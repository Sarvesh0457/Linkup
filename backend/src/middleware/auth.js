import httpStatus from "http-status";
import { readSession } from "../lib/session.js";

// Routes behind this need a valid session cookie; sets req.user and req.session.
export const requireAuth = async (req, res, next) => {
    const found = await readSession(req);
    if (!found) {
        return res.status(httpStatus.UNAUTHORIZED).json({ message: "please log in again" });
    }
    req.user = found.user;
    req.session = found.session;
    next();
};
