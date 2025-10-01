import { EVENT_TYPE, RedisClient } from "@exness/redisClient";
import { PrismaClient } from "@exness/db";
import type { Asset, AssetMessage } from "./types";

const BROADCAST_INTERVAL_MS = 100;
const WEBSOCKET_URL = process.env.WEBSOCKET_URL || "wss://ws.backpack.exchange"; // backpack url
const RECONNECT_DELAY_MS = 1_000;

const redisClient = new RedisClient();
const decimalsBySymbol = new Map<string, number>();
const pricesBySymbol = new Map<string, Asset>();

async function loadAssetDecimals() {
    const prisma = new PrismaClient();

    try {
        await prisma.$connect();

        const assets = await prisma.asset.findMany({
            select: {
                symbol: true,
                decimal: true,
            },
        });

        for (const { symbol, decimal } of assets) {
            decimalsBySymbol.set(symbol, decimal);
        }
    } catch (error) {
        console.error("Failed to load asset metadata", error);
    } finally {
        try {
            await prisma.$disconnect();
        } catch (disconnectError) {
            console.error("Failed to disconnect Prisma", disconnectError);
        }
    }
}

async function broadcastPriceSnapshot() {
    const pricesArray = Array.from(pricesBySymbol.values());
    if (!pricesArray.length) {
        return;
    }

    await redisClient.xAdd({
        msgType: EVENT_TYPE.ASSETS_PRICE,
        message: {
            price_updates: JSON.stringify(pricesArray),
        },
    });

    console.log({ price_values: pricesArray });
}

const broadcastLoop = (() => {
    let intervalHandle: NodeJS.Timeout | null = null;

    return {
        start() {
            if (intervalHandle) return;
            intervalHandle = setInterval(() => {
                broadcastPriceSnapshot().catch((error) =>
                    console.error("Failed to broadcast price snapshot", error),
                );
            }, BROADCAST_INTERVAL_MS);
        },
        stop() {
            if (!intervalHandle) return;
            clearInterval(intervalHandle);
            intervalHandle = null;
        },
    };
})();

function subscribeToAssets(socket: WebSocket) {
    for (const symbol of decimalsBySymbol.keys()) {
        socket.send(
            JSON.stringify({
                method: "SUBSCRIBE",
                params: [`bookTicker.${symbol}`],
            }),
        );
    }
}

function handleTickerMessage(data: string) {
    try {
        const { data: { s: symbol, a: ask, b: bid } }: AssetMessage = JSON.parse(data);

        const decimal = decimalsBySymbol.get(symbol)!;

        const midpoint = (Number(ask) + Number(bid)) / 2;
        const price = Math.trunc(midpoint * (10 ** decimal));

        pricesBySymbol.set(symbol, { asset: symbol, price, decimal });
    } catch (error) {
        console.log(data);
        console.error("Failed to parse data stream", error);
    }
}

function createSocketSession(): Promise<void> {
    return new Promise((resolve) => {
        const socket = new WebSocket(WEBSOCKET_URL);

        const teardown = () => {
            broadcastLoop.stop();
            socket.onopen = null;
            socket.onmessage = null;
            socket.onerror = null;
            socket.onclose = null;
        };

        socket.onopen = () => {
            subscribeToAssets(socket);
            broadcastLoop.start();
        };

        socket.onmessage = ({ data }) => handleTickerMessage(data as string);

        socket.onerror = (event) => {
            console.error("WebSocket error", event);
            teardown();
            socket.close();
            resolve();
        };

        socket.onclose = (event) => {
            console.warn("WebSocket connection closed", {
                code: event.code,
                reason: event.reason,
            });
            teardown();
            resolve();
        };
    });
}

async function main() {
    await loadAssetDecimals();

    if (!decimalsBySymbol.size) {
        console.log("No assets found");
        return;
    }

    await redisClient.connect();

    while (true) {
        await createSocketSession();
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
        console.log("Reconnecting WebSocket...");
    }
}

main()