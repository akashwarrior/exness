import { RedisClient, EVENT_TYPE, QUEUE } from "@exness/redisClient";
import type { AssetPriceUpdate } from "./types";
import { OrderBook } from "./orderBook";

const orderBook = new OrderBook();
const client = new RedisClient();

async function main() {
    await client.connect();
    await orderBook.recoverState();

    while (1) {
        const message = await client.xRead({});
        if (!message) continue;

        switch (message.type) {
            case EVENT_TYPE.LOGIN:
                orderBook.addUserBalance(message.email!);
                break;

            case EVENT_TYPE.ASSETS_PRICE:
                const assets = JSON.parse(message.price_updates!) as AssetPriceUpdate[];
                orderBook.handlePriceChange(assets);
                break;

            case EVENT_TYPE.TRADE_OPEN:
                const msg = orderBook.createOrder({
                    email: message.email,
                    ...JSON.parse(message.payload!),
                });

                client.xAdd({
                    key: QUEUE.WORKER_QUEUE,
                    msgType: EVENT_TYPE.TRADE_OPEN,
                    message: {
                        id: message.id,
                        ...msg,
                    },
                });
                break;

            case EVENT_TYPE.TRADE_CLOSE:
                const res = orderBook.closeOrder({
                    orderId: message.orderId!,
                    uniqueId: message.id,
                });
                client.xAdd({
                    key: QUEUE.WORKER_QUEUE,
                    msgType: EVENT_TYPE.TRADE_CLOSE,
                    message: res,
                });
                break;

            case EVENT_TYPE.BALANCE:
                const asset = message?.asset ? message?.asset : null;
                const email = message.email!;
                const balance = orderBook.getUserBalance(email);

                client.xAdd({
                    key: QUEUE.WORKER_QUEUE,
                    msgType: EVENT_TYPE.BALANCE,
                    message: {
                        id: message.id,
                        balance: JSON.stringify(
                            asset ? balance?.[asset] : balance,
                        ),
                    },
                });
                break;

            default:
                console.log("Unsupported Message");
        }
    }
}

main();
