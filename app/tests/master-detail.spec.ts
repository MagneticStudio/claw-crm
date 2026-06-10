import { test, expect } from "@playwright/test";

// Desktop master-detail layout (#82): at ≥1024px the list view splits into a
// compact contact rail + one full detail card. Below 1024px the classic
// single-column notebook renders. Assumes the demo seed data (PIN 1234).

test.describe("Master-detail layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[type="password"]').fill("1234");
    await page.locator("button", { hasText: "Unlock" }).click();
    await expect(page.locator("text=Upcoming")).toBeVisible({ timeout: 5000 });
  });

  test("≥1024px shows rail + detail pane with the first contact selected", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    const rail = page.locator('[data-testid="contact-rail"]');
    const detail = page.locator('[data-testid="contact-detail"]');
    await expect(rail).toBeVisible();
    await expect(detail).toBeVisible();

    const rows = rail.locator('[data-testid^="contact-row-"]');
    await expect(rows).toHaveCount(8);
    // Exactly one full card (one note input) in the detail pane.
    await expect(detail.locator('input[placeholder*="note"]')).toHaveCount(1);

    // Default selection mirrors the first rail row.
    const firstRowText = (await rows.first().textContent()) ?? "";
    const detailName = (await detail.locator("h2").first().textContent()) ?? "";
    expect(firstRowText).toContain(detailName.trim().split(" ")[0]);
  });

  test("clicking a rail row switches the detail pane", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    const rail = page.locator('[data-testid="contact-rail"]');
    await rail.locator('[data-testid^="contact-row-"]', { hasText: "Sarah Chen" }).click();

    const detail = page.locator('[data-testid="contact-detail"]');
    await expect(detail.locator("h2").first()).toHaveText("Sarah Chen");
  });

  test("below 1024px the single-column card list renders instead", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });

    await expect(page.locator('[data-testid="contact-rail"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="contact-detail"]')).toHaveCount(0);
    // All 8 seed contacts render as full cards.
    await expect(page.locator('input[placeholder*="note"]')).toHaveCount(8);
  });
});
