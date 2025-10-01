import { PrismaClient } from "@exness/db";
import { EVENT_TYPE, RedisClient } from "@exness/redisClient";
import dotenv from "dotenv";
import type { Request, Response } from "express";
import { Router } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { Resend } from "resend";
import z from "zod";

import { generateMessage } from "../config/constant";
import { AuthSchema } from "../config/zodSchema";

dotenv.config();

const PROD = "production";
const JWT_SECRET = process.env.JWT_SECRET || "secret";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required in backend");
}

const prisma = new PrismaClient();
const resend = new Resend(RESEND_API_KEY);
const redisClient = new RedisClient();

void redisClient.connect();

const router = Router();

async function handleAuth(req: Request, res: Response): Promise<void> {
    const { body } = req;
    const { data, error } = z.safeParse(AuthSchema, body);

    if (error) {
        res.status(401).json({
            error: "Invalid inputs",
        });
        return;
    }

    try {
        const token = jwt.sign({ email: data.email }, JWT_SECRET, {
            expiresIn: "5m",
        });

        if (process.env.NODE_ENV === PROD) {
            const { error: emailError } = await resend.emails.send({
                from: "Acme <onboarding@resend.dev>",
                to: [data.email],
                subject: "Exness-clone: verify email address",
                html: generateMessage({ token, email: data.email }),
            });

            if (emailError) {
                throw new Error(emailError.message);
            }
        } else {
            console.log({ token });
        }

        res.status(200).json({
            message: "Login link sent to your email",
        });
    } catch (error) {
        console.error("Sign up error", error);
        res.status(501).json({
            error: "Failed to authenticate",
        });
    }
}

router.post("/signup", handleAuth);
router.post("/signin", handleAuth);

router.get("/signin/post", async (req, res) => {
    const token = req.query?.token as string | undefined;

    if (!token) {
        res.status(501).json({
            error: "Invalid token",
        });
        return;
    }

    try {
        const { email } = jwt.verify(token, JWT_SECRET) as JwtPayload;

        const { id } = await prisma.user.upsert({
            where: { email },
            create: { email },
            update: { lastLoggedIn: new Date() },
            select: { id: true },
        });

        await redisClient.xAdd({
            msgType: EVENT_TYPE.LOGIN,
            message: { email: id },
        });

        const authToken = jwt.sign({ email: id }, JWT_SECRET);
        res.cookie("session_token", authToken);

        res.status(200).json({
            message: "Login successful",
        });
    } catch (error) {
        console.error("Login error", error);
        res.status(501).json({
            error: "Failed to login",
        });
    }
});

export default router;
