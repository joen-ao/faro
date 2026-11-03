import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "faro_key", value: process.env.APP_ACCESS_KEY ?? "", url: baseURL ?? "http://localhost:3100" }]);
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
