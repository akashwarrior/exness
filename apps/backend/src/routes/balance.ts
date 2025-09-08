import { Router, type Request, type Response } from "express";
import { EVENT_TYPE, RedisClient } from "@exness/redisClient";
import { publishAndSubscribe } from "../redis";

const router = Router();
const client = new RedisClient();
client.connect();

async function balanceHandler(req: Request, res: Response) {
    const asset = req.params?.asset ?? "";

    try {
        const response = await publishAndSubscribe(req.headers.email! as string, {
            msgType: EVENT_TYPE.BALANCE,
            message: { asset }
        }, client)

        res.status(200).json(response)

    } catch (e) {
        console.log(e)
        res.status(401).json({
            error: "Failed to get balance",
        })
    }
}

router.get('/balance', balanceHandler);

router.get('/balance/:asset', balanceHandler);

export default router;