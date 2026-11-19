import crypto from "node:crypto";
import { Session } from "../models/session.model.js";
import { User } from "../models/user.model.js";

export const COOKIE_NAME = "linkup_sid";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000; // extend the expiry at most once a day

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

const cookieOptions = (req) => ({
    httpOnly: true, // JavaScript in the page can't read it, so XSS can't steal it
    // HTTPS-only in production (or whenever the request came in over HTTPS)
    secure: process.env.NODE_ENV === "production" || req.secure,
    // not sent on cross-site POSTs, which blocks CSRF from other websites
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS,
});

// log in: new random secret in an httpOnly cookie, its hash in the database
export const startSession = async (req, res, user) => {
    const token = crypto.randomBytes(32).toString("base64url");
    await Session.create({
        user_id: user._id,
        tokenHash: hash(token),
        userAgent: String(req.get("user-agent") || "").slice(0, 200),
        expiresAt: new Date(Date.now() + SESSION_MS),
    });
    res.cookie(COOKIE_NAME, token, cookieOptions(req));
};

// returns { user, session } for a valid cookie, or null
export const readSession = async (req) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;

    const session = await Session.findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } });
    if (!session) return null;

    const user = await User.findById(session.user_id).select("_id name username");
    if (!user) return null;

    // sliding expiry: active users stay logged in, idle sessions run out
    if (Date.now() - session.lastUsedAt.getTime() > REFRESH_AFTER_MS) {
        session.lastUsedAt = new Date();
        session.expiresAt = new Date(Date.now() + SESSION_MS);
        await session.save();
    }
    return { user, session };
};

export const endSession = async (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (typeof token === "string") await Session.deleteOne({ tokenHash: hash(token) });
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(req), maxAge: undefined });
};

export const endAllSessions = async (req, res, userId) => {
    await Session.deleteMany({ user_id: userId });
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(req), maxAge: undefined });
};
