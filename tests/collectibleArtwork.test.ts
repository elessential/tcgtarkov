import { describe, expect, it } from "vitest";
import { parseCollectibleArtworkSources } from "../src/server/collectibleArtwork.js";

describe("collectible artwork sources", () => {
  it("matches trader portraits and boss artwork by their normalized API names", () => {
    const sources = parseCollectibleArtworkSources(
      { data: { prapor: { normalizedName: "prapor", imageLink: "https://cdn.example/prapor.png" } } },
      {
        data: {
          maps: {},
          mobs: {
            reshala: {
              normalizedName: "reshala",
              imagePosterLink: "https://cdn.example/reshala-poster.png",
              imagePortraitLink: "https://cdn.example/reshala-portrait.png",
            },
          },
        },
      },
    );

    expect(sources.get("prapor")).toEqual(["https://cdn.example/prapor.png"]);
    expect(sources.get("reshala")).toEqual([
      "https://cdn.example/reshala-poster.png",
      "https://cdn.example/reshala-portrait.png",
    ]);
  });

  it("rejects unexpected API shapes rather than returning misleading empty artwork", () => {
    expect(() => parseCollectibleArtworkSources({}, {})).toThrow("Unexpected tarkov.dev collectible artwork response");
  });
});
