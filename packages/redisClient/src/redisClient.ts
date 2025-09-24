import { createClient } from "redis";
import type { RedisClientType } from "@redis/client";
import { EVENT_TYPE, QUEUE } from "./types";

export class RedisClient {
    private client: RedisClientType;

    constructor() {
        this.client = createClient();
    }

    public async connect() {
        return this.client.connect();
    }

    public disconnect() {
        this.client.destroy();
    }

    public async xRead({
        key = QUEUE.PRIMARY_QUEUE,
        id = "$",
        options = { BLOCK: 0 },
    }: Partial<{
        key: QUEUE;
        id: string;
        options: { BLOCK?: number; COUNT?: number };
    }>): Promise<(Record<string, string> & { type: EVENT_TYPE }) | null> {
        const data = await this.client.xRead(
            {
                key: key,
                id: id,
            },
            options,
        );

        const message = data?.[0]?.messages[0]?.message;

        if (!message || !message?.msgType) {
            return null;
        }

        return { ...message, type: message.msgType as EVENT_TYPE };
    }

    public async xAdd({
        key = QUEUE.PRIMARY_QUEUE,
        id = "*",
        message,
        msgType,
    }: {
        key?: QUEUE;
        id?: string;
        msgType: EVENT_TYPE;
        message: Record<string, string | number | boolean | undefined>;
    }) {
        const stringMessage: Record<string, string> = msgType
            ? { msgType }
            : {};
        for (const [k, v] of Object.entries(message)) {
            if (k !== undefined && v !== undefined) {
                stringMessage[k] = String(v);
            }
        }
        return await this.client.xAdd(key, id, stringMessage);
    }
}
