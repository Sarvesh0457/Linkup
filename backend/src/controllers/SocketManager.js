import { Server } from "socket.io";
import { findUserByToken } from "../middleware/auth.js";
import { Meeting } from "../models/meeting.model.js";

const connections = {}; // room -> [socketId]
const rooms = {};       // room -> { title, startedAt, names: Set of everyone seen }
const messages = {};    // room -> [{ sender, data, "socket-id-sender" }]
const peers = {};       // socketId -> { name, mic, cam, hand, sharing }

const roomOf = (id) => Object.keys(connections).find((k) => connections[k].includes(id));
const FLAGS = ["mic", "cam", "hand", "sharing"];
const MAX_MESSAGES = 200;          // chat history kept per room for late joiners
const MAX_CODE_LENGTH = 64;

// allowed browser origins, e.g. CLIENT_URL=https://linkup.example.com (comma-separated for several).
// Not set → any origin (handy in development).
export const allowedOrigins = () =>
    process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",").map((s) => s.trim()) : true;

// history is best-effort: a database hiccup must never break the call itself
const recordJoin = (socket, path, isHost) => {
    const room = rooms[path];
    socket.data.meeting = { path, startedAt: room.startedAt };
    Meeting.updateOne(
        { user_id: socket.data.user.id, meetingCode: path, roomStartedAt: new Date(room.startedAt) },
        { $setOnInsert: { title: room.title || path, isHost, date: new Date() } },
        { upsert: true }
    ).catch((e) => console.error("history: could not record join:", e.message));
};

const recordLeave = (socket, path) => {
    const m = socket.data.meeting;
    if (!m || m.path !== path) return;
    const others = [...(rooms[path]?.names ?? [])].filter((n) => n !== socket.data.user.name);
    Meeting.updateOne(
        { user_id: socket.data.user.id, meetingCode: path, roomStartedAt: new Date(m.startedAt) },
        { $set: { endedAt: new Date() }, $addToSet: { participants: { $each: others } } }
    ).catch((e) => console.error("history: could not record leave:", e.message));
};

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: allowedOrigins(),
            methods: ["GET", "POST"],
        }
    });

    // only logged-in users can connect; the client sends its token in the handshake
    io.use(async (socket, next) => {
        try {
            const user = await findUserByToken(socket.handshake.auth?.token);
            if (!user) return next(new Error("unauthorized"));
            socket.data.user = { id: String(user._id), name: user.name };
            next();
        } catch (e) {
            console.error("socket auth failed:", e.message);
            next(new Error("server error"));
        }
    });

    io.on("connection", (socket) => {
        console.log("User Connected");
        const myName = String(socket.data.user.name || "Guest").slice(0, 40);

        socket.on("join-call", (path, info = {}) => {
            if (typeof path !== "string" || !path.trim() || path.length > MAX_CODE_LENGTH) return;
            if (!info || typeof info !== "object") info = {};
            if (connections[path]?.includes(socket.id)) return;
            if (roomOf(socket.id)) return; // one room per connection

            const isHost = !connections[path];
            if (isHost) {
                connections[path] = [];
                rooms[path] = {
                    title: String(info.title || "").trim().slice(0, 80),
                    startedAt: Date.now(),
                    names: new Set(),
                };
            }
            connections[path].push(socket.id);
            rooms[path].names.add(myName);

            peers[socket.id] = {
                // the name comes from the account, not from what the client claims
                name: myName,
                mic: info.mic !== false,
                cam: info.cam !== false,
                hand: !!info.hand,
                sharing: !!info.sharing,
            };

            const infoMap = Object.fromEntries(connections[path].map((id) => [id, peers[id]]));
            connections[path].forEach((id) => {
                io.to(id).emit("user-joined", socket.id, connections[path], infoMap);
            });

            // title + start time; serverNow lets clients correct for clock differences
            const { title, startedAt } = rooms[path];
            socket.emit("room-info", { title, startedAt, serverNow: Date.now() });

            (messages[path] || []).forEach((m) => {
                socket.emit("chat-message", m.data, m.sender, m["socket-id-sender"]);
            });

            recordJoin(socket, path, isHost);
        });

        socket.on("signal", (toId, message) => {
            // only relay between people in the same room
            const room = roomOf(socket.id);
            if (!room || typeof toId !== "string" || !connections[room].includes(toId)) return;
            io.to(toId).emit("signal", socket.id, message);
        });

        socket.on("peer-state", (patch = {}) => {
            const room = roomOf(socket.id);
            if (!room || !peers[socket.id] || !patch || typeof patch !== "object") return;

            const clean = {};
            for (const k of FLAGS) if (typeof patch[k] === "boolean") clean[k] = patch[k];
            Object.assign(peers[socket.id], clean);

            connections[room].forEach((id) => {
                if (id !== socket.id) io.to(id).emit("peer-state", socket.id, clean);
            });
        });

        socket.on("reaction", (emoji) => {
            const room = roomOf(socket.id);
            if (!room || typeof emoji !== "string") return;
            connections[room].forEach((id) => io.to(id).emit("reaction", socket.id, emoji.slice(0, 8)));
        });

        socket.on("chat-message", (data) => {
            const room = roomOf(socket.id);
            if (!room || typeof data !== "string" || !data.trim()) return;

            const text = data.slice(0, 1000);

            if (!messages[room]) messages[room] = [];
            messages[room].push({ sender: myName, data: text, "socket-id-sender": socket.id });
            if (messages[room].length > MAX_MESSAGES) messages[room].shift();

            connections[room].forEach((id) => io.to(id).emit("chat-message", text, myName, socket.id));
        });

        socket.on("disconnect", () => {
            console.log("User Disconnected");

            const room = roomOf(socket.id);
            delete peers[socket.id];
            if (!room) return;

            recordLeave(socket, room); // before the room data below is deleted

            connections[room] = connections[room].filter((id) => id !== socket.id);
            connections[room].forEach((id) => io.to(id).emit("user-left", socket.id));

            if (connections[room].length === 0) {
                delete connections[room];
                delete rooms[room];
                delete messages[room];
            }
        });
    });

    return io;
};
