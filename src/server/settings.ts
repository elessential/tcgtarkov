import { DEFAULT_SETTINGS, ITEM_CLASS_IDS, type DrawSettings, type ItemClass, type Rarity } from "../shared/game.js";

export interface AppSettings extends DrawSettings {
  xpPerCoin: number;
  overlayDuration: number;
  overlayMode: "immediate" | "synced";
  overlayHud: boolean;
  overlayPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  gameMode: "regular" | "pve";
  enabledItemClasses: ItemClass[];
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ...DEFAULT_SETTINGS,
  xpPerCoin: 10,
  overlayDuration: 9,
  overlayMode: "immediate",
  overlayHud: false,
  overlayPosition: "bottom-right",
  gameMode: process.env.TARKOV_GAME_MODE === "pve" ? "pve" : "regular",
  enabledItemClasses: [...ITEM_CLASS_IDS],
};

export async function getSettings(db: typeof import("./db.js").prisma): Promise<AppSettings> {
  const rows = await db.setting.findMany();
  const saved = new Map(rows.map((row) => [row.key, row.value]));
  const result = { ...DEFAULT_APP_SETTINGS };
  for (const key of ["xpPerCoin", "packSize", "godPackChance", "foilChance", "newCardPity", "epicPity", "overlayDuration"] as const) {
    const value = saved.get(key);
    if (value !== undefined) result[key] = Number(value);
  }
  const weights = saved.get("rarityWeights");
  if (weights) result.rarityWeights = JSON.parse(weights) as Record<Rarity, number>;
  const enabledItemClasses = saved.get("enabledItemClasses");
  if (enabledItemClasses) result.enabledItemClasses = JSON.parse(enabledItemClasses) as ItemClass[];
  const mode = saved.get("overlayMode");
  if (mode === "immediate" || mode === "synced") result.overlayMode = mode;
  const hud = saved.get("overlayHud");
  if (hud !== undefined) result.overlayHud = hud === "true";
  const position = saved.get("overlayPosition");
  if (position === "top-left" || position === "top-right" || position === "bottom-left" || position === "bottom-right") {
    result.overlayPosition = position;
  }
  const gameMode = saved.get("gameMode");
  if (gameMode === "regular" || gameMode === "pve") result.gameMode = gameMode;
  return result;
}

export async function saveSettings(
  db: typeof import("./db.js").prisma,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  await db.$transaction(async (tx) => persistSettings(tx, patch));
  return getSettings(db);
}

export async function persistSettings(
  db: Pick<typeof import("./db.js").prisma, "setting">,
  patch: Partial<AppSettings>,
): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    const stored = key === "rarityWeights" || key === "enabledItemClasses" ? JSON.stringify(value) : String(value);
    await db.setting.upsert({
      where: { key },
      create: { key, value: stored },
      update: { value: stored },
    });
  }
}
