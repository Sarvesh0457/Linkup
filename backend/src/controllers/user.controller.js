import {User} from '../models/user.model.js';
import httpStatus from 'http-status';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// only accept real, non-empty strings (objects like {"$ne": null} would become MongoDB query operators)
const isText = (value) => typeof value === 'string' && value.trim() !== '';

const login = async (req,res) => {
    const {username, password} = req.body ?? {};

    if(!isText(username) || !isText(password)){
        return res.status(httpStatus.BAD_REQUEST).json({message: "please provide username and password"});
    }

    try{
        const user = await User.findOne({username});

        if(!user){
            return res.status(httpStatus.NOT_FOUND).json({message: "Wrong credentials"});
        }

        const isMatch = await bcrypt.compare(password,user.password);

        if(!isMatch){
            return res.status(httpStatus.UNAUTHORIZED).json({message: "Wrong credentials"});
        }

        let token = crypto.randomBytes(20).toString("hex");

        user.token = token;
        await user.save();
        return res.status(httpStatus.OK).json({token:token, name: user.name});

    }catch(e) {
        return res.status(500).json({message: "something went wrong ",e});
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
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({message: `something went wrong ${e}`});
    }
}

export {login, register};