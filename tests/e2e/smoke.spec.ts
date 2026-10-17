import { test, expect } from "@playwright/test";

test("home renders and captures screenshot", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const width = info.project.use.viewport?.width ?? 1440;
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noHScroll).toBe(true);
  await page.screenshot({ path: `artifacts/screens/F00-home-${width}.png`, fullPage: true });

  const res = await page.request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.sendEnabled).toBe(false);
});
