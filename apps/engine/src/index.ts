import { RedisClient, EVENT_TYPE, QUEUE } from '@exness/redisClient';
import { PrismaClient } from '@exness/db'

type Balance = {
    [key: string]: {
        balance: number,
        decimal: number,
        decimalBalance: number,
    },
}

interface Trade {
    orderId: string;
    openPrice: number;
    closePrice?: number;
    leverage: number;
    pnl: number;
    asset: string;
    email: string;
    createdAt: number;
    // liquidated: boolean  // it will always be true for storing closed order (can be set by db worker)

    type: 'long' | 'short'
    quantity: number;
    margin: number;
}

const prisma = new PrismaClient()

const ASSETS: { [asset: string]: Msg } = {};
const DB_ASSETS = (
    await prisma.asset.findMany({
        select: {
            symbol: true,
            id: true,
        }
    })
).map(asset => ({
    [asset.symbol]: asset.id
}))[0]!;

const USER_BALACNE: { [userId: string]: Balance } = {};
const ORDERS = new Map<string, Trade[]>();

const BALANCE_DECIMAL = 2;

interface Msg {
    price: number,
    decimal: number,
    decimalPrice: number,
}

const client = new RedisClient();

async function main() {
    await client.connect();

    while (1) {
        const message = await client.xRead({})
        if (!message) continue;

        switch (message.type) {
            case EVENT_TYPE.LOGIN:
                if (message?.email && !USER_BALACNE[message.email]) {
                    USER_BALACNE[message.email] = {
                        USD: {
                            balance: 5000_00, // 5000.00
                            decimal: 2,
                            decimalBalance: 5000.00,
                        }
                    }
                }
                break;

            case EVENT_TYPE.ASSETS_PRICE:
                const assets = await JSON.parse(message.price_updates!);
                for (const { asset, decimal, price } of assets) {
                    ASSETS[asset] = { decimal, price, decimalPrice: price / (10 ** decimal) }; // updated price
                }
                handlePriceChnage();
                console.log({
                    ...assets,
                })
                console.log(ORDERS)
                console.log({
                    ...USER_BALACNE
                })
                break;

            case EVENT_TYPE.TRADE_OPEN:
                const msg = executeOrder({ email: message.email, ...JSON.parse(message.payload!) });

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
                closeOrder({ userId: message.email!, orderId: message.orderId!, uniqueId: message.id });
                break;

            case EVENT_TYPE.BALANCE:
                const asset = message?.asset ? message?.asset : null;
                const email = message.email!;
                const balance = asset ? USER_BALACNE[email]?.[asset] : USER_BALACNE[email]!.USD!.balance;

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

function executeOrder({ asset, email, leverage, margin, type }: {
    type: 'long' | 'short';
    email: string;
    asset: string;
    margin: number;
    leverage: number;
    slippage: number; // there is not frontend price to check slippage
}): Record<string, string> {
    const actualAsset = ASSETS[asset];

    if (!actualAsset) {
        return {
            message: "Invalid asset",
        }
    }
    const { decimal: assetDecimal, decimalPrice: assetPrice } = actualAsset;
    // TODO: optimise this
    const decimalMargin = margin / (10 ** BALANCE_DECIMAL);                                     // buying for total amount of
    const volume = decimalMargin / assetPrice;     // getting quantity of asset
    const balance = USER_BALACNE[email]!.USD!.decimalBalance!;                                  // if someone is trading then balance does exist
    const orderValue = Number((assetPrice * volume * leverage).toFixed(assetDecimal));

    if (orderValue >= balance) {
        return {
            message: "Insufficient balance",
        }
    }

    USER_BALACNE[email]!.USD!.balance -= margin; // deduct USD balance
    USER_BALACNE[email]!.USD!.decimalBalance -= decimalMargin; // deduct USD balance

    if (USER_BALACNE[email]?.[asset]) {
        USER_BALACNE[email][asset].balance += decimalMargin * (10 ** assetDecimal);  // storing without decimal
        USER_BALACNE[email][asset].decimalBalance += margin;                    // storing with decimal
    } else {
        USER_BALACNE[email]![asset] = {
            balance: decimalMargin * (10 ** assetDecimal),
            decimal: assetDecimal,
            decimalBalance: decimalMargin,
        }
    }

    const orderId = Date.now() + performance.now().toFixed(0)

    const order: Trade = {
        asset: asset,
        email: email,
        type: type,
        quantity: volume,
        orderId: orderId,
        leverage: leverage,
        margin: decimalMargin,
        openPrice: assetPrice,
        createdAt: Date.now(),
        pnl: 0,
    }

    if (ORDERS.has(email)) {
        ORDERS.get(email)!.push(order)
    } else {
        ORDERS.set(email, [order]);
    }

    return {
        orderId: orderId,
    }
}

function handlePriceChnage() {
    const updatedTrades: Trade[] = [];
    for (const [userId, trades] of ORDERS) {
        for (const trade of trades) {
            const { email, type, openPrice, quantity, leverage, margin, asset, pnl } = trade;
            const { decimalPrice: currentPrice, decimal: assetDecimal } = ASSETS[asset]!;
            /*
                calculate -> netPnl = (currentPrice - openPrice) * quantity * leverage // opposite for short
                change -> assetBalance = netPnl - prevPnl
                update ->  pnl = netPnl
            */

            let pnlDiff = 0.00;
            let newPnl = 0.00;
            let isLiquidated: boolean = false;


            if (leverage > 1) {
                const liquidationAMount = (margin + USER_BALACNE[email]!.USD!.decimalBalance) * 0.95;
                newPnl = parseFloat(((currentPrice - openPrice) * quantity * leverage).toFixed(assetDecimal));
                pnlDiff = newPnl - pnl;

                if (liquidationAMount + newPnl <= 0) {
                    const amountToDeduct = (margin * leverage) - margin;
                    USER_BALACNE[email]!.USD!.decimalBalance -= amountToDeduct;
                    USER_BALACNE[email]!.USD!.balance -= (amountToDeduct * (10 ** BALANCE_DECIMAL));
                    isLiquidated = true;
                    // liquidate here
                }

            } else {
                if (type === 'short') {
                    newPnl = parseFloat(((openPrice - currentPrice) * leverage).toFixed(assetDecimal));;
                    const liquidationAmount = margin * 0.95;
                    pnlDiff = newPnl - pnl;

                    if (liquidationAmount + newPnl <= 0) {
                        isLiquidated = true;
                        // liqidate here
                    }
                } else {
                    newPnl = parseFloat(((currentPrice - openPrice) * leverage).toFixed(assetDecimal));;
                    pnlDiff = newPnl - pnl;
                }
            }

            // update user asset balance
            USER_BALACNE[email]![asset]!.balance += pnlDiff * (10 ** assetDecimal);
            USER_BALACNE[email]![asset]!.decimalBalance = (USER_BALACNE[email]![asset]!.balance / 10 ** assetDecimal);

            if (!isLiquidated) {
                updatedTrades.push({
                    ...trade,
                    pnl: newPnl,
                })
            }
        }

        ORDERS.set(userId, updatedTrades);
    }
}

function closeOrder({ userId, orderId, uniqueId }: { userId: string, orderId: string, uniqueId?: string }) {
    const trade = ORDERS.get(userId)?.find(order => order.orderId === orderId);

    function init() {
        if (!trade) {
            return {
                message: "Order not found",
            }
        }

        const { decimal: assetDecimal, decimalPrice: currentPrice } = ASSETS[trade.asset]!
        const tradeValue = Number((trade.pnl + trade.margin).toFixed(BALANCE_DECIMAL));

        // update user asset balance
        USER_BALACNE[trade.email]!.USD!.decimalBalance += tradeValue;
        USER_BALACNE[trade.email]!.USD!.balance += tradeValue * (10 ** assetDecimal);

        USER_BALACNE[trade.email]![trade.asset]!.decimalBalance -= tradeValue;
        USER_BALACNE[trade.email]![trade.asset]!.balance -= tradeValue * (10 ** assetDecimal);

        const filteredOrders = ORDERS.get(userId)?.filter(order => order.orderId !== orderId) ?? [];
        ORDERS.set(userId, filteredOrders);

        trade.closePrice = currentPrice;

        return {
            ...trade,
            assetId: DB_ASSETS[trade.asset!],
            balance: USER_BALACNE[trade.email]!.USD!.balance,
        }
    }

    const closeOrderMsg = init();

    client.xAdd({
        key: QUEUE.WORKER_QUEUE,
        msgType: EVENT_TYPE.TRADE_CLOSE,
        message: {
            id: uniqueId,
            ...closeOrderMsg,
        }
    });
}

main();