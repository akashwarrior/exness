import z from "zod";

export const AuthSchema = z.object({
    email: z.email(),
});

export const OrderSchema = z.object({
    asset: z.string(),
    type: z.enum(["long", "short"]),
    margin: z.number().nonnegative(),
    leverage: z.number().min(1).max(100).default(1),
    slippage: z.number().min(0).max(10000),
});
