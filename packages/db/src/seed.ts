import { PrismaClient } from "./generated/prisma"

function getAsset({ symbol, decimal, name }: { symbol: string, decimal: number, name: string }) {
    return {
        symbol: symbol,
        decimal: decimal,
        imageUrl: `https://backpack.exchange/_next/image?url=%2Fcoins%2F${symbol.split('_')[0]?.toLowerCase()}.png&w=48&q=75`,
        name: name,
    }
}

async function seedAsset() {
    try {
        const prisma = new PrismaClient();

        await prisma.asset.createMany({
            data: [
                getAsset({
                    symbol: "SOL_USD",
                    decimal: 2,
                    name: "Solana"
                }),
                getAsset({
                    symbol: "ETH_USD",
                    decimal: 2,
                    name: "Ethereum"
                }),
                getAsset({
                    symbol: "BTC_USD",
                    decimal: 5,
                    name: "Bitcoin",
                }),
            ]
        })

        prisma.$disconnect();
    } catch (e) {
        console.log("Failed to seed DB:", e);
    }
}

seedAsset()