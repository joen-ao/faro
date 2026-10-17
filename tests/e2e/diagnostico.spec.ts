import { test, expect } from "@playwright/test";

test("diagnostic page: findings, opt-out button, event registered, contact form, screenshots", async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 1440;
  await page.goto("/d/demo-clinica?c=email&s=osm&utm_source=email&utm_campaign=e2e-f12");

  await expect(page.getByTestId("diag-title")).toContainText("Sonrisa Norte");
  await expect(page.getByTestId("demo-badge")).toHaveText("Ejemplo");
  const findings = page.getByTestId("finding");
  expect(await findings.count()).toBeLessThanOrEqual(3);
  expect(await findings.count()).toBeGreaterThan(0);
  await expect(page.getByTestId("widget-placeholder")).toContainText("no configurado");
  await expect(page.getByTestId("sender")).toContainText("30X Hackathon");
  await expect(page.getByTestId("attribution")).toContainText("ODbL");

  const optout = page.getByTestId("optout-link-footer");
  await expect(optout).toBeVisible();
  expect(await optout.getAttribute("href")).toMatch(/^\/baja\/.+/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The open event is sent after hydration, without blocking the render.
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/events?slug=demo-clinica");
      const body = (await res.json()) as { events: { type: string; utm: Record<string, string> | null }[] };
      return body.events.find((e) => e.type === "widget_open" && e.utm?.utm_campaign === "e2e-f12")?.utm ?? null;
    })
    .toMatchObject({ c: "email", s: "osm", utm_source: "email" });

  await page.screenshot({ path: `artifacts/screens/F12-diagnostico-${width}.png`, fullPage: true });

  // Honeypot: bot gets 200 but nothing is stored.
  const bot = await page.request.post("/api/contact", { data: { slug: "demo-clinica", hp: "spam" } });
  expect(bot.status()).toBe(200);
  // Personal mailbox is rejected.
  const bad = await page.request.post("/api/contact", { data: { slug: "demo-clinica", company: "X SAS", email: "juan.perez@gmail.com", message: "hola hola", consent: true } });
  expect(bad.status()).toBe(422);

  await page.getByLabel("Correo de la empresa").fill("citas@sonrisa-norte.example");
  await page.getByLabel("¿Qué necesitan?").fill("Queremos conocer cómo funciona.");
  await page.getByLabel(/Acepto el/).check();
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByTestId("contact-ok")).toBeVisible();
  const after = (await (await page.request.get("/api/events?slug=demo-clinica")).json()) as { events: { type: string }[] };
  expect(after.events.some((e) => e.type === "form_submit")).toBe(true);

  await optout.click();
  await expect(page).toHaveURL(/\/baja\//);
  await expect(page.getByTestId("optout-confirm")).toBeVisible();
});

test("unknown slug shows the designed 404; ICP page renders and bad ICP 404s", async ({ page }) => {
  const res = await page.goto("/d/no-existe-xyz");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found-title")).toBeVisible();
  await page.goto("/d/icp/clinicas-dentales-bogota?utm_source=meta&utm_campaign=c1");
  await expect(page.getByTestId("diag-title")).toContainText("clínica");
  await expect(page.getByTestId("contact-form")).toBeVisible();
  expect((await page.goto("/d/icp/nope"))?.status()).toBe(404);
});
