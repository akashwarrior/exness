import type { ActiveOrder } from "./types";

export class OrderList {
    private readonly indexByOrderId: Record<string, number>;
    private readonly orders: ActiveOrder[];

    constructor() {
        this.indexByOrderId = Object.create(null);
        this.orders = [];
    }

    public insert(order: ActiveOrder) {
        this.indexByOrderId[order.orderId] = this.orders.length;
        this.orders.push(order);
    }

    public delete(orderId: string) {
        const idx = this.indexByOrderId[orderId];
        const orderLen = this.orders.length;
        if (idx === undefined || orderLen === 0) return;

        if (idx !== orderLen - 1) {
            const lastItem = this.orders[orderLen - 1]!;
            this.orders[idx] = lastItem;
            this.indexByOrderId[lastItem.orderId] = idx;
        }

        this.orders.pop();
        delete this.indexByOrderId[orderId];
    }

    public get(orderId: string) {
        const idx = this.indexByOrderId[orderId];
        if (idx === undefined) {
            return null;
        }

        return this.orders[idx]!;
    }

    public getOrders() {
        return this.orders;
    }
}
