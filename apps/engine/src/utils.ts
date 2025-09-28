import { USD_DECIMALS } from "./constants";

const MAX_DECIMALS = 10;
const POWERS_OF_TEN: number[] = Array.from(
    { length: MAX_DECIMALS + 1 },
    (_, index) => 10 ** index,
);

export function getScale(decimals: number): number {
    if (decimals > 10) return 0;
    return POWERS_OF_TEN[decimals]!;
}

export function toFixed(
    num: number,
    fixedPoint: number = USD_DECIMALS,
): number {
    const factor = getScale(fixedPoint);
    return Math.trunc(num * factor) / factor;
}

export function scaleDecimals(
    value: number,
    fromDecimals: number,
    toDecimals: number,
): number {
    if (fromDecimals === toDecimals) return value;

    if (toDecimals > fromDecimals) {
        return Math.trunc(value * getScale(toDecimals - fromDecimals));
    }

    const factor = getScale(fromDecimals - toDecimals);
    return Math.trunc(value / factor);
}
