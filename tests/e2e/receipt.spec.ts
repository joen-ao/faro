import { test, expect } from "@playwright/test";

test("lead receipt page asks for a lead id (no demo receipt since F31) and the receipt API is gated", async ({ page, context }) => {
  await context.addCookies([{ name: "faro_key", value: process.env.APP_ACCESS_KEY ?? "e2e-app-key", domain: "localhost", path: "/" }]);
  await page.goto("/app/dev/receipt");
  await expect(page.getByText("?lead=<uuid>")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  expect((await page.request.get("/api/metrics/receipt/not-a-uuid", { headers: { "x-app-key": process.env.APP_ACCESS_KEY ?? "" } })).status()).toBe(400);
  expect((await page.request.get("/api/metrics/receipt/not-a-uuid", { headers: { "x-app-key": "wrong-key" } })).status()).toBe(401);
});
