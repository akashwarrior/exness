import { EVENT_TYPE, RedisClient } from '@exness/redisClient'
import type { AssetMessage, Msg } from "./types";

const ASSETS = ["ETH_USDC", "SOL_USDC", "BTC_USDC"] // TODO: get from db
const PRICES: { [key: string]: Msg } = {};

const client = new RedisClient();
client.connect()

const socket = new WebSocket('wss://ws.backpack.exchange/');

socket.onopen = () => {
  ASSETS.forEach(asset => socket.send(JSON.stringify({
    method: "SUBSCRIBE",
    params: ["bookTicker." + asset],
  })))
}

let now = new Date().getTime();

socket.onmessage = async (ev) => {
  const { data: { s: symbol, a: ask, b: bid } }: AssetMessage = JSON.parse(ev.data);
  const price = ask.toString().split('.').join('')            // ((bid + ask) / 2) for better price
  const decimal = Number(String(ask).split('.')[1]?.length)   // bad approach

  PRICES[symbol] = {  // use better data stucture
    asset: symbol,
    price: Number(price),
    decimal
  }

  const priceValues = Object.values(PRICES);

  if ((new Date().getTime() - now) >= 2000) {
    await client.xAdd({
      msgType: EVENT_TYPE.ASSETS_PRICE,
      message: {
        price_updates: JSON.stringify(priceValues),
      }
    })

    console.log({
      price_updates: priceValues,
    })

    now = new Date().getTime();
  }
}
