import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "faro_key", value: process.env.APP_ACCESS_KEY ?? "e2e-app-key", domain: "localhost", path: "/" }]);
});

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("desktop sidebar: groups, real counts, send status, collapse to a rail that persists", async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 1440) < 1024, "desktop only");
  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: "Reto Dapta: cumplimiento en vivo" })).toBeVisible();
  const aside = page.getByTestId("app-sidebar");
  await expect(aside).toBeVisible();
  expect((await aside.boundingBox())?.width).toBe(264);
  const nav = aside.getByRole("navigation", { name: "Panel" });
  await expect(nav.getByRole("link", { name: "Tablero" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: /^Búsquedas/ })).toHaveAttribute("href", "/app/hunts");
  await expect(nav.getByRole("link", { name: /^Contacto/ })).toHaveAttribute("href", /^\/app\/hunts(\/[0-9a-f-]+\/outreach)?$/);
  await expect(nav.getByRole("link", { name: "Tu oferta" })).toHaveAttribute("href", "/app/settings/oferta");
  await expect(aside.getByRole("link", { name: "Nueva búsqueda" })).toHaveAttribute("href", "/app/new");
  // SEND_ENABLED=false in e2e: simulated sends, plus the live state of the saved window.
  await expect(aside.getByTestId("send-status")).toContainText("Envío simulado");
  await expect(aside.getByTestId("send-status")).toContainText(/Ventana (abierta|cerrada) · /);
  await expect(aside.getByRole("button", { name: "Salir" })).toBeVisible();
  expect(await noHScroll(page)).toBe(true);
  // Page content starts right of the sidebar.
  expect((await page.locator("main").first().boundingBox())?.x ?? 0).toBeGreaterThanOrEqual(264);
  await page.screenshot({ path: "artifacts/screens/F21-sidebar-1440.png" });

  await nav.getByRole("link", { name: "Horario de envío" }).click();
  await page.waitForURL("**/app/settings/envio");
  await expect(nav.getByRole("link", { name: "Horario de envío" })).toHaveAttribute("aria-current", "page");

  await aside.getByRole("button", { name: "Contraer menú" }).click();
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await page.reload();
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(72);
  expect(await noHScroll(page)).toBe(true);
  await page.screenshot({ path: "artifacts/screens/F21-sidebar-1440-collapsed.png" });
  await aside.getByRole("button", { name: "Expandir menú" }).click();
  await expect(aside).toHaveAttribute("data-collapsed", "false");

  await page.goto("/app/login");
  await expect(page.getByTestId("app-sidebar")).toHaveCount(0);
});

test("mobile drawer: hamburger, Esc, click outside and navigation close it; focus stays inside", async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 1440) >= 1024, "mobile only");
  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: "Reto Dapta: cumplimiento en vivo" })).toBeVisible();
  const toggle = page.getByRole("button", { name: "Abrir menú" });
  const aside = page.getByTestId("app-sidebar");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(aside).toBeHidden();
  await expect(page.getByRole("banner").getByRole("link", { name: "Nueva búsqueda" })).toHaveAttribute("href", "/app/new");
  expect(await noHScroll(page)).toBe(true);
  await page.screenshot({ path: "artifacts/screens/F21-sidebar-390-closed.png" });

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(aside).toBeVisible();
  await expect(aside.getByRole("button", { name: "Cerrar menú" })).toBeFocused();
  await expect(aside.getByRole("navigation", { name: "Panel" }).getByRole("link", { name: "Tablero" })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: "artifacts/screens/F21-sidebar-390-open.png" });
  // Focus trap: Shift+Tab past the first control (the logo) wraps to the last one, inside the drawer.
  await page.keyboard.press("Shift+Tab");
  await expect(aside.getByRole("link", { name: "Faro" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(aside.getByRole("button", { name: "Salir" })).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("#app-sidebar"))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(aside).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.getByTestId("app-sidebar-overlay").click({ position: { x: 370, y: 400 } });
  await expect(aside).toBeHidden();

  await toggle.click();
  await aside.getByRole("link", { name: "Pauta" }).click();
  await page.waitForURL("**/app/settings/ads");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(aside).toBeHidden();
  expect(await noHScroll(page)).toBe(true);
});
