import { USD_DECIMALS } from "./constants";

const MAX_SUPPORTED_DECIMALS = 10;
const SCALE_FACTORS: number[] = Array.from(
    { length: MAX_SUPPORTED_DECIMALS + 1 },
    (_, index) => 10 ** index,
);

export function getScaleFactor(decimals: number): number {
    if (decimals > MAX_SUPPORTED_DECIMALS) {
        return 0;
    }

    return SCALE_FACTORS[decimals]!;
}

export function truncateToDecimals(
    value: number,
    decimals: number = USD_DECIMALS,
): number {
    const factor = getScaleFactor(decimals);
    return Math.trunc(value * factor) / factor;
}

export function convertDecimals(
    value: number,
    fromDecimals: number,
    toDecimals: number,
): number {
    if (fromDecimals === toDecimals) {
        return value;
    }

    if (toDecimals > fromDecimals) {
        return Math.trunc(value * getScaleFactor(toDecimals - fromDecimals));
    }

    const scaleFactor = getScaleFactor(fromDecimals - toDecimals);
    return Math.trunc(value / scaleFactor);
}

