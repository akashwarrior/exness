import { RedisClient, QUEUE } from "@exness/redisClient";
import { TradingEngine } from "./tradingEngine";

const engine = new TradingEngine();
const redisClient = new RedisClient();

async function runEngineLoop(): Promise<void> {
    await engine.recoverState();
    await redisClient.connect();

    while (true) {
        const messages = await redisClient.xReadGroup({});
        for (const message of messages) {
            engine.processStream(message);
            await redisClient.xAck({
                key: QUEUE.PRIMARY_QUEUE,
                id: message.id,
            });
        }
    }
}

runEngineLoop().catch((error) => {
    redisClient.disconnect();
    engine.shutdown();
    console.error("Engine shutting down", error);
});