import { expect, test } from "@playwright/test";

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
