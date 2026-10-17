import { test, expect } from "@playwright/test";

test("lead receipt demo page renders, is labelled DEMO and has no horizontal scroll", async ({ page }, info) => {
  await page.goto("/app/dev/receipt?demo=1");
  await expect(page.getByRole("article", { name: /Recibo de lead/ })).toBeVisible();
  await expect(page.getByText("DEMO", { exact: true })).toBeVisible();
  await expect(page.getByText("cubierto por tier gratuito").first()).toBeVisible();
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noHScroll).toBe(true);
  const width = info.project.use.viewport?.width ?? 1440;
  await page.screenshot({ path: `artifacts/screens/F13-receipt-${width}.png`, fullPage: true });

  expect((await page.request.get("/api/metrics/receipt/not-a-uuid", { headers: { "x-app-key": process.env.APP_ACCESS_KEY ?? "" } })).status()).toBe(400);
  expect((await page.request.get("/api/metrics/receipt/not-a-uuid")).status()).toBe(401);
});
