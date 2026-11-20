import type { Rarity } from "../shared/game.js";

export const poolConfig: {
  blocklist: string[];
  rarityOverrides: Record<string, Rarity>;
} = {
  blocklist: [],
  rarityOverrides: {},
};
