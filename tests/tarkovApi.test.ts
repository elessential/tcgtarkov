import { describe, expect, it } from "vitest";
import { parseTraderOffers } from "../src/server/tarkovApi.js";

describe("parseTraderOffers", () => {
  it("uses English item names and known traders, excluding unsupported levels and traders", () => {
    const offers = parseTraderOffers(
      {
        data: {
          items: {
            rifle: {
              id: "rifle",
              name: "rifle Name",
              shortName: "rifle ShortName",
              basePrice: 1250,
              wikiLink: "https://example.test/rifle",
              iconLink: "https://example.test/rifle-icon.webp",
              image512pxLink: "https://example.test/rifle.webp",
              types: ["ammo", "noFlea"],
              buyFromTrader: [
                { trader: "prapor-id", minTraderLevel: 2 },
                { trader: "fence-id", minTraderLevel: 1 },
                { trader: "prapor-id", minTraderLevel: 0 },
              ],
            },
          },
        },
      },
      { data: { "rifle Name": "Rifle", "rifle ShortName": "Test rifle" } },
      {
        data: {
          prapor: { id: "prapor-id", normalizedName: "prapor" },
          fence: { id: "fence-id", normalizedName: "fence" },
        },
      },
    );

    expect(offers).toEqual([{
      id: "rifle",
      name: "Rifle",
      shortName: "Test rifle",
      basePrice: 1250,
      wikiUrl: "https://example.test/rifle",
      iconLink: "https://example.test/rifle-icon.webp",
      image512pxLink: "https://example.test/rifle.webp",
      trader: "Prapor",
      loyaltyLevel: 2,
      itemClasses: ["ammo"],
    }]);
  });

  it("fails explicitly when an offered item has no English name", () => {
    expect(() => parseTraderOffers(
      {
        data: {
          items: {
            rifle: {
              id: "rifle",
              name: "rifle Name",
              buyFromTrader: [{ trader: "prapor-id", minTraderLevel: 1 }],
            },
          },
        },
      },
      { data: {} },
      { data: { prapor: { id: "prapor-id", normalizedName: "prapor" } } },
    )).toThrow("no English translation for item rifle");
  });
});
