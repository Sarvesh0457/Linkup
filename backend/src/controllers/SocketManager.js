import { Server } from "socket.io";

const connections = {}; // room -> [socketId]
const rooms = {};       // room -> { title, startedAt }
const messages = {};    // room -> [{ sender, data, "socket-id-sender" }]
const peers = {};       // socketId -> { name, mic, cam, hand, sharing }

const roomOf = (id) => Object.keys(connections).find((k) => connections[k].includes(id));
const FLAGS = ["mic", "cam", "hand", "sharing"];

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });

    io.on("connection", (socket) => {
        console.log("User Connected");

        socket.on("join-call", (path, info = {}) => {
            if (connections[path]?.includes(socket.id)) return;

            if (!connections[path]) {
                connections[path] = [];
                rooms[path] = {
                    title: String(info.title || "").slice(0, 80),
                    startedAt: Date.now(),
                };
            }
            connections[path].push(socket.id);

            peers[socket.id] = {
                name: String(info.name || "Guest").slice(0, 40),
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
            socket.emit("room-info", { ...rooms[path], serverNow: Date.now() });

            (messages[path] || []).forEach((m) => {
                socket.emit("chat-message", m.data, m.sender, m["socket-id-sender"]);
            });
        });

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        socket.on("peer-state", (patch = {}) => {
            const room = roomOf(socket.id);
            if (!room || !peers[socket.id]) return;

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

        socket.on("chat-message", (data, sender) => {
            const room = roomOf(socket.id);
            if (!room || typeof data !== "string") return;

            const text = data.slice(0, 1000);
            const name = String(sender || "Guest").slice(0, 40);

            if (!messages[room]) messages[room] = [];
            messages[room].push({ sender: name, data: text, "socket-id-sender": socket.id });

            connections[room].forEach((id) => io.to(id).emit("chat-message", text, name, socket.id));
        });

        socket.on("disconnect", () => {
            console.log("User Disconnected");

            const room = roomOf(socket.id);
            delete peers[socket.id];
            if (!room) return;

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