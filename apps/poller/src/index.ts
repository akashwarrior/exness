import { EVENT_TYPE, RedisClient } from '@exness/redisClient'
import type { AssetMessage, Msg } from "./types";
import { PrismaClient } from '@exness/db';

const prisma = new PrismaClient();

const ASSETS = (
  await prisma.asset.findMany({
    select: {
      symbol: true,
    }
  })
).map(asset => asset.symbol)

await prisma.$disconnect();

const PRICES: { [key: string]: Msg } = {};

const client = new RedisClient();
client.connect()

const socket = new WebSocket('wss://ws.backpack.exchange/');

socket.onopen = () => {
  ASSETS.forEach(asset => socket.send(JSON.stringify({
    method: "SUBSCRIBE",
    params: ["bookTicker." + asset + "C"],
  })))

  setInterval(async () => {
    // TODO: fix this operation
    const priceValues = Object.values(PRICES);
    if (!priceValues.length) return;

    await client.xAdd({
      msgType: EVENT_TYPE.ASSETS_PRICE,
      message: {
        price_updates: JSON.stringify(priceValues),
      }
    })

    console.log({
      price_updates: priceValues,
    })
  }, 1000);
}

socket.onmessage = (ev) => {
  const { data: { s: symbol, a: ask, b: bid } }: AssetMessage = JSON.parse(ev.data);
  const price = parseFloat(ask.toString().split('.').join(''));     // ((bid + ask) / 2) for better price
  const decimal = Number(String(ask).split('.')[1]?.length)         // bad approach

  PRICES[symbol] = {
    asset: symbol.substring(0, symbol.length - 1),
    price: price,
    decimal: decimal,
  }
}
