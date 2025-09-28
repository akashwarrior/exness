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

export interface Order extends Omit<OpenOrder, "quantity"> {
    closePrice: number;
    liquidated: boolean;
    pnl: number;
}

export interface OpenOrder {
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
