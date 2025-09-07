import { RedisClient, EVENT_TYPE, QUEUE } from '@exness/redisClient';

type Balance = {
    [key: string]: {
        balance: number,
        decimal: number,
    },
}

interface Trade {
    orderId: number;
    openPrice: number;
    closePrice?: number;
    leverage: number;
    pnl?: number;
    asset: string;
    email: string;
    createdAt: number;
    // liquidated: boolean  // it will always be true for storing closed order (can be set by db worker)
    type: 'long' | 'short'
    quantity: number;
    margin: number;
}

const ASSETS: { [asset: string]: Msg } = {};
let USERS: { [userId: string]: Balance } = {};
const BALANCE_DECIMAL = 2;

let orderLen = 0;
let ACTIVE_ORDERS: {
    [userId: string]: Trade[]
} = {};

let OPEN_ORDERS: {
    [userId: string]: Trade[]
} = {};

interface Msg {
    price: number,
    decimal: number,
}

const client = new RedisClient();

async function main() {
    await client.connect();

    while (1) {
        const message = await client.xRead({})
        if (!message) continue;

        switch (message.type) {
            case EVENT_TYPE.LOGIN:
                if (message?.email && !USERS[message.email]) {
                    USERS[message.email] = {
                        USD: {
                            balance: 5000_00, // 5000.00
                            decimal: 2,
                        }
                    }
                }
                break;

            case EVENT_TYPE.ASSETS_PRICE:
                handlePriceChnage(await JSON.parse(message.price_updates!));
                break;

            case EVENT_TYPE.TRADE_OPEN:
                const msg = executeTrade({ email: message.email, ...JSON.parse(message.payload!) });

                client.xAdd({
                    key: QUEUE.WORKER_QUEUE,
                    msgType: EVENT_TYPE.TRADE_OPEN,
                    message: {
                        id: message.id,
                        ...msg,
                    }
                });
                break;

            case EVENT_TYPE.TRADE_CLOSE:
                const object = Object.values(ACTIVE_ORDERS);
                object.map(orders => orders.map(order => closeTrade(order, message.id)))
                break;

            case EVENT_TYPE.BALANCE:
                const asset = message?.asset ? message?.asset : null;
                const email = message.email!;
                const balance = asset ? USERS[email]?.[asset] : USERS[email]!.USD!.balance;

                client.xAdd({
                    key: QUEUE.WORKER_QUEUE,
                    msgType: EVENT_TYPE.BALANCE,
                    message: {
                        id: message.id,
                        assetBalance: JSON.stringify({ [asset ?? "balance"]: balance, }),
                    }
                })
                break;

            default:
                console.log("Unsupported Message");
        }
    }

}

function executeTrade({ asset, email, leverage, margin, type }: {
    type: 'long' | 'short';
    email: string;
    asset: string;
    margin: string | number;
    leverage: string;
    slippage: string; // there is not frontend price to check slippage
}): Record<string, string> {
    const { decimal, price } = ASSETS[asset]!;
    const assetPrice = price / (10 ** decimal)
    margin = Number(margin) / (10 ** BALANCE_DECIMAL)
    const volume = (Number(margin) / assetPrice) * Number(leverage);
    let balance = USERS[email]!.USD!.balance ?? 0;
    balance = balance > 0 ? balance / (10 ** BALANCE_DECIMAL) : 0;

    if ((assetPrice * volume) >= balance) {
        return {
            message: "Insufficient balance",
        }
    }
    // 204 * 24.5 = 4998
    USERS[email]!.USD!.balance -= (margin * (10 ** BALANCE_DECIMAL));
    if (USERS[email]?.[asset]) {
        USERS[email][asset].balance += (assetPrice * volume)
        USERS[email][asset].decimal = decimal
    } else {
        USERS[email]![asset] = {
            balance: (assetPrice * volume),
            decimal,
        }
    }

    const order: Trade = {
        asset: asset,
        email: email,
        type,
        quantity: volume,
        orderId: orderLen++,
        leverage: Number(leverage),
        margin: Number(margin),
        openPrice: Number(assetPrice),
        createdAt: new Date().getTime(),
    }

    if (Number(leverage) > 1 || type === 'short') {
        if (!ACTIVE_ORDERS[email]) {
            ACTIVE_ORDERS[email] = [order]
        } else {
            ACTIVE_ORDERS[email].push(order);
        }
    } else {
        if (!OPEN_ORDERS[email]) {
            OPEN_ORDERS[email] = [order];
        } else {
            OPEN_ORDERS[email].push(order);
        }
    }

    console.log(OPEN_ORDERS)
    console.log(ACTIVE_ORDERS)
    console.log(USERS)

    return {
        orderId: String(orderLen - 1),
    }
}

function handlePriceChnage(price_updates: (Msg & { asset: string })[]) {
    for (const { asset, decimal, price } of price_updates) {
        ASSETS[asset] = {
            decimal,
            price,
        }
        const closedTrades: string[] = [];
        if (ACTIVE_ORDERS[asset]) {
            const trades = ACTIVE_ORDERS[asset];

            for (const trade of trades) {
                const openPrice = (trade.openPrice * trade.leverage);   // 100 * 10 = 1000  - currentBalance -> 5000 
                const currentPrice = (price * trade.leverage);          // 150 * 10 = 1500  - currentBalance -> 5000
                const liquidateBalance = USERS[trade.email]!.USD!.balance * 0.9;

                if (trade.type === 'long' && (openPrice - currentPrice) >= liquidateBalance) {
                    closedTrades.push(trade.email);
                    closeTrade(trade);
                } else if (trade.type === 'short' && (currentPrice - openPrice) > liquidateBalance) {
                    closedTrades.push(trade.email);
                    closeTrade(trade);
                }
            }

            for (const closedTrade of closedTrades) {
                ACTIVE_ORDERS[asset].filter(x => x.email !== closedTrade);
            }
        }
    }
}


function closeTrade(trade: Trade, uniqueId?: string) {
    const { price, decimal } = ASSETS[trade.asset]!;

    const currentPrice = (price / (10 ** decimal))

    const orderId = trade.orderId;
    USERS[trade.email]!.USD!.balance += ((currentPrice! * trade.quantity) * (10 ** decimal));
    USERS[trade.email]![trade.asset]!.balance -= (currentPrice! * trade.quantity);

    client.xAdd({
        key: QUEUE.WORKER_QUEUE,
        msgType: EVENT_TYPE.TRADE_CLOSE,
        message: {
            id: uniqueId,
            ...trade,
            closePrice: currentPrice,
            balance: USERS[trade.email]!.USD!.balance,
            pnl: 1,
        }
    })

    ACTIVE_ORDERS = { ...ACTIVE_ORDERS, [trade.email]: ACTIVE_ORDERS[trade.email]?.filter(trade => trade.orderId !== orderId) ?? [] }
    OPEN_ORDERS = { ...OPEN_ORDERS, [trade.email]: OPEN_ORDERS[trade.email]?.filter(trade => trade.orderId !== orderId) ?? [] }


    console.log(OPEN_ORDERS)
    console.log(ACTIVE_ORDERS)
    console.log(USERS)
}

main();