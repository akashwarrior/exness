import type { NextFunction, Request, Response } from "express";
import JWT, { type JwtPayload } from "jsonwebtoken";
import dotnev from "dotenv";

dotnev.config();

const JWT_SECRET = process.env.JWT_SECRET || "secret";

export default function middleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    const token = req.cookies.session_token;

    if (!token) {
        return res.status(401).json({
            error: "Sign In required",
        });
    }

    try {
        const { email } = JWT.verify(token, JWT_SECRET) as JwtPayload;
        req.headers.email = email;
        next();
    } catch (e) {
        console.log(e);
        res.status(401).json({
            error: "Invalid Token",
        });
    }
}
