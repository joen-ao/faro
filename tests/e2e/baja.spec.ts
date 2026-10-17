import { test, expect } from "@playwright/test";
import { createOptOutToken } from "../../src/features/compliance/optout";

test("baja confirms immediately with a valid token", async ({ page }, info) => {
  const token = createOptOutToken("00000000-0000-4000-8000-000000000000");
  await page.goto(`/baja/${token}`);
  await expect(page.getByTestId("optout-title")).toContainText("No volverás a recibir mensajes");
  await expect(page.getByTestId("attribution")).toContainText("ODbL");
  await expect(page.getByTestId("attribution")).toContainText("CC BY-SA 4.0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const width = info.project.use.viewport?.width ?? 1440;
  await page.screenshot({ path: `artifacts/screens/F09-baja-${width}.png`, fullPage: true });
});

test("baja rejects a tampered token and API returns 400", async ({ page }) => {
  const token = createOptOutToken("00000000-0000-4000-8000-000000000000");
  const bad = `${token.slice(0, -2)}xx`;
  await page.goto(`/baja/${bad}`);
  await expect(page.getByTestId("optout-title")).toContainText("no es válido");
  const res = await page.request.get(`/api/optout/${bad}`);
  expect(res.status()).toBe(400);
  const ok = await page.request.get(`/api/optout/${token}`);
  expect(ok.status()).toBe(200);
});
