import { assignRarities, DEFAULT_SETTINGS, PACK_PRICES, TRADERS, type Rarity, type Trader } from "../shared/game.js";
import { poolConfig } from "./pool-config.js";
import type { OfferedItem } from "./tarkovApi.js";

export interface AssignedItem extends OfferedItem {
  poolKey: string;
  poolLevelRange: string;
  rarity: Rarity;
}

export interface PoolDefinition {
  poolKey: string;
  trader: Trader;
  levelRange: string;
  packPrice: number;
  items: AssignedItem[];
  rarityCounts: Record<Rarity, number>;
}

const normalizedTrader = (trader: string) => trader.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function buildPools(
  offers: OfferedItem[],
  minimumPoolSize = 12,
  rarityCuts: Record<Rarity, number> = DEFAULT_SETTINGS.rarityWeights,
): PoolDefinition[] {
  const firstOfferByItem = new Map<string, OfferedItem>();
  const orderedOffers = [...offers].sort((a, b) =>
    a.loyaltyLevel - b.loyaltyLevel ||
    a.trader.localeCompare(b.trader) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id),
  );
  for (const offer of orderedOffers) {
    if (!offer.id || poolConfig.blocklist.includes(offer.id) || !offer.name.trim() || !(offer.image512pxLink || offer.iconLink)) continue;
    if (!firstOfferByItem.has(offer.id)) firstOfferByItem.set(offer.id, offer);
  }
  const unique = [...firstOfferByItem.values()];
  const pools: PoolDefinition[] = [];
  for (const trader of TRADERS) {
    const traderItems = unique.filter((item) => item.trader === trader);
    const byLevel = new Map<number, OfferedItem[]>();
    for (let level = 1; level <= 4; level += 1) byLevel.set(level, []);
    for (const item of traderItems) byLevel.get(item.loyaltyLevel)?.push(item);

    let start = 1;
    while (start <= 4) {
      let end = start;
      let grouped = [...(byLevel.get(start) ?? [])];
      while (grouped.length < minimumPoolSize && end < 4) {
        end += 1;
        grouped = grouped.concat(byLevel.get(end) ?? []);
      }
      if (grouped.length === 0) break;
      const range = start === end ? `${start}` : `${start}-${end}`;
      const poolKey = `${normalizedTrader(trader)}-ll${range.replace("-", "-")}`;
      const withRarity = assignRarities(grouped, rarityCuts).map((item) => ({
        ...item,
        poolKey,
        poolLevelRange: range,
        rarity: poolConfig.rarityOverrides[item.id] ?? item.rarity,
      }));
      const rarityCounts = Object.fromEntries(
        (Object.keys(rarityCuts) as Rarity[]).map((rarity) => [rarity, withRarity.filter((item) => item.rarity === rarity).length]),
      ) as Record<Rarity, number>;
      pools.push({
        poolKey,
        trader,
        levelRange: range,
        packPrice: PACK_PRICES[start],
        items: withRarity,
        rarityCounts,
      });
      start = end + 1;
    }
  }
  return pools;
}
