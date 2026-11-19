import { Server } from "socket.io";
import { redeemTicket } from "../lib/tickets.js";
import { allowedOrigins } from "../middleware/security.js";
import { Meeting } from "../models/meeting.model.js";

/*
 * Room state lives in memory (one server process). A room exists while someone is in it.
 *
 * rooms[code] = {
 *   title, startedAt,
 *   hostId, hostUserId,          // current host's socket and account
 *   waitingRoom,                 // host approves who joins
 *   waiting: Map(socketId -> { name, userId, info }),
 *   admitted: Set(userId),       // let in once → reconnects skip the waiting room
 *   removed: Set(userId),        // removed by the host → can't come back this session
 *   names: Set(name),            // everyone seen, for meeting history
 * }
 */
const connections = {}; // code -> [socketId] of people in the call
const rooms = {};
const messages = {};    // code -> [{ id, sender, from, data, at, reactions: Map(emoji -> Map(userId -> name)) }]
const peers = {};       // socketId -> { name, mic, cam, hand, sharing }

const roomOf = (id) => Object.keys(connections).find((k) => connections[k].includes(id));
const FLAGS = ["mic", "cam", "hand", "sharing"];
const REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "🙌"];
const MAX_MESSAGES = 200;          // chat history kept per room for late joiners
const MAX_CODE_LENGTH = 64;

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

// reactions on one message, as seen by one user
const reactionSummary = (msg, userId) =>
    REACTIONS.filter((e) => msg.reactions.get(e)?.size).map((emoji) => {
        const who = msg.reactions.get(emoji);
        return { emoji, count: who.size, names: [...who.values()], mine: who.has(userId) };
    });

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: allowedOrigins(),
            methods: ["GET", "POST"],
        }
    });

    // Only logged-in users: the browser gets a one-time ticket from POST /api/v1/auth/socket-ticket
    // (cookie-authenticated) and sends it in the handshake. See lib/tickets.js for why.
    io.use((socket, next) => {
        const user = redeemTicket(socket.handshake.auth?.ticket);
        if (!user) return next(new Error("unauthorized"));
        socket.data.user = user;
        next();
    });

    const sock = (id) => io.sockets.sockets.get(id);
    // tell everyone in a room's waiting room they won't be let in
    const releaseWaiting = (path, reason) => {
        for (const id of rooms[path]?.waiting.keys() ?? []) {
            const s = sock(id);
            if (s) delete s.data.waitingFor;
            io.to(id).emit("join-denied", reason);
        }
        rooms[path]?.waiting.clear();
    };
    const emitRoom = (path, ...args) => (connections[path] ?? []).forEach((id) => io.to(id).emit(...args));
    const isHost = (socket, path) => !!path && rooms[path]?.hostId === socket.id;

    const roomInfo = (path) => {
        const r = rooms[path];
        return { title: r.title, startedAt: r.startedAt, serverNow: Date.now(), hostId: r.hostId, waitingRoom: r.waitingRoom };
    };

    const sendWaitingList = (path) => {
        const r = rooms[path];
        if (!r?.hostId) return;
        io.to(r.hostId).emit("waiting-list", [...r.waiting].map(([id, w]) => ({ id, name: w.name })));
    };

    // actually put a socket into the call (straight away, or once the host admits them)
    const enterRoom = (socket, path, info) => {
        const room = rooms[path];
        const user = socket.data.user;
        delete socket.data.waitingFor;

        room.admitted.add(user.id);
        if (!connections[path]) connections[path] = [];
        connections[path].push(socket.id);
        room.names.add(user.name);

        // first one in (or nobody holds the role any more) becomes host
        if (!room.hostId || !connections[path].includes(room.hostId)) {
            room.hostId = socket.id;
            room.hostUserId = user.id;
        }

        peers[socket.id] = {
            // the name comes from the account, not from what the client claims
            name: user.name,
            mic: info.mic !== false,
            cam: info.cam !== false,
            hand: !!info.hand,
            sharing: !!info.sharing,
        };

        const infoMap = Object.fromEntries(connections[path].map((id) => [id, peers[id]]));
        emitRoom(path, "user-joined", socket.id, connections[path], infoMap);

        // title, start time, host; serverNow lets clients correct for clock differences
        socket.emit("room-info", roomInfo(path));

        (messages[path] || []).forEach((m) => {
            socket.emit("chat-message", m.data, m.sender, m.from, { id: m.id, at: m.at, reactions: reactionSummary(m, user.id) });
        });

        if (room.hostId === socket.id) sendWaitingList(path);
        recordJoin(socket, path, room.hostId === socket.id);
    };

    // the host leaves but others stay: the longest-present person takes over
    const passHost = (path) => {
        const room = rooms[path];
        const next = connections[path]?.[0];
        if (!room || !next) return;
        room.hostId = next;
        room.hostUserId = sock(next)?.data.user.id ?? room.hostUserId;
        emitRoom(path, "host-changed", next);
        sendWaitingList(path);
    };

    io.on("connection", (socket) => {
        console.log("User Connected");
        const user = socket.data.user;

        socket.on("join-call", (path, info = {}) => {
            if (typeof path !== "string" || !path.trim() || path.length > MAX_CODE_LENGTH) return;
            if (!info || typeof info !== "object") info = {};
            if (roomOf(socket.id) || socket.data.waitingFor) return; // one room per connection

            if (!rooms[path]) {
                rooms[path] = {
                    title: String(info.title || "").trim().slice(0, 80),
                    startedAt: Date.now(),
                    hostId: null,
                    hostUserId: user.id,
                    waitingRoom: info.waitingRoom === true,
                    waiting: new Map(),
                    admitted: new Set(),
                    removed: new Set(),
                    names: new Set(),
                };
            }
            const room = rooms[path];

            if (room.removed.has(user.id)) {
                return socket.emit("join-denied", "removed");
            }

            const mustWait = room.waitingRoom && user.id !== room.hostUserId && !room.admitted.has(user.id);
            if (mustWait) {
                room.waiting.set(socket.id, { name: user.name, userId: user.id, info });
                socket.data.waitingFor = path;
                socket.emit("waiting", { title: room.title });
                sendWaitingList(path);
                return;
            }

            enterRoom(socket, path, info);
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
            emitRoom(room, "reaction", socket.id, emoji.slice(0, 8));
        });

        /* ---------- chat ---------- */

        socket.on("chat-message", (data) => {
            const room = roomOf(socket.id);
            if (!room || typeof data !== "string" || !data.trim()) return;

            const msg = {
                id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                sender: user.name,
                from: socket.id,
                data: data.slice(0, 1000),
                at: Date.now(),
                reactions: new Map(),
            };
            if (!messages[room]) messages[room] = [];
            messages[room].push(msg);
            if (messages[room].length > MAX_MESSAGES) messages[room].shift();

            emitRoom(room, "chat-message", msg.data, msg.sender, msg.from, { id: msg.id, at: msg.at, reactions: [] });
        });

        // toggle my reaction on a message; everyone gets the updated counts
        socket.on("chat-react", (msgId, emoji) => {
            const room = roomOf(socket.id);
            if (!room || typeof msgId !== "string" || !REACTIONS.includes(emoji)) return;
            const msg = messages[room]?.find((m) => m.id === msgId);
            if (!msg) return;

            if (!msg.reactions.has(emoji)) msg.reactions.set(emoji, new Map());
            const who = msg.reactions.get(emoji);
            if (who.has(user.id)) who.delete(user.id);
            else who.set(user.id, user.name);

            connections[room].forEach((id) => {
                const viewer = sock(id)?.data.user.id;
                io.to(id).emit("chat-reactions", msgId, reactionSummary(msg, viewer));
            });
        });

        // "<name> is typing…" for everyone else
        socket.on("typing", (isTyping) => {
            const room = roomOf(socket.id);
            if (!room) return;
            connections[room].forEach((id) => {
                if (id !== socket.id) io.to(id).emit("typing", socket.id, user.name, isTyping === true);
            });
        });

        /* ---------- host controls (ignored unless sent by the current host) ---------- */

        socket.on("host:admit", (target) => {
            const path = roomOf(socket.id);
            if (!isHost(socket, path)) return;
            const room = rooms[path];
            const ids = target === "all" ? [...room.waiting.keys()] : [target];
            for (const id of ids) {
                const w = room.waiting.get(id);
                if (!w) continue;
                room.waiting.delete(id);
                room.admitted.add(w.userId);
                const s = sock(id);
                if (s) enterRoom(s, path, w.info);
            }
            sendWaitingList(path);
        });

        socket.on("host:deny", (target) => {
            const path = roomOf(socket.id);
            if (!isHost(socket, path) || !rooms[path].waiting.has(target)) return;
            rooms[path].waiting.delete(target);
            const s = sock(target);
            if (s) {
                delete s.data.waitingFor;
                s.emit("join-denied", "denied");
            }
            sendWaitingList(path);
        });

        socket.on("host:waiting-room", (on) => {
            const path = roomOf(socket.id);
            if (!isHost(socket, path) || typeof on !== "boolean") return;
            rooms[path].waitingRoom = on;
            emitRoom(path, "room-settings", { waitingRoom: on });
            // turning it off lets everyone who's waiting in
            if (!on) {
                for (const [id, w] of [...rooms[path].waiting]) {
                    rooms[path].waiting.delete(id);
                    const s = sock(id);
                    if (s) enterRoom(s, path, w.info);
                }
                sendWaitingList(path);
            }
        });

        // the host can mute someone; only that person can unmute themselves
        socket.on("host:mute", (target) => {
            const path = roomOf(socket.id);
            if (!isHost(socket, path) || target === socket.id || !connections[path].includes(target)) return;
            io.to(target).emit("force-mute", user.name);
        });

        // remove someone; they can't rejoin this session of the room
        socket.on("host:remove", (target) => {
            const path = roomOf(socket.id);
            if (!isHost(socket, path) || target === socket.id || !connections[path].includes(target)) return;
            const s = sock(target);
            if (!s) return;
            rooms[path].removed.add(s.data.user.id);
            rooms[path].admitted.delete(s.data.user.id);
            s.emit("removed", user.name);
            setTimeout(() => s.disconnect(true), 300); // let the message arrive first
        });

        // end the meeting for everyone, including anyone still waiting
        socket.on("host:end", () => {
            const path = roomOf(socket.id);
            if (!isHost(socket, path)) return;
            releaseWaiting(path, "ended");
            const everyone = [...connections[path]];
            everyone.forEach((id) => io.to(id).emit("meeting-ended", user.name));
            setTimeout(() => everyone.forEach((id) => sock(id)?.disconnect(true)), 500);
        });

        socket.on("disconnect", () => {
            console.log("User Disconnected");

            // left while still in the waiting room
            const waitingFor = socket.data.waitingFor;
            if (waitingFor && rooms[waitingFor]) {
                rooms[waitingFor].waiting.delete(socket.id);
                sendWaitingList(waitingFor);
                return;
            }

            const room = roomOf(socket.id);
            delete peers[socket.id];
            if (!room) return;

            recordLeave(socket, room); // before the room data below is deleted

            const wasHost = rooms[room]?.hostId === socket.id;
            connections[room] = connections[room].filter((id) => id !== socket.id);
            emitRoom(room, "user-left", socket.id);

            if (connections[room].length === 0) {
                // last one out: anyone still waiting is told the meeting is over
                releaseWaiting(room, "ended");
                delete connections[room];
                delete rooms[room];
                delete messages[room];
            } else if (wasHost) {
                passHost(room);
            }
        });
    });

    return io;
};
