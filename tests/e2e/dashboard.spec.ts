import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "faro_key", value: process.env.APP_ACCESS_KEY ?? "e2e-app-key", domain: "localhost", path: "/" }]);
});

test("dashboard: empty real state, then demo toggle shows separated DEMO data", async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 1440;
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await page.goto("/app/dashboard");
  // "Reto Dapta" panel first: every brief requirement, honest statuses from real data only (none in e2e).
  const challenge = page.getByTestId("challenge-panel");
  await expect(challenge.getByRole("heading", { name: "Reto Dapta: cumplimiento en vivo" })).toBeVisible();
  await expect(challenge.locator("li[data-status]")).toHaveCount(9);
  await expect(page.getByTestId("challenge-outreach")).toHaveAttribute("data-status", "pending");
  await expect(page.getByTestId("challenge-public-data")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("challenge-summary")).toContainText("de 6 obligatorios");
  await challenge.screenshot({ path: `artifacts/screens/F14-reto-dapta-${width}.png` });
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
  await expect(page.getByRole("region", { name: /Datos de prueba/ }).getByRole("complementary", { name: "Recomendación" })).toContainText("Ejemplo con datos de prueba");
  await expect(page.getByText("Pauta vs. fuentes gratuitas")).toBeVisible();
  const demoRegion = page.getByRole("region", { name: /Datos de prueba/ });
  await expect(demoRegion.getByTestId("funnel-source")).toContainText("Abrieron diagnóstico");
  await expect(demoRegion.getByTestId("funnel-source")).toContainText("Conversaron con el agente");
  await expect(demoRegion.getByTestId("funnel-contact")).toContainText("Abrieron diagnóstico");

  // heatmap cell -> leads -> receipt
  await page.getByRole("button", { name: /^REPS por Correo/ }).click();
  await expect(page.getByRole("region", { name: "Detalle de la celda" })).toBeVisible();
  await page.getByRole("region", { name: "Detalle de la celda" }).getByRole("button", { expanded: false }).first().click();
  await expect(page.getByRole("article", { name: /Recibo de lead/ })).toBeVisible();
  expect(await noHScroll()).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F14-dashboard-${width}.png`, fullPage: true });

  expect((await page.request.get("/api/dashboard/cell?source=bad")).status()).toBe(400);
});
