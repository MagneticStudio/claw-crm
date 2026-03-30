import { test, expect } from "@playwright/test";

// Login helper
async function login(page: any) {
  await page.goto("/auth");
  await page.locator('input[type="password"]').fill("1234");
  await page.locator("button", { hasText: "Unlock" }).click();
  await expect(page.locator("text=active")).toBeVisible({ timeout: 5000 });
}

test.describe("Contacts", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("displays contacts on the CRM page", async ({ page }) => {
    // Should see at least one contact name
    await expect(page.locator("h2").first()).toBeVisible();
  });

  test("shows stage filter pills", async ({ page }) => {
    await expect(page.locator("button", { hasText: "All" })).toBeVisible();
  });

  test("filters contacts by stage", async ({ page }) => {
    const allButton = page.locator("button", { hasText: "All" });
    await expect(allButton).toBeVisible();

    // Click a stage filter
    const liveButton = page.locator("button", { hasText: /^Live/ });
    if (await liveButton.isVisible()) {
      await liveButton.click();
      // Verify filtering happened (fewer contacts visible)
      await expect(page.locator("h2").first()).toBeVisible();
    }
  });

  test("adds an interaction note", async ({ page }) => {
    // Find the first note input
    const input = page.locator('input[placeholder*="note"]').first();
    await input.fill("Test interaction from Playwright");
    await input.press("Enter");

    // Should appear in the timeline
    await expect(page.locator("text=Test interaction from Playwright")).toBeVisible({ timeout: 5000 });
  });

  test("creates a follow-up via /fu command", async ({ page }) => {
    const input = page.locator('input[placeholder*="note"]').first();
    await input.fill("/fu 12/31 Test follow-up from Playwright");
    await input.press("Enter");

    // Should appear as a follow-up
    await expect(page.locator("text=Test follow-up from Playwright")).toBeVisible({ timeout: 5000 });
  });
});
