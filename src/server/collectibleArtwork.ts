import { z } from "zod";
import { COLLECTIBLE_CARDS } from "../shared/collectibles.js";
import { cacheImage, findCachedImage, findFandomThumbnail } from "./imageCache.js";

const imageUrlSchema = z.string().url().nullable().optional();
const traderSchema = z.object({
  normalizedName: z.string().optional(),
  name: z.string().optional(),
  imageLink: imageUrlSchema,
}).passthrough();
const mapSchema = z.object({
  normalizedName: z.string().optional(),
  name: z.string().optional(),
  wiki: z.string().url().nullable().optional(),
}).passthrough();
const mobSchema = z.object({
  normalizedName: z.string().optional(),
  name: z.string().optional(),
  imagePortraitLink: imageUrlSchema,
  imagePosterLink: imageUrlSchema,
}).passthrough();
const apiResponseSchema = z.object({
  traders: z.object({ data: z.record(z.string(), traderSchema) }),
  maps: z.object({
    data: z.object({
      maps: z.record(z.string(), mapSchema),
      mobs: z.record(z.string(), mobSchema),
    }).passthrough(),
  }),
});

export interface CollectibleArtwork {
  imageLocal: string | null;
  imageUrl: string | null;
}

export interface CollectibleArtworkResult {
  byCardId: Map<string, CollectibleArtwork>;
  warning: string | null;
}

interface ArtworkSources {
  sources: Map<string, string[]>;
  warnings: string[];
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseCollectibleArtworkSources(tradersPayload: unknown, mapsPayload: unknown): Map<string, string[]> {
  const parsed = apiResponseSchema.safeParse({ traders: tradersPayload, maps: mapsPayload });
  if (!parsed.success) throw new Error(`Unexpected tarkov.dev collectible artwork response: ${parsed.error.message}`);

  const sources = new Map<string, string[]>();
  for (const [key, trader] of Object.entries(parsed.data.traders.data)) {
    const name = trader.normalizedName ?? trader.name ?? key;
    if (trader.imageLink) sources.set(normalize(name), [trader.imageLink]);
  }
  for (const [key, mob] of Object.entries(parsed.data.maps.data.mobs)) {
    const name = mob.normalizedName ?? mob.name ?? key;
    const images = [mob.imagePosterLink, mob.imagePortraitLink].filter((image): image is string => !!image);
    if (images.length) sources.set(normalize(name), images);
  }
  return sources;
}

let artworkSourcesPromise: Promise<ArtworkSources> | null = null;

async function fetchCollectibleArtworkSources(): Promise<ArtworkSources> {
  const endpoint = (process.env.TARKOV_JSON_API_URL ?? "https://json.tarkov.dev").replace(/\/+$/, "");
  const fetchJson = async (path: string): Promise<unknown> => {
    const response = await fetch(`${endpoint}/${path}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`tarkov.dev JSON API returned HTTP ${response.status} for /${path}.`);
    return response.json();
  };
  const [tradersResult, mapsResult] = await Promise.allSettled([
    fetchJson("regular/traders"),
    fetchJson("regular/maps"),
  ]);
  const sources = new Map<string, string[]>();
  const warnings: string[] = [];
  const emptyMaps = { data: { maps: {}, mobs: {} } };
  const emptyTraders = { data: {} };

  if (tradersResult.status === "fulfilled") {
    try {
      for (const [key, images] of parseCollectibleArtworkSources(tradersResult.value, emptyMaps)) sources.set(key, images);
    } catch (error) {
      warnings.push(`Trader portraits: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    warnings.push(`Trader portraits: ${tradersResult.reason instanceof Error ? tradersResult.reason.message : String(tradersResult.reason)}`);
  }
  if (mapsResult.status !== "fulfilled") {
    warnings.push(`Boss and map artwork: ${mapsResult.reason instanceof Error ? mapsResult.reason.message : String(mapsResult.reason)}`);
    return { sources, warnings };
  }

  let parsedMaps: { data: { maps: Record<string, z.infer<typeof mapSchema>> } };
  try {
    for (const [key, images] of parseCollectibleArtworkSources(emptyTraders, mapsResult.value)) sources.set(key, images);
    parsedMaps = z.object({ data: z.object({ maps: z.record(z.string(), mapSchema) }) }).parse(mapsResult.value);
  } catch (error) {
    warnings.push(`Boss and map artwork: ${error instanceof Error ? error.message : String(error)}`);
    return { sources, warnings };
  }
  const mapRecords = parsedMaps.data.maps;
  const mapByName = new Map<string, z.infer<typeof mapSchema>>();
  for (const [key, map] of Object.entries(mapRecords)) {
    mapByName.set(normalize(map.normalizedName ?? map.name ?? key), map);
  }

  const mapKeys = [...new Set(COLLECTIBLE_CARDS
    .filter((card) => card.category === "Map" || card.category === "Cover" || card.category === "Lethal")
    .map((card) => card.artworkKey))];
  const mapSources = await Promise.all(mapKeys.map(async (key) => {
    const map = mapByName.get(normalize(key));
    if (!map?.wiki) return [normalize(key), [] as string[]] as const;
    const title = decodeURIComponent(new URL(map.wiki).pathname.split("/").pop() ?? "").replace(/_/g, " ");
    let image: string | null;
    try {
      image = await findFandomThumbnail(title);
    } catch (error) {
      warnings.push(`${title} map artwork: ${error instanceof Error ? error.message : String(error)}`);
      image = null;
    }
    return [normalize(key), image ? [image] : []] as const;
  }));
  for (const [key, images] of mapSources) {
    if (images.length) sources.set(key, images);
  }
  return { sources, warnings };
}

async function getCollectibleArtworkSources(): Promise<ArtworkSources> {
  if (!artworkSourcesPromise) {
    artworkSourcesPromise = fetchCollectibleArtworkSources().catch((error: unknown) => {
      artworkSourcesPromise = null;
      throw error;
    });
  }
  return artworkSourcesPromise;
}

export async function resolveCollectibleArtwork(): Promise<CollectibleArtworkResult> {
  const cached = await Promise.all(COLLECTIBLE_CARDS.map(async (card) => [
    card.id,
    await findCachedImage("collectibles", card.id),
  ] as const));
  const byCardId = new Map<string, CollectibleArtwork>(
    cached.map(([id, imageLocal]) => [id, { imageLocal, imageUrl: null }]),
  );
  const cardsNeedingImages = COLLECTIBLE_CARDS.filter((card) => !byCardId.get(card.id)?.imageLocal);
  if (cardsNeedingImages.length === 0) return { byCardId, warning: null };

  let artworkSources: ArtworkSources;
  try {
    artworkSources = await getCollectibleArtworkSources();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Collectible artwork lookup failed: ${message}`);
    return { byCardId, warning: `Collectible artwork could not be loaded: ${message}` };
  }

  const results = await Promise.all(cardsNeedingImages.map(async (card) => {
    const imageUrls = artworkSources.sources.get(normalize(card.artworkKey)) ?? [];
    const imageLocal = await cacheImage("collectibles", card.id, imageUrls);
    const imageUrl = imageUrls[0] ?? null;
    return [card.id, { imageLocal, imageUrl }] as const;
  }));
  for (const [id, artwork] of results) byCardId.set(id, artwork);
  const missingCount = results.filter(([, artwork]) => !artwork.imageLocal && !artwork.imageUrl).length;
  const warnings = [...artworkSources.warnings];
  if (missingCount) warnings.push(`${missingCount} collectible card${missingCount === 1 ? "" : "s"} could not find artwork in the public APIs.`);
  const warning = warnings.length ? warnings.join(" ") : null;
  if (warning) console.warn(warning);
  return { byCardId, warning };
}
