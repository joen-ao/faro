import { test, expect } from "@playwright/test";

const KEY = process.env.APP_ACCESS_KEY ?? "e2e-only-app-key";

test("ads settings page is gated, renders spend list and has no horizontal scroll", async ({ page, context }, info) => {
  expect((await page.request.get("/api/ads/spend")).status()).toBe(401);
  expect((await page.request.get("/app/settings/ads")).status()).toBe(401);
  await context.addCookies([{ name: "faro_key", value: KEY, domain: "localhost", path: "/" }]);

  const csv = "campaign,date,usd,impressions,clicks\nfaro-e2e,2026-10-01,12.5,1000,30\nfaro-e2e,2026-10-02,9,800,22\n=bad,2026-10-03,1,1,1\n";
  const up = await page.request.post("/api/ads/spend/csv", { headers: { "content-type": "text/csv", "x-app-key": KEY }, data: csv });
  expect(up.status()).toBe(200);
  expect((await up.json()).errors).toHaveLength(1);

  await page.goto("/app/settings/ads");
  await expect(page.getByRole("heading", { name: /Pauta en Meta/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gasto cargado" })).toBeVisible();
  await expect(page.locator("text=faro-e2e >> visible=true").first()).toBeVisible();
  await expect(page.getByLabel(/Marcar como datos de prueba/)).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const width = info.project.use.viewport?.width ?? 1440;
  await page.screenshot({ path: `artifacts/screens/F16-ads-${width}.png`, fullPage: true });
});
