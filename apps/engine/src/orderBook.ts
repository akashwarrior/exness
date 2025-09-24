import { USD_DECIMALS, INITIAL_BALANCE, LIQUIDATION_RATIO, SNAPSHOT_INTERVAL_MS, USD } from "./constants";
import type { AssetPriceUpdate, AssetState, Balance, OpenTrades, Trade } from "./types";
import { toDecimal, toInteger } from "./utils";

type OrderResponse = (OpenTrades & { createdAt: number }) | { message: string };

export class OrderBook {
    private readonly assets: Record<string, AssetState> = {};
    private readonly userBalances: Record<string, Balance> = {};
    private readonly openOrders: Record<string, OpenTrades> = {};

    constructor() {
        setInterval(() => this.storeSnapShot(), SNAPSHOT_INTERVAL_MS);
    }

    public async recoverState() { }

    private storeSnapShot() { }

    public addUserBalance(email: string): void {
        if (this.userBalances[email]) return;

        this.userBalances[email] = {
            [USD]: {
                qty: toInteger(INITIAL_BALANCE),
                decimal: USD_DECIMALS,
            },
        };
    }

    public getUserBalance(userEmail: string): Balance | undefined {
        const blc = this.userBalances[userEmail];
        return blc ? structuredClone(blc) : undefined;
    }

    public createOrder({ asset, email, leverage, margin, type }: OpenTrades): OrderResponse {
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

        const normalizedMargin = toDecimal(margin);
        const marginInAssetDecimals = toInteger(normalizedMargin, assetDecimal);
        const rawQuantity = marginInAssetDecimals / assetPrice;
        const quantity = toInteger(rawQuantity, assetDecimal);

        if (quantity <= 0) {
            return { message: "Order size too small" };
        }

        usdWallet.qty -= margin;

        if (type === "long") {
            balance[asset] = {
                qty: quantity + (balance[asset]?.qty || 0),
                decimal: assetDecimal,
            };
        }

        const orderId = Date.now().toString();

        const order: OpenTrades = {
            orderId,
            email,
            type,
            asset,
            leverage,
            margin: marginInAssetDecimals,
            openPrice: assetPrice,
            quantity,
        };

        this.openOrders[orderId] = order;

        return {
            ...order,
            createdAt: Number(orderId),
        };
    }

    public handlePriceChange(assets: AssetPriceUpdate[]): void {
        for (const asset of assets) {
            this.assets[asset.asset] = {
                price: asset.price,
                decimal: asset.decimal,
            };
        }

        const ordersToDelete: string[] = [];

        for (const trade of Object.values(this.openOrders)) {
            const assetState = this.assets[trade.asset];
            if (!assetState) continue;

            const { price: currentPrice, decimal } = assetState;
            const pnl = this.calculatePnl(trade, currentPrice, decimal);

            if (this.shouldLiquidate(pnl, trade.margin)) {
                const closedOrder = this.closeOrder({ orderId: trade.orderId, liquidated: true });
                if ("orderId" in closedOrder) {
                    ordersToDelete.push(closedOrder.orderId);
                }
            }
        }
        ordersToDelete.forEach(orderId => delete this.openOrders[orderId]);
    }

    public closeOrder({ orderId, uniqueId, liquidated = false }: { orderId: string; uniqueId?: string; liquidated?: boolean; }): (Trade | { id?: string, message: string }) {
        const trade = this.openOrders[orderId];
        if (!trade) {
            return {
                id: uniqueId,
                message: "Already Closed",
            };
        }

        const assetState = this.assets[trade.asset];
        const balance = this.userBalances[trade.email];

        if (!assetState || !balance) {
            return {
                id: uniqueId,
                message: "Missing state",
            };
        }

        const { price: currentPrice, decimal } = assetState;
        const pnl = this.calculatePnl(trade, currentPrice, decimal);

        if (!liquidated) {
            const totalPnl = toInteger(toDecimal(trade.margin + pnl, decimal));
            balance[USD]!.qty += totalPnl;
        }

        if (trade.type === "long") {
            balance[trade.asset]!.qty -= trade.quantity;
        }

        const response: Trade = {
            ...trade,
            margin: toInteger(toDecimal(trade.margin, decimal)),
            liquidated,
            closePrice: currentPrice,
            pnl,
            createdAt: Number(orderId),
        };

        return {
            id: uniqueId,
            ...response,
        };
    }

    private calculatePnl(trade: OpenTrades, currentPrice: number, decimal: number): number {
        const qty = trade.quantity * trade.leverage;
        const openTradeValue = qty * trade.openPrice;
        const currentTradeValue = qty * currentPrice;
        const pnlValue = toDecimal(currentTradeValue - openTradeValue, decimal * 2);
        const direction = trade.type === "long" ? 1 : -1;
        return direction * toInteger(pnlValue, decimal);
    }

    private shouldLiquidate(pnl: number, margin: number): boolean {
        if (pnl >= 0) return false;
        return (Math.abs(pnl) * LIQUIDATION_RATIO.denominator) >= (margin * LIQUIDATION_RATIO.numerator);
    }
}