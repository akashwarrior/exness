import { USD_DECIMALS } from "./constants";

export function toFixed(num: number, fixedPoint: number = USD_DECIMALS): number {
    const [integer, decimals] = String(num).split(".");
    const decimalDigits = Array.from({ length: fixedPoint }, (_, index) => decimals?.[index] ?? "0");
    return Number(`${integer}.${decimalDigits.join("")}`);
}

export function toInteger(num: number, decimalPoint: number = USD_DECIMALS): number {
    return toFixed(num, decimalPoint) * (10 ** decimalPoint);
}

export function toDecimal(num: number, decimalPoint: number = USD_DECIMALS): number {
    return num / (10 ** decimalPoint);
}