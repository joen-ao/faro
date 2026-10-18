import { test, expect } from "@playwright/test";

test("diagnostic page: findings, opt-out button, event registered, contact form, screenshots", async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 1440;
  await page.goto("/d/demo-clinica?c=email&s=osm&utm_source=email&utm_campaign=e2e-f12");

  await expect(page.getByTestId("diag-title")).toContainText("Sonrisa Norte");
  await expect(page.getByTestId("demo-badge")).toHaveText("Ejemplo");
  await expect(page.getByTestId("diag-title")).toContainText("Diagnóstico de captación de pacientes");
  // Website cards from the seeded (example) site: booking + WhatsApp + freshness are opportunities, form + social are fine.
  const findings = page.getByTestId("finding");
  await expect(findings).toHaveCount(5);
  await expect(page.locator('[data-testid="finding"][data-status="opportunity"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="finding"][data-status="ok"]')).toHaveCount(2);
  await expect(findings.first()).toContainText("Por qué importa");
  await expect(findings.first()).toContainText("Recomendación");
  // Benchmark: the demo lead has no real peers, so no percentage is shown.
  await expect(page.getByTestId("bench-booking")).toContainText("Usted: no");
  await expect(page.getByTestId("benchmark")).toContainText("aún no hay suficientes datos para comparar");
  await expect(page.getByTestId("benchmark")).not.toContainText("%");
  // Registry data is only the "why we wrote" note, with its source link.
  await expect(page.getByTestId("why-we-wrote")).toContainText("REPS");
  expect(await page.getByTestId("why-we-wrote").locator("a").getAttribute("href")).toMatch(/^https:\/\//);
  // Primary CTA: WhatsApp with the company and slug in the prefilled text.
  const wa = await page.getByTestId("whatsapp-cta").getAttribute("href");
  expect(wa).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  expect(decodeURIComponent(wa!.split("text=")[1]!)).toContain("demo-clinica");
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
      const body = (await res.json()) as { events: { type: string; utm: Record<string, string> | null; payload: { kind?: string } }[] };
      // No Dapta snippet in e2e: the open is a page_view (type click), never a widget_open.
      expect(body.events.some((e) => e.type === "widget_open" && e.utm?.utm_campaign === "e2e-f12" && e.payload.kind === "page_view")).toBe(false);
      return body.events.find((e) => e.type === "click" && e.payload.kind === "page_view" && e.utm?.utm_campaign === "e2e-f12")?.utm ?? null;
    })
    .toMatchObject({ c: "email", s: "osm", utm_source: "email" });

  // Duplicate open within the window is not recorded again; response never echoes tracking.
  const dup = await page.request.post("/api/events", { data: { slug: "demo-clinica", c: "email", s: "osm", utm: { utm_campaign: "e2e-f12" } } });
  const dupBody = (await dup.json()) as Record<string, unknown>;
  expect(dupBody.tracking).toBeUndefined();
  const big = await page.request.post("/api/contact", { data: { slug: "demo-clinica", message: "x".repeat(20000) } });
  expect(big.status()).toBe(413);

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
