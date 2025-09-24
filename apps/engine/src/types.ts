export type Balance = {
    [key: string]: {
        qty: number;
        decimal: number;
    };
};

export interface AssetState {
    price: number;
    decimal: number;
}

export interface AssetPriceUpdate extends AssetState {
    asset: string;
}

export interface Trade extends OpenTrades {
    createdAt: number;
    closePrice: number;
    liquidated: boolean;
    pnl: number;
}

export interface OpenTrades {
    orderId: string;
    email: string;
    type: "long" | "short";
    asset: string;
    margin: number;
    openPrice: number;
    leverage: number;
    quantity: number
}
