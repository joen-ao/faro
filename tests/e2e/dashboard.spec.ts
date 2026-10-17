import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "faro_key", value: "e2e-key", url: "http://localhost:3100" }]);
});

test("dashboard: empty real state, then demo toggle shows separated DEMO data", async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 1440;
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: /Todavía no hay datos reales/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Encontrar mis clientes" })).toHaveAttribute("href", "/app/new");
  await expect(page.getByText("Panel de cumplimiento")).toBeVisible();
  await expect(page.getByTestId("attribution")).toBeVisible();
  await expect(page.getByText("DEMO", { exact: true })).toHaveCount(0);
  expect(await noHScroll()).toBe(true);
  if (width === 1440) await page.screenshot({ path: "artifacts/screens/F14-dashboard-empty-1440.png", fullPage: true });

  await page.getByRole("switch", { name: /Incluir datos de prueba/ }).click();
  await page.waitForURL(/demo=1/);
  await expect(page.getByRole("region", { name: /Datos de prueba/ })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Recomendación" })).toContainText("Conviene buscar en");
  await expect(page.getByText("Pauta vs. fuentes gratuitas")).toBeVisible();

  // heatmap cell -> leads -> receipt
  await page.getByRole("button", { name: /^REPS por Correo/ }).click();
  await expect(page.getByRole("region", { name: "Detalle de la celda" })).toBeVisible();
  await page.getByRole("region", { name: "Detalle de la celda" }).getByRole("button", { expanded: false }).first().click();
  await expect(page.getByRole("article", { name: /Recibo de lead/ })).toBeVisible();
  expect(await noHScroll()).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F14-dashboard-${width}.png`, fullPage: true });

  expect((await page.request.get("/api/dashboard/cell?source=bad")).status()).toBe(400);
});
