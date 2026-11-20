import { describe, expect, it } from "vitest";
import { itemClassesFromTypes } from "../src/shared/game.js";
import { isItemClassEnabled } from "../src/server/itemClassFilter.js";

describe("item class filters", () => {
  it("maps ammunition types to the bullets class and unknown types to Other", () => {
    expect(itemClassesFromTypes(["ammo", "noFlea"])).toEqual(["ammo"]);
    expect(itemClassesFromTypes(["noFlea", "markedOnly"])).toEqual(["other"]);
  });

  it("excludes multi-class items when any of their classes are disabled", () => {
    expect(isItemClassEnabled('["ammo"]', ["ammo", "gun"])).toBe(true);
    expect(isItemClassEnabled('["ammo"]', ["gun"])).toBe(false);
    expect(isItemClassEnabled('["gun","wearable"]', ["gun"])).toBe(false);
    expect(isItemClassEnabled("[]", ["other"])).toBe(true);
  });
});
