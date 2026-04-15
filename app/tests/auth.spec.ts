import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("shows PIN login page when not authenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Enter PIN")).toBeVisible();
  });

  test("logs in with correct PIN", async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[type="password"]').fill("1234");
    await page.locator("button", { hasText: "Unlock" }).click();

    // Should redirect to CRM page and show contacts
    await expect(page.locator("text=Upcoming")).toBeVisible({ timeout: 5000 });
  });

  test("rejects invalid PIN", async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[type="password"]').fill("9999");
    await page.locator("button", { hasText: "Unlock" }).click();

    await expect(page.locator("text=Invalid PIN")).toBeVisible({ timeout: 3000 });
  });
});
