import { Router } from "express";

const router = Router();

const SUPPORTED_ASSETS = ["ETH_USDC", "SOL_USDC", "BTC_USDC"] as const;

router.get("/supportedAssets", (req, res) => {
    res.status(200).json(SUPPORTED_ASSETS);
});

export default router;
