import { expect, test } from "@playwright/test";

// Software GL so MapLibre renders in headless CI.
test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

const widthOf = (info: { project: { use: { viewport?: { width: number } | null } } }) => info.project.use.viewport?.width ?? 1440;

test("new profile: conversation, editable chips and source cards", async ({ page }, info) => {
  await page.goto("/app/new");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("vender");
  await expect(page.getByTestId("structure")).toBeDisabled();

  await page.getByTestId("example-bogota-dental").click();
  await expect(page.getByTestId("thinking")).toBeVisible();
  const launch = page.getByTestId("launch");
  await expect(launch).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("source-cards").locator("li")).toHaveCount(3);

  // chips are editable: remove a signal and add another
  await page.getByRole("button", { name: "Quitar agenda en linea" }).click();
  await page.getByPlaceholder("Añadir señal").fill("whatsapp");
  await page.getByPlaceholder("Añadir señal").press("Enter");
  await expect(page.getByText("whatsapp", { exact: true })).toBeVisible();

  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noHScroll).toBe(true);
  // restore the example's own signal so the capture shows the canonical state
  await page.getByRole("button", { name: "Quitar whatsapp" }).click();
  await page.getByPlaceholder("Añadir señal").fill("agenda en linea");
  await page.getByPlaceholder("Añadir señal").press("Enter");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `artifacts/screens/F19-new-${widthOf(info)}.png`, fullPage: true });
});

test("live hunt (DEMO 2.000 points): map, virtual list, filters and lead drawer", async ({ page }, info) => {
  const width = widthOf(info);
  await page.goto("/app/hunts/demo");
  await expect(page.getByTestId("demo-badge")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("hunt-title")).toContainText("Bogotá");

  // attribution must always be visible (SPEC §8)
  await expect(page.getByTestId("map").getByRole("link", { name: "OpenStreetMap" })).toBeVisible({ timeout: 30_000 });

  const mapLoaded = await page
    .waitForSelector('[data-testid="map"][data-loaded="true"]', { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  test.info().annotations.push({ type: "map-loaded", description: String(mapLoaded) });
  if (mapLoaded) {
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="map"]')?.getAttribute("data-points")) >= 2000, null, { timeout: 30_000 });
    await page.waitForTimeout(3500); // basemap tiles
  }

  // virtualised: 2.060 leads, only a handful of rows in the DOM
  await expect(page.getByTestId("lead-list")).toBeVisible();
  const rows = await page.locator('[data-testid="lead-list"] [role="listitem"]').count();
  expect(rows).toBeGreaterThan(3);
  expect(rows).toBeLessThan(40);

  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noHScroll).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F19-hunt-${width}.png` });

  // filter by status narrows the list
  await page.getByRole("button", { name: /^Calificada/ }).click();
  const qualifiedRow = page.locator('[data-testid="lead-list"] button').first();
  await expect(qualifiedRow).toContainText("Calificada");
  await page.getByRole("button", { name: "Limpiar" }).click();

  // duplicates tab shows per-pair detail
  await page.getByRole("tab", { name: /Duplicados/ }).click();
  await expect(page.getByTestId("dupes-list").locator("li").first()).toBeVisible();
  await page.getByRole("tab", { name: /Empresas/ }).click();

  // drawer
  await page.locator('[data-testid="lead-list"] button').first().click();
  const drawer = page.getByTestId("lead-drawer");
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId("drawer-score")).toBeVisible();
  await expect(drawer.getByText("Fuentes y licencias")).toBeVisible();
  await expect(drawer.getByText("Recibo de lead").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `artifacts/screens/F19-drawer-${width}.png` });
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("stream and run API contracts", async ({ request }) => {
  const bad = await request.get("/api/hunts/not-a-uuid/stream");
  expect(bad.status()).toBe(400);
  const missing = await request.get("/api/hunts/00000000-0000-4000-8000-0000000000aa/stream");
  expect(missing.status()).toBe(404);
  const noSource = await request.post("/api/hunts/00000000-0000-4000-8000-0000000000aa/run?source=nope");
  expect(noSource.status()).toBe(400);
  const demo = await (await request.get("/api/hunts/00000000-0000-4000-8000-00000000f019/stream?since=0")).json();
  expect(demo.isDemo).toBe(true);
  expect(demo.points.length).toBeGreaterThan(1000);
  expect(demo.counters.total.found).toBeGreaterThanOrEqual(2000);
});
