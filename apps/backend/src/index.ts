import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { Router } from "express";

import balanceRouter from "./routes/balance";
import klinesRouter from "./routes/klines";
import middleware from "./middleware";
import supportedAssetsRouter from "./routes/supporttedAssets";
import authRouter from "./routes/auth";
import tradeRouter from "./routes/trade";

dotenv.config();

const PORT = process.env.PORT || 3001;
const app = express();
const apiRouter = Router();

app.use(cookieParser());
app.use(express.json());
app.use(
    cors({
        origin: "*",
    }),
);

app.use("/api/v1", apiRouter);

apiRouter.use(authRouter);
apiRouter.use(klinesRouter);
apiRouter.use(supportedAssetsRouter);

apiRouter.use(middleware);

apiRouter.use(balanceRouter);
apiRouter.use("/trade", tradeRouter);

app.listen(PORT, () => {
    console.log("Listening on port", PORT);
});
