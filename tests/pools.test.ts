import { describe, expect, it } from "vitest";
import { buildPools } from "../src/server/pools.js";
import type { OfferedItem } from "../src/server/tarkovApi.js";

const offer = (id: string, trader: OfferedItem["trader"], loyaltyLevel: number): OfferedItem => ({
  id,
  name: id,
  shortName: id,
  basePrice: Number(id.replace(/\D/g, "")) || 100,
  wikiUrl: null,
  iconLink: `https://example.test/${id}.png`,
  image512pxLink: null,
  trader,
  loyaltyLevel,
  itemClasses: ["other"],
});

describe("buildPools", () => {
  it("assigns duplicate items to the lowest loyalty level, then alphabetical trader", () => {
    const pools = buildPools([
      offer("shared", "Prapor", 2),
      offer("shared", "Mechanic", 2),
      offer("early", "Prapor", 1),
    ]);
    const assigned = pools.flatMap((pool) => pool.items);
    expect(assigned.filter((item) => item.id === "shared")).toHaveLength(1);
    expect(assigned.find((item) => item.id === "shared")?.trader).toBe("Mechanic");
    expect(assigned.find((item) => item.id === "early")?.poolKey).toBe("prapor-ll1-4");
  });

  it("merges adjacent levels until a pool reaches the minimum size", () => {
    const offers = [
      ...Array.from({ length: 5 }, (_, index) => offer(`ll1-${index}`, "Ragman", 1)),
      ...Array.from({ length: 7 }, (_, index) => offer(`ll2-${index}`, "Ragman", 2)),
      ...Array.from({ length: 12 }, (_, index) => offer(`ll3-${index}`, "Ragman", 3)),
    ];
    const ragman = buildPools(offers).filter((pool) => pool.trader === "Ragman");
    expect(ragman.map((pool) => pool.levelRange)).toEqual(["1-2", "3"]);
    expect(ragman.map((pool) => pool.items.length)).toEqual([12, 12]);
  });
});
