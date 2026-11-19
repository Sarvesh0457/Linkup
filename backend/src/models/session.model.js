import mongoose, { Schema } from "mongoose";

// One row per logged-in browser. The cookie holds a random secret; only its
// SHA-256 hash is stored here, so a database leak doesn't hand out live logins.
const sessionSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
    },
    userAgent: {
        type: String,
        default: "",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    lastUsedAt: {
        type: Date,
        default: Date.now,
    },
    // MongoDB deletes the row automatically once this time passes (TTL index)
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
    },
});

const Session = mongoose.model("Session", sessionSchema);

export { Session };
