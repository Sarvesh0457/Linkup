import mongoose, { Schema } from "mongoose";

// One entry per person per call: written by the socket server when you join,
// finished when you leave (closing the tab counts too).
const meetingSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    meetingCode: {
        type: String,
        required: true,
    },
    // the host's title, or the meeting code when they didn't set one
    title: {
        type: String,
        default: "",
    },
    isHost: {
        type: Boolean,
        default: false,
    },
    // names of the other people seen in the call while you were there
    participants: {
        type: [String],
        default: [],
    },
    // identifies this particular session of the room (the same code can be reused later)
    roomStartedAt: {
        type: Date,
        required: true,
    },
    // when you joined
    date: {
        type: Date,
        default: Date.now,
        required: true,
    },
    // when you left; missing if you're still in the call or the server stopped mid-call
    endedAt: {
        type: Date,
    },
});

// rejoining the same session (e.g. after a reconnect) updates the same entry instead of adding a new one
meetingSchema.index({ user_id: 1, meetingCode: 1, roomStartedAt: 1 }, { unique: true });

const Meeting = mongoose.model("Meeting", meetingSchema);

export { Meeting };
