import z from "zod";

export const AuthSchema = z.object({
    email: z.email(),
})

export const OrderSchema = z.object({
    asset: z.string(),
    type: z.enum(["long", 'short']),
    margin: z.number().nonnegative(),                   // without decimal 500.00 -> 50,000
    leverage: z.number().min(1).max(100).default(1),    // margin * leverage
    slippage: z.number().min(0).max(10000),             // in bips 100 -> 1%
})