import { test, expect } from '../../src/fixtures';

test.describe('Main navigation', () => {
  test('shows the configured main categories', { tag: '@smoke' }, async ({ page, cfg, navigation }) => {
    await page.goto(cfg.routes.home);
    const texts = (await navigation.rootLinkTexts()).map((t) => t.toLowerCase());
    for (const name of cfg.testData.mainCategories) {
      expect(texts, `main navigation should contain "${name}"`).toContain(name.toLowerCase());
    }
  });

  test('every main category opens a listing page', async ({ page, cfg, navigation }) => {
    // two page loads per category: scale the timeout with the number of categories
    test.setTimeout(test.info().timeout + cfg.testData.mainCategories.length * 20_000);
    for (const name of cfg.testData.mainCategories) {
      await page.goto(cfg.routes.home);
      await navigation.openCategory(name);
      await expect(page.locator('body')).toHaveClass(/is-ctl-navigation/);
      await expect(page).not.toHaveURL(new RegExp(`${cfg.baseURL.replace(/[.]/g, '\\.')}/?$`));
      await expect(page.locator(cfg.selectors.page.main).first()).toBeVisible();
    }
  });

  test('flyout shows sub categories (desktop)', async ({ page, cfg, navigation }) => {
    await page.goto(cfg.routes.home);
    const withFlyout = page.locator(`${cfg.selectors.navigation.rootLink}${cfg.selectors.navigation.flyoutTrigger}`).first();
    test.skip((await withFlyout.count()) === 0, 'No category with flyout');
    const name = (await withFlyout.innerText()).trim();
    const flyout = await navigation.openFlyout(name);
    const sub = flyout.locator(cfg.selectors.navigation.flyoutLink).first();
    await expect(sub).toBeVisible();
    await Promise.all([page.waitForLoadState('domcontentloaded'), sub.click()]);
    await expect(page.locator(cfg.selectors.page.breadcrumb).first()).toBeVisible();
  });

  test('category page shows breadcrumb', async ({ page, cfg }) => {
    await page.goto(cfg.testData.listingCategoryPath);
    await expect(page.locator(cfg.selectors.page.breadcrumb).first()).toBeVisible();
  });
});
