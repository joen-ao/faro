import { test, expect } from "@playwright/test";

test("landing: hero, lazy demo video, honest metrics, compliance and attributions", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // deterministic screenshots: entrance animations off
  await page.goto("/");
  const width = info.project.use.viewport?.width ?? 1440;

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿Dónde están tus próximos clientes y cuánto te cuestan?");
  const cta = page.getByRole("link", { name: "Encontrar mis clientes" }).first();
  await expect(cta).toHaveAttribute("href", "/app/new");
  await expect(page.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/app/login");
  await expect(page.getByText("30X Hackathon · Reto Dapta · Integrado con Dapta")).toBeVisible();

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

  // Sections 5-8 fill the screen (min-h-dvh) from 640 px; on phones they size to content (specs/landing-mobile.md).
  const { vh, vw } = await page.evaluate(() => ({ vh: window.innerHeight, vw: window.innerWidth }));
  for (const id of ["como-funciona", "pauta", "diagnostico", "cumplimiento"]) {
    const h = await page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().height);
    if (vw >= 640) expect(h, id).toBeGreaterThanOrEqual(vh - 1);
    else expect(h, id).toBeGreaterThan(0);
  }
  // Phones never scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const footer = page.locator("footer");
  await expect(footer).toContainText("ODbL");
  await expect(footer).toContainText("CC BY-SA 4.0");
  await expect(footer).toContainText("Integrado con Dapta");
  await expect(footer).toContainText("Proyecto del 30X Hackathon");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.screenshot({ path: `artifacts/screens/F18-landing-${width}.png` });
  if (width === 1440) await page.screenshot({ path: "artifacts/screens/F18-landing-full-1440.png", fullPage: true });
});
