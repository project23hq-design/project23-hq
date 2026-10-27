import { expect, test } from "@playwright/test";

test.describe("mobile and accessibility", () => {
  test("home has a skip link and no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("ticket picker is keyboard operable from the sticky purchase pill", async ({ page }) => {
    await page.goto("/events/ilesa-comedy-jamz");
    const buy = page.getByRole("button", { name: "Buy tickets from ₦3,000" });
    await expect(buy).toBeInViewport();
    await buy.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    const add = dialog.getByRole("button", { name: "Add one Regular", exact: true });
    await add.focus();
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Add one Regular", exact: true }).press("Enter");
    await expect(dialog.locator("output").first()).toHaveText("2");
    await expect(dialog.getByText("₦6,000")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Checkout" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("explore filters live in the URL and survive back navigation", async ({ page }) => {
    await page.goto("/explore");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Location: Location" }).click();
    await page.getByRole("radio", { name: "Ile-Ife" }).click();
    await expect(page).toHaveURL(/city=ile-ife/);
    await expect(page.getByRole("heading", { name: /Events in Ile-Ife/ })).toBeVisible();
    await page
      .getByRole("link", { name: /Ife Tech/ })
      .first()
      .click();
    await page.waitForURL(/\/events\//);
    await page.goBack();
    await expect(page).toHaveURL(/city=ile-ife/);
    await expect(page.getByRole("button", { name: "Location: Ile-Ife" })).toBeVisible();
  });

  test("sold-out and not-yet-on-sale states are honest", async ({ page }) => {
    await page.goto("/events/campus-poetry-slam");
    await expect(page.getByRole("button", { name: "Sold out" })).toBeVisible();
    await page.goto("/events/ede-highlife-revival");
    await expect(page.getByRole("button", { name: "Not on sale yet" })).toBeVisible();
  });
});
