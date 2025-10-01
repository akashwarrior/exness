import type { Request, Response } from "express";
import { Router } from "express";

import { EVENT_TYPE, RedisClient } from "@exness/redisClient";

import { publishAndSubscribe } from "../redis";

const router = Router();
const redisClient = new RedisClient();

void redisClient.connect();

async function balanceHandler(req: Request, res: Response): Promise<void> {
    const asset = req.params?.asset ?? "";

    try {
        const response = await publishAndSubscribe(
            req.headers.email as string,
            {
                msgType: EVENT_TYPE.BALANCE,
                message: { asset },
            },
            redisClient,
        );

        res.status(200).json(response);
    } catch (error) {
        console.error("Failed to get balance", error);
        res.status(401).json({
            error: "Failed to get balance",
        });
    }
}

router.get("/balance", balanceHandler);
router.get("/balance/:asset", balanceHandler);

export default router;
