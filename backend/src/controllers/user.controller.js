import {User} from '../models/user.model.js';
import httpStatus from 'http-status';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const login = async (req,res) => {
    const {username, password} = req.body;

    if(!username || !password){
        return res.status(400).json({message: "please provide username or password"});
    }

    try{
        const user = await User.findOne({username});

        if(!user){
            return res.status(httpStatus.NOT_FOUND).json({message: "Wrong credentials"});
        }

        console.log(user);
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
    const {name, username, password} = req.body;

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
        return res.json({message: `something went wrong ${e}`});
    }
}

export {login, register};