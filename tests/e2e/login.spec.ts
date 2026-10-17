import { test, expect } from "@playwright/test";

const KEY = process.env.APP_ACCESS_KEY ?? "e2e-app-key";

test("login: /app redirects to the form, a wrong key shows an error, the right key opens the page", async ({ page }, info) => {
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/app\/login\?next=%2Fapp%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Entra al panel del equipo" })).toBeVisible();

  await page.getByLabel("Clave de acceso").fill("clave-incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("#login-error")).toContainText("no es correcta");

  await page.getByLabel("Clave de acceso").fill(KEY);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await page.goto("/app/login");
  await page.screenshot({ path: `artifacts/screens/login-${info.project.name.includes("390") ? "390" : "1440"}.png`, fullPage: true });
});
