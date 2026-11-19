import mongoose from "mongoose";
import httpStatus from "http-status";
import { Meeting } from "../models/meeting.model.js";

const toEntry = (m) => ({
    id: String(m._id),
    code: m.meetingCode,
    title: m.title || m.meetingCode,
    isHost: m.isHost,
    participants: m.participants,
    joinedAt: m.date,
    endedAt: m.endedAt ?? null,
});

// GET /api/v1/users/history?limit=50
const getHistory = async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const meetings = await Meeting.find({ user_id: req.user._id })
        .sort({ date: -1 })
        .limit(limit)
        .lean();

    return res.status(httpStatus.OK).json({ meetings: meetings.map(toEntry) });
};

// DELETE /api/v1/users/history/:id
const deleteHistoryEntry = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "invalid meeting id" });
    }

    // the user_id check stops anyone deleting someone else's entries
    const { deletedCount } = await Meeting.deleteOne({ _id: id, user_id: req.user._id });
    if (!deletedCount) {
        return res.status(httpStatus.NOT_FOUND).json({ message: "meeting not found" });
    }

    return res.status(httpStatus.OK).json({ message: "deleted" });
};

// DELETE /api/v1/users/history
const clearHistory = async (req, res) => {
    const { deletedCount } = await Meeting.deleteMany({ user_id: req.user._id });
    return res.status(httpStatus.OK).json({ message: "history cleared", deleted: deletedCount });
};

export { getHistory, deleteHistoryEntry, clearHistory };
