import { describe, expect, it } from "vitest";
import {
  COLLECTIBLE_CARDS,
  COLLECTIBLE_CATEGORIES,
  COLLECTIBLE_PACK_PRICE,
  COLLECTIBLE_PACK_SIZE,
  collectibleCardById,
  drawCollectiblePack,
} from "../src/shared/collectibles.js";

describe("collectible cards", () => {
  it("defines the card types, anatomy, lore, and abilities", () => {
    expect(new Set(COLLECTIBLE_CARDS.map((card) => card.category))).toEqual(new Set(COLLECTIBLE_CATEGORIES));
    expect(new Set(COLLECTIBLE_CARDS.map((card) => card.cardType))).toEqual(new Set(["Units", "Hideouts", "Covers", "Lethal"]));
    expect(new Set(COLLECTIBLE_CARDS.map((card) => card.id)).size).toBe(COLLECTIBLE_CARDS.length);
    for (const card of COLLECTIBLE_CARDS) {
      expect(card.abilityName).not.toBe("");
      expect(card.abilityText).not.toBe("");
      expect(card.story).not.toBe("");
      expect(card.artworkKey).not.toBe("");
      expect(card.traits.length).toBeGreaterThan(0);
      expect(card.cost).toBeGreaterThan(0);
      expect(card.health).toBeGreaterThan(0);
      expect(card.attack).toBeGreaterThanOrEqual(0);
      expect(card.resources).toBeGreaterThanOrEqual(0);
      expect(card.reputation).toBeGreaterThanOrEqual(0);
      expect(card.reward).toBeGreaterThanOrEqual(0);
      expect(card.primaryStat.value).toBeGreaterThan(0);
      expect(card.secondaryStat.value).toBeGreaterThan(0);
    }
  });

  it("draws a five-card pack with a higher-rarity card and tracks ownership and foil", () => {
    expect(COLLECTIBLE_PACK_PRICE).toBeGreaterThan(0);
    const cards = drawCollectiblePack(new Set(), () => 0.99);

    expect(cards).toHaveLength(COLLECTIBLE_PACK_SIZE);
    expect(new Set(cards.map((card) => card.id)).size).toBe(COLLECTIBLE_PACK_SIZE);
    expect(cards.some((card) => ["Rare", "Epic", "Legendary"].includes(collectibleCardById(card.id).rarity))).toBe(true);
    expect(cards.every((card) => card.isNew)).toBe(true);
    expect(cards.every((card) => !card.isFoil)).toBe(true);
  });

  it("marks previously owned cards as duplicates and rejects invalid random sources", () => {
    const allOwned = new Set(COLLECTIBLE_CARDS.map((card) => card.id));
    const cards = drawCollectiblePack(allOwned, () => 0.5);

    expect(cards.every((card) => !card.isNew)).toBe(true);
    expect(() => drawCollectiblePack(new Set(), () => 1)).toThrow("Random source must return a value in [0, 1).");
  });
});
