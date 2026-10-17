import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "faro_key", value: process.env.APP_ACCESS_KEY ?? "", url: baseURL ?? "http://localhost:3100" }]);
});

const NOW = "2026-10-19T15:00:00Z";

test("mark reply dialog: note required, guard on leads without a sent message", async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 1440;
  await page.goto(`/app/hunts/demo/outreach?now=${NOW}`);
  await page.getByTestId("mark-reply").first().click();
  const dialog = page.getByTestId("reply-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Sin nombres de personas");
  await expect(page.getByTestId("reply-submit")).toBeDisabled();
  await page.getByTestId("reply-note").fill("La empresa pidió una llamada esta semana.");
  await page.screenshot({ path: `artifacts/screens/F11-reply-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Demo leads have no sent message yet: the API refuses and the dialog explains why (state stays untouched).
  await page.getByTestId("reply-submit").click();
  await expect(page.getByTestId("reply-error")).toContainText("contáctalo primero");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
});

test("reply API requires a note and the app key", async ({ page, playwright, baseURL }) => {
  const bad = await page.request.post("/api/leads/00000000-0000-4000-8000-000000000000/reply", { data: { channel: "email" } });
  expect(bad.status()).toBe(400);
  const anon = await playwright.request.newContext({ baseURL });
  const res = await anon.post("/api/leads/00000000-0000-4000-8000-000000000000/reply", { data: { note: "hola", channel: "email" }, headers: { "x-app-key": "wrong" } });
  expect(res.status()).toBe(401);
  const hook = await anon.post("/api/webhooks/email", { data: { type: "email.delivered" } });
  expect(hook.status()).toBe(401);
});
