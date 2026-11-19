import rateLimit from "express-rate-limit";
import httpStatus from "http-status";
import { normalizeUsername } from "../lib/validate.js";

const tooMany = (message) => (req, res) => res.status(httpStatus.TOO_MANY_REQUESTS).json({ message });

// Allowed browser origins: CLIENT_URL in .env (comma-separated). Unset → allow any (development).
export const allowedOrigins = () =>
    process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",").map((s) => s.trim().replace(/\/$/, "")) : true;

// Login: 10 attempts per 15 minutes for the same IP + username,
// so guessing one account's password is slow but other users aren't affected.
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true, // only failed attempts count
    keyGenerator: (req) => {
        const u = typeof req.body?.username === "string" ? normalizeUsername(req.body.username) : "";
        return `${req.ip}|${u}`;
    },
    handler: tooMany("too many login attempts, please wait 15 minutes and try again"),
});

// Sign-up: 5 new accounts per hour per IP (typos and taken usernames don't count)
export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipFailedRequests: true,
    handler: tooMany("too many sign-ups from this network, please try again later"),
});

// Everything under /api: a generous ceiling against floods
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: tooMany("too many requests, please slow down"),
});

// CSRF defence in depth (on top of SameSite cookies): a request that changes something
// must come from our own frontend. Browsers always send Origin on such requests.
export const checkOrigin = (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const allowed = allowedOrigins();
    const origin = req.get("origin");
    if (allowed === true || !origin || allowed.includes(origin)) return next();
    return res.status(httpStatus.FORBIDDEN).json({ message: "request blocked: unknown origin" });
};
