import { Router, type Request, type Response } from "express";
import JWT, { type JwtPayload } from 'jsonwebtoken';
import { generateMessage } from '../config/constant';
import { EVENT_TYPE, RedisClient } from "@exness/redisClient";
import { Resend } from 'resend';
import { AuthSchema } from "../config/zodSchema";
import dotenv from 'dotenv';
import z from "zod";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "secret";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const PROD = "production";

if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is requied in backend");
}

const resend = new Resend(RESEND_API_KEY);
const client = new RedisClient()
client.connect();

const router = Router()

async function handleAuth(req: Request, res: Response) {
    const body = req.body;
    const { data, error } = z.safeParse(AuthSchema, body);

    if (error) {
        return res.status(401).json({
            error: "Invalid Inputs",
        })
    }

    try {
        const token = JWT.sign({ email: data.email }, JWT_SECRET,
            { expiresIn: '5 Mins' }
        );

        if (process.env.NODE_ENV === PROD) {
            const { error } = await resend.emails.send({
                from: 'Acme <onboarding@resend.dev>',
                to: [data.email],
                subject: 'Exness-clone: verfiy email address',
                html: generateMessage({ token, email: data.email }),
            });

            if (error) {
                throw new Error(error.message);
            }
        } else {
            console.log({
                token,
            })
        }

        res.status(200).json({
            message: "Login link sent to your email",
        })

    } catch (e) {
        console.log("SignUp Error", e);
        res.status(501).json({
            error: "Failed to authenticate",
        })
    }
}

router.post('/signup', handleAuth);
router.post('/signin', handleAuth);


router.get('/signin/post', async (req, res) => {
    const token = req.query?.token as string;
    if (!token) {
        return res.status(501).json({
            error: "Invalid Token",
        })
    }

    try {
        const { email } = JWT.verify(token, JWT_SECRET) as JwtPayload;
        const authToken = JWT.sign({ email }, JWT_SECRET); // sign in with different token and required payload

        client.xAdd({
            msgType: EVENT_TYPE.LOGIN,
            message: { email },
        })

        res.cookie("session_token", authToken);

        res.status(200).json({
            message: "Login Successful",
        })

    } catch (e) {
        res.status(501).json({
            error: "Failed to verify Token",
        })
    }
});

export default router; 