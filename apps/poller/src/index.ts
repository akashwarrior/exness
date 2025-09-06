import { createClient } from 'redis';
import type { AssetMessage, Msg } from "./types";

const ASSETS = ["ETH_USDC", "SOL_USDC", "BTC_USDC"] // TODO: get from db
const PRICES: { [key: string]: Msg } = {};

// constansts 
const ASSET_PRICE = "ASSETS_PRICE";
const SECONDARY_QUEUE = "queue:secondary";

const client = createClient();
client.connect()

const socket = new WebSocket('wss://ws.backpack.exchange/')

socket.onopen = () => {
  ASSETS.forEach(asset => socket.send(JSON.stringify({
    method: "SUBSCRIBE",
    params: ["bookTicker." + asset],
  })))
}

let now = new Date().getTime();

socket.onmessage = (ev) => {
  const { data: { s: symbol, a: ask, b: bid } }: AssetMessage = JSON.parse(ev.data);
  const price = ask.toString().split('.').join('') // ((bid + ask) / 2) for better price
  const decimal = Number(String(ask).split('.')[1]?.length) // bad approach

  PRICES[symbol] = {  // use better data stucture
    asset: symbol,
    price: Number(price),
    decimal
  }

  const priceValues = Object.values(PRICES);

  if ((new Date().getTime() - now) >= 2000) {
    client.xAdd(
      SECONDARY_QUEUE, '*',
      {
        msgType: ASSET_PRICE,
        price_updates: JSON.stringify(priceValues),
      }
    )

    console.log({
      price_updates: priceValues,
    })

    now = new Date().getTime();
  }
}
