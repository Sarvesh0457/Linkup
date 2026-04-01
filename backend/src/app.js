import express from 'express';
import {createServer} from 'node:http';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { connectToSocket } from './controllers/SocketManager.js';

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.use(cors());
app.use(express.json({limit:'40kb'}));
app.use(express.urlencoded({limit:'40kb', extended: true}));

const start = async () => {

    try{
        const PORT = process.env.PORT || 3001;

        const connectDB = await mongoose.connect(process.env.MONGO_URL);
        console.log(`DB Host: ${connectDB.connection.host}`);
        
        server.listen(PORT, () => {
            console.log(`app listening on PORT: ${PORT}`);
        });
    }catch(e){
        console.log("Error in starting server: ",e);
    }
}

start();