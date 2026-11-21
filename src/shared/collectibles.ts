import type { Rarity } from "./game.js";

export const COLLECTIBLE_CATEGORIES = ["Boss", "Trader", "Map", "Cover", "Lethal"] as const;
export type CollectibleCategory = (typeof COLLECTIBLE_CATEGORIES)[number];
export const COLLECTIBLE_CARD_TYPES = ["Units", "Hideouts", "Covers", "Lethal"] as const;
export type CollectibleCardType = (typeof COLLECTIBLE_CARD_TYPES)[number];

export interface CollectibleCard {
  id: string;
  name: string;
  category: CollectibleCategory;
  cardType: CollectibleCardType;
  artworkKey: string;
  imageLocal?: string | null;
  imageUrl?: string | null;
  rarity: Rarity;
  symbol: string;
  primaryStat: { label: string; value: number };
  secondaryStat: { label: string; value: number };
  cost: number;
  attack: number;
  resources: number;
  reputation: number;
  reward: number;
  health: number;
  traits: string[];
  abilityName: string;
  abilityText: string;
  story: string;
}

interface CollectibleCardTemplate {
  id: string;
  name: string;
  category: CollectibleCategory;
  rarity: Rarity;
  symbol: string;
  primaryStat: { label: string; value: number };
  secondaryStat: { label: string; value: number };
  artworkKey?: string;
  abilityName: string;
  abilityText: string;
  story: string;
}

export interface DrawnCollectible {
  id: string;
  isNew: boolean;
  isFoil: boolean;
}

export const COLLECTIBLE_PACK_SIZE = 5;
export const COLLECTIBLE_PACK_PRICE = 250;

const COLLECTIBLE_CARD_TEMPLATES: readonly CollectibleCardTemplate[] = [
  {
    id: "boss-reshala",
    name: "Reshala, the Dealmaker",
    category: "Boss",
    rarity: "Rare",
    symbol: "R",
    primaryStat: { label: "THREAT", value: 7 },
    secondaryStat: { label: "GUARD", value: 6 },
    abilityName: "Paid Protection",
    abilityText: "While a guard stands with Reshala, the first strike against him loses its force.",
    story: "At the dorms, every door has a price. His guards already know who paid.",
  },
  {
    id: "boss-killa",
    name: "Killa, Mall Warden",
    category: "Boss",
    rarity: "Epic",
    symbol: "K",
    primaryStat: { label: "THREAT", value: 9 },
    secondaryStat: { label: "GUARD", value: 9 },
    abilityName: "Redline Charge",
    abilityText: "When Killa enters the raid, mark a route. The next rival crossing it is caught off guard.",
    story: "The lights fail one by one. A red stripe moves between the darkened shopfronts.",
  },
  {
    id: "boss-tagilla",
    name: "Tagilla, Foundry King",
    category: "Boss",
    rarity: "Rare",
    symbol: "T",
    primaryStat: { label: "THREAT", value: 8 },
    secondaryStat: { label: "GUARD", value: 7 },
    abilityName: "Hammerfall",
    abilityText: "Break a barricade to open a shortcut; the noise reveals your position.",
    story: "A heavy hammer rings through the Factory. The workers have all gone quiet.",
  },
  {
    id: "boss-shturman",
    name: "Shturman, Woods Ghost",
    category: "Boss",
    rarity: "Epic",
    symbol: "S",
    primaryStat: { label: "THREAT", value: 8 },
    secondaryStat: { label: "GUARD", value: 5 },
    abilityName: "Long Sightline",
    abilityText: "Choose an exposed route. Scouts on that route cannot hide until the next turn.",
    story: "The sawmill is empty at noon. At dusk, the forest starts watching back.",
  },
  {
    id: "boss-sanitar",
    name: "Sanitar, Shoreline Surgeon",
    category: "Boss",
    rarity: "Epic",
    symbol: "S",
    primaryStat: { label: "THREAT", value: 7 },
    secondaryStat: { label: "GUARD", value: 8 },
    abilityName: "Field Treatment",
    abilityText: "Recover one wounded ally, then move them to cover before the next assault.",
    story: "His clinic has no sign, no waiting room, and a light that never goes out.",
  },
  {
    id: "boss-glukhar",
    name: "Glukhar, Reserve Marshal",
    category: "Boss",
    rarity: "Legendary",
    symbol: "G",
    primaryStat: { label: "THREAT", value: 10 },
    secondaryStat: { label: "GUARD", value: 9 },
    abilityName: "Hold the Line",
    abilityText: "Call the squad to a landmark. Allies there gain cover until the next turn.",
    story: "The command bunker answers his voice. The whole reserve moves as one.",
  },
  {
    id: "boss-knight",
    name: "Knight, Night Operator",
    category: "Boss",
    rarity: "Legendary",
    symbol: "N",
    primaryStat: { label: "THREAT", value: 9 },
    secondaryStat: { label: "GUARD", value: 8 },
    abilityName: "Blackout Entry",
    abilityText: "Enter from a shadowed edge. The first defender cannot intercept this advance.",
    story: "Three silhouettes cross the ridge without a word. Only one leaves footprints.",
  },
  {
    id: "trader-prapor",
    name: "Prapor, Frontline Broker",
    category: "Trader",
    rarity: "Common",
    symbol: "P",
    primaryStat: { label: "INFLUENCE", value: 6 },
    secondaryStat: { label: "INTEL", value: 4 },
    abilityName: "Supply Drop",
    abilityText: "Send a cache to a known landmark; the first ally who reaches it takes the supplies.",
    story: "His radio crackles with old call signs and favors that are still unpaid.",
  },
  {
    id: "trader-therapist",
    name: "Therapist, Field Medic",
    category: "Trader",
    rarity: "Uncommon",
    symbol: "T",
    primaryStat: { label: "INFLUENCE", value: 5 },
    secondaryStat: { label: "INTEL", value: 7 },
    abilityName: "Triage",
    abilityText: "Stabilize an ally. They can withdraw safely, but must leave one supply behind.",
    story: "She keeps a careful ledger of every survivor who made it back to the light.",
  },
  {
    id: "trader-skier",
    name: "Skier, Border Fixer",
    category: "Trader",
    rarity: "Uncommon",
    symbol: "S",
    primaryStat: { label: "INFLUENCE", value: 7 },
    secondaryStat: { label: "INTEL", value: 5 },
    abilityName: "Back Channel",
    abilityText: "Trade a rumor for a route. Reveal one concealed path before the next move.",
    story: "He knows a man who knows a man. The border guard knows them both.",
  },
  {
    id: "trader-peacekeeper",
    name: "Peacekeeper, Liaison",
    category: "Trader",
    rarity: "Rare",
    symbol: "U",
    primaryStat: { label: "INFLUENCE", value: 8 },
    secondaryStat: { label: "INTEL", value: 7 },
    abilityName: "Clearance Window",
    abilityText: "Open a brief corridor through a contested zone. It closes after one crossing.",
    story: "A stamped document travels farther than a warning shot, if it arrives in time.",
  },
  {
    id: "trader-mechanic",
    name: "Mechanic, Quartermaster",
    category: "Trader",
    rarity: "Epic",
    symbol: "M",
    primaryStat: { label: "INFLUENCE", value: 7 },
    secondaryStat: { label: "INTEL", value: 9 },
    abilityName: "Field Retrofit",
    abilityText: "Repair a tool or reinforce cover. Choose one before the next encounter.",
    story: "Every broken machine has a second life in his workshop, and sometimes a third.",
  },
  {
    id: "trader-ragman",
    name: "Ragman, Quartermaster",
    category: "Trader",
    rarity: "Common",
    symbol: "R",
    primaryStat: { label: "INFLUENCE", value: 5 },
    secondaryStat: { label: "INTEL", value: 5 },
    abilityName: "Hidden Pockets",
    abilityText: "Move one small supply past a checkpoint without drawing attention.",
    story: "The market stalls are empty now. His old customers still know where to find him.",
  },
  {
    id: "trader-jaeger",
    name: "Jaeger, Wilds Guide",
    category: "Trader",
    rarity: "Rare",
    symbol: "J",
    primaryStat: { label: "INFLUENCE", value: 6 },
    secondaryStat: { label: "INTEL", value: 8 },
    abilityName: "Read the Wind",
    abilityText: "Scout the wilderness. Learn which approach is quietest before the squad moves.",
    story: "He leaves no trail on the way in, and expects the same courtesy on the way out.",
  },
  {
    id: "map-customs",
    name: "Customs, Crossroads",
    category: "Map",
    rarity: "Common",
    symbol: "C",
    primaryStat: { label: "DANGER", value: 6 },
    secondaryStat: { label: "SALVAGE", value: 6 },
    abilityName: "Dormitory Sweep",
    abilityText: "Search the dorms for a lead; every rival hears the doors open.",
    story: "The river divides the old road. The bridge has never been a quiet way across.",
  },
  {
    id: "map-woods",
    name: "Woods, Long Winter",
    category: "Map",
    rarity: "Uncommon",
    symbol: "W",
    primaryStat: { label: "DANGER", value: 7 },
    secondaryStat: { label: "SALVAGE", value: 5 },
    abilityName: "Tree Line",
    abilityText: "Take cover among the pines; distant scouts lose your trail for one turn.",
    story: "Snow erases the road by morning. The lake keeps every secret it is given.",
  },
  {
    id: "map-factory",
    name: "Factory, Last Shift",
    category: "Map",
    rarity: "Common",
    symbol: "F",
    primaryStat: { label: "DANGER", value: 9 },
    secondaryStat: { label: "SALVAGE", value: 4 },
    abilityName: "Emergency Lights",
    abilityText: "Reveal every nearby position, including your own.",
    story: "The siren has been ringing for hours. Nobody can remember who pulled it.",
  },
  {
    id: "map-interchange",
    name: "Interchange, Black Friday",
    category: "Map",
    rarity: "Rare",
    symbol: "I",
    primaryStat: { label: "DANGER", value: 7 },
    secondaryStat: { label: "SALVAGE", value: 9 },
    abilityName: "Power Restored",
    abilityText: "Light one wing of the mall. Search it before the outage spreads.",
    story: "Escalators stand still beneath the signs. Somewhere, a generator coughs awake.",
  },
  {
    id: "map-reserve",
    name: "Reserve, Redoubt",
    category: "Map",
    rarity: "Epic",
    symbol: "R",
    primaryStat: { label: "DANGER", value: 9 },
    secondaryStat: { label: "SALVAGE", value: 9 },
    abilityName: "Bunker Signal",
    abilityText: "Sound the alarm to open a sealed cache; the blast doors will not stay open.",
    story: "The launch site is quiet. Below ground, every radio is tuned to the same frequency.",
  },
  {
    id: "map-lighthouse",
    name: "Lighthouse, Gray Tide",
    category: "Map",
    rarity: "Rare",
    symbol: "L",
    primaryStat: { label: "DANGER", value: 8 },
    secondaryStat: { label: "SALVAGE", value: 7 },
    abilityName: "Coastal Watch",
    abilityText: "Spot movement along the shore; the watched route cannot be ambushed this turn.",
    story: "The beam still turns over the water, though nobody tends the lantern anymore.",
  },
  {
    id: "map-streets",
    name: "Streets, Empty Quarter",
    category: "Map",
    rarity: "Legendary",
    symbol: "S",
    primaryStat: { label: "DANGER", value: 10 },
    secondaryStat: { label: "SALVAGE", value: 10 },
    abilityName: "City of Echoes",
    abilityText: "Choose one block to search. Its alleys connect to every nearby route.",
    story: "The city remembers every footstep. At night, it repeats the ones that never came home.",
  },
  {
    id: "cover-customs-crates",
    name: "Customs, Freight Stack",
    category: "Cover",
    rarity: "Common",
    symbol: "C",
    primaryStat: { label: "DANGER", value: 2 },
    secondaryStat: { label: "SALVAGE", value: 4 },
    artworkKey: "customs",
    abilityName: "Take Cover",
    abilityText: "Discard one card to draw one card while this cover is in play.",
    story: "The cargo is long gone. The steel still stops a round.",
  },
  {
    id: "cover-woods-rocks",
    name: "Woods, Stone Shelf",
    category: "Cover",
    rarity: "Uncommon",
    symbol: "W",
    primaryStat: { label: "DANGER", value: 3 },
    secondaryStat: { label: "SALVAGE", value: 3 },
    artworkKey: "woods",
    abilityName: "Break the Silhouette",
    abilityText: "A unit behind this cover cannot be targeted from beyond the tree line.",
    story: "Moss softens the ridge; old brass in the dirt says someone else found it first.",
  },
  {
    id: "cover-reserve-barrier",
    name: "Reserve, Blast Wall",
    category: "Cover",
    rarity: "Rare",
    symbol: "R",
    primaryStat: { label: "DANGER", value: 4 },
    secondaryStat: { label: "SALVAGE", value: 5 },
    artworkKey: "reserve",
    abilityName: "Reinforced Position",
    abilityText: "The first attack against a unit at this location deals two less damage.",
    story: "The bunker wall was built for a different war. It is holding all the same.",
  },
  {
    id: "lethal-factory-alarm",
    name: "Factory, False Alarm",
    category: "Lethal",
    rarity: "Rare",
    symbol: "F",
    primaryStat: { label: "DANGER", value: 7 },
    secondaryStat: { label: "SALVAGE", value: 2 },
    artworkKey: "factory",
    abilityName: "Sound the Siren",
    abilityText: "Deal three damage to a unit that moved this turn; reveal its position.",
    story: "The klaxon starts with a cough. The echo makes it sound like an evacuation.",
  },
  {
    id: "lethal-customs-minefield",
    name: "Customs, Marked Ground",
    category: "Lethal",
    rarity: "Epic",
    symbol: "C",
    primaryStat: { label: "DANGER", value: 9 },
    secondaryStat: { label: "SALVAGE", value: 1 },
    artworkKey: "customs",
    abilityName: "No Safe Crossing",
    abilityText: "Deal four damage to the first unit that crosses this route.",
    story: "The warning paint fades at the water's edge. The current never carries the markers back.",
  },
  {
    id: "lethal-woods-snare",
    name: "Woods, Silent Snare",
    category: "Lethal",
    rarity: "Uncommon",
    symbol: "W",
    primaryStat: { label: "DANGER", value: 6 },
    secondaryStat: { label: "SALVAGE", value: 2 },
    artworkKey: "woods",
    abilityName: "Tripwire",
    abilityText: "The first unit entering this route loses its next action.",
    story: "A twig bends against the wind. The forest is waiting for someone to notice.",
  },
];

const cardTypeByCategory: Record<CollectibleCategory, CollectibleCardType> = {
  Boss: "Units",
  Trader: "Units",
  Map: "Hideouts",
  Cover: "Covers",
  Lethal: "Lethal",
};
const rarityCost: Record<Rarity, number> = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5 };
const rarityReward: Record<Rarity, number> = { Common: 1, Uncommon: 2, Rare: 3, Epic: 5, Legendary: 8 };
const defaultArtworkKey = (card: CollectibleCardTemplate) => {
  if (card.artworkKey) return card.artworkKey;
  const suffix = card.id.slice(card.id.indexOf("-") + 1);
  return card.category === "Map" && suffix === "streets" ? "streets-of-tarkov" : suffix;
};
const traitsByCategory: Record<CollectibleCategory, string[]> = {
  Boss: ["Boss", "Hostile"],
  Trader: ["Trader", "Ally"],
  Map: ["Location", "Hideout"],
  Cover: ["Cover", "Defensive"],
  Lethal: ["Trap", "Ambush"],
};

export const COLLECTIBLE_CARDS: readonly CollectibleCard[] = COLLECTIBLE_CARD_TEMPLATES.map((template) => ({
  id: template.id,
  name: template.name,
  category: template.category,
  cardType: cardTypeByCategory[template.category],
  artworkKey: defaultArtworkKey(template),
  rarity: template.rarity,
  symbol: template.symbol,
  primaryStat: template.primaryStat,
  secondaryStat: template.secondaryStat,
  cost: rarityCost[template.rarity],
  attack: template.category === "Boss" || template.category === "Lethal"
    ? template.primaryStat.value
    : template.category === "Trader"
      ? Math.max(1, Math.round(template.primaryStat.value / 2))
      : 0,
  resources: template.category === "Boss"
    ? 1
    : template.category === "Trader" || template.category === "Map"
      ? template.secondaryStat.value
      : 0,
  reputation: template.category === "Trader" ? template.primaryStat.value : 0,
  reward: template.category === "Boss" || template.category === "Lethal" ? rarityReward[template.rarity] : 0,
  health: template.category === "Lethal" ? 1 : template.secondaryStat.value,
  traits: traitsByCategory[template.category],
  abilityName: template.abilityName,
  abilityText: template.abilityText,
  story: template.story,
}));

const byId = new Map(COLLECTIBLE_CARDS.map((card) => [card.id, card]));
const packRaritySlots: readonly (readonly Rarity[])[] = [
  ["Common", "Uncommon"],
  ["Common", "Uncommon"],
  ["Common", "Uncommon"],
  ["Rare", "Epic", "Legendary"],
  ["Common", "Uncommon", "Rare", "Epic", "Legendary"],
];

function randomValue(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Random source must return a value in [0, 1).");
  }
  return value;
}

function randomIndex(length: number, random: () => number): number {
  return Math.floor(randomValue(random) * length);
}

export function drawCollectiblePack(
  ownedIds: ReadonlySet<string>,
  random: () => number = Math.random,
): DrawnCollectible[] {
  const seen = new Set(ownedIds);
  const drawn = new Set<string>();
  const cards: DrawnCollectible[] = [];

  for (const raritySlot of packRaritySlots) {
    const available = COLLECTIBLE_CARDS.filter((card) => !drawn.has(card.id) && raritySlot.includes(card.rarity));
    const candidates = available.length > 0
      ? available
      : COLLECTIBLE_CARDS.filter((card) => !drawn.has(card.id));
    const card = candidates[randomIndex(candidates.length, random)]!;
    const isNew = !seen.has(card.id);
    drawn.add(card.id);
    seen.add(card.id);
    cards.push({ id: card.id, isNew, isFoil: randomValue(random) < 0.03 });
  }

  return cards;
}

export function collectibleCardById(id: string): CollectibleCard {
  const card = byId.get(id);
  if (!card) throw new Error(`Unknown collectible card: ${id}`);
  return card;
}
