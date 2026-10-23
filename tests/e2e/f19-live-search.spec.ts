import { expect, test } from "@playwright/test";

// Software GL so MapLibre renders in headless CI.
test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

const KEY = process.env.APP_ACCESS_KEY ?? "";
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "faro_key", value: KEY, url: baseURL ?? "http://localhost:3100" }]);
});

const widthOf = (info: { project: { use: { viewport?: { width: number } | null } } }) => info.project.use.viewport?.width ?? 1440;

test("new profile: conversation, editable chips and source cards", async ({ page }, info) => {
  await page.goto("/app/new");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("vender");
  await expect(page.getByTestId("structure")).toBeDisabled();

  await page.getByTestId("example-bogota-dental").click();
  await expect(page.getByTestId("thinking")).toBeVisible();
  const launch = page.getByTestId("launch");
  await expect(launch).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("source-cards").locator("li")).toHaveCount(6);

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
  await page.screenshot({ path: `artifacts/screens/F07-new-${widthOf(info)}.png`, fullPage: true });

  // Step 2: the search needs at least one service (inline validation), then Claude proposes value angles.
  const step = page.getByTestId("offer-step");
  await expect(step.getByRole("heading", { name: "¿Qué valor les llevas?" })).toBeVisible();
  await launch.click();
  await expect(page.getByTestId("offer-error")).toContainText("Elige al menos un servicio");
  await page.getByTestId("service-pick-agentes-ia").click();
  await page.getByTestId("service-pick-landing-webs").click();
  await expect(page.getByTestId("offer-error")).toBeHidden();
  const angles = page.getByTestId("angle-card");
  await expect(angles.first()).toBeVisible({ timeout: 15_000 });
  expect(await angles.count()).toBeGreaterThanOrEqual(2);
  await expect(angles.first()).toContainText("→");
  await angles.first().getByTestId("angle-accept").click();
  await expect(angles.first()).toHaveAttribute("data-state", "accepted");
  await angles.nth(1).getByTestId("angle-dismiss").click();
  await expect(page.getByTestId("refinement-card").first()).toBeVisible();
  await expect(page.getByTestId("offer-preview")).toContainText("Agentes de IA y automatización");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await step.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `artifacts/screens/F07-new-oferta-${widthOf(info)}.png`, fullPage: true });

  // The search is created with the offer (chosen services + accepted angle). The request is answered with the demo hunt so
  // this spec does not add real data that later specs expect to be empty (storage is covered by unit tests).
  let sent: { offer?: { serviceIds: string[]; angles: unknown[] } } = {};
  await page.route("**/api/hunts", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ huntId: "demo" }) });
  });
  await launch.click();
  await expect(page).toHaveURL(/\/app\/hunts\/demo$/, { timeout: 20_000 });
  expect(sent.offer?.serviceIds).toEqual(["agentes-ia", "landing-webs"]);
  expect(sent.offer?.angles).toHaveLength(1);
});

test("new search over several cities or a whole country", async ({ page }, info) => {
  const width = widthOf(info);
  await page.goto("/app/new");
  await page.getByTestId("example-bogota-dental").click();
  await expect(page.getByTestId("launch")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("place-picker")).toContainText("Bogotá");

  // Cities mode: searchable presets, removable chips, max 5.
  await page.getByTestId("place-picker").click();
  await expect(page.getByTestId("place-panel")).toBeVisible();
  await page.getByTestId("city-search").fill("mede");
  await page.getByTestId("city-option-medellin").click();
  await page.getByTestId("city-option-cali").click();
  await expect(page.getByTestId("place-picker")).toContainText("Bogotá, Medellín +1");
  const summary = page.getByTestId("launch-summary");
  await expect(summary).toHaveText("3 fuentes · dental en Bogotá, Medellín y Cali");
  // estimates add up per city; OSM was not measured outside Bogotá, so no number is invented
  const cards = page.getByTestId("source-cards").locator("li");
  await expect(cards.nth(1)).toContainText("≈ 2.191 registros en 3 ciudades");
  await expect(cards.nth(0)).toContainText("Estimado no disponible");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId("place-panel").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `artifacts/screens/F07-multiciudad-ciudades-${width}.png`, fullPage: true });

  await page.getByRole("button", { name: "Quitar Cali" }).click();
  await expect(summary).toHaveText("3 fuentes · dental en Bogotá y Medellín");
  await page.getByTestId("city-option-barranquilla").click();
  await page.getByTestId("city-option-cartagena").click();
  await page.getByTestId("city-option-cali").click();
  await expect(page.getByTestId("city-search")).toBeDisabled();
  await expect(page.getByTestId("city-option-miami")).toHaveCount(0); // one country per search

  // Country mode: Colombia expands to its 5 main cities.
  await page.getByTestId("place-mode-country").click();
  await page.getByTestId("country-option-CO").click();
  await expect(page.getByTestId("country-option-CO")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("place-picker")).toContainText("Colombia (5 ciudades)");
  await expect(summary).toHaveText("3 fuentes · dental en Bogotá, Medellín, Cali, Barranquilla y Cartagena");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId("place-panel").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `artifacts/screens/F07-multiciudad-pais-${width}.png`, fullPage: true });
  await page.getByTestId("place-done").click();
  await expect(page.getByTestId("place-panel")).toBeHidden();

  // The hunt is created with every city. Answered with the demo hunt (no real data for later specs); its stream is
  // given the 5 cities so the live map frames all of them.
  let sent: { criteria?: { city: string; scope?: string; cities?: Array<{ name: string; bbox?: number[] }> } } = {};
  await page.route("**/api/hunts", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ huntId: "demo" }) });
  });
  await page.route("**/api/hunts/*/stream*", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, cities: sent.criteria?.cities ?? [], area: "Colombia (5 ciudades)" } });
  });
  await page.getByTestId("service-pick-agentes-ia").click();
  await page.getByTestId("launch").click();
  await expect(page).toHaveURL(/\/app\/hunts\/demo$/, { timeout: 20_000 });
  expect(sent.criteria).toMatchObject({ city: "Bogota", scope: "country" });
  expect(sent.criteria?.cities?.map((c) => c.name)).toEqual(["Bogota", "Medellin", "Cali", "Barranquilla", "Cartagena"]);
  expect(sent.criteria?.cities?.every((c) => c.bbox?.length === 4)).toBe(true);
  await expect(page.getByTestId("hunt-title")).toContainText("Colombia (5 ciudades)", { timeout: 60_000 });
  const mapLoaded = await page
    .waitForSelector('[data-testid="map"][data-loaded="true"]', { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (mapLoaded) await page.waitForTimeout(4000); // fit + basemap tiles
  await page.screenshot({ path: `artifacts/screens/F07-multiciudad-mapa-${width}.png` });
});

test("live hunt (DEMO 2.000 points): map, virtual list, filters and lead drawer", async ({ page }, info) => {
  const width = widthOf(info);
  await page.goto("/app/hunts/demo");
  await expect(page.getByTestId("demo-badge")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("hunt-title")).toContainText("Bogotá");
  await expect(page.getByTestId("to-outreach")).toHaveAttribute("href", /\/app\/hunts\/.+\/outreach$/);

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
  await page.screenshot({ path: `artifacts/screens/F19-mapa-${width}.png` });

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
  await expect(page.getByTestId("receipt")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `artifacts/screens/F19-drawer-${width}.png` });
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("stream and run API contracts (gated by the app key)", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/api/hunts/00000000-0000-4000-8000-00000000f019/stream")).status()).toBe(401);
  expect((await anon.post("/api/hunts", { data: {} })).status()).toBe(401);
  await anon.dispose();
  const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-app-key": KEY } });
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
  await request.dispose();
});
