import { test, expect } from "@playwright/test";

const KEY = process.env.APP_ACCESS_KEY ?? "e2e-app-key";

test("login: /app redirects to the form, a wrong key shows an error, the right key opens the page", async ({ page }, info) => {
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/app\/login\?next=%2Fapp%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Entra al panel del equipo" })).toBeVisible();

  await page.getByLabel("Clave de acceso").fill("clave-incorrecta");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("#login-error")).toContainText("no es correcta");

  await page.getByLabel("Clave de acceso").fill(KEY);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await page.goto("/app/login");
  await page.screenshot({ path: `artifacts/screens/login-${info.project.name.includes("390") ? "390" : "1440"}.png`, fullPage: true });
});

test("evaluator: one click, reads the panel, cannot send or change settings", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/app/login?next=%2Fapp%2Fhunts");
  await page.getByRole("button", { name: "Entrar como evaluador" }).click();
  await expect(page).toHaveURL(/\/app\/hunts/);
  await expect(page.getByRole("heading", { name: "Lo que ya buscamos" })).toBeVisible();
  const send = await page.request.put("/api/settings/send-window", { data: { policy: "ley2300" } });
  expect(send.status()).toBe(403);
  expect((await send.json()).error).toContain("Modo evaluador");
});
