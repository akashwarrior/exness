import { EVENT_TYPE, QUEUE, RedisClient } from '@exness/redisClient';
import { PrismaClient, type ExistingTrades } from '@exness/db'

const client = new RedisClient();
const prisma = new PrismaClient();

async function main() {
    await client.connect();

    while (1) {
        const message = await client.xRead({ key: QUEUE.WORKER_QUEUE });
        if (!message) continue;
        console.log(message);

        if (message.type === EVENT_TYPE.TRADE_CLOSE && !message.message) {
            const existingOrder: Omit<ExistingTrades, "id" | "createdAt"> = {
                assetId: message.assetId!,
                closePrice: parseFloat(message.closePrice!),
                leverage: parseFloat(message.leverage!),
                openPrice: parseFloat(message.openPrice!),
                pnl: parseFloat(message.pnl!),
                userId: message.email!,
                liquidated: true,   // only storing closed order so liquidating will alwasy be true
            };

            try {
                await prisma.existingTrades.create({
                    data: existingOrder,
                })
            } catch (e) {
                console.log("Failed to store trade in DB", e);
            }
        }
    }
}

main()