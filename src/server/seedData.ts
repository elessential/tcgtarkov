import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "./db.js";
import { cacheImage } from "./imageCache.js";
import { buildPools } from "./pools.js";
import { getSettings } from "./settings.js";
import { fetchTraderOffers } from "./tarkovApi.js";

export async function seedGameMode(gameMode: "regular" | "pve") {
  const settings = await getSettings(prisma);
  const offers = await fetchTraderOffers(gameMode);
  const pools = buildPools(offers, 12, settings.rarityWeights);
  const expectedItems = pools.flatMap((pool) => pool.items);
  let downloaded = 0;
  let imageFailures = 0;

  for (const item of expectedItems) {
    const prior = await prisma.item.findUnique({ where: { id_gameMode: { id: item.id, gameMode } } });
    const imageLocal = process.env.TARKOV_SKIP_IMAGE_CACHE === "true"
      ? prior?.imageLocal ?? null
      : await cacheImage(gameMode, item.id, [item.image512pxLink, item.iconLink]);
    if (imageLocal && imageLocal !== prior?.imageLocal) downloaded += 1;
    if (!imageLocal) imageFailures += 1;
    await prisma.item.upsert({
      where: { id_gameMode: { id: item.id, gameMode } },
      create: {
        id: item.id,
        gameMode,
        name: item.name,
        shortName: item.shortName,
        wikiUrl: item.wikiUrl,
        imageUrl: item.image512pxLink ?? item.iconLink,
        imageLocal,
        itemClasses: JSON.stringify(item.itemClasses),
        basePrice: item.basePrice,
        trader: item.trader,
        loyaltyLevel: item.loyaltyLevel,
        poolKey: item.poolKey,
        rarity: item.rarity,
        needsRefresh: !imageLocal,
      },
      update: {
        name: item.name,
        shortName: item.shortName,
        wikiUrl: item.wikiUrl,
        imageUrl: item.image512pxLink ?? item.iconLink,
        imageLocal,
        itemClasses: JSON.stringify(item.itemClasses),
        basePrice: item.basePrice,
        trader: item.trader,
        loyaltyLevel: item.loyaltyLevel,
        poolKey: item.poolKey,
        rarity: item.rarity,
        needsRefresh: !imageLocal,
      },
    });
  }
  await prisma.$transaction(
    pools.map((pool) => prisma.pool.upsert({
      where: { poolKey_gameMode: { poolKey: pool.poolKey, gameMode } },
      create: {
        poolKey: pool.poolKey,
        gameMode,
        trader: pool.trader,
        levelRange: pool.levelRange,
        itemCount: pool.items.length,
        packPrice: pool.packPrice,
        rarityCuts: JSON.stringify(settings.rarityWeights),
      },
      update: {
        trader: pool.trader,
        levelRange: pool.levelRange,
        itemCount: pool.items.length,
        packPrice: pool.packPrice,
        rarityCuts: JSON.stringify(settings.rarityWeights),
      },
    })),
  );
  const stalePools = await prisma.pool.findMany({
    where: { gameMode, poolKey: { notIn: pools.map((pool) => pool.poolKey) } },
    select: { poolKey: true },
  });
  if (stalePools.length > 0) {
    await prisma.pool.deleteMany({ where: { gameMode, poolKey: { in: stalePools.map((pool) => pool.poolKey) } } });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    gameMode,
    sourceOffers: offers.length,
    uniqueItems: expectedItems.length,
    cachedImages: downloaded,
    missingCachedImages: imageFailures,
    pools: pools.map(({ poolKey, trader, levelRange, items, rarityCounts }) => ({
      poolKey,
      trader,
      levelRange,
      itemCount: items.length,
      rarityCounts,
    })),
  };
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  await writeFile(join(process.cwd(), "reports", `seed-summary-${gameMode}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
