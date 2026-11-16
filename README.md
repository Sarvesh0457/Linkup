<div align="center">

# LinkUp

**Video meetings in your browser. Create a room, share the code, and start talking.**

Peer-to-peer video calls built on WebRTC, with Socket.IO for signaling, a React front end, and a Node/Express + MongoDB back end.

[Live Demo](#) · [Report a Bug](https://github.com/Sarvesh0457/Linkup/issues) · [Request a Feature](https://github.com/Sarvesh0457/Linkup/issues)

<!-- Add a hero screenshot or GIF here once deployed -->
<!-- ![LinkUp preview](docs/screenshots/hero.png) -->

</div>

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Socket Events](#socket-events)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Author](#author)

---

## Features

**Meetings**
- Create a meeting and get a code you can share, with an optional meeting title
- Join with a code, or paste the whole meeting link
- A lobby where you can check your camera and mic before joining
- Grid view and speaker view, and you can pin a participant
- Screen sharing
- A meeting timer that stays in sync with the server clock

**Collaboration**
- In-room chat with an unread-message badge; people who join late get the earlier messages
- Raise your hand
- Emoji reactions (👍 ❤️ 😂 🎉 👏 🙌)
- Everyone sees each participant's mic and camera status as it changes

**Accounts**
- Register and log in, with passwords hashed using bcrypt
- You stay logged in for 7 days, with automatic logout when the session expires
- Logging in or out in one tab updates your other tabs

---

## Screenshots

<!-- Save images in docs/screenshots/ and uncomment the lines below -->

| Landing | Lobby / Setup |
|:---:|:---:|
| <!-- ![Landing](docs/screenshots/landing.png) --> | <!-- ![Setup](docs/screenshots/setup.png) --> |

| In Call (Grid) | Screen Share + Chat |
|:---:|:---:|
| <!-- ![Call](docs/screenshots/call-grid.png) --> | <!-- ![Share](docs/screenshots/call-share.png) --> |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, React Router 7, Tailwind CSS 4, shadcn/ui |
| **Real-time** | WebRTC (`RTCPeerConnection`), Socket.IO client |
| **Backend** | Node.js, Express 5, Socket.IO |
| **Database** | MongoDB with Mongoose |
| **Auth** | bcrypt password hashing, random token per login |

---

## How It Works

LinkUp uses a **mesh** setup: each participant's browser connects directly to every other participant's browser. The server only *signals*. It helps the browsers find each other, but the audio and video never go through it.

```mermaid
sequenceDiagram
    participant A as Browser A
    participant S as Socket.IO Server
    participant B as Browser B

    A->>S: join-call(code, {name, mic, cam})
    B->>S: join-call(code, {name, mic, cam})
    S-->>A: user-joined(B, peers, info)
    S-->>B: user-joined(B, peers, info)
    A->>S: signal(B, SDP offer)
    S-->>B: signal(A, SDP offer)
    B->>S: signal(A, SDP answer + ICE)
    S-->>A: signal(B, SDP answer + ICE)
    A-->>B: Direct P2P audio / video (WebRTC)
```

1. **Signaling.** Browsers exchange SDP offers/answers and ICE candidates through the `signal` socket event.
2. **NAT traversal.** Google's public STUN servers help browsers find their public addresses.
3. **Room state.** The server keeps room data in memory: who is connected, each person's mic/cam/hand/sharing status, chat history, and when the meeting started. When the last person leaves, the room is deleted.

> **Note:** A mesh works best for small groups, roughly 2–6 people. Each person uploads one stream per other participant, so bandwidth use goes up quickly as more people join.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- A MongoDB database ([MongoDB Atlas](https://www.mongodb.com/atlas) free tier works)

### 1. Clone the repo

```bash
git clone https://github.com/Sarvesh0457/Linkup.git
cd Linkup
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=3001
MONGO_URL=your_mongodb_connection_string
```

Start the server:

```bash
npm run dev
```

### 3. Set up the frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. To test a call on one computer, open the meeting in two browser windows (for example, one normal and one incognito) and log in with different accounts.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `PORT` | Port the server listens on | `3001` |
| `MONGO_URL` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/linkup` |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Backend URL, used for the REST API and Socket.IO | `http://localhost:3001` |

> **Never commit `.env` files.** Both are already in `.gitignore`.

---

## Project Structure

```
LinkUp/
├── backend/
│   └── src/
│       ├── app.js                    # Express + HTTP server + DB connection
│       ├── controllers/
│       │   ├── SocketManager.js      # Rooms, signaling, chat, reactions, peer state
│       │   └── user.controller.js    # Register / login
│       ├── models/
│       │   ├── user.model.js
│       │   └── meeting.model.js
│       └── routes/
│           └── user.routes.js
│
└── frontend/
    └── src/
        ├── App.jsx                   # Routes
        ├── Navbar.jsx
        ├── context/
        │   └── AuthContext.jsx       # Saved session, expiry, sync between tabs
        └── components/pages/
            ├── landing/              # Hero + meeting options
            ├── auth/                 # Login / signup
            ├── home/Setup.jsx        # Create / join lobby with device preview
            └── call/Call.jsx         # The meeting room
```

---

## API Reference

Base URL: `/api/v1/users`

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/register` | `{ name, username, password }` | `201 { message }` |
| `POST` | `/login` | `{ username, password }` | `200 { token, name }` |

---

## Socket Events

| Event | Direction | Payload | Purpose |
|---|---|---|---|
| `join-call` | client → server | `code, { name, title, mic, cam }` | Join or create a room |
| `user-joined` | server → room | `socketId, peerIds[], infoMap` | Someone joined |
| `room-info` | server → client | `{ title, startedAt, serverNow }` | Meeting title and server time for the timer |
| `signal` | both | `toId / fromId, message` | WebRTC SDP and ICE exchange |
| `peer-state` | both | `{ mic?, cam?, hand?, sharing? }` | Mic, camera, hand or screen-share status changed |
| `reaction` | both | `emoji` | Send an emoji reaction |
| `chat-message` | both | `text, senderName, socketId` | Chat |
| `user-left` | server → room | `socketId` | Someone left |

---

## Deployment

The frontend and backend are deployed separately.

### Backend → [Render](https://render.com) / [Railway](https://railway.app)

1. Create a new **Web Service** with **`backend`** as the root directory.
2. Build command: `npm install`. Start command: `npm start`.
3. Set the `MONGO_URL` environment variable. The host sets `PORT` itself.
4. Pick a host that supports **WebSockets**. Serverless platforms such as Vercel Functions can't keep Socket.IO connections open.

### Frontend → [Vercel](https://vercel.com) / [Netlify](https://netlify.com)

1. Set the root directory to **`frontend`**.
2. Build command: `npm run build`. Output folder: `dist`.
3. Set `VITE_API_URL` to your deployed backend URL.
4. Add an SPA rewrite so that reloading `/call/ABC-1234` doesn't return a 404:
   - **Vercel:** add `frontend/vercel.json` containing `{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }`
   - **Netlify:** add `frontend/public/_redirects` containing `/* /index.html 200`

### Production checklist

- [ ] **HTTPS everywhere.** Browsers only allow camera, mic and screen sharing on secure (HTTPS) pages.
- [ ] **MongoDB Atlas network access.** Allow your backend host's IP address.
- [ ] **TURN server.** STUN alone doesn't work on some strict networks (some office and mobile networks). Add a TURN server, such as [Metered](https://www.metered.ca/tools/openrelay/) or a self-hosted coturn, to `RTC_CONFIG` in `Call.jsx`.
- [ ] **CORS.** Allow only your frontend's domain instead of every origin.

---

## Roadmap

- [ ] Meeting history (`add_to_activity` / `get_all_activity` routes)
- [ ] Check the auth token before letting someone join a room
- [ ] TURN server support
- [ ] Waiting room / host controls (mute or remove participants)
- [ ] An SFU (for example mediasoup or LiveKit) for larger meetings
- [ ] Background blur

---

## Author

**Sarvesh** · [GitHub @Sarvesh0457](https://github.com/Sarvesh0457)

If you found this project useful, consider giving it a ⭐
