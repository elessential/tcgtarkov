import { prisma } from "../src/server/db.js";
import { DEFAULT_SETTINGS, DUPLICATE_SCRAP, drawPack, type PoolItem, type Rarity } from "../src/shared/game.js";
import { getSettings } from "../src/server/settings.js";

const simulations = Number(process.env.SIMULATIONS ?? 1_000);

try {
  const settings = await getSettings(prisma);
  const pools = await prisma.pool.findMany({ where: { gameMode: settings.gameMode } });
  if (!Number.isInteger(simulations) || simulations < 1 || simulations > 10_000) {
    throw new Error("SIMULATIONS must be an integer between 1 and 10000.");
  }
  if (pools.length === 0) throw new Error("No seeded pools found. Run `npm run seed` before `npm run simulate`.");
  for (const pool of pools) {
    const items = await prisma.item.findMany({ where: { gameMode: settings.gameMode, poolKey: pool.poolKey }, select: { id: true, name: true, rarity: true } });
    const cards: PoolItem[] = items.map((item) => ({ ...item, rarity: item.rarity as Rarity }));
    let completedPacks = 0;
    let packsToLegendaryTotal = 0;
    const hasLegendary = cards.some((card) => card.rarity === "Legendary");
    let duplicateScrap = 0;
    let duplicateCount = 0;

    for (let run = 0; run < simulations; run += 1) {
      const owned = new Set<string>();
      let pity = { packsSinceNew: 0, packsSinceEpic: 0 };
      let packs = 0;
      while (owned.size < cards.length && packs < 100_000) {
        const result = drawPack(cards, owned, pity, {
          ...DEFAULT_SETTINGS,
          packSize: settings.packSize,
          rarityWeights: settings.rarityWeights,
          godPackChance: settings.godPackChance,
          foilChance: settings.foilChance,
          newCardPity: settings.newCardPity,
          epicPity: settings.epicPity,
        });
        packs += 1;
        pity = result.nextPity;
        for (const card of result.cards) {
          if (!owned.has(card.id)) owned.add(card.id);
          else {
            duplicateCount += 1;
            duplicateScrap += DUPLICATE_SCRAP[card.rarity];
          }
        }
      }
      completedPacks += packs;

      if (!hasLegendary) continue;
      let gotLegendary = false;
      let legendaryPacks = 0;
      const empty = new Set<string>();
      let legendaryPity = { packsSinceNew: 0, packsSinceEpic: 0 };
      while (!gotLegendary && legendaryPacks < 100_000) {
        const result = drawPack(cards, empty, legendaryPity, {
          ...DEFAULT_SETTINGS,
          packSize: settings.packSize,
          rarityWeights: settings.rarityWeights,
          godPackChance: settings.godPackChance,
          foilChance: settings.foilChance,
          newCardPity: settings.newCardPity,
          epicPity: settings.epicPity,
        });
        legendaryPacks += 1;
        legendaryPity = result.nextPity;
        gotLegendary = result.cards.some((card) => card.rarity === "Legendary");
      }
      packsToLegendaryTotal += legendaryPacks;
    }

    console.log(JSON.stringify({
      poolKey: pool.poolKey,
      itemCount: cards.length,
      simulations,
      expectedPacksToComplete: Number((completedPacks / simulations).toFixed(2)),
      packsToFirstLegendary: hasLegendary ? Number((packsToLegendaryTotal / simulations).toFixed(2)) : null,
      averageCoinsPerDuplicate: duplicateCount ? Number(((pool.packPrice * completedPacks) / duplicateCount).toFixed(2)) : null,
      averageScrapPerDuplicate: duplicateCount ? Number((duplicateScrap / duplicateCount).toFixed(2)) : null,
    }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
