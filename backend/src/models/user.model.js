import mongoose, { Schema } from "mongoose";
import { LIMITS } from "../lib/validate.js";

const userSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: LIMITS.name.max,
    },
    // stored lowercase for new accounts (older accounts may still have capitals; login handles both)
    username: {
        type: String,
        required: true,
        unique: true,
        maxlength: LIMITS.username.max,
    },
    password: {
        type: String,
        required: true
    },
});

const User = mongoose.model("User",userSchema);

export {User};
