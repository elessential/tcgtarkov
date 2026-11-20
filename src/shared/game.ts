export const TRADERS = ["Prapor", "Therapist", "Skier", "Peacekeeper", "Mechanic", "Ragman", "Jaeger"] as const;
export const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"] as const;
export const ITEM_CLASS_IDS = [
  "ammo",
  "ammoBox",
  "armor",
  "armorPlate",
  "backpack",
  "barter",
  "container",
  "glasses",
  "grenade",
  "gun",
  "headphones",
  "helmet",
  "injectors",
  "keys",
  "meds",
  "mods",
  "pistolGrip",
  "poster",
  "preset",
  "provisions",
  "rig",
  "specialSlot",
  "suppressor",
  "wearable",
  "other",
] as const;
export const ITEM_CLASSES: ReadonlyArray<{ id: ItemClass; label: string }> = [
  { id: "ammo", label: "Bullets & ammunition" },
  { id: "ammoBox", label: "Ammo boxes" },
  { id: "gun", label: "Weapons" },
  { id: "mods", label: "Weapon mods" },
  { id: "pistolGrip", label: "Pistol grips" },
  { id: "suppressor", label: "Suppressors" },
  { id: "armor", label: "Armor" },
  { id: "armorPlate", label: "Armor plates" },
  { id: "helmet", label: "Helmets" },
  { id: "backpack", label: "Backpacks" },
  { id: "rig", label: "Rigs & vests" },
  { id: "wearable", label: "Wearables" },
  { id: "glasses", label: "Glasses" },
  { id: "headphones", label: "Headsets" },
  { id: "meds", label: "Medical supplies" },
  { id: "injectors", label: "Injectors" },
  { id: "provisions", label: "Food & provisions" },
  { id: "barter", label: "Barter items" },
  { id: "container", label: "Containers" },
  { id: "keys", label: "Keys" },
  { id: "grenade", label: "Grenades" },
  { id: "specialSlot", label: "Special-slot items" },
  { id: "preset", label: "Weapon presets" },
  { id: "poster", label: "Posters" },
  { id: "other", label: "Other" },
];
export type Trader = (typeof TRADERS)[number];
export type Rarity = (typeof RARITIES)[number];
export type ItemClass = (typeof ITEM_CLASS_IDS)[number];

const itemClassIds = new Set<string>(ITEM_CLASS_IDS);

export function itemClassesFromTypes(types: readonly string[]): ItemClass[] {
  const classes = [...new Set(types.filter((type): type is ItemClass => type !== "other" && itemClassIds.has(type)))];
  return classes.length > 0 ? classes : ["other"];
}

export interface PoolItem {
  id: string;
  name: string;
  rarity: Rarity;
}

export interface DrawnCard extends PoolItem {
  isNew: boolean;
  isFoil: boolean;
}

export interface DrawSettings {
  packSize: number;
  rarityWeights: Record<Rarity, number>;
  godPackChance: number;
  foilChance: number;
  newCardPity: number;
  epicPity: number;
}

export interface PityCounters {
  packsSinceNew: number;
  packsSinceEpic: number;
}

export interface DrawResult {
  cards: DrawnCard[];
  wasGodPack: boolean;
  nextPity: PityCounters;
}

export const DEFAULT_SETTINGS: DrawSettings = {
  packSize: 5,
  rarityWeights: { Common: 50, Uncommon: 25, Rare: 15, Epic: 8, Legendary: 2 },
  godPackChance: 0.005,
  foilChance: 0.03,
  newCardPity: 4,
  epicPity: 20,
};

const RARITY_ORDER = new Map<Rarity, number>(RARITIES.map((rarity, index) => [rarity, index]));

export function assignRarities<T extends { basePrice: number; name: string }>(
  items: T[],
  cuts: Record<Rarity, number> = DEFAULT_SETTINGS.rarityWeights,
): Array<T & { rarity: Rarity }> {
  if (items.length === 0) return [];
  const total = Object.values(cuts).reduce((sum, value) => sum + value, 0);
  if (total <= 0 || Object.values(cuts).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Rarity percentile weights must be non-negative and have a positive sum.");
  }
  const sorted = [...items].sort((a, b) =>
    a.basePrice - b.basePrice ||
    a.name.localeCompare(b.name) ||
    ("id" in a && "id" in b ? String(a.id).localeCompare(String(b.id)) : 0),
  );
  const boundaries: Array<{ rarity: Rarity; cumulative: number }> = [];
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += cuts[rarity] / total;
    boundaries.push({ rarity, cumulative });
  }
  return sorted.map((item, index) => {
    const percentile = (index + 0.5) / sorted.length;
    const rarity = boundaries.find((boundary) => percentile <= boundary.cumulative)?.rarity ?? "Legendary";
    return { ...item, rarity };
  });
}

function choose<T>(values: readonly T[], random: () => number): T {
  if (values.length === 0) throw new Error("Cannot choose from an empty collection.");
  const value = random();
  if (value < 0 || value >= 1) throw new Error("Random source must return a value in [0, 1).");
  return values[Math.floor(value * values.length)]!;
}

function weightedRarity(
  rarities: readonly Rarity[],
  available: ReadonlySet<Rarity>,
  weights: Record<Rarity, number>,
  random: () => number,
  fallbackOrder: readonly Rarity[] = RARITIES,
): Rarity {
  const choices = rarities.filter((rarity) => available.has(rarity));
  if (choices.length === 0) {
    const fallback = fallbackOrder.filter((rarity) => available.has(rarity));
    if (fallback.length === 0) throw new Error("This pool has no available cards.");
    return fallback[0]!;
  }
  const total = choices.reduce((sum, rarity) => sum + Math.max(0, weights[rarity]), 0);
  if (total === 0) return choose(choices, random);
  let roll = random() * total;
  for (const rarity of choices) {
    roll -= Math.max(0, weights[rarity]);
    if (roll < 0) return rarity;
  }
  return choices[choices.length - 1]!;
}

export function drawPack(
  pool: PoolItem[],
  ownedIds: ReadonlySet<string>,
  pity: PityCounters,
  settings: DrawSettings = DEFAULT_SETTINGS,
  random: () => number = Math.random,
): DrawResult {
  if (!Number.isInteger(settings.packSize) || settings.packSize < 1 || settings.packSize > 20) {
    throw new Error("Pack size must be an integer between 1 and 20.");
  }
  if (pool.length === 0) throw new Error("This pool has no cards.");
  const rarityAvailable = new Set(pool.map((item) => item.rarity));
  const highRarities = RARITIES.filter((rarity) => RARITY_ORDER.get(rarity)! >= RARITY_ORDER.get("Epic")! && rarityAvailable.has(rarity));
  const missing = pool.filter((item) => !ownedIds.has(item.id));
  const naturalWeights = Object.fromEntries(
    RARITIES.map((rarity) => [rarity, pool.filter((item) => item.rarity === rarity).length]),
  ) as Record<Rarity, number>;
  const wasGodPack = highRarities.length > 0 && random() < settings.godPackChance;
  const forceNew = missing.length > 0 && pity.packsSinceNew >= settings.newCardPity;
  const forceEpic = pity.packsSinceEpic >= settings.epicPity;
  const newCardSlot = forceEpic && settings.packSize > 1 ? settings.packSize - 2 : settings.packSize - 1;
  const seen = new Set(ownedIds);
  const cards: DrawnCard[] = [];

  for (let slot = 0; slot < settings.packSize; slot += 1) {
    let candidates: PoolItem[];
    if (wasGodPack) {
      const rarity = weightedRarity(["Epic", "Legendary"], new Set(highRarities), { ...naturalWeights, Epic: 75, Legendary: 25 }, random);
      candidates = pool.filter((item) => item.rarity === rarity);
    } else if (forceEpic && slot === settings.packSize - 1) {
      const requiredRarities = highRarities.length > 0
        ? highRarities
        : [...RARITIES].reverse().filter((rarity) => rarityAvailable.has(rarity)).slice(0, 1);
      candidates = pool.filter((item) => requiredRarities.includes(item.rarity));
    } else if (slot < 3) {
      const rarity = weightedRarity(["Common", "Uncommon"], rarityAvailable, { ...settings.rarityWeights, Common: 70, Uncommon: 30 }, random);
      candidates = pool.filter((item) => item.rarity === rarity);
    } else if (slot === 3) {
      const rarity = weightedRarity(
        ["Rare", "Epic", "Legendary"],
        rarityAvailable,
        { ...settings.rarityWeights, Rare: 75, Epic: 20, Legendary: 5 },
        random,
        ["Uncommon", "Common"],
      );
      candidates = pool.filter((item) => item.rarity === rarity);
    } else {
      const rarity = weightedRarity(RARITIES, rarityAvailable, naturalWeights, random);
      candidates = pool.filter((item) => item.rarity === rarity);
    }

    if (forceNew && slot === newCardSlot) {
      const eligibleMissing = missing.filter((item) => candidates.some((candidate) => candidate.id === item.id));
      if (eligibleMissing.length > 0) candidates = eligibleMissing;
      else if (!(forceEpic && slot === settings.packSize - 1)) candidates = missing;
    }
    const item = choose(candidates, random);
    const isNew = !seen.has(item.id);
    seen.add(item.id);
    cards.push({ id: item.id, name: item.name, rarity: item.rarity, isNew, isFoil: random() < settings.foilChance });
  }

  const gotNew = cards.some((card) => card.isNew);
  const gotEpic = cards.some((card) => RARITY_ORDER.get(card.rarity)! >= RARITY_ORDER.get("Epic")!);
  return {
    cards,
    wasGodPack,
    nextPity: {
      packsSinceNew: gotNew ? 0 : pity.packsSinceNew + 1,
      packsSinceEpic: gotEpic || forceEpic ? 0 : pity.packsSinceEpic + 1,
    },
  };
}

export const DUPLICATE_SCRAP: Record<Rarity, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 5,
  Epic: 15,
  Legendary: 40,
};

export const PACK_PRICES: Record<number, number> = { 1: 250, 2: 500, 3: 1_000, 4: 2_000 };
