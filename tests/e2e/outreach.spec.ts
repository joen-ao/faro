import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "faro_key", value: process.env.APP_ACCESS_KEY ?? "", url: baseURL ?? "http://localhost:3100" }]);
});

// Monday 10:00 Bogota: window open, deterministic for screenshots.
const NOW = "2026-10-19T15:00:00Z";
const SUNDAY = "2026-10-18T15:00:00Z";

test("outreach view: banner, compliance blocks, preview and screenshot", async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 1440;
  await page.goto(`/app/hunts/demo/outreach?now=${NOW}`);
  await expect(page.getByTestId("send-banner")).toContainText("SEND_ENABLED=false");
  await expect(page.getByTestId("send-banner")).toContainText("se simulan");
  await expect(page.getByTestId("window-state")).toContainText("Ventana abierta");
  expect(await page.getByTestId("lead-row").count()).toBeGreaterThanOrEqual(6);
  // Explained blocks are visible in the list.
  await expect(page.getByText("Persona natural o profesional independiente")).toBeVisible();
  await expect(page.getByText("lista de supresión")).toBeVisible();
  // Each row says which service fits the lead and why (deterministic, from its website findings).
  await expect(page.getByTestId("suggested-service").first()).toContainText("Servicio sugerido:");

  await page.getByRole("button", { name: "Dental Norte Demo SAS" }).click();
  await expect(page.getByTestId("body")).toContainText("30X Hackathon", { timeout: 20_000 });
  await expect(page.getByTestId("body")).toContainText("/baja/");
  await expect(page.getByTestId("blocks")).toContainText("Sin bloqueos");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F10-outreach-${width}.png`, fullPage: true });
});

test("outreach view: assisted mode and closed window on Sunday", async ({ page }) => {
  await page.goto(`/app/hunts/demo/outreach?now=${SUNDAY}`);
  await expect(page.getByTestId("window-state")).toContainText("Ventana cerrada");
  await page.getByRole("button", { name: "Sonrisa Plena Demo SAS" }).click();
  await expect(page.getByTestId("assisted")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("blocks")).toContainText("Fuera de ventana");
  await expect(page.getByTestId("mark-sent")).toBeDisabled();
});

test("outreach API validates input", async ({ page }) => {
  const res = await page.request.post("/api/outreach/preview", { data: { leadId: "x" } });
  expect(res.status()).toBe(400);
  const res2 = await page.request.post("/api/outreach/send", { data: "not-json", headers: { "content-type": "application/json" } });
  expect(res2.status()).toBe(400);
});
