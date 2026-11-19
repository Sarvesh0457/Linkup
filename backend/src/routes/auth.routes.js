import { Router } from "express";
import { login, logout, logoutAll, me, register, socketTicket } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { loginLimiter, registerLimiter } from "../middleware/security.js";

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.post("/logout-all", requireAuth, logoutAll);
router.get("/me", requireAuth, me);
router.post("/socket-ticket", requireAuth, socketTicket);

export default router;
