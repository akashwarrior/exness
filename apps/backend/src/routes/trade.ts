import type { Request, Response } from "express";
import { Router } from "express";
import z from "zod";

import { OrderSchema } from "../config/zodSchema";
import { publishAndSubscribe } from "../redis";
import { EVENT_TYPE, RedisClient } from "@exness/redisClient";

const router = Router();
const redisClient = new RedisClient();

void redisClient.connect();

router.post("/create", async (req: Request, res: Response) => {
    const { data, error } = z.safeParse(OrderSchema, req.body);

    if (error) {
        res.status(403).json({
            error: "Invalid inputs",
        });
        return;
    }

    try {
        const response = await publishAndSubscribe(
            req.headers.email as string,
            {
                msgType: EVENT_TYPE.TRADE_OPEN,
                message: { payload: JSON.stringify(data) },
            },
            redisClient,
        );

        res.status(200).json(response);
    } catch (err) {
        console.error("Failed to execute order", err);
        res.status(401).json({
            error: "Failed to execute order",
        });
    }
});

router.post("/close", async (req: Request, res: Response) => {
    const orderId = req.body?.orderId;

    if (!orderId) {
        res.status(403).json({
            error: "Invalid inputs",
        });
        return;
    }

    try {
        const response = await publishAndSubscribe(
            req.headers.email as string,
            {
                msgType: EVENT_TYPE.TRADE_CLOSE,
                message: { orderId },
            },
            redisClient,
        );

        res.status(200).json(response);
    } catch (err) {
        console.error("Failed to close order", err);
        res.status(401).json({
            error: "Failed to close order",
        });
    }
});

export default router;
