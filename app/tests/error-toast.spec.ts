import { test, expect } from "@playwright/test";

// Global mutation-failure toast (#85): optimistic updates roll back silently,
// so failed writes need an explicit surface. The MutationCache onError parses
// the API error body and shows a destructive toast.

test.describe("Mutation error toast", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[type="password"]').fill("1234");
    await page.locator("button", { hasText: "Unlock" }).click();
    await expect(page.locator("text=Upcoming")).toBeVisible({ timeout: 5000 });
  });

  test("a failed write surfaces a destructive toast with the server message", async ({ page }) => {
    await page.route("**/api/interactions", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "Interaction content cannot be empty" }),
      }),
    );

    const input = page.locator('input[placeholder*="note"]').first();
    await input.fill("this write will fail");
    await input.press("Enter");

    // .first(): Radix mirrors toast text into an aria-live region, so the
    // string appears twice once the live region populates (strict-mode trap).
    await expect(page.getByText("Couldn't save").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Interaction content cannot be empty").first()).toBeVisible();
  });

  test("successful writes show no error toast", async ({ page }) => {
    const input = page.locator('input[placeholder*="note"]').first();
    await input.fill("toast success path note");
    await input.press("Enter");

    await expect(page.getByText("toast success path note").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Couldn't save")).toHaveCount(0);
  });
});
