import axios, { AxiosError } from 'axios';
import { Router } from 'express';

const router = Router();
const BACKPACK_URL = "https://api.backpack.exchange/api/v1/klines"

router.get('/klines', async (req, res) => {
    const asset = req.query?.asset;
    const interval = (req.query?.inerval ?? '5m');
    const startTime = String(req.query?.startTime || Date.now() - (24 * 60 * 60 * 1000)).substring(0, 10);

    if (!asset) {
        return res.status(404).json({
            message: "Asset is needed to get candles"
        });
    }

    try {
        const response = await axios.get(
            BACKPACK_URL + `?symbol=${asset}&interval=${interval}&startTime=${startTime}`
        );

        res.status(200).json(response.data)

    } catch (e) {
        console.log((e as AxiosError).message);
        res.status(501).json({
            error: "Failed to get candles",
        })
    }
});

export default router;