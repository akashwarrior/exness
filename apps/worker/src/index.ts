import { EVENT_TYPE, QUEUE, RedisClient } from "@exness/redisClient";
import { PrismaClient, type ExistingTrades } from "@exness/db";

const client = new RedisClient();
const prisma = new PrismaClient();

async function main() {
    await client.connect();

    while (1) {
        const messages = await client.xRead({ key: QUEUE.WORKER_QUEUE });

        for (const { type, message } of messages) {
            if (type === EVENT_TYPE.TRADE_CLOSE) {
                const existingOrder: Omit<ExistingTrades, "id"> = {
                    assetId: message.assetId!,
                    closePrice: parseFloat(message.closePrice!),
                    leverage: parseFloat(message.leverage!),
                    openPrice: parseFloat(message.openPrice!),
                    pnl: parseFloat(message.pnl!),
                    userId: message.email!,
                    liquidated: message.liquidated! === 'true',
                    createdAt: new Date(message.createdAt!),
                };

                try {
                    await prisma.existingTrades.create({
                        data: existingOrder,
                    });
                } catch (e) {
                    console.log("Failed to store trade in DB", e);
                }
            }
        }
    }
}

main();
