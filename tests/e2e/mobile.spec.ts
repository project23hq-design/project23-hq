import { expect, test } from "@playwright/test";

test.describe("mobile and accessibility", () => {
  test("home has a skip link and no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("ticket selector is keyboard operable with a sticky purchase bar", async ({ page }) => {
    await page.goto("/events/ilesa-comedy-jamz");
    const add = page.getByRole("button", { name: "Add one Regular", exact: true });
    await add.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(page.locator("output").first()).toHaveText("2");
    const cta = page.getByRole("button", { name: /Continue · ₦6,000/ });
    await expect(cta).toBeVisible();
    await expect(cta).toBeInViewport();
  });

  test("explore filters live in the URL and survive back navigation", async ({ page }) => {
    await page.goto("/explore");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("City").selectOption("ile-ife");
    await expect(page).toHaveURL(/city=ile-ife/);
    await expect(page.getByRole("heading", { name: "Events in Ile-Ife" })).toBeVisible();
    await page.getByRole("link", { name: /Ife Tech/ }).first().click();
    await page.waitForURL(/\/events\//);
    await page.goBack();
    await expect(page).toHaveURL(/city=ile-ife/);
    await expect(page.getByLabel("City")).toHaveValue("ile-ife");
  });

  test("sold-out and not-yet-on-sale states are honest", async ({ page }) => {
    await page.goto("/events/campus-poetry-slam");
    await expect(page.getByText("Sold out").first()).toBeVisible();
    await page.goto("/events/ede-highlife-revival");
    await expect(page.getByText("Not on sale yet")).toBeVisible();
  });
});
