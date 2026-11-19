import {User} from '../models/user.model.js';
import httpStatus from 'http-status';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// only accept real, non-empty strings (objects like {"$ne": null} would become MongoDB query operators)
const isText = (value) => typeof value === 'string' && value.trim() !== '';

// compared against when the username doesn't exist, so both cases take the same time
const DUMMY_HASH = bcrypt.hashSync('linkup-timing-guard', 12);

const login = async (req,res) => {
    const {username, password} = req.body ?? {};

    if(!isText(username) || !isText(password)){
        return res.status(httpStatus.BAD_REQUEST).json({message: "please provide username and password"});
    }

    try{
        const user = await User.findOne({username});

        // same status and message for "no such user" and "wrong password",
        // so the response doesn't reveal which usernames exist
        const isMatch = await bcrypt.compare(password, user?.password ?? DUMMY_HASH) && !!user;

        if(!isMatch){
            return res.status(httpStatus.UNAUTHORIZED).json({message: "Wrong credentials"});
        }

        // keep the existing token so logging in on a second device doesn't sign out the first
        if(!user.token){
            user.token = crypto.randomBytes(20).toString("hex");
            await user.save();
        }

        return res.status(httpStatus.OK).json({token: user.token, name: user.name});

    }catch(e) {
        console.error("login failed:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({message: "something went wrong, please try again"});
    }
}

const register = async (req,res) => {
    const {name, username, password} = req.body ?? {};

    if(!isText(name) || !isText(username) || !isText(password)){
        return res.status(httpStatus.BAD_REQUEST).json({message: "please provide name, username and password"});
    }

    try{
        const existingUser = await User.findOne({username});

        if(existingUser) {
            return res.status(httpStatus.CONFLICT).json({message: "User Already exists"});
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = new User({
            name: name,
            username: username,
            password: hashedPassword
        });

        await newUser.save();

        res.status(httpStatus.CREATED).json({message: "User created"});

    }catch(e){
        // two sign-ups racing for the same username: the unique index rejects the second one
        if(e?.code === 11000){
            return res.status(httpStatus.CONFLICT).json({message: "User Already exists"});
        }
        console.error("register failed:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({message: "something went wrong, please try again"});
    }
}

export {login, register};