import { test, expect } from "@playwright/test";
import { createOptOutToken } from "../../src/features/compliance/optout";

const LEAD = "00000000-0000-4000-8000-000000000000";

test("baja asks for confirmation (GET does not write) and confirms after the POST", async ({ page }, info) => {
  const token = createOptOutToken(LEAD);
  const width = info.project.use.viewport?.width ?? 1440;
  await page.goto(`/baja/${token}`);
  await expect(page.getByTestId("optout-confirm")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F09-baja-confirm-${width}.png`, fullPage: true });

  await page.getByTestId("optout-confirm").click();
  await expect(page).toHaveURL(/done=1/);
  await expect(page.getByTestId("optout-title")).toContainText("No volverás a recibir mensajes");
  await expect(page.getByTestId("attribution")).toContainText("ODbL");
  await expect(page.getByTestId("attribution")).toContainText("CC BY-SA 4.0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F09-baja-${width}.png`, fullPage: true });
});

test("baja rejects a tampered token; API GET redirects and POST applies", async ({ page }) => {
  const token = createOptOutToken(LEAD);
  const bad = `${token.slice(0, -2)}xx`;
  await page.goto(`/baja/${bad}`);
  await expect(page.getByTestId("optout-title")).toContainText("no es válido");
  expect((await page.request.post(`/api/optout/${bad}`)).status()).toBe(400);
  const get = await page.request.get(`/api/optout/${token}`, { maxRedirects: 0 });
  expect(get.status()).toBe(303);
  expect((await page.request.post(`/api/optout/${token}`)).status()).toBe(200);
});
