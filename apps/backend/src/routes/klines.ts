import axios, { AxiosError } from "axios";
import { Router } from "express";

const router = Router();

const BACKPACK_URL = "https://api.backpack.exchange/api/v1/klines";
const DEFAULT_INTERVAL = "5m";
const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000;

router.get("/klines", async (req, res) => {
    const asset = req.query?.asset as string | undefined;
    const interval = (req.query?.interval as string | undefined) ?? DEFAULT_INTERVAL;
    const startTime = String(
        req.query?.startTime ?? Date.now() - DEFAULT_RANGE_MS,
    ).substring(0, 10);

    if (!asset) {
        res.status(404).json({
            message: "Asset is needed to get candles",
        });
        return;
    }

    try {
        const response = await axios.get(
            `${BACKPACK_URL}?symbol=${asset}&interval=${interval}&startTime=${startTime}`,
        );

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Failed to get candles", (error as AxiosError).message);
        res.status(501).json({
            error: "Failed to get candles",
        });
    }
});

export default router;
