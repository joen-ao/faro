import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "faro_key", value: process.env.APP_ACCESS_KEY ?? "", url: baseURL ?? "http://localhost:3100" }]);
});

test("outreach API validates input", async ({ page }) => {
  const res = await page.request.post("/api/outreach/preview", { data: { leadId: "x" } });
  expect(res.status()).toBe(400);
  const res2 = await page.request.post("/api/outreach/send", { data: "not-json", headers: { "content-type": "application/json" } });
  expect(res2.status()).toBe(400);
});
