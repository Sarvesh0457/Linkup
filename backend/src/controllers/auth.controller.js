import httpStatus from 'http-status';
import bcrypt from 'bcrypt';
import { User } from '../models/user.model.js';
import { endAllSessions, endSession, startSession } from '../lib/session.js';
import { issueTicket } from '../lib/tickets.js';
import { isText, normalizeUsername, validateName, validatePassword, validateUsername, LIMITS } from '../lib/validate.js';

// compared against when the username doesn't exist, so both cases take the same time
const DUMMY_HASH = bcrypt.hashSync('linkup-timing-guard', 12);

const publicUser = (user) => ({ name: user.name, username: user.username });

// POST /api/v1/auth/register
const register = async (req, res) => {
    const { name, username, password } = req.body ?? {};

    const problem = validateName(name) || validateUsername(username) || validatePassword(password);
    if (problem) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: problem });
    }

    const cleanName = name.trim();
    const cleanUsername = normalizeUsername(username);

    try {
        // case-insensitive check, so "alice" can't be registered next to an older "Alice"
        // (the pattern check above guarantees only [a-z0-9._-], so escaping "." is enough)
        const existing = await User.findOne({ username: { $regex: `^${cleanUsername.replace(/\./g, '\\.')}$`, $options: 'i' } });
        if (existing) {
            return res.status(httpStatus.CONFLICT).json({ message: "that username is taken" });
        }

        const user = await User.create({
            name: cleanName,
            username: cleanUsername,
            password: await bcrypt.hash(password, 12),
        });

        // signed in straight away
        await startSession(req, res, user);
        return res.status(httpStatus.CREATED).json({ user: publicUser(user) });
    } catch (e) {
        // two sign-ups racing for the same username: the unique index rejects the second one
        if (e?.code === 11000) {
            return res.status(httpStatus.CONFLICT).json({ message: "that username is taken" });
        }
        console.error("register failed:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "something went wrong, please try again" });
    }
};

// POST /api/v1/auth/login
const login = async (req, res) => {
    const { username, password } = req.body ?? {};

    if (!isText(username) || !isText(password)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "please provide username and password" });
    }

    try {
        // new accounts are stored lowercase; older ones may have capitals, so fall back to the exact name
        const user =
            (await User.findOne({ username: normalizeUsername(username) })) ??
            (await User.findOne({ username: username.trim() }));

        // same answer, and roughly the same time, whether the user is missing or the password is wrong;
        // passwords over bcrypt's 72-byte limit are refused rather than truncated
        const tooLong = Buffer.byteLength(password, 'utf8') > LIMITS.password.maxBytes;
        const isMatch = !tooLong && (await bcrypt.compare(password, user?.password ?? DUMMY_HASH)) && !!user;

        if (!isMatch) {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Wrong credentials" });
        }

        await startSession(req, res, user);
        return res.status(httpStatus.OK).json({ user: publicUser(user) });
    } catch (e) {
        console.error("login failed:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "something went wrong, please try again" });
    }
};

// POST /api/v1/auth/logout — ends this browser's session on the server, not just in the browser
const logout = async (req, res) => {
    await endSession(req, res);
    return res.status(httpStatus.OK).json({ message: "logged out" });
};

// POST /api/v1/auth/logout-all — ends every session for this account (all devices)
const logoutAll = async (req, res) => {
    await endAllSessions(req, res, req.user._id);
    return res.status(httpStatus.OK).json({ message: "logged out everywhere" });
};

// GET /api/v1/auth/me — who am I? (the frontend can't read the httpOnly cookie, so it asks)
const me = async (req, res) => {
    return res.status(httpStatus.OK).json({ user: publicUser(req.user) });
};

// POST /api/v1/auth/socket-ticket — one-time pass for opening the call socket
const socketTicket = async (req, res) => {
    return res.status(httpStatus.OK).json({ ticket: issueTicket(req.user) });
};

export { register, login, logout, logoutAll, me, socketTicket };
