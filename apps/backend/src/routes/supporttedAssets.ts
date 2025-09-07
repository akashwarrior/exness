import { Router } from "express";

const router = Router();
const ASSETS = ["ETH_USDC", "SOL_USDC", "BTC_USDC"] // TODO: get from db

router.get('/supportedAssets', (req, res) => {
    res.status(200).json(ASSETS);
});

export default router;