import { expect, test } from "@playwright/test";
import { COLLECTIBLE_CARDS } from "../../src/shared/collectibles.js";

test("collectibles packs reveal separately from item packs and have their own collection", async ({ page }) => {
  const sampleArtwork = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E";
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const state = await response.json() as { coins: number };
    state.coins = 250;
    await route.fulfill({ response, json: state });
  });
  await page.route("**/api/collectibles", (route) => route.fulfill({
    contentType: "application/json",
    json: {
      cards: COLLECTIBLE_CARDS.map((card, index) => ({
        ...card,
        ...(index === 0 ? { imageLocal: sampleArtwork } : {}),
        ownedCount: 0,
        foilCount: 0,
      })),
      packs: [],
      packPrice: 250,
      packSize: 5,
      collectedCount: 0,
      totalCount: COLLECTIBLE_CARDS.length,
      artworkWarning: null,
    },
  }));
  await page.route("**/api/collectibles/open", (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      pack: {
        id: "collectibles-e2e",
        timestamp: new Date().toISOString(),
        cost: 250,
        cards: COLLECTIBLE_CARDS.slice(0, 5).map((card, index) => ({
          ...card,
          ...(index === 0 ? { imageLocal: sampleArtwork } : {}),
          isNew: true,
          isFoil: false,
        })),
      },
    }),
  }));

  await page.goto("/");
  await page.getByRole("button", { name: "Collectibles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Collectibles", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "BUY COLLECTIBLE PACK" }).click();

  const reveal = page.getByRole("dialog", { name: "Your new field legends" });
  await expect(reveal).toBeVisible();
  await expect(reveal.locator(".collectible-art img").first()).toHaveAttribute("alt", `${COLLECTIBLE_CARDS[0].name} artwork`);
  await expect.poll(() => page.locator(".collectible-reveal-card.revealed").count(), { timeout: 6000 }).toBe(5);
  await reveal.getByRole("button", { name: "CLOSE" }).click();

  await page.getByRole("button", { name: "Collectible Collection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Collectible Collection", exact: true })).toBeVisible();
  await expect(page.locator(".collectible-collection-grid .collectible-face")).toHaveCount(COLLECTIBLE_CARDS.length);
  await page.getByRole("button", { name: "TRADERS", exact: true }).click();
  await expect(page.locator(".collectible-collection-grid .collectible-face")).toHaveCount(7);
});
