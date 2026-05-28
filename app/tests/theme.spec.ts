import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/auth");
  await page.locator('input[type="password"]').fill("1234");
  await page.locator("button", { hasText: "Unlock" }).click();
  await expect(page.locator("text=Upcoming")).toBeVisible({ timeout: 5000 });
}

test.describe("Theme", () => {
  test("header Sun/Moon toggle flips the .dark class and persists", async ({ page }) => {
    await login(page);
    // Reset theme to a known state for this test, then reload.
    await page.evaluate(() => window.localStorage.removeItem("claw-theme"));
    await page.reload();
    await expect(page.locator("text=Upcoming")).toBeVisible({ timeout: 5000 });

    const html = page.locator("html");
    const toggle = page.locator('button[aria-label="Toggle theme"]');
    await expect(toggle).toBeVisible();

    const startedDark = await html.evaluate((el) => el.classList.contains("dark"));

    await toggle.click();
    if (startedDark) {
      await expect(html).not.toHaveClass("dark");
    } else {
      await expect(html).toHaveClass("dark");
    }

    // The choice persists across reload via localStorage.
    await page.reload();
    if (startedDark) {
      await expect(html).not.toHaveClass("dark");
    } else {
      await expect(html).toHaveClass("dark");
    }
  });

  test("Settings three-way control sets System/Light/Dark", async ({ page }) => {
    await login(page);
    await page.goto("/settings");

    const html = page.locator("html");

    await page.locator("button", { hasText: "Dark" }).click();
    await expect(html).toHaveClass("dark");

    await page.locator("button", { hasText: "Light" }).click();
    await expect(html).not.toHaveClass("dark");

    await page.locator("button", { hasText: "System" }).click();
    const stored = await page.evaluate(() => window.localStorage.getItem("claw-theme"));
    expect(stored).toBe("system");
  });

  test("Auth page stays on the branded teal gradient regardless of theme", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("claw-theme", "dark");
    });
    await page.goto("/auth");

    // Auth page applies an inline teal gradient on its root container. The
    // brand teal is #2bbcb3 (rgb 43,188,179) — the browser may serialize
    // either form.
    const gradientRoot = page.locator('div[style*="linear-gradient"]').first();
    await expect(gradientRoot).toBeVisible();
    const bg = await gradientRoot.evaluate((el) => (el as HTMLElement).style.background);
    expect(bg).toContain("linear-gradient");
    expect(bg).toMatch(/(#2bbcb3|rgb\(\s*43\s*,\s*188\s*,\s*179\s*\))/i);
  });
});
