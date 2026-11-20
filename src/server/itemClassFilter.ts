import { z } from "zod";
import { ITEM_CLASS_IDS, type ItemClass } from "../shared/game.js";

const itemClassesSchema = z.array(z.enum(ITEM_CLASS_IDS));

export function isItemClassEnabled(itemClassesJson: string, enabledClasses: readonly ItemClass[]): boolean {
  const parsed = itemClassesSchema.safeParse(JSON.parse(itemClassesJson) as unknown);
  if (!parsed.success) throw new Error(`Invalid stored item classes: ${parsed.error.message}`);
  const classes: ItemClass[] = parsed.data.length > 0 ? parsed.data : ["other"];
  const enabled = new Set(enabledClasses);
  return classes.every((itemClass) => enabled.has(itemClass));
}
