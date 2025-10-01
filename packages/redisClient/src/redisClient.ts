import { createClient } from "redis";
import { EVENT_TYPE, QUEUE, } from "./types";
import type { RedisClientType } from "@redis/client";
import type { StreamMessage, StreamReadOptions } from "./types";

const DEFAULT_CONSUMER_GROUP = "consumer_group";
const DEFAULT_CONSUMER_NAME = "engine";

type StreamEntry = {
    id: string;
    message: Record<string, string>;
};

type StreamAddParams = Partial<Omit<StreamReadOptions, "options">> & {
    msgType: EVENT_TYPE;
    message: Record<string, string | number | boolean | undefined>;
};

export class RedisClient {
    private readonly client: RedisClientType;

    constructor() {
        this.client = createClient();
    }

    public async connect() {
        return this.client.connect();
    }

    public disconnect(): void {
        this.client.destroy();
    }

    public async xRead({
        key = QUEUE.PRIMARY_QUEUE,
        id = "0",
        options = { BLOCK: 0 },
    }: Partial<StreamReadOptions>): Promise<StreamMessage[]> {
        const response = await this.client.xRead({ key, id }, options);
        if (!response) {
            return [];
        }

        return this.extractMessages(response.flatMap((entry) => entry.messages));
    }

    public async createGroup(id: string = "0"): Promise<void> {
        try {
            await this.client.xGroupCreate(
                QUEUE.PRIMARY_QUEUE,
                DEFAULT_CONSUMER_GROUP,
                id,
            );
        } catch (error) {
            console.log("Consumer group already exists.");
        }
    }

    public async xReadGroup({
        key = QUEUE.PRIMARY_QUEUE,
        id = "$",
        options = { BLOCK: 0 },
    }: Partial<StreamReadOptions>): Promise<StreamMessage[]> {
        const response = await this.client.xReadGroup(
            DEFAULT_CONSUMER_GROUP,
            DEFAULT_CONSUMER_NAME,
            { id, key },
            options,
        );

        if (!response) {
            return [];
        }

        return this.extractMessages(response.flatMap((entry) => entry.messages));
    }

    public async xAdd({
        key = QUEUE.PRIMARY_QUEUE,
        id = "*",
        message,
        msgType,
    }: StreamAddParams): Promise<string> {
        const payload: Record<string, string> = { msgType };

        for (const [field, value] of Object.entries(message)) {
            if (field !== undefined && value !== undefined) {
                payload[field] = String(value);
            }
        }

        return this.client.xAdd(key, id, payload);
    }

    public async xRange({
        key = QUEUE.PRIMARY_QUEUE,
        start,
        end,
        exclusive = false,
        options,
    }: Partial<Omit<StreamReadOptions, "id">> & {
        start: string;
        end: string;
        exclusive: boolean;
    }): Promise<StreamMessage[]> {
        const formattedStart = exclusive ? `(${start}` : start;
        const response = await this.client.xRange(
            key,
            formattedStart,
            end,
            options,
        );
        return this.extractMessages(response);
    }

    public async xPending() {
        return this.client.xPending(QUEUE.PRIMARY_QUEUE, DEFAULT_CONSUMER_GROUP);
    }

    public async xAck({ key, id }: Omit<StreamReadOptions, "options">) {
        return this.client.xAck(key, DEFAULT_CONSUMER_GROUP, id);
    }

    private extractMessages(entries: StreamEntry[]): StreamMessage[] {
        const messages: StreamMessage[] = [];
        for (const { id, message } of entries) {
            const type = message?.msgType as EVENT_TYPE | undefined;
            if (!type) {
                continue;
            }

            messages.push({
                id,
                type,
                message,
            });
        }

        return messages;
    }
}
