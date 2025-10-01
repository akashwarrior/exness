import { EVENT_TYPE, QUEUE, RedisClient } from "@exness/redisClient";

class RedisConsumer extends RedisClient {
    private callbacks: Record<string, (val: Record<string, number | string>) => void> = {};

    constructor() {
        super();
        this.readEvents();
    }

    public async readEvents() {
        await this.connect();
        try {
            while (1) {
                const messages = await this.xRead({ key: QUEUE.WORKER_QUEUE });
                for (const { message } of messages) {
                    const id = message?.id;
                    if (!id) continue;
                    let data = {};

                    switch (message.type) {
                        case EVENT_TYPE.TRADE_OPEN:
                            data = { orderId: message.orderId! };
                            break;

                        case EVENT_TYPE.TRADE_CLOSE:
                            data = { orderId: Number(message.orderId!) };
                            break;

                        case EVENT_TYPE.BALANCE:
                            data = JSON.parse(message?.balance || "{}");
                            break;

                        case EVENT_TYPE.ERROR:
                            data = { message: message.message };
                    }
                    this.callbacks[id]!(data);
                    delete this.callbacks[id];
                }
            }
        } catch {
            this.readEvents();
        }
    }

    public subscribeEvent(uniqueId: string) {
        return new Promise<Record<string, number | string>>((resolve, reject) => {
            const timeout = setTimeout(reject, 5000);
            this.callbacks[uniqueId] = (data) => {
                timeout.close();
                resolve(data);
            };
        });
    }
}

const redisConsumer = new RedisConsumer();

function publishAndSubscribe(
    email: string,
    data: {
        msgType: EVENT_TYPE;
        message: Record<string, string>;
    },
    client: RedisClient,
) {
    const uniqueId = email + performance.now().toFixed(0);
    data.message.id = uniqueId;
    data.message.email = email;

    return new Promise<Record<string, number | string>>(async (resolve, reject) => {
        redisConsumer.subscribeEvent(uniqueId).then(resolve).catch(reject);
        await client.xAdd(data);
    });
}

export { publishAndSubscribe };
