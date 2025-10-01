import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "secret";

export default function middleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const token = req.cookies.session_token;

    if (!token) {
        res.status(401).json({
            error: "Sign in required",
        });
        return;
    }

    try {
        const { email } = jwt.verify(token, JWT_SECRET) as JwtPayload;
        req.headers.email = email;
        next();
    } catch (error) {
        console.error("Invalid token", error);
        res.status(401).json({
            error: "Invalid token",
        });
    }
}
