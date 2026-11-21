import { z } from "zod";
import { ITEM_CLASS_IDS, RARITIES, TRADERS } from "../shared/game.js";

export const gameModeSchema = z.enum(["regular", "pve"]);
export const xpEntrySchema = z.object({
  xpAmount: z.number().int().min(1).max(10_000_000),
  survived: z.boolean().optional(),
  kills: z.number().int().min(0).max(100).optional(),
});
export const openPackSchema = z.object({
  poolKey: z.string().min(1).max(120),
  idempotencyKey: z.string().uuid(),
});
export const openCollectiblePackSchema = z.object({ idempotencyKey: z.string().uuid() });
export const craftSchema = z.object({ itemId: z.string().min(1).max(120) });
export const flipPackSchema = z.union([
  z.object({ index: z.number().int().min(0) }),
  z.object({ all: z.literal(true) }),
]);
export const traderSchema = z.enum(TRADERS);
export const itemsQuerySchema = z.object({
  trader: z.union([z.literal("All"), traderSchema]).optional(),
  loyaltyLevel: z.enum(["All", "1", "2", "3", "4"]).optional(),
  rarity: z.union([z.literal("All"), z.enum(RARITIES)]).optional(),
  search: z.string().max(200).optional(),
}).strict();
export const idParamSchema = z.object({ id: z.string().min(1).max(120) });
export const settingsSchema = z.object({
  xpPerCoin: z.number().int().min(1).max(1_000_000).optional(),
  packSize: z.number().int().min(1).max(20).optional(),
  rarityWeights: z.object(Object.fromEntries(RARITIES.map((rarity) => [rarity, z.number().min(0).max(100)])) as Record<(typeof RARITIES)[number], z.ZodNumber>).refine((weights) => Object.values(weights).some((weight) => weight > 0)).optional(),
  godPackChance: z.number().min(0).max(1).optional(),
  foilChance: z.number().min(0).max(1).optional(),
  newCardPity: z.number().int().min(1).max(1000).optional(),
  epicPity: z.number().int().min(1).max(1000).optional(),
  overlayDuration: z.number().min(1).max(120).optional(),
  overlayMode: z.enum(["immediate", "synced"]).optional(),
  overlayHud: z.boolean().optional(),
  overlayPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
  gameMode: gameModeSchema.optional(),
  enabledItemClasses: z.array(z.enum(ITEM_CLASS_IDS))
    .max(ITEM_CLASS_IDS.length)
    .refine((classes) => new Set(classes).size === classes.length, "Item classes must be unique.")
    .optional(),
});
const isoDateSchema = z.string().datetime({ offset: true });
export const backupSchema = z.object({
  version: z.literal(1),
  gameMode: gameModeSchema,
  settings: settingsSchema,
  items: z.array(z.object({
    id: z.string().min(1),
    gameMode: gameModeSchema,
    name: z.string(),
    shortName: z.string(),
    wikiUrl: z.string().nullable(),
    imageUrl: z.string().nullable(),
    imageLocal: z.string().nullable(),
    itemClasses: z.string().optional(),
    basePrice: z.number().int(),
    trader: traderSchema,
    loyaltyLevel: z.number().int().min(1).max(4),
    poolKey: z.string(),
    rarity: z.enum(RARITIES),
    needsRefresh: z.boolean(),
  })),
  pools: z.array(z.object({
    poolKey: z.string(),
    gameMode: gameModeSchema,
    trader: traderSchema,
    levelRange: z.string(),
    itemCount: z.number().int().nonnegative(),
    packPrice: z.number().int().nonnegative(),
    rarityCuts: z.string(),
  })),
  collection: z.array(z.object({
    itemId: z.string(),
    gameMode: gameModeSchema,
    ownedCount: z.number().int().nonnegative(),
    foilCount: z.number().int().nonnegative(),
    firstObtainedAt: isoDateSchema,
  })),
  ledger: z.array(z.object({
    id: z.string(),
    timestamp: isoDateSchema,
    type: z.string(),
    gameMode: gameModeSchema,
    coinDelta: z.number().int(),
    scrapDelta: z.number().int(),
    xpAmount: z.number().int().nullable(),
    refId: z.string().nullable(),
    reversesId: z.string().nullable(),
    note: z.string().nullable(),
  })),
  packs: z.array(z.object({
    id: z.string(),
    idempotencyKey: z.string().uuid(),
    gameMode: gameModeSchema,
    poolKey: z.string(),
    cost: z.number().int().nonnegative(),
    cards: z.string(),
    wasGodPack: z.boolean(),
    pityBefore: z.string(),
    timestamp: isoDateSchema,
    flipped: z.boolean(),
    flippedCards: z.string(),
  })),
  pity: z.array(z.object({
    poolKey: z.string(),
    gameMode: gameModeSchema,
    packsSinceNew: z.number().int().nonnegative(),
    packsSinceEpic: z.number().int().nonnegative(),
  })),
  collectibleCollection: z.array(z.object({
    cardId: z.string(),
    gameMode: gameModeSchema,
    ownedCount: z.number().int().nonnegative(),
    foilCount: z.number().int().nonnegative(),
    firstObtainedAt: isoDateSchema,
  })).optional(),
  collectiblePacks: z.array(z.object({
    id: z.string(),
    idempotencyKey: z.string().uuid(),
    gameMode: gameModeSchema,
    cost: z.number().int().nonnegative(),
    cards: z.string(),
    timestamp: isoDateSchema,
  })).optional(),
});

