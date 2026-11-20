import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import {
  assignRarities,
  DUPLICATE_SCRAP,
  ITEM_CLASS_IDS,
  RARITIES,
  drawPack,
  type DrawnCard,
  type ItemClass,
  type PityCounters,
  type PoolItem,
  type Rarity,
} from "../shared/game.js";
import { reverseLedgerEntry } from "../shared/ledger.js";
import { prisma } from "./db.js";
import { addEventClient, closeEventClients, publishEvent, publishHeartbeat } from "./events.js";
import { cacheImage, findFandomThumbnail } from "./imageCache.js";
import { seedGameMode } from "./seedData.js";
import { getSettings, persistSettings } from "./settings.js";
import { poolConfig } from "./pool-config.js";
import { isItemClassEnabled } from "./itemClassFilter.js";
import { backupSchema, craftSchema, flipPackSchema, idParamSchema, itemsQuerySchema, openPackSchema, settingsSchema, xpEntrySchema } from "./validation.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const overlayToken = process.env.OVERLAY_TOKEN;

app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "25mb" }));

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Object.assign(new Error(parsed.error.issues.map((issue) => issue.message).join("; ")), { status: 400 });
  return parsed.data;
}

function currentGameMode(settings: { gameMode: string }): string {
  return settings.gameMode;
}

async function getBalances(gameMode: string, tx: Pick<typeof prisma, "ledgerEntry"> = prisma) {
  const [coins, scrap] = await Promise.all([
    tx.ledgerEntry.aggregate({ where: { gameMode }, _sum: { coinDelta: true } }),
    tx.ledgerEntry.aggregate({ where: { gameMode }, _sum: { scrapDelta: true } }),
  ]);
  return { coins: coins._sum.coinDelta ?? 0, scrap: scrap._sum.scrapDelta ?? 0 };
}

async function getEnabledItems(gameMode: string, enabledItemClasses: readonly ItemClass[]) {
  const [items, pools] = await Promise.all([
    prisma.item.findMany({
      where: { gameMode },
      select: { id: true, poolKey: true, itemClasses: true },
    }),
    prisma.pool.findMany({ where: { gameMode }, select: { poolKey: true } }),
  ]);
  const activePoolKeys = new Set(pools.map((pool) => pool.poolKey));
  return items.filter((item) => activePoolKeys.has(item.poolKey) && isItemClassEnabled(item.itemClasses, enabledItemClasses));
}

async function getHud(gameMode: string) {
  const settings = await getSettings(prisma);
  const [balances, enabledItems, collection] = await Promise.all([
    getBalances(gameMode),
    getEnabledItems(gameMode, settings.enabledItemClasses),
    prisma.collectionEntry.findMany({
      where: { gameMode, ownedCount: { gt: 0 } },
      include: { item: { select: { itemClasses: true } } },
    }),
  ]);
  const enabledItemIds = new Set(enabledItems.map((item) => item.id));
  const collected = collection.filter((entry) => enabledItemIds.has(entry.itemId)).length;
  return { ...balances, collected, total: enabledItems.length };
}

async function overlayAuthorized(request: Request): Promise<boolean> {
  const configuredToken = overlayToken || (await prisma.setting.findUnique({ where: { key: "overlayToken" } }))?.value;
  if (!configuredToken) return true;
  const provided = request.query.key;
  if (typeof provided !== "string") return false;
  const expectedBuffer = Buffer.from(configuredToken);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

app.get("/api/health", (_request, response) => response.json({ ok: true }));

app.get("/api/state", async (_request, response) => {
  const settings = await getSettings(prisma);
  const gameMode = currentGameMode(settings);
  const [balances, allPacks, ledger, pity, enabledItems] = await Promise.all([
    getBalances(gameMode),
    prisma.packOpen.findMany({ where: { gameMode }, orderBy: { timestamp: "asc" } }),
    prisma.ledgerEntry.findMany({ where: { gameMode }, orderBy: { timestamp: "desc" }, take: 25 }),
    prisma.pityState.findMany({ where: { gameMode } }),
    getEnabledItems(gameMode, settings.enabledItemClasses),
  ]);
  const enabledItemIds = new Set(enabledItems.map((item) => item.id));
  const itemCountByPool = new Map<string, number>();
  for (const item of enabledItems) itemCountByPool.set(item.poolKey, (itemCountByPool.get(item.poolKey) ?? 0) + 1);
  const rarityRank: Record<Rarity, number> = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5 };
  const rarityScore: Record<Rarity, number> = { Common: 1, Uncommon: 2, Rare: 5, Epic: 12, Legendary: 30 };
  let rarestPull: { name: string; rarity: Rarity; packId: string } | null = null;
  let luckiestPack: { id: string; score: number; cards: DrawnCard[] } | null = null;
  const uniqueCards = new Set<string>();
  const completionHistory: Array<{ timestamp: string; collected: number }> = [{ timestamp: allPacks[0]?.timestamp.toISOString() ?? new Date().toISOString(), collected: 0 }];
  const sampleEvery = Math.max(1, Math.ceil(allPacks.length / 30));
  for (const [index, pack] of allPacks.entries()) {
    const cards = JSON.parse(pack.cards) as DrawnCard[];
    let score = 0;
    for (const card of cards) {
      if (enabledItemIds.has(card.id)) uniqueCards.add(card.id);
      score += rarityScore[card.rarity];
      if (!rarestPull || rarityRank[card.rarity] > rarityRank[rarestPull.rarity]) {
        rarestPull = { name: card.name, rarity: card.rarity, packId: pack.id };
      }
    }
    if (!luckiestPack || score > luckiestPack.score) luckiestPack = { id: pack.id, score, cards };
    if ((index + 1) % sampleEvery === 0 || index === allPacks.length - 1) {
      completionHistory.push({ timestamp: pack.timestamp.toISOString(), collected: uniqueCards.size });
    }
  }
  const packs = allPacks.slice(-100).reverse();
  const spentAggregate = await prisma.ledgerEntry.aggregate({
    where: { gameMode, type: "pack_purchase" },
    _sum: { coinDelta: true },
  });
  const coinsSpent = -(spentAggregate._sum.coinDelta ?? 0);
  const [allCollection, pools] = await Promise.all([
    prisma.collectionEntry.findMany({
      where: { gameMode, ownedCount: { gt: 0 } },
      include: { item: true },
    }),
    prisma.pool.findMany({ where: { gameMode }, orderBy: [{ trader: "asc" }, { levelRange: "asc" }] }),
  ]);
  const collection = allCollection.filter((entry) => enabledItemIds.has(entry.itemId));
  const visiblePools = pools.filter((pool) => itemCountByPool.has(pool.poolKey));
  const collectedByPool = new Map<string, number>();
  for (const entry of collection) {
    collectedByPool.set(entry.item.poolKey, (collectedByPool.get(entry.item.poolKey) ?? 0) + 1);
  }
  response.json({
    settings,
    gameMode,
    ...balances,
    collection: collection.map(({ item, ...entry }) => ({ ...entry, item })),
    packs: packs.map((pack) => ({ ...pack, cards: JSON.parse(pack.cards) as DrawnCard[] })),
    stats: {
      packsOpened: allPacks.length,
      godPacks: allPacks.filter((pack) => pack.wasGodPack).length,
      coinsSpent,
      luckiestPack,
      rarestPull,
      completionHistory,
    },
    ledger,
    pools: visiblePools.map((pool) => ({
      ...pool,
      itemCount: itemCountByPool.get(pool.poolKey)!,
      collectedCount: collectedByPool.get(pool.poolKey) ?? 0,
    })),
    pity: Object.fromEntries(pity.map((entry) => [entry.poolKey, { packsSinceNew: entry.packsSinceNew, packsSinceEpic: entry.packsSinceEpic }])),
  });
});

app.get("/api/pools", async (_request, response) => {
  const settings = await getSettings(prisma);
  const [pools, enabledItems, collection] = await Promise.all([
    prisma.pool.findMany({ where: { gameMode: settings.gameMode }, orderBy: [{ trader: "asc" }, { levelRange: "asc" }] }),
    getEnabledItems(settings.gameMode, settings.enabledItemClasses),
    prisma.collectionEntry.findMany({
      where: { gameMode: settings.gameMode, ownedCount: { gt: 0 } },
      include: { item: { select: { poolKey: true, itemClasses: true } } },
    }),
  ]);
  const itemCountByPool = new Map<string, number>();
  for (const item of enabledItems) itemCountByPool.set(item.poolKey, (itemCountByPool.get(item.poolKey) ?? 0) + 1);
  const enabledItemIds = new Set(enabledItems.map((item) => item.id));
  const owned = new Map<string, number>();
  for (const entry of collection) {
    if (enabledItemIds.has(entry.itemId)) {
      owned.set(entry.item.poolKey, (owned.get(entry.item.poolKey) ?? 0) + 1);
    }
  }
  response.json(pools.filter((pool) => itemCountByPool.has(pool.poolKey)).map((pool) => ({
    ...pool,
    itemCount: itemCountByPool.get(pool.poolKey)!,
    collectedCount: owned.get(pool.poolKey) ?? 0,
  })));
});

app.get("/api/items", async (request, response) => {
  const settings = await getSettings(prisma);
  const { trader, loyaltyLevel, rarity, search } = parseOrThrow(itemsQuerySchema, request.query);
  const activePools = await prisma.pool.findMany({ where: { gameMode: settings.gameMode }, select: { poolKey: true } });
  const items = (await prisma.item.findMany({
    where: {
      gameMode: settings.gameMode,
      poolKey: { in: activePools.map((pool) => pool.poolKey) },
      ...(typeof trader === "string" && trader !== "All" ? { trader } : {}),
      ...(typeof loyaltyLevel === "string" && loyaltyLevel !== "All" ? { loyaltyLevel: Number(loyaltyLevel) } : {}),
      ...(typeof rarity === "string" && rarity !== "All" ? { rarity } : {}),
      ...(typeof search === "string" && search.trim() ? { name: { contains: search.trim() } } : {}),
    },
    include: { collection: true },
    orderBy: [{ trader: "asc" }, { loyaltyLevel: "asc" }, { name: "asc" }],
  })).filter((item) => isItemClassEnabled(item.itemClasses, settings.enabledItemClasses));
  response.json(items.map(({ collection, ...item }) => ({
    ...item,
    ownedCount: collection?.ownedCount ?? 0,
    foilCount: collection?.foilCount ?? 0,
  })));
});

app.post("/api/xp", async (request, response) => {
  const { xpAmount } = parseOrThrow(xpEntrySchema, request.body);
  const settings = await getSettings(prisma);
  const coinDelta = Math.floor(xpAmount / settings.xpPerCoin);
  if (coinDelta <= 0) throw Object.assign(new Error(`Enter at least ${settings.xpPerCoin} XP to earn a coin.`), { status: 400 });
  await prisma.ledgerEntry.create({
    data: { type: "xp_entry", gameMode: settings.gameMode, xpAmount, coinDelta, note: `Raid XP: ${xpAmount.toLocaleString()}` },
  });
  const hud = await getHud(settings.gameMode);
  publishEvent("hud_update", hud);
  response.status(201).json({ ...hud, earned: coinDelta });
});

app.post("/api/packs/open", async (request, response) => {
  const { poolKey, idempotencyKey } = parseOrThrow(openPackSchema, request.body);
  const settings = await getSettings(prisma);
  const gameMode = settings.gameMode;

  let result: Awaited<ReturnType<typeof openPackTransaction>>;
  try {
    result = await openPackTransaction();
  } catch (error) {
    const previous = await prisma.packOpen.findUnique({ where: { idempotencyKey } });
    if (!previous) throw error;
    result = {
      pack: previous,
      cards: JSON.parse(previous.cards) as DrawnCard[],
      repeated: true,
      balances: await getBalances(previous.gameMode),
    };
  }

  async function openPackTransaction() {
    return prisma.$transaction(async (tx) => {
      const previous = await tx.packOpen.findUnique({ where: { idempotencyKey } });
      if (previous) {
        return {
          pack: previous,
          cards: JSON.parse(previous.cards) as DrawnCard[],
          repeated: true,
          balances: await getBalances(previous.gameMode, tx),
        };
      }

      const pool = await tx.pool.findFirst({ where: { poolKey, gameMode } });
      if (!pool) throw Object.assign(new Error("Pack pool not found for the selected game mode."), { status: 404 });
      const balance = await getBalances(gameMode, tx);
      if (balance.coins < pool.packPrice) {
        throw Object.assign(new Error(`Not enough coins. This pack costs ${pool.packPrice}.`), { status: 400 });
      }

      const [dbItems, ownedEntries, pityEntry] = await Promise.all([
        tx.item.findMany({ where: { poolKey, gameMode }, orderBy: { id: "asc" } }),
        tx.collectionEntry.findMany({
          where: { gameMode, item: { poolKey }, ownedCount: { gt: 0 } },
          select: { itemId: true },
        }),
        tx.pityState.findUnique({ where: { poolKey_gameMode: { poolKey, gameMode } } }),
      ]);
      const eligibleItems = dbItems.filter((item) => isItemClassEnabled(item.itemClasses, settings.enabledItemClasses));
      if (eligibleItems.length === 0) {
        throw Object.assign(new Error("This pool has no items in the enabled classes."), { status: 400 });
      }
      const eligibleItemIds = new Set(eligibleItems.map((item) => item.id));
      const poolItems: PoolItem[] = eligibleItems.map((item) => ({
        id: item.id,
        name: item.name,
        rarity: item.rarity as Rarity,
      }));
      const pity: PityCounters = {
        packsSinceNew: pityEntry?.packsSinceNew ?? 0,
        packsSinceEpic: pityEntry?.packsSinceEpic ?? 0,
      };
      const draw = drawPack(
        poolItems,
        new Set(ownedEntries.filter((entry) => eligibleItemIds.has(entry.itemId)).map((entry) => entry.itemId)),
        pity,
        {
          packSize: settings.packSize,
          rarityWeights: settings.rarityWeights,
          godPackChance: settings.godPackChance,
          foilChance: settings.foilChance,
          newCardPity: settings.newCardPity,
          epicPity: settings.epicPity,
        },
        () => randomInt(0, 1_000_000) / 1_000_000,
      );
      const pack = await tx.packOpen.create({
        data: {
          idempotencyKey,
          gameMode,
          poolKey,
          cost: pool.packPrice,
          cards: JSON.stringify(draw.cards),
          wasGodPack: draw.wasGodPack,
          pityBefore: JSON.stringify(pity),
        },
      });
      await tx.ledgerEntry.create({
        data: {
          type: "pack_purchase",
          gameMode,
          coinDelta: -pool.packPrice,
          refId: pack.id,
          note: `Opened ${pool.trader} LL${pool.levelRange} pack`,
        },
      });
      let duplicateScrap = 0;
      for (const card of draw.cards) {
        await tx.collectionEntry.upsert({
          where: { itemId_gameMode: { itemId: card.id, gameMode } },
          create: { itemId: card.id, gameMode, ownedCount: 1, foilCount: card.isFoil ? 1 : 0 },
          update: { ownedCount: { increment: 1 }, foilCount: { increment: card.isFoil ? 1 : 0 } },
        });
        if (!card.isNew) duplicateScrap += DUPLICATE_SCRAP[card.rarity];
      }
      if (duplicateScrap > 0) {
        await tx.ledgerEntry.create({
          data: {
            type: "scrap_gain",
            gameMode,
            scrapDelta: duplicateScrap,
            refId: pack.id,
            note: `Duplicates from ${pool.trader} LL${pool.levelRange} pack`,
          },
        });
      }
      await tx.pityState.upsert({
        where: { poolKey_gameMode: { poolKey, gameMode } },
        create: { poolKey, gameMode, ...draw.nextPity },
        update: draw.nextPity,
      });
      return { pack, cards: draw.cards, repeated: false, balances: await getBalances(gameMode, tx) };
    });
  }

  if (!result.repeated) {
    const itemImages = await prisma.item.findMany({
      where: { gameMode, id: { in: result.cards.map((card) => card.id) } },
      select: { id: true, imageLocal: true },
    });
    const imageById = new Map(itemImages.map((item) => [item.id, item.imageLocal]));
    const event = {
      poolKey,
      cards: result.cards.map((card) => ({ ...card, imageLocal: imageById.get(card.id) ?? null })),
      godPack: result.pack.wasGodPack,
      packId: result.pack.id,
      overlayMode: settings.overlayMode,
      duration: settings.overlayDuration,
    };
    publishEvent("pack_opened", event);
    publishEvent("hud_update", await getHud(gameMode));
  }
  response.status(result.repeated ? 200 : 201).json({ ...result, pack: { ...result.pack, cards: result.cards } });
});

app.post("/api/packs/:id/flip", async (request, response) => {
  const { id } = parseOrThrow(idParamSchema, request.params);
  const body = parseOrThrow(flipPackSchema, request.body);
  const pack = await prisma.packOpen.findUnique({ where: { id } });
  if (!pack) throw Object.assign(new Error("Pack not found."), { status: 404 });
  const cards = JSON.parse(pack.cards) as DrawnCard[];
  const flippedCards = new Set<number>(JSON.parse(pack.flippedCards) as number[]);
  if ("index" in body) {
    if (body.index >= cards.length) throw Object.assign(new Error("Card index is outside this pack."), { status: 400 });
    flippedCards.add(body.index);
  } else {
    cards.forEach((_, index) => flippedCards.add(index));
  }
  const indexes = [...flippedCards].sort((a, b) => a - b);
  await prisma.packOpen.update({
    where: { id: pack.id },
    data: { flippedCards: JSON.stringify(indexes), flipped: indexes.length === cards.length },
  });
  for (const cardIndex of indexes) {
    if (!JSON.parse(pack.flippedCards).includes(cardIndex)) publishEvent("card_flipped", { packId: pack.id, cardIndex });
  }
  response.json({ ok: true, flippedCards: indexes });
});

app.post("/api/collection/craft", async (request, response) => {
  const { itemId } = parseOrThrow(craftSchema, request.body);
  const settings = await getSettings(prisma);
  const gameMode = settings.gameMode;
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.item.findFirst({ where: { id: itemId, gameMode } });
    if (!item) throw Object.assign(new Error("Card not found."), { status: 404 });
    if (!isItemClassEnabled(item.itemClasses, settings.enabledItemClasses)) {
      throw Object.assign(new Error("This item class is disabled."), { status: 400 });
    }
    const existing = await tx.collectionEntry.findUnique({ where: { itemId_gameMode: { itemId, gameMode } } });
    if ((existing?.ownedCount ?? 0) > 0) throw Object.assign(new Error("You can craft only a missing card."), { status: 400 });
    const cost = DUPLICATE_SCRAP[item.rarity as Rarity] * 4;
    const balance = await getBalances(gameMode, tx);
    if (balance.scrap < cost) throw Object.assign(new Error(`Not enough scrap. Crafting this card costs ${cost}.`), { status: 400 });
    await tx.ledgerEntry.create({
      data: { type: "craft_spend", gameMode, scrapDelta: -cost, refId: item.id, note: `Crafted ${item.name}` },
    });
    await tx.collectionEntry.upsert({
      where: { itemId_gameMode: { itemId, gameMode } },
      create: { itemId, gameMode, ownedCount: 1, foilCount: 0 },
      update: { ownedCount: 1 },
    });
    return { item, cost };
  });
  const hud = await getHud(gameMode);
  publishEvent("hud_update", hud);
  response.status(201).json({ ...result, ...hud });
});

app.post("/api/ledger/:id/undo", async (request, response) => {
  const { id } = parseOrThrow(idParamSchema, request.params);
  const settings = await getSettings(prisma);
  const gameMode = settings.gameMode;
  await prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.findFirst({ where: { id, gameMode } });
    if (!entry || entry.reversesId || !["xp_entry", "pack_purchase"].includes(entry.type)) {
      throw Object.assign(new Error("This transaction cannot be undone."), { status: 400 });
    }
    const alreadyReversed = await tx.ledgerEntry.findUnique({ where: { reversesId: entry.id } });
    if (alreadyReversed) throw Object.assign(new Error("This transaction was already undone."), { status: 400 });
    if (entry.type === "pack_purchase") {
      const purchases = await tx.ledgerEntry.findMany({ where: { gameMode, type: "pack_purchase" }, orderBy: [{ timestamp: "desc" }, { id: "desc" }] });
      let latestUnreversed: (typeof purchases)[number] | undefined;
      for (const purchase of purchases) {
        if (!(await tx.ledgerEntry.findUnique({ where: { reversesId: purchase.id } }))) {
          latestUnreversed = purchase;
          break;
        }
      }
      if (latestUnreversed?.id !== entry.id) throw Object.assign(new Error("Only the most recent pack purchase can be undone."), { status: 400 });
      const pack = entry.refId ? await tx.packOpen.findUnique({ where: { id: entry.refId } }) : null;
      if (!pack) throw Object.assign(new Error("Pack history is missing; the purchase cannot be undone."), { status: 409 });
      const cards = JSON.parse(pack.cards) as DrawnCard[];
      const counts = new Map<string, { owned: number; foil: number }>();
      for (const card of cards) {
        const count = counts.get(card.id) ?? { owned: 0, foil: 0 };
        count.owned += 1;
        count.foil += card.isFoil ? 1 : 0;
        counts.set(card.id, count);
      }
      for (const [itemId, count] of counts) {
        const current = await tx.collectionEntry.findUnique({ where: { itemId_gameMode: { itemId, gameMode } } });
        if (!current || current.ownedCount < count.owned || current.foilCount < count.foil) {
          throw Object.assign(new Error("Collection changed since this pack was opened; undo is no longer safe."), { status: 409 });
        }
        const ownedCount = current.ownedCount - count.owned;
        if (ownedCount === 0) await tx.collectionEntry.delete({ where: { itemId_gameMode: { itemId, gameMode } } });
        else await tx.collectionEntry.update({
          where: { itemId_gameMode: { itemId, gameMode } },
          data: { ownedCount, foilCount: current.foilCount - count.foil },
        });
      }
      const previousPity = JSON.parse(pack.pityBefore) as PityCounters;
      await tx.pityState.upsert({
        where: { poolKey_gameMode: { poolKey: pack.poolKey, gameMode } },
        create: { poolKey: pack.poolKey, gameMode, ...previousPity },
        update: previousPity,
      });
      await tx.ledgerEntry.create({
        data: reverseLedgerEntry(entry, `Undo: ${entry.note ?? "pack purchase"}`),
      });
      const gains = await tx.ledgerEntry.findMany({ where: { gameMode, type: "scrap_gain", refId: pack.id } });
      for (const gain of gains) {
        if (await tx.ledgerEntry.findUnique({ where: { reversesId: gain.id } })) continue;
        await tx.ledgerEntry.create({
          data: reverseLedgerEntry(gain, "Undo duplicate scrap from pack"),
        });
      }
    } else {
      await tx.ledgerEntry.create({
        data: reverseLedgerEntry(entry, `Undo: ${entry.note ?? entry.type}`),
      });
    }
  });
  const hud = await getHud(gameMode);
  publishEvent("hud_update", hud);
  response.json(hud);
});

app.patch("/api/settings", async (request, response) => {
  const patch = parseOrThrow(settingsSchema, request.body);
  await prisma.$transaction(async (tx) => {
    await persistSettings(tx, patch);
    if (patch.rarityWeights) {
      const pools = await tx.pool.findMany();
      for (const pool of pools) {
        const items = await tx.item.findMany({
          where: { gameMode: pool.gameMode, poolKey: pool.poolKey },
          select: { id: true, name: true, basePrice: true },
        });
        const assigned = assignRarities(items, patch.rarityWeights).map((item) => ({
          ...item,
          rarity: poolConfig.rarityOverrides[item.id] ?? item.rarity,
        }));
        const rarityCounts = Object.fromEntries(
          RARITIES.map((rarity) => [rarity, assigned.filter((item) => item.rarity === rarity).length]),
        );
        for (const item of assigned) {
          await tx.item.update({
            where: { id_gameMode: { id: item.id, gameMode: pool.gameMode } },
            data: { rarity: item.rarity },
          });
        }
        await tx.pool.update({
          where: { poolKey_gameMode: { poolKey: pool.poolKey, gameMode: pool.gameMode } },
          data: { rarityCuts: JSON.stringify(patch.rarityWeights) },
        });
      }
    }
  });
  const updated = await getSettings(prisma);
  publishEvent("hud_update", await getHud(updated.gameMode));
  response.json(updated);
});

app.post("/api/settings/overlay-token", async (_request, response) => {
  if (overlayToken) {
    throw Object.assign(new Error("OVERLAY_TOKEN is configured in the environment. Change it there to regenerate the hosted token."), { status: 400 });
  }
  const token = randomBytes(32).toString("hex");
  await prisma.setting.upsert({
    where: { key: "overlayToken" },
    create: { key: "overlayToken", value: token },
    update: { value: token },
  });
  closeEventClients();
  response.json({ token });
});

app.get("/api/events", async (request, response) => {
  if (!(await overlayAuthorized(request))) {
    response.status(401).end("Unauthorized");
    return;
  }
  const settings = await getSettings(prisma);
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  response.write("retry: 3000\n\n");
  addEventClient(response);
  response.write(`event: hud_update\ndata: ${JSON.stringify(await getHud(settings.gameMode))}\n\n`);
});

app.post("/api/overlay/test", async (request, response) => {
  const settings = await getSettings(prisma);
  const sampleCards = [
    { id: "test-common", name: "Military Bandage", rarity: "Common", isNew: true, isFoil: false },
    { id: "test-rare", name: "Graphics Card", rarity: "Rare", isNew: false, isFoil: true },
    { id: "test-epic", name: "LEDX Skin Transilluminator", rarity: "Epic", isNew: true, isFoil: false },
    { id: "test-common-2", name: "Duct Tape", rarity: "Common", isNew: false, isFoil: false },
    { id: "test-legendary", name: "Red Keycard", rarity: "Legendary", isNew: true, isFoil: false },
  ];
  const cachedItems = await prisma.item.findMany({
    where: { gameMode: settings.gameMode, imageLocal: { not: null } },
    orderBy: { name: "asc" },
    take: 5,
    select: { id: true, name: true, rarity: true, imageLocal: true },
  });
  const sample = {
    poolKey: "test",
    cards: cachedItems.length === 5
      ? cachedItems.map((item, index) => ({
          id: item.id,
          name: item.name,
          rarity: item.rarity as Rarity,
          isNew: index % 2 === 0,
          isFoil: index === 1,
          imageLocal: item.imageLocal,
        }))
      : sampleCards.map((card) => ({ ...card, imageLocal: null })),
    godPack: false,
  };
  publishEvent("test", { ...sample, duration: settings.overlayDuration });
  response.json({ ok: true });
});

app.post("/api/data/repair-images", async (_request, response) => {
  const settings = await getSettings(prisma);
  const missing = await prisma.item.findMany({
    where: { gameMode: settings.gameMode, OR: [{ needsRefresh: true }, { imageLocal: null }] },
    select: { id: true, imageUrl: true, name: true },
  });
  let repaired = 0;
  const errors: Array<{ itemId: string; error: string }> = [];
  for (const item of missing) {
    let imageLocal = await cacheImage(settings.gameMode, item.id, [item.imageUrl]);
    if (!imageLocal) {
      try {
        const fandomImage = await findFandomThumbnail(item.name);
        imageLocal = await cacheImage(settings.gameMode, item.id, [fandomImage]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ itemId: item.id, error: message });
        console.warn(`Fandom image repair failed for ${item.id}: ${message}`);
      }
    }
    await prisma.item.update({
      where: { id_gameMode: { id: item.id, gameMode: settings.gameMode } },
      data: { imageLocal, needsRefresh: !imageLocal },
    });
    if (imageLocal) repaired += 1;
  }
  response.json({ processed: missing.length, repaired, remaining: missing.length - repaired, errors });
});

app.post("/api/data/seed", async (_request, response) => {
  const settings = await getSettings(prisma);
  const report = await seedGameMode(settings.gameMode);
  publishEvent("hud_update", await getHud(settings.gameMode));
  response.json(report);
});

app.get("/api/export", async (_request, response) => {
  const settings = await getSettings(prisma);
  const gameMode = settings.gameMode;
  const [items, pools, collection, ledger, packs, pity] = await Promise.all([
    prisma.item.findMany({ where: { gameMode } }),
    prisma.pool.findMany({ where: { gameMode } }),
    prisma.collectionEntry.findMany({ where: { gameMode } }),
    prisma.ledgerEntry.findMany({ where: { gameMode }, orderBy: { timestamp: "asc" } }),
    prisma.packOpen.findMany({ where: { gameMode }, orderBy: { timestamp: "asc" } }),
    prisma.pityState.findMany({ where: { gameMode } }),
  ]);
  response.json({ version: 1, exportedAt: new Date().toISOString(), gameMode, settings, items, pools, collection, ledger, packs, pity });
});

app.post("/api/import", async (request, response) => {
  const backup = parseOrThrow(backupSchema, request.body);
  if ([...backup.items, ...backup.pools, ...backup.collection, ...backup.ledger, ...backup.packs, ...backup.pity]
    .some((entry) => entry.gameMode !== backup.gameMode)) {
    throw Object.assign(new Error("Backup data contains mixed game modes."), { status: 400 });
  }
  for (const pack of backup.packs) {
    let cards: unknown;
    let pityBefore: unknown;
    try {
      cards = JSON.parse(pack.cards);
      pityBefore = JSON.parse(pack.pityBefore);
    } catch {
      throw Object.assign(new Error("Backup contains invalid pack or pity JSON."), { status: 400 });
    }
    const cardsResult = z.array(z.object({
      id: z.string(),
      name: z.string(),
      rarity: z.enum(RARITIES),
      isNew: z.boolean(),
      isFoil: z.boolean(),
    })).safeParse(cards);
    const pityResult = z.object({
      packsSinceNew: z.number().int().nonnegative(),
      packsSinceEpic: z.number().int().nonnegative(),
    }).safeParse(pityBefore);
    if (!cardsResult.success || !pityResult.success) {
      throw Object.assign(new Error("Backup contains invalid pack or pity data."), { status: 400 });
    }
  }
  await prisma.$transaction(async (tx) => {
    const gameMode = backup.gameMode;
    await tx.collectionEntry.deleteMany({ where: { gameMode } });
    await tx.ledgerEntry.deleteMany({ where: { gameMode } });
    await tx.pityState.deleteMany({ where: { gameMode } });
    await tx.packOpen.deleteMany({ where: { gameMode } });
    await tx.pool.deleteMany({ where: { gameMode } });
    await tx.item.deleteMany({ where: { gameMode } });
    if (backup.items.length) await tx.item.createMany({ data: backup.items });
    if (backup.pools.length) await tx.pool.createMany({ data: backup.pools });
    if (backup.collection.length) await tx.collectionEntry.createMany({ data: backup.collection.map((entry) => ({ ...entry, firstObtainedAt: new Date(entry.firstObtainedAt) })) });
    if (backup.ledger.length) await tx.ledgerEntry.createMany({ data: backup.ledger.map((entry) => ({ ...entry, timestamp: new Date(entry.timestamp) })) });
    if (backup.packs.length) await tx.packOpen.createMany({ data: backup.packs.map((entry) => ({ ...entry, timestamp: new Date(entry.timestamp) })) });
    if (backup.pity.length) await tx.pityState.createMany({ data: backup.pity });
    const importedSettings = {
      ...backup.settings,
      enabledItemClasses: backup.settings.enabledItemClasses ?? [...ITEM_CLASS_IDS],
      gameMode,
    };
    for (const [key, value] of Object.entries(importedSettings)) {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: key === "rarityWeights" || key === "enabledItemClasses" ? JSON.stringify(value) : String(value) },
        update: { value: key === "rarityWeights" || key === "enabledItemClasses" ? JSON.stringify(value) : String(value) },
      });
    }
  });
  publishEvent("hud_update", await getHud(backup.gameMode));
  response.json({ ok: true, gameMode: backup.gameMode });
});

app.post("/api/reset", async (_request, response) => {
  const settings = await getSettings(prisma);
  const gameMode = settings.gameMode;
  await prisma.$transaction(async (tx) => {
    const [entries, existingReversals] = await Promise.all([
      tx.ledgerEntry.findMany({ where: { gameMode, type: { not: "reversal" }, reversesId: null } }),
      tx.ledgerEntry.findMany({ where: { gameMode, reversesId: { not: null } }, select: { reversesId: true } }),
    ]);
    const alreadyReversed = new Set(existingReversals.map((entry) => entry.reversesId));
    const adjustments = entries
      .filter((entry) => !alreadyReversed.has(entry.id) && (entry.coinDelta !== 0 || entry.scrapDelta !== 0))
      .map((entry) => reverseLedgerEntry(entry, `Wipe reset: reverse ${entry.note ?? entry.type}`));
    if (adjustments.length) await tx.ledgerEntry.createMany({ data: adjustments });
    await tx.collectionEntry.deleteMany({ where: { gameMode } });
    await tx.pityState.deleteMany({ where: { gameMode } });
  });
  publishEvent("hud_update", await getHud(gameMode));
  response.json({ ok: true });
});

app.use("/images", express.static("public/images", { fallthrough: false, maxAge: "30d" }));
if (existsSync(join(process.cwd(), "dist", "index.html"))) {
  app.use(express.static(join(process.cwd(), "dist")));
  app.get(/.*/, (_request, response) => response.sendFile(join(process.cwd(), "dist", "index.html")));
}
app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  if (status >= 500) console.error(error);
  response.status(status).json({ error: message });
});

const server = app.listen(port, process.env.HOST ?? "127.0.0.1", () => {
  console.log(`Tarkov TCG API listening on http://${process.env.HOST ?? "127.0.0.1"}:${port}`);
});

const heartbeat = setInterval(() => {
  publishHeartbeat();
}, 15_000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
  });
}
