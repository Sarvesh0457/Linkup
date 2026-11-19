import { Router } from "express";
import { login, register } from "../controllers/user.controller.js";
import { clearHistory, deleteHistoryEntry, getHistory } from "../controllers/history.controller.js";
import { requireAuth } from "../middleware/auth.js";


const router = Router();

router.route("/login")
    .post(login)
router.route("/register")
    .post(register)

// meeting history (entries are recorded by the socket server, see SocketManager.js)
router.route("/history")
    .get(requireAuth, getHistory)
    .delete(requireAuth, clearHistory)
router.route("/history/:id")
    .delete(requireAuth, deleteHistoryEntry)

export default router;
