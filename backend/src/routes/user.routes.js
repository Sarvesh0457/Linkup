import { Router } from "express";
import { clearHistory, deleteHistoryEntry, getHistory } from "../controllers/history.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// meeting history (entries are recorded by the socket server, see SocketManager.js)
router.route("/history")
    .get(requireAuth, getHistory)
    .delete(requireAuth, clearHistory)
router.route("/history/:id")
    .delete(requireAuth, deleteHistoryEntry)

export default router;
