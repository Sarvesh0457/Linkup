import express from 'express';
import {createServer} from 'node:http';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { allowedOrigins, connectToSocket } from './controllers/SocketManager.js';

import userRoutes from './routes/user.routes.js';

const app = express();
const server = createServer(app);
connectToSocket(server);

// set CLIENT_URL in .env to your frontend's address before deploying (any origin is allowed when it's unset)
app.use(cors({ origin: allowedOrigins() }));
app.use(express.json({limit:'40kb'}));
app.use(express.urlencoded({limit:'40kb', extended: true}));

app.use("/api/v1/users", userRoutes);

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
