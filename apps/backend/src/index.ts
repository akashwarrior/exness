import expres, { Router } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotnev from "dotenv";
import authRouter from "./routes/auth";
import middleware from "./middleware";
import tradeRouter from "./routes/trade";
import balanceRouter from "./routes/balance";
import klinesRouter from "./routes/klines";
import suppportedAssetsRouter from "./routes/supporttedAssets";

dotnev.config();

const PORT = process.env.PORT || 3001;
const app = expres();

app.use(cookieParser());
app.use(expres.json());
app.use(
    cors({
        origin: "*",
    }),
);

const router = Router();

app.use("/api/v1", router);

router.use(authRouter);
router.use(klinesRouter);
router.use(suppportedAssetsRouter);

router.use(middleware);

router.use(balanceRouter);
router.use("/trade", tradeRouter);

app.listen(PORT, () => {
    console.log("listening on port", PORT);
});
