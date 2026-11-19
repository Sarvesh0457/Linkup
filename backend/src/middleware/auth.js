import httpStatus from "http-status";
import { User } from "../models/user.model.js";

// Looks up the user from the login token.
// REST requests send it as "Authorization: Bearer <token>"; sockets send it in the handshake.
export const findUserByToken = async (token) => {
    if (typeof token !== "string" || token.trim() === "") return null;
    return User.findOne({ token: token.trim() }).select("_id name username");
};

export const requireAuth = async (req, res, next) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    const user = await findUserByToken(token);
    if (!user) {
        return res.status(httpStatus.UNAUTHORIZED).json({ message: "please log in again" });
    }

    req.user = user;
    next();
};
