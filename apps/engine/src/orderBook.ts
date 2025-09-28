import { OrderList } from "./orderList";
import { scaleDecimals, toFixed } from "./utils";
import {
    USD_DECIMALS,
    INITIAL_BALANCE,
    LIQUIDATION_RATIO,
    SNAPSHOT_INTERVAL_MS,
    USD,
} from "./constants";
import type {
    AssetPriceUpdate,
    AssetState,
    Balance,
    OpenOrder,
    Order,
} from "./types";

type OrderResponse = (OpenOrder & { createdAt: number }) | { message: string };

export class OrderBook {
    private readonly assets: Record<string, AssetState> = Object.create(null);
    private readonly userBalances: Record<string, Balance> =
        Object.create(null);
    private readonly openOrders = new OrderList();

    constructor() {
        setInterval(() => this.storeSnapShot(), SNAPSHOT_INTERVAL_MS);
    }

    public async recoverState() {}

    private storeSnapShot() {}

    public addUserBalance(email: string): void {
        if (this.userBalances[email]) return;

        this.userBalances[email] = {
            [USD]: {
                qty: scaleDecimals(INITIAL_BALANCE, 0, USD_DECIMALS),
                decimal: USD_DECIMALS,
            },
        };
    }

    public getUserBalance(userEmail: string): Balance | undefined {
        const balance = this.userBalances[userEmail];
        return structuredClone(balance);
    }

    public createOrder({
        asset,
        email,
        leverage,
        margin,
        type,
    }: OpenOrder): OrderResponse {
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

        const marginInAssetDecimals = scaleDecimals(
            margin,
            USD_DECIMALS,
            assetDecimal,
        );
        const quantity = toFixed(
            marginInAssetDecimals / assetPrice,
            assetDecimal,
        );
        const netMargin = quantity * assetPrice;

        if (quantity <= 0) {
            return { message: "Order size too small" };
        }

        usdWallet.qty -= scaleDecimals(netMargin, assetDecimal, USD_DECIMALS);

        if (type === "long") {
            balance[asset] = {
                qty:
                    scaleDecimals(quantity, 0, assetDecimal) +
                    (balance[asset]?.qty || 0),
                decimal: assetDecimal,
            };
        }

        const now = Date.now();

        const order: OpenOrder = {
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

        return {
            ...order,
        };
    }

    public handlePriceChange(assets: AssetPriceUpdate[]): void {
        for (const asset of assets) {
            this.assets[asset.asset] = {
                price: asset.price,
                decimal: asset.decimal,
            };
        }

        const closedOrders: string[] = [];
        const orders = this.openOrders.getOrders();
        for (const order of orders) {
            const assetState = this.assets[order.asset];
            if (!assetState) continue;

            const { price: currentPrice } = assetState;
            const pnl = this.calculatePnl(order, currentPrice);

            if (this.shouldLiquidate(pnl, order.margin)) {
                closedOrders.push(order.orderId);
            }
        }
        closedOrders.forEach((orderId) =>
            this.closeOrder({ orderId, liquidated: true }),
        );
    }

    public closeOrder({
        orderId,
        uniqueId,
        liquidated = false,
    }: {
        orderId: string;
        uniqueId?: string;
        liquidated?: boolean;
    }): Order | { id?: string; message: string } {
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
            balance[USD]!.qty += scaleDecimals(
                order.margin + pnl,
                decimal,
                USD_DECIMALS,
            );
        }

        if (order.type === "long") {
            balance[order.asset]!.qty -= scaleDecimals(
                order.quantity,
                0,
                decimal,
            );
        }

        const response: Order = {
            ...order,
            margin: scaleDecimals(order.margin, decimal, USD_DECIMALS),
            liquidated,
            closePrice: currentPrice,
            pnl: scaleDecimals(pnl, decimal, USD_DECIMALS),
        };

        this.openOrders.delete(orderId);

        return {
            id: uniqueId,
            ...response,
        };
    }

    private calculatePnl(trade: OpenOrder, currentPrice: number): number {
        const quantity = trade.quantity * trade.leverage;
        const openTradeValue = Math.trunc(quantity * trade.openPrice);
        const currentTradeValue = Math.trunc(quantity * currentPrice);
        const direction = trade.type === "long" ? 1 : -1;
        return (currentTradeValue - openTradeValue) * direction;
    }

    private shouldLiquidate(pnl: number, margin: number): boolean {
        if (pnl >= 0) return false;
        return (
            Math.abs(pnl) * LIQUIDATION_RATIO.denominator >=
            margin * LIQUIDATION_RATIO.numerator
        );
    }
}
