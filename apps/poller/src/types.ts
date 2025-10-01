export interface AssetMessage {
    data: {
        a: string;
        b: string;
        s: string;
    };
}

export interface Asset {
    asset: string;
    price: number;
    decimal: number;
}
