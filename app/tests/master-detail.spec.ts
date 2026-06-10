import { test, expect } from "@playwright/test";

// Desktop rail-index layout: at ≥1024px the list view shows a sticky compact
// contact rail (an index) on the left and the full scrolling card feed on the
// right — clicking a rail row scrolls the feed to that contact. Below 1024px
// the classic single-column notebook renders. Assumes demo seed data (PIN 1234).

test.describe("Desktop rail + feed layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[type="password"]').fill("1234");
    await page.locator("button", { hasText: "Unlock" }).click();
    await expect(page.locator("text=Upcoming")).toBeVisible({ timeout: 5000 });
  });

  test("≥1024px shows the index rail and the full card feed", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    const rail = page.locator('[data-testid="contact-rail"]');
    const feed = page.locator('[data-testid="contact-feed"]');
    await expect(rail).toBeVisible();
    await expect(feed).toBeVisible();

    // All 8 seed contacts appear BOTH as index rows and as full cards.
    await expect(rail.locator('[data-testid^="contact-row-"]')).toHaveCount(8);
    await expect(feed.locator('input[placeholder*="note"]')).toHaveCount(8);
  });

  test("clicking a rail row scrolls the feed to that contact", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // Pick a contact far down the feed so the click must actually scroll.
    const lastRow = page.locator('[data-testid^="contact-row-"]').last();
    const targetId = (await lastRow.getAttribute("data-testid"))!.replace("contact-row-", "");
    const card = page.locator(`#contact-${targetId}`);

    const before = await card.boundingBox();
    expect(before!.y).toBeGreaterThan(800); // below the fold before the click

    await lastRow.click();
    // Smooth scroll — the card ends up fully inside the viewport. (It can't be
    // asserted "at top": the last card in the feed is bounded by document end.)
    await expect
      .poll(async () => (await card.boundingBox())!.y, { timeout: 5000 })
      .toBeLessThan(800);
    await expect(card).toBeInViewport();

    // The clicked row holds the active (teal) highlight through the scroll.
    const bg = await lastRow.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("below 1024px the single-column card list renders instead", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });

    await expect(page.locator('[data-testid="contact-rail"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="contact-feed"]')).toHaveCount(0);
    // All 8 seed contacts render as full cards in one column.
    await expect(page.locator('input[placeholder*="note"]')).toHaveCount(8);
  });
});
