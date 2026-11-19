import crypto from "node:crypto";

// Short-lived, single-use tickets for opening a socket.
//
// Why: in production the frontend (Vercel) and backend (Render) are different sites, and
// browsers increasingly refuse to send cookies across sites. REST calls go through a Vercel
// rewrite so the session cookie stays first-party, but WebSockets can't be rewritten. So the
// browser asks the API (cookie-authenticated) for a ticket, then connects the socket with it.
const TTL_MS = 60 * 1000;
const tickets = new Map(); // ticket -> { user, expires }

export const issueTicket = (user) => {
    const ticket = crypto.randomBytes(24).toString("base64url");
    tickets.set(ticket, { user: { id: String(user._id), name: user.name }, expires: Date.now() + TTL_MS });
    return ticket;
};

// returns the user once; the ticket can't be used again
export const redeemTicket = (ticket) => {
    if (typeof ticket !== "string") return null;
    const entry = tickets.get(ticket);
    tickets.delete(ticket);
    if (!entry || entry.expires < Date.now()) return null;
    return entry.user;
};

// drop expired tickets now and then so the map can't grow forever
setInterval(() => {
    const now = Date.now();
    for (const [t, e] of tickets) if (e.expires < now) tickets.delete(t);
}, TTL_MS).unref();
