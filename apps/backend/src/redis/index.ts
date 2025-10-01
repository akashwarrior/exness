import { EVENT_TYPE, QUEUE, RedisClient } from "@exness/redisClient";

type PublishPayload = {
    msgType: EVENT_TYPE;
    message: Record<string, string>;
};

type CallbackResponse = Record<string, number | string>;

class RedisConsumer extends RedisClient {
    private readonly callbacks: Record<string, (value: CallbackResponse) => void>;
    private reading = false;

    constructor() {
        super();
        this.callbacks = Object.create(null);
        void this.startReading();
    }

    private async startReading(): Promise<void> {
        if (this.reading) {
            return;
        }

        this.reading = true;

        while (this.reading) {
            try {
                await this.consumeWorkerQueue();
            } catch (error) {
                console.error("Redis consumer error", error);
                await this.delay(1000);
            }
        }
    }

    private async consumeWorkerQueue(): Promise<void> {
        await this.connect();

        while (true) {
            const messages = await this.xRead({ key: QUEUE.WORKER_QUEUE });

            for (const { message } of messages) {
                const callbackId = message?.id;
                if (!callbackId) {
                    continue;
                }

                const callback = this.callbacks[callbackId];
                if (!callback) {
                    continue;
                }

                callback(this.normalizeMessage(message));
                delete this.callbacks[callbackId];
            }
        }
    }

    private normalizeMessage(message: Record<string, string>): CallbackResponse {
        switch (message.type) {
            case EVENT_TYPE.TRADE_OPEN:
                return { orderId: message.orderId! };

            case EVENT_TYPE.TRADE_CLOSE:
                return { orderId: Number(message.orderId!) };

            case EVENT_TYPE.BALANCE:
                return JSON.parse(message.balance ?? "{}");

            case EVENT_TYPE.ERROR:
                return { message: message.message! };

            default:
                return {};
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    public subscribeEvent(uniqueId: string): Promise<CallbackResponse> {
        return new Promise<CallbackResponse>((resolve, reject) => {
            const timeout = setTimeout(() => {
                delete this.callbacks[uniqueId];
                reject(new Error("Response timeout"));
            }, 5000);

            this.callbacks[uniqueId] = (data) => {
                clearTimeout(timeout);
                resolve(data);
            };
        });
    }
}

const redisConsumer = new RedisConsumer();

async function publishAndSubscribe(
    email: string,
    data: PublishPayload,
    client: RedisClient,
): Promise<CallbackResponse> {
    const uniqueId = `${email}:${Date.now()}:${performance.now().toFixed(0)}`;

    data.message.id = uniqueId;
    data.message.email = email;

    const responsePromise = redisConsumer.subscribeEvent(uniqueId);
    await client.xAdd(data);

    return responsePromise;
}

export { publishAndSubscribe };
