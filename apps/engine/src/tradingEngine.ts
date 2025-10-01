import { EVENT_TYPE, QUEUE, RedisClient } from "@exness/redisClient";
import { convertDecimals, truncateToDecimals } from "./decimalMath";
import { mongodbClient } from "./mongoClient";
import { OrderList } from "./orderList";
import {
    INITIAL_BALANCE,
    LIQUIDATION_RATIO,
    SNAPSHOT_INTERVAL_MS,
    USD,
    USD_DECIMALS,
} from "./constants";

import type {
    ActiveOrder,
    AssetPriceUpdate,
    AssetStateMap,
    Balance,
    ClosedOrder,
    EngineSnapshot,
    OrderDraft,
} from "./types";

type StreamMessage = {
    id: string;
    type: EVENT_TYPE;
    message: Record<string, string>;
};

type OrderResponse = ActiveOrder | { message: string };

const SNAPSHOT_COLLECTION = "engineSnapshots";

export class TradingEngine {
    private readonly assets: AssetStateMap;
    private readonly userBalances: Record<string, Balance>;
    private readonly openOrders: OrderList;
    private readonly redisClient: RedisClient;
    private readonly snapshotInterval: NodeJS.Timeout;
    private lastProcessedMessageId: string | undefined;

    constructor() {
        this.assets = Object.create(null);
        this.userBalances = Object.create(null);
        this.openOrders = new OrderList();
        this.redisClient = new RedisClient();
        this.lastProcessedMessageId = undefined;
        this.snapshotInterval = setInterval(() => {
            this.storeSnapshot().catch((error) =>
                console.error("Failed to store snapshot", error),
            );
        }, SNAPSHOT_INTERVAL_MS);
    }

    public async recoverState(): Promise<void> {
        await this.redisClient.connect();
        await this.restoreFromSnapshot();
        await this.replayMessages();
    }

    private async replayMessages(): Promise<void> {
        const { firstId } = await this.redisClient.xPending();
        const historicalMessages = await this.redisClient.xRange({
            start: this.lastProcessedMessageId ?? "0-0",
            end: firstId ?? "+",
            exclusive: Boolean(this.lastProcessedMessageId),
        });

        for (const message of historicalMessages) {
            this.processStream(message);
        }
    }

    public processStream({ id, type, message }: StreamMessage): void {
        this.lastProcessedMessageId = id;

        switch (type) {
            case EVENT_TYPE.LOGIN: {
                this.handleLogin(message.email!);
                break;
            }

            case EVENT_TYPE.ASSETS_PRICE: {
                this.handlePriceUpdate(message.price_updates!);
                break;
            }

            case EVENT_TYPE.TRADE_OPEN: {
                this.handleTradeOpen(message);
                break;
            }

            case EVENT_TYPE.TRADE_CLOSE: {
                this.handleTradeClose(message);
                break;
            }

            case EVENT_TYPE.BALANCE: {
                this.handleBalanceRequest(message);
                break;
            }

            default: {
                console.warn("Unsupported message type", type);
            }
        }
    }

    public shutdown(): void {
        clearInterval(this.snapshotInterval);
    }

    public addUserBalance(email: string): void {
        if (this.userBalances[email]) {
            return;
        }

        this.userBalances[email] = {
            [USD]: {
                qty: convertDecimals(INITIAL_BALANCE, 0, USD_DECIMALS),
                decimal: USD_DECIMALS,
            },
        };
    }

    private handleLogin(email: string): void {
        this.addUserBalance(email);
    }

    public getUserBalance(userEmail: string): Balance | undefined {
        const balance = this.userBalances[userEmail];
        return structuredClone(balance);
    }

    private handlePriceUpdate(payload: string): void {
        const priceUpdates = JSON.parse(payload) as AssetPriceUpdate[];
        this.handlePriceChange(priceUpdates);
    }

    private handleTradeOpen(message: Record<string, string>): void {
        const orderResult = this.createOrder({
            email: message.email!,
            ...JSON.parse(message.payload!),
        });

        void this.redisClient.xAdd({
            key: QUEUE.WORKER_QUEUE,
            msgType: ('message' in orderResult) ? EVENT_TYPE.ERROR : EVENT_TYPE.TRADE_OPEN,
            message: {
                id: message.id,
                ...orderResult,
            },
        });
    }

    private handleTradeClose(message: Record<string, string>): void {
        const closedOrder = this.closeOrder({
            orderId: message.orderId!,
            uniqueId: message.id,
        });

        void this.redisClient.xAdd({
            key: QUEUE.WORKER_QUEUE,
            msgType: ('message' in closedOrder) ? EVENT_TYPE.ERROR : EVENT_TYPE.TRADE_CLOSE,
            message: closedOrder as Record<
                string,
                string | number | boolean | undefined
            >,
        });
    }

    private handleBalanceRequest(message: Record<string, string>): void {
        const email = message.email!;
        const asset = message.asset ?? null;
        const balance = this.getUserBalance(email);

        void this.redisClient.xAdd({
            key: QUEUE.WORKER_QUEUE,
            msgType: EVENT_TYPE.BALANCE,
            message: {
                id: message.id,
                balance: JSON.stringify(asset ? balance?.[asset] : balance),
            },
        });
    }

    public createOrder(orderDraft: OrderDraft): OrderResponse {
        const { asset, email, leverage, margin, type } = orderDraft;
        const balance = this.userBalances[email];
        const usdWallet = balance?.[USD];

        if (!balance || !usdWallet || margin > usdWallet.qty) {
            return { message: "Insufficient balance" };
        }

        const assetState = this.assets[asset];
        if (!assetState) {
            return { message: "Invalid asset" };
        }

        const { decimal: assetDecimal, price: assetPrice } = assetState;

        const marginInAssetDecimals = convertDecimals(
            margin,
            USD_DECIMALS,
            assetDecimal,
        );
        const quantity = truncateToDecimals(
            marginInAssetDecimals / assetPrice,
            assetDecimal,
        );
        const netMargin = quantity * assetPrice;

        if (quantity <= 0) {
            return { message: "Order size too small" };
        }

        usdWallet.qty -= convertDecimals(netMargin, assetDecimal, USD_DECIMALS);

        if (type === "long") {
            balance[asset] = {
                qty:
                    convertDecimals(quantity, 0, assetDecimal) +
                    (balance[asset]?.qty || 0),
                decimal: assetDecimal,
            };
        }

        const now = Date.now();
        const order: ActiveOrder = {
            orderId: now + performance.now().toFixed(0),
            email,
            type,
            asset,
            leverage,
            margin: netMargin,
            openPrice: assetPrice,
            quantity,
            createdAt: now,
        };

        this.openOrders.insert(order);
        return { ...order };
    }

    public handlePriceChange(priceUpdates: AssetPriceUpdate[]): void {
        this.updateAssetStates(priceUpdates);
        this.closeLiquidatedOrders();
    }

    private updateAssetStates(priceUpdates: AssetPriceUpdate[]): void {
        for (const update of priceUpdates) {
            this.assets[update.asset] = {
                price: update.price,
                decimal: update.decimal,
            };
        }
    }

    private closeLiquidatedOrders(): void {
        const ordersToClose: string[] = [];
        const activeOrders = this.openOrders.getOrders();

        for (const order of activeOrders) {
            const assetState = this.assets[order.asset];
            if (!assetState) continue;

            const pnl = this.calculatePnl(order, assetState.price);
            if (this.shouldLiquidate(pnl, order.margin)) {
                ordersToClose.push(order.orderId);
            }
        }

        for (const orderId of ordersToClose) {
            this.closeOrder({ orderId, liquidated: true });
        }
    }

    public closeOrder({
        orderId,
        uniqueId,
        liquidated = false,
    }: {
        orderId: string;
        uniqueId?: string;
        liquidated?: boolean;
    }): ClosedOrder | { id?: string; message: string } {
        const order = this.openOrders.get(orderId);
        if (!order) {
            return {
                id: uniqueId,
                message: "Already Closed",
            };
        }

        const assetState = this.assets[order.asset];
        const balance = this.userBalances[order.email];

        if (!assetState || !balance) {
            return {
                id: uniqueId,
                message: "Missing state",
            };
        }

        const { price: currentPrice, decimal } = assetState;
        const pnl = this.calculatePnl(order, currentPrice);

        if (!liquidated) {
            balance[USD]!.qty += convertDecimals(
                order.margin + pnl,
                decimal,
                USD_DECIMALS,
            );
        }

        if (order.type === "long") {
            balance[order.asset]!.qty -= convertDecimals(
                order.quantity,
                0,
                decimal,
            );
        }

        const response: ClosedOrder = {
            ...order,
            margin: convertDecimals(order.margin, decimal, USD_DECIMALS),
            liquidated,
            closePrice: currentPrice,
            pnl: convertDecimals(pnl, decimal, USD_DECIMALS),
        };

        this.openOrders.delete(orderId);

        return {
            id: uniqueId,
            ...response,
        };
    }

    private async storeSnapshot(): Promise<void> {
        if (!this.lastProcessedMessageId) {
            return;
        }

        const snapshot: EngineSnapshot = {
            createdAt: Date.now(),
            lastMessageId: this.lastProcessedMessageId,
            assets: structuredClone(this.assets),
            userBalances: structuredClone(this.userBalances),
            openOrders: this.openOrders
                .getOrders()
                .map((order) => ({ ...order })),
        };

        const db = mongodbClient.db();
        await db
            .collection<EngineSnapshot>(SNAPSHOT_COLLECTION)
            .insertOne(snapshot);
    }

    private async restoreFromSnapshot(): Promise<void> {
        const db = mongodbClient.db();
        const snapshot = await db
            .collection<EngineSnapshot>(SNAPSHOT_COLLECTION)
            .find()
            .sort({ createdAt: -1 })
            .limit(1)
            .next();

        if (!snapshot) {
            return;
        }

        this.lastProcessedMessageId = snapshot.lastMessageId;
        this.restoreAssets(snapshot.assets);
        this.restoreBalances(snapshot.userBalances);
        this.restoreOpenOrders(snapshot.openOrders);
    }

    private restoreAssets(assets: AssetStateMap): void {
        for (const key of Object.keys(this.assets)) {
            delete this.assets[key];
        }

        for (const [symbol, state] of Object.entries(assets)) {
            this.assets[symbol] = { ...state };
        }
    }

    private restoreBalances(balances: Record<string, Balance>): void {
        for (const key of Object.keys(this.userBalances)) {
            delete this.userBalances[key];
        }

        for (const [email, balance] of Object.entries(balances)) {
            this.userBalances[email] = structuredClone(balance);
        }
    }

    private restoreOpenOrders(orders: ActiveOrder[]): void {
        for (const order of orders) {
            this.openOrders.insert({ ...order });
        }
    }

    private calculatePnl(trade: ActiveOrder, currentPrice: number): number {
        const leveragedQuantity = trade.quantity * trade.leverage;
        const openValue = Math.trunc(leveragedQuantity * trade.openPrice);
        const currentValue = Math.trunc(leveragedQuantity * currentPrice);
        const direction = trade.type === "long" ? 1 : -1;
        return (currentValue - openValue) * direction;
    }

    private shouldLiquidate(pnl: number, margin: number): boolean {
        if (pnl >= 0) {
            return false;
        }

        return (
            Math.abs(pnl) * LIQUIDATION_RATIO.denominator >=
            margin * LIQUIDATION_RATIO.numerator
        );
    }
}