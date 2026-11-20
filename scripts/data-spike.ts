import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/server/db.js";
import { buildPools } from "../src/server/pools.js";
import { getSettings } from "../src/server/settings.js";
import { fetchTraderOffers } from "../src/server/tarkovApi.js";

const gameMode = process.env.TARKOV_GAME_MODE === "pve" ? "pve" : "regular";

try {
  const settings = await getSettings(prisma);
  const offers = await fetchTraderOffers(gameMode);
  const pools = buildPools(offers, 12, settings.rarityWeights);
  const quantile = (prices: number[], fraction: number) => prices.length
    ? prices[Math.min(prices.length - 1, Math.floor((prices.length - 1) * fraction))]!
    : null;
  const report = {
    generatedAt: new Date().toISOString(),
    gameMode,
    source: "https://json.tarkov.dev",
    offerCount: offers.length,
    uniqueItemCount: new Set(offers.map((item) => item.id)).size,
    excludedWithoutImages: offers.filter((item) => !item.image512pxLink && !item.iconLink).map(({ id, name, trader, loyaltyLevel }) => ({ id, name, trader, loyaltyLevel })),
    pools: pools.map((pool) => ({
      poolKey: pool.poolKey,
      trader: pool.trader,
      levelRange: pool.levelRange,
      itemCount: pool.items.length,
      rarityCounts: pool.rarityCounts,
      price: (() => {
        const prices = pool.items.map((item) => item.basePrice).sort((a, b) => a - b);
        return {
          min: prices[0] ?? null,
          p10: quantile(prices, 0.10),
          p25: quantile(prices, 0.25),
          median: quantile(prices, 0.5),
          p75: quantile(prices, 0.75),
          p90: quantile(prices, 0.90),
          max: prices.at(-1) ?? null,
        };
      })(),
      missingWikiLinks: pool.items.filter((item) => !item.wikiUrl).map(({ id, name }) => ({ id, name })),
      missingImages: pool.items.filter((item) => !item.image512pxLink && !item.iconLink).map(({ id, name }) => ({ id, name })),
      poolSizeDecision: pool.items.length < 12
        ? "All available loyalty levels merged; remains below 12."
        : pool.levelRange.includes("-") ? "Merged adjacent loyalty levels to reach the 12-item minimum." : "Meets the 12-item minimum without merging.",
    })),
  };
  const outDir = join(process.cwd(), "reports");
  await mkdir(outDir, { recursive: true });
  const reportPath = join(outDir, `m0-data-spike-${gameMode}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`M0 report: ${reportPath}`);
  for (const pool of report.pools) {
    console.log(`${pool.trader} LL${pool.levelRange}: ${pool.itemCount} items; price min/p50/max ${pool.price.min ?? "n/a"}/${pool.price.median ?? "n/a"}/${pool.price.max ?? "n/a"}; ${pool.poolSizeDecision}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
