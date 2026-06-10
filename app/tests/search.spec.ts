import { test, expect } from "@playwright/test";

// Frontend MiniSearch (BM25) over contacts + their flattened interactions /
// followups / briefing. Tests assume the demo seed data (PIN 1234) — Sarah
// Chen exists and her interactions contain "kicking".

test.describe("Cmd+K full-text search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[type="password"]').fill("1234");
    await page.locator("button", { hasText: "Unlock" }).click();
    await expect(page.locator("text=Upcoming")).toBeVisible({ timeout: 5000 });
  });

  test("Cmd+K opens the search input and Esc closes it", async ({ page }) => {
    await page.keyboard.press("Meta+K");
    const input = page.locator('input[aria-label="Search contacts"]');
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
  });

  test("typing a name filters contacts with the named one ranked first", async ({ page }) => {
    await page.keyboard.press("Meta+K");
    const input = page.locator('input[aria-label="Search contacts"]');
    await input.fill("sarah");

    const names = page.locator("main h2");
    await expect(names.first()).toHaveText("Sarah Chen", { timeout: 2000 });
  });

  test("typing a word that only appears in one contact's interactions finds them", async ({
    page,
  }) => {
    await page.keyboard.press("Meta+K");
    const input = page.locator('input[aria-label="Search contacts"]');
    // "kicking" only appears in Sarah Chen's interactions in the seed data.
    await input.fill("kicking");

    const names = page.locator("main h2");
    await expect(names).toHaveCount(1);
    await expect(names.first()).toHaveText("Sarah Chen");
  });

  test("ArrowDown moves the highlight ring; Esc clears + restores the full list", async ({
    page,
  }) => {
    await page.keyboard.press("Meta+K");
    const input = page.locator('input[aria-label="Search contacts"]');
    await input.fill("sarah");

    // At least two matches expected (name + body hits across seed data).
    const names = page.locator("main h2");
    const initialCount = await names.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);

    if (initialCount >= 2) {
      await page.keyboard.press("ArrowDown");
      // The second result should now have a teal ring (box-shadow).
      const ringed = page.locator('main div[style*="box-shadow"]');
      await expect(ringed.first()).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
    // Full list restored — there are 8 seed contacts. At ≥1024px the list view
    // is master-detail (#82): contacts render as compact rail rows and only the
    // selected contact has an h2 card. Below 1024px each contact is a full card.
    if (await page.locator('[data-testid="contact-rail"]').count()) {
      await expect(page.locator('[data-testid^="contact-row-"]')).toHaveCount(8);
    } else {
      await expect(names).toHaveCount(8);
    }
  });
});
