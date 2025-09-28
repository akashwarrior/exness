import type { OpenOrder } from "./types";

export class OrderList {
    private readonly orderIdx: Record<string, number>;
    private readonly orders: OpenOrder[];

    constructor() {
        this.orderIdx = Object.create(null);
        this.orders = [];
    }

    public insert(order: OpenOrder) {
        this.orderIdx[order.orderId] = this.orders.length;
        this.orders.push(order);
    }

    public delete(orderId: string) {
        const idx = this.orderIdx[orderId];
        const orderLen = this.orders.length;
        if (idx === undefined || orderLen === 0) return;

        if (idx !== orderLen - 1) {
            const lastItem = this.orders[orderLen - 1]!;
            this.orders[idx] = lastItem;
            this.orderIdx[lastItem.orderId] = idx;
        }

        this.orders.pop();
        delete this.orderIdx[orderId];
    }

    public get(orderId: string) {
        const idx = this.orderIdx[orderId];
        if (idx === undefined) {
            return null;
        }

        return this.orders[idx]!;
    }

    public getOrders() {
        return this.orders;
    }
}
