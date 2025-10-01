export interface Balance {
    [asset: string]: {
        qty: number;
        decimal: number;
    }
}

export interface AssetState {
    price: number;
    decimal: number;
}

export type AssetStateMap = Record<string, AssetState>;

export interface AssetPriceUpdate extends AssetState {
    asset: string;
}

export interface ActiveOrder {
    orderId: string;
    email: string;
    type: "long" | "short";
    asset: string;
    margin: number;
    openPrice: number;
    leverage: number;
    quantity: number;
    createdAt: number;
}

export interface ClosedOrder extends Omit<ActiveOrder, "quantity"> {
    closePrice: number;
    liquidated: boolean;
    pnl: number;
}

export type OrderDraft = Pick<ActiveOrder, "asset" | "email" | "leverage" | "margin" | "type">;

export interface EngineSnapshot {
    createdAt: number;
    lastMessageId?: string;
    assets: AssetStateMap;
    userBalances: Record<string, Balance>;
    openOrders: ActiveOrder[];
}