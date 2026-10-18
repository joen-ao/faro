import { expect, test } from "@playwright/test";

const KEY = process.env.APP_ACCESS_KEY ?? "";
const widthOf = (info: { project: { use: { viewport?: { width: number } | null } } }) => info.project.use.viewport?.width ?? 1440;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "faro_key", value: KEY, url: baseURL ?? "http://localhost:3100" }]);
});

test("Mis servicios: initial Mokub catalog, Claude suggestions and save", async ({ page }, info) => {
  await page.goto("/app/settings/oferta");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mis servicios");
  const cards = page.getByTestId("service-card");
  await expect(cards).toHaveCount(4);
  await expect(cards.first().getByTestId("service-name")).toHaveValue("Agentes de IA y automatización");
  if (await page.getByTestId("default-catalog").isVisible()) {
    await expect(page.getByTestId("default-catalog")).toContainText("Catálogo inicial (de mokub.co)");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F22-oferta-${widthOf(info)}.png`, fullPage: true });

  // Inline validation: an empty outcome cannot be saved.
  const outcome = cards.first().getByTestId("service-outcome");
  const original = await outcome.inputValue();
  await outcome.fill("");
  await page.getByTestId("save-services").click();
  await expect(cards.first().getByRole("alert")).toContainText("resultado");
  await outcome.fill(original);

  // Saving keeps the same services and stores them in app_settings.
  await page.getByTestId("save-services").click();
  await expect(page.getByText("Servicios guardados")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("default-catalog")).toBeHidden();
  await expect(page.getByTestId("service-card")).toHaveCount(4);

  // Claude proposes a catalog from a free description; nothing is saved until the team saves.
  await page.getByTestId("open-suggest").click();
  await page.getByTestId("suggest-input").fill("Somos una agencia que hace agentes de WhatsApp con IA y sitios web para clínicas");
  await page.getByTestId("suggest-services").click();
  await expect(page.getByTestId("service-card")).toHaveCount(2);
  await expect(page.getByTestId("service-card").first().getByTestId("service-name")).toHaveValue("Agente de WhatsApp con IA");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `artifacts/screens/F22-oferta-sugerir-${widthOf(info)}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByTestId("service-card")).toHaveCount(4);
});

test("services API is gated and validates input", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/api/settings/services")).status()).toBe(401);
  expect((await anon.post("/api/settings/services/suggest", { data: { description: "x" } })).status()).toBe(401);
  expect((await anon.post("/api/icp/angles", { data: {} })).status()).toBe(401);
  await anon.dispose();
  const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-app-key": KEY } });
  expect((await request.put("/api/settings/services", { data: { services: [] } })).status()).toBe(400);
  expect((await request.put("/api/settings/services", { data: { services: [{ name: "Solo nombre" }] } })).status()).toBe(400);
  const res = await (await request.get("/api/settings/services")).json();
  expect(res.services.length).toBeGreaterThanOrEqual(1);
  const angles = await request.post("/api/icp/angles", { data: { criteria: { sector: "dental", city: "Bogota" }, services: res.services } });
  expect(angles.status()).toBe(200);
  expect((await angles.json()).angles.length).toBeGreaterThanOrEqual(1);
  await request.dispose();
});
