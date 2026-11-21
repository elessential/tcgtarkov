import { expect, test } from "@playwright/test";
import { COLLECTIBLE_CARDS } from "../../src/shared/collectibles.js";

test("overlay stays transparent while idle and displays a test reveal", async ({ page, request }) => {
  const externalRequests: string[] = [];
  page.on("request", (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") externalRequests.push(url.href);
  });

  await page.goto("/overlay");
  await expect(page.locator(".overlay-pack")).toHaveCount(0);
  await expect.poll(() => page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await page.waitForTimeout(300);
  const response = await request.post("/api/overlay/test");
  expect(response.ok()).toBe(true);
  await expect(page.locator(".overlay-title")).toHaveText("TEST PACK");
  expect(externalRequests).toEqual([]);
});

test("overlay displays collectible cards in one row with the website aspect ratio", async ({ page }) => {
  const cards = COLLECTIBLE_CARDS.slice(0, 5).map((card, index) => ({
    ...card,
    imageLocal: index === 0 ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E" : null,
    isNew: true,
    isFoil: false,
  }));
  await page.route("**/api/state", (route) => route.fulfill({
    contentType: "application/json",
    json: {
      settings: { overlayHud: false, overlayPosition: "bottom-right", overlayDuration: 9, overlayMode: "immediate" },
      coins: 0,
      collection: [],
      pools: [],
    },
  }));
  await page.route("**/api/events", (route) => route.fulfill({
    contentType: "text/event-stream",
    body: `event: pack_opened\ndata: ${JSON.stringify({
      poolKey: "collectibles",
      cards,
      godPack: false,
      packId: "collectible-overlay-e2e",
      overlayMode: "immediate",
      duration: 30,
      isCollectible: true,
    })}\n\n`,
  }));

  await page.goto("/overlay");
  await expect(page.locator(".collectible-overlay-pack .overlay-title")).toBeHidden();
  await expect(page.locator(".overlay-collectible-card .collectible-face")).toHaveCount(5);
  await expect(page.locator(".overlay-collectible-card .collectible-cost")).toHaveCount(5);
  await expect(page.locator(".overlay-collectible-card .collectible-spell")).toHaveCount(5);
  await expect(page.locator(".overlay-collectible-card .collectible-art img")).toHaveCount(1);
  const cardTops = await page.locator(".overlay-collectible-card").evaluateAll((cards) =>
    cards.map((card) => Math.round(card.getBoundingClientRect().top)),
  );
  expect(new Set(cardTops).size).toBe(1);
  const cardMetrics = await page.locator(".overlay-collectible-card").evaluateAll((cards) => cards.map((card) => {
    const bounds = card.getBoundingClientRect();
    const face = card.querySelector(".collectible-face")!.getBoundingClientRect();
    const storyElement = card.querySelector(".collectible-story")!;
    const story = storyElement.getBoundingClientRect();
    const footer = card.querySelector(".collectible-card-footer")!.getBoundingClientRect();
    return {
      ratio: bounds.height / bounds.width,
      bottom: bounds.bottom,
      faceBottom: face.bottom,
      storyBottom: story.bottom,
      storyFontSize: Number.parseFloat(getComputedStyle(storyElement).fontSize),
      footerTop: footer.top,
      footerBottom: footer.bottom,
    };
  }));
  expect(cardMetrics.every((card) => card.ratio > 1.65 && card.ratio < 1.8)).toBe(true);
  expect(cardMetrics.every((card) => card.storyFontSize >= 10)).toBe(true);
  expect(cardMetrics.every((card) => card.bottom <= (page.viewportSize()?.height ?? 720)
    && card.footerBottom <= card.faceBottom + 1
    && card.storyBottom <= card.footerTop + 1)).toBe(true);
});
