// Input rules shared by the auth routes and the User model.

export const LIMITS = {
    name: { min: 1, max: 40 },
    username: { min: 3, max: 30 },
    // bcrypt only uses the first 72 bytes of a password, so longer ones are refused
    // instead of being silently cut short
    password: { min: 8, maxBytes: 72 },
};

const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

// only real strings: objects like {"$ne": null} would become MongoDB query operators
export const isText = (value) => typeof value === "string" && value.trim() !== "";

// "  Alice " → "alice"
export const normalizeUsername = (value) => value.trim().toLowerCase();

export const validateName = (name) => {
    if (!isText(name)) return "please enter your name";
    const n = name.trim();
    if (n.length > LIMITS.name.max) return `name can be at most ${LIMITS.name.max} characters`;
    return null;
};

export const validateUsername = (username) => {
    if (!isText(username)) return "please enter a username";
    const u = normalizeUsername(username);
    if (u.length < LIMITS.username.min || u.length > LIMITS.username.max) {
        return `username must be ${LIMITS.username.min}-${LIMITS.username.max} characters`;
    }
    if (!USERNAME_PATTERN.test(u)) {
        return "username can only use letters, numbers, dots, dashes and underscores";
    }
    return null;
};

export const validatePassword = (password) => {
    if (typeof password !== "string" || password.length === 0) return "please enter a password";
    if (password.length < LIMITS.password.min) return `password must be at least ${LIMITS.password.min} characters`;
    if (Buffer.byteLength(password, "utf8") > LIMITS.password.maxBytes) return "password is too long (max 72 characters)";
    return null;
};
