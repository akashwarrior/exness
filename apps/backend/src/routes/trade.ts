import { Router } from "express";
import { OrderSchema } from "../config/zodSchema";
import { EVENT_TYPE, RedisClient } from "@exness/redisClient";
import { publishAndSubscribe } from "../redis";
import z from "zod";

const router = Router();

const client = new RedisClient();
client.connect();

router.post('/create', async (req, res) => {
    const body = req.body;
    const { data, error } = z.safeParse(OrderSchema, body);

    if (error) {
        return res.status(403).json({
            error: "Invalid Inputs",
        })
    }

    try {
        const response = await publishAndSubscribe(req.headers.email! as string, {
            msgType: EVENT_TYPE.TRADE_OPEN,
            message: { payload: JSON.stringify(data) }
        }, client)

        res.status(200).json(response)

    } catch {
        res.status(401).json({
            error: "Failed to execute order",
        })
    }
});

router.post('/close', async (req, res) => {
    const orderId = req.body?.orderId;

    if (!orderId) {
        return res.status(403).json({
            error: "Invalid Inputs",
        })
    }

    try {
        const response = await publishAndSubscribe(req.headers.email! as string, {
            msgType: EVENT_TYPE.TRADE_CLOSE,
            message: { orderId }
        }, client);

        res.status(200).json(response)

    } catch {
        res.status(401).json({
            error: "Failed to close order",
        })
    }
});

export default router;