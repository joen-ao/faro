import { test, expect } from "@playwright/test";

test("landing: hero, lazy demo video, honest metrics, compliance and attributions", async ({ page }, info) => {
  await page.goto("/");
  const width = info.project.use.viewport?.width ?? 1440;

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿Dónde están tus próximos clientes y cuánto te cuestan?");
  const cta = page.getByRole("link", { name: "Encontrar mis clientes" }).first();
  await expect(cta).toHaveAttribute("href", "/app/new");

  const video = page.locator("video");
  await expect(video).toHaveAttribute("poster", "/demo/poster.jpg");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).toHaveAttribute("controls", "");
  await expect(page.getByText("Demostración con datos de ejemplo")).toBeVisible();
  expect((await page.request.get("/demo/faro-demo.mp4")).ok()).toBe(true);
  expect((await page.request.get("/demo/poster.jpg")).ok()).toBe(true);

  await expect(page.getByRole("heading", { name: "Cómo funciona" }).or(page.locator("#como-funciona"))).toBeVisible();
  await expect(page.locator("#como-funciona li")).toHaveCount(4);

  // Fresh e2e DB has no real data: honest empty state, never demo numbers.
  await expect(page.getByTestId("metrics-empty")).toContainText("Aún no hay datos del evento");
  await expect(page.getByTestId("metrics-ready")).toHaveCount(0);

  await expect(page.locator("#cumplimiento")).toContainText("robots.txt");
  const footer = page.locator("footer");
  await expect(footer).toContainText("ODbL");
  await expect(footer).toContainText("CC BY-SA 4.0");
  await expect(footer).toContainText("Integrado con Dapta");
  await expect(footer).toContainText("Proyecto del 30X Hackathon");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.screenshot({ path: `artifacts/screens/F18-landing-${width}.png` });
  if (width === 1440) await page.screenshot({ path: "artifacts/screens/F18-landing-full-1440.png", fullPage: true });
});
