import { describe, expect, it } from "vitest";
import { assignRarities, drawPack, type PoolItem } from "../src/shared/game.js";

describe("assignRarities", () => {
  it("uses stable price and name ordering and assigns every item once", () => {
    const assigned = assignRarities([
      { id: "c", name: "same", basePrice: 10 },
      { id: "b", name: "same", basePrice: 10 },
      { id: "a", name: "cheap", basePrice: 1 },
    ]);
    expect(assigned.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(assigned).toHaveLength(3);
    expect(new Set(assigned.map((item) => item.id)).size).toBe(3);
  });
});

describe("drawPack", () => {
  const pool: PoolItem[] = [
    { id: "c", name: "Common", rarity: "Common" },
    { id: "u", name: "Uncommon", rarity: "Uncommon" },
    { id: "r", name: "Rare", rarity: "Rare" },
    { id: "e", name: "Epic", rarity: "Epic" },
  ];

  it("steps down to rarities available in a small pool and gives pity a new card", () => {
    const result = drawPack(pool.slice(0, 2), new Set(["c"]), { packsSinceNew: 4, packsSinceEpic: 0 }, {
      packSize: 5,
      rarityWeights: { Common: 50, Uncommon: 25, Rare: 15, Epic: 8, Legendary: 2 },
      godPackChance: 0,
      foilChance: 0,
      newCardPity: 4,
      epicPity: 20,
    }, () => 0);
    expect(result.cards.some((card) => card.id === "u" && card.isNew)).toBe(true);
    expect(result.nextPity.packsSinceNew).toBe(0);
  });

  it("guarantees an epic when epic pity is reached and the pool has one", () => {
    const result = drawPack(pool, new Set(pool.map((item) => item.id)), { packsSinceNew: 0, packsSinceEpic: 20 }, {
      packSize: 5,
      rarityWeights: { Common: 50, Uncommon: 25, Rare: 15, Epic: 8, Legendary: 2 },
      godPackChance: 0,
      foilChance: 0,
      newCardPity: 4,
      epicPity: 20,
    }, () => 0);
    expect(result.cards.some((card) => card.rarity === "Epic")).toBe(true);
    expect(result.nextPity.packsSinceEpic).toBe(0);
  });

  it("falls back to the highest available rarity for epic pity", () => {
    const result = drawPack(pool.slice(0, 2), new Set(["c", "u"]), { packsSinceNew: 0, packsSinceEpic: 20 }, {
      packSize: 5,
      rarityWeights: { Common: 50, Uncommon: 25, Rare: 15, Epic: 8, Legendary: 2 },
      godPackChance: 0,
      foilChance: 0,
      newCardPity: 4,
      epicPity: 20,
    }, () => 0);
    expect(result.cards.at(-1)?.rarity).toBe("Uncommon");
    expect(result.nextPity.packsSinceEpic).toBe(0);
  });
});
