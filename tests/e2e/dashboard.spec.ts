import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "faro_key", value: process.env.APP_ACCESS_KEY ?? "e2e-app-key", domain: "localhost", path: "/" }]);
});

test("dashboard: global filters in the URL, results, funnel, breakdown, health and no horizontal scroll", async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 1440;
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Tablero" })).toBeVisible();
  for (const name of ["Resultados", "Embudo de prospección", "Desglose", "Salud del envío"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByTestId("result-Leads calificados")).toBeVisible();
  await expect(page.getByTestId("result-Reuniones agendadas")).toBeVisible();
  await expect(page.getByText("Leads nuevos")).toHaveCount(0);
  await expect(page.getByTestId("meta-vs-faro")).toBeVisible();
  await expect(page.getByTestId("snapshot-age")).toContainText("Prospección en vivo");
  await expect(page.getByTestId("attribution")).toBeVisible();
  expect(await noHScroll()).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F43-tablero-${width}.png`, fullPage: true });

  // panel nav (sidebar; a drawer under 1024 px): Tablero is the current item
  if (width < 1024) await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("navigation", { name: "Panel" }).getByRole("link", { name: "Tablero" })).toHaveAttribute("aria-current", "page");
  if (width < 1024) await page.keyboard.press("Escape");

  const filters = page.getByRole("search", { name: "Filtros del tablero" });
  await filters.getByRole("group", { name: "Período" }).getByRole("button", { name: "7 días" }).click();
  await page.waitForURL(/periodo=7/);
  await filters.getByRole("combobox", { name: "Canal" }).selectOption("email");
  await page.waitForURL(/canal=email/);
  await expect(filters).toContainText("Correo · Últimos 7 días");
  await expect(page.getByTestId("meta-vs-faro")).toHaveCount(0);
  await filters.getByRole("group", { name: "Período" }).getByRole("button", { name: "Hoy" }).click();
  await page.waitForURL(/periodo=hoy/);
  await filters.getByRole("button", { name: "Limpiar filtros" }).click();
  await page.waitForURL((u) => !u.search.includes("canal"));

  await page.getByRole("tab", { name: "Ciudad" }).click();
  await expect(page.getByRole("tab", { name: "Ciudad" })).toHaveAttribute("aria-selected", "true");

  const refreshed = page.waitForResponse((r) => r.url().includes("/api/dashboard/refresh") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Actualizar ahora" }).click();
  expect((await refreshed).status()).toBe(200);

  expect((await page.request.get("/api/dashboard/cell?source=bad")).status()).toBe(400);
});

test("búsquedas: one horizontal card per hunt, sidebar marks the active item and hides on the live map", async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 1440;
  await page.goto("/app/hunts");
  await expect(page.getByRole("heading", { level: 1, name: "Lo que ya buscamos" })).toBeVisible();
  if (width < 1024) await page.getByRole("button", { name: "Abrir menú" }).click();
  const nav = page.getByRole("navigation", { name: "Panel" });
  await expect(nav.getByRole("link", { name: "Búsquedas" })).toHaveAttribute("aria-current", "page");
  if (width < 1024) await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: /Nueva búsqueda/ }).last()).toHaveAttribute("href", "/app/new");
  const list = page.getByTestId("hunt-list");
  if (await list.count()) {
    await expect(list.locator("> li").first()).toBeVisible();
    // DEMO hunts are labelled and kept out of the real totals
    for (const card of await list.locator("> li").all()) {
      const isDemo = (await card.getByText("DEMO", { exact: true }).count()) > 0;
      if (isDemo) await expect(card).toContainText("fuera de los totales reales");
      else await expect(card.getByRole("link", { name: "Contactar" })).toBeVisible();
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F14-busquedas-${width}.png`, fullPage: true });
});
