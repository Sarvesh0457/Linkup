import express from 'express';
import {createServer} from 'node:http';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
dotenv.config();

import { connectToSocket } from './controllers/SocketManager.js';
import { allowedOrigins, apiLimiter, checkOrigin } from './middleware/security.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();
const server = createServer(app);
connectToSocket(server);

// Behind a host's proxy (Render, Railway) and the Vercel rewrite, the real client IP is in
// X-Forwarded-For. TRUST_PROXY = how many proxies sit in front (see README). 0 in development.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));
app.disable('x-powered-by');

app.use(helmet()); // security headers (no sniffing, no framing, HSTS, ...)
app.use(cors({ origin: allowedOrigins(), credentials: true }));
app.use(cookieParser());
app.use(express.json({limit:'40kb'}));

app.use("/api", apiLimiter, checkOrigin);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);

// for uptime checks, and to confirm TRUST_PROXY: "ip" should be your own address
app.get("/api/v1/health", (req, res) => res.json({ ok: true, ip: req.ip }));

// unknown routes answer in JSON like the rest of the API
app.use((req, res) => {
    res.status(404).json({message: "not found"});
});

// errors from any route (Express 5 also catches rejected promises) end up here
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({message: "invalid JSON in request body"});
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({message: "request body is too large"});
    }
    console.error("unhandled error:", err);
    res.status(500).json({message: "something went wrong, please try again"});
});

const start = async () => {

    try{
        const PORT = process.env.PORT || 3001;

        if (!process.env.MONGO_URL) {
            throw new Error("MONGO_URL is not set (add it to backend/.env)");
        }

        const connectDB = await mongoose.connect(process.env.MONGO_URL);
        console.log(`DB Host: ${connectDB.connection.host}`);

        // e.g. the port is already taken: report it clearly and exit with a failure code
        server.on('error', (err) => {
            console.log(`Error in starting server: ${err.code === 'EADDRINUSE' ? `port ${PORT} is already in use` : err.message}`);
            process.exit(1);
        });

        server.listen(PORT, () => {
            console.log(`app listening on PORT: ${PORT}`);
        });
    }catch(e){
        console.log("Error in starting server: ",e);
        // a non-zero exit code tells nodemon / pm2 / your host that startup failed
        process.exit(1);
    }
}

start();
