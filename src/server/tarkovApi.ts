import { z } from "zod";
import { itemClassesFromTypes, TRADERS, type ItemClass, type Trader } from "../shared/game.js";

const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1).optional().nullable(),
  basePrice: z.number().optional().nullable(),
  wikiLink: z.string().optional().nullable(),
  iconLink: z.string().optional().nullable(),
  image512pxLink: z.string().optional().nullable(),
  types: z.array(z.string()).optional().nullable(),
  buyFromTrader: z.array(z.object({
    trader: z.string().min(1),
    minTraderLevel: z.number().int(),
  })).optional().nullable(),
});

const itemsResponseSchema = z.object({
  data: z.object({ items: z.record(z.string(), itemSchema) }),
});

const translationsResponseSchema = z.object({
  data: z.record(z.string(), z.string()),
});

const tradersResponseSchema = z.object({
  data: z.record(z.string(), z.object({
    id: z.string().min(1),
    normalizedName: z.string().min(1),
  })),
});

export interface OfferedItem {
  id: string;
  name: string;
  shortName: string;
  basePrice: number;
  wikiUrl: string | null;
  iconLink: string | null;
  image512pxLink: string | null;
  trader: Trader;
  loyaltyLevel: number;
  itemClasses: ItemClass[];
}

const traderAliases: Record<string, Trader> = Object.fromEntries(
  TRADERS.map((name) => [name.toLowerCase(), name]),
);

export function parseTraderOffers(
  itemsPayload: unknown,
  translationsPayload: unknown,
  tradersPayload: unknown,
): OfferedItem[] {
  const parsedItems = itemsResponseSchema.safeParse(itemsPayload);
  if (!parsedItems.success) throw new Error(`Unexpected tarkov.dev JSON items response: ${parsedItems.error.message}`);

  const parsedTranslations = translationsResponseSchema.safeParse(translationsPayload);
  if (!parsedTranslations.success) throw new Error(`Unexpected tarkov.dev English translations response: ${parsedTranslations.error.message}`);

  const parsedTraders = tradersResponseSchema.safeParse(tradersPayload);
  if (!parsedTraders.success) throw new Error(`Unexpected tarkov.dev traders response: ${parsedTraders.error.message}`);

  const englishNames = parsedTranslations.data.data;
  const traderById = new Map<string, Trader>();
  for (const traderData of Object.values(parsedTraders.data.data)) {
    const trader = traderAliases[traderData.normalizedName.toLowerCase()];
    if (trader) traderById.set(traderData.id, trader);
  }

  const offers: OfferedItem[] = [];
  for (const item of Object.values(parsedItems.data.data.items)) {
    const traderOffers = item.buyFromTrader ?? [];
    for (const traderOffer of traderOffers) {
      const trader = traderById.get(traderOffer.trader);
      if (!trader || traderOffer.minTraderLevel < 1 || traderOffer.minTraderLevel > 4) continue;

      const name = englishNames[item.name];
      if (!name) throw new Error(`tarkov.dev has no English translation for item ${item.id}.`);
      offers.push({
        id: item.id,
        name,
        shortName: item.shortName ? englishNames[item.shortName] ?? name : name,
        basePrice: Math.max(0, Math.round(item.basePrice ?? 0)),
        wikiUrl: item.wikiLink ?? null,
        iconLink: item.iconLink ?? null,
        image512pxLink: item.image512pxLink ?? null,
        trader,
        loyaltyLevel: traderOffer.minTraderLevel,
        itemClasses: itemClassesFromTypes(item.types ?? []),
      });
    }
  }
  if (offers.length === 0) throw new Error("tarkov.dev returned no standard-trader items for this game mode.");
  return offers;
}

export async function fetchTraderOffers(gameMode: "regular" | "pve"): Promise<OfferedItem[]> {
  const endpoint = (process.env.TARKOV_JSON_API_URL ?? "https://json.tarkov.dev").replace(/\/+$/, "");
  const fetchJson = async (path: string): Promise<unknown> => {
    const response = await fetch(`${endpoint}/${path}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`tarkov.dev JSON API returned HTTP ${response.status} for /${path}.`);
    return response.json();
  };
  const [itemsPayload, translationsPayload, tradersPayload] = await Promise.all([
    fetchJson(`${gameMode}/items`),
    fetchJson(`${gameMode}/items_en`),
    fetchJson(`${gameMode}/traders`),
  ]);
  return parseTraderOffers(itemsPayload, translationsPayload, tradersPayload);
}
