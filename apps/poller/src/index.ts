import { EVENT_TYPE, RedisClient } from "@exness/redisClient";
import { PrismaClient } from "@exness/db";
import type { Asset, AssetMessage } from "./types";

const BROADCAST_INTERVAL_MS = 1000;
const WEBSOCKET_URL = process.env.WEBSOCKET_URL || "wss://ws.backpack.exchange"; // backpack url

const redisClient = new RedisClient();
const decimalsBySymbol = new Map<string, number>();
const pricesBySymbol = new Map<string, Asset>();

let lastBroadcastAt = Date.now();

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
        const priceInDecimal = Number(midpoint.toFixed(decimal));
        const price = priceInDecimal * 10 ** decimal;

        pricesBySymbol.set(symbol, { asset: symbol, price, decimal });

        if ((Date.now() - lastBroadcastAt) >= BROADCAST_INTERVAL_MS) {
            lastBroadcastAt = Date.now();

            broadcastPriceSnapshot().catch((error) =>
                console.error("Failed to broadcast price snapshot", error),
            );
        }

    } catch (error) {
        console.log(data);
        console.error("Failed to parse data stream", error);
    }
}

async function main() {
    await loadAssetDecimals();

    if (!decimalsBySymbol.size) {
        console.log("No assets found");
        return;
    }

    await redisClient.connect();

    const socket = new WebSocket(WEBSOCKET_URL);

    socket.onopen = () => subscribeToAssets(socket);
    socket.onmessage = ({ data }) => handleTickerMessage(data as string);
    socket.onerror = (event) => console.error("WebSocket error", event);
    socket.onclose = (event) =>
        console.warn("WebSocket connection closed", {
            code: event.code,
            reason: event.reason,
        });
}

main().catch((error) => {
    console.error("Poller failed", error);
});

