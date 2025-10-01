export enum QUEUE {
    PRIMARY_QUEUE = "primary:queue",
    WORKER_QUEUE = "worker:queue",
}

export enum EVENT_TYPE {
    LOGIN = "LOGIN",
    ASSETS_PRICE = "ASSETS_PRICE",
    TRADE_OPEN = "TRADE_OPEN",
    TRADE_CLOSE = "TRADE_CLOSE",
    BALANCE = "BALANCE",
    ERROR = "ERROR",
}

export interface StreamMessage {
    id: string;
    type: EVENT_TYPE;
    message: Record<string, string>;
}

export interface StreamReadOptions {
    key: QUEUE;
    id: string;
    options: Partial<{ BLOCK: number; COUNT: number }>;
}