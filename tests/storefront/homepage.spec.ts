import { test, expect } from '../../src/fixtures';

test.describe('Homepage', () => {
  test('loads with header, navigation, content and footer', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, header }) => {
    const res = await page.goto(cfg.routes.home);
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).toHaveClass(/is-ctl-navigation/);
    await expect(header.logo).toBeVisible();
    await expect(
      header.searchInput.or(page.locator(cfg.selectors.header.searchToggle)).locator('visible=true').first(),
    ).toBeVisible();
    await expect(header.cartButton).toBeVisible();
    await expect(page.locator(cfg.selectors.footer.root).first()).toBeVisible();
    await expect(page.locator('.cms-page, .cms-section').first()).toBeVisible();
  });

  test('has basic SEO meta data', { tag: '@smoke' }, async ({ page, cfg }) => {
    await page.goto(cfg.routes.home);
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
    await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null);
    test.info().annotations.push({ type: 'robots', description: robots ?? '(none)' });
  });

  test('logo links back to the homepage', async ({ page, cfg, header }) => {
    await page.goto(cfg.testData.listingCategoryPath);
    await Promise.all([page.waitForLoadState('domcontentloaded'), header.logo.click()]);
    await expect(page).toHaveURL(new RegExp(`${cfg.baseURL.replace(/[.]/g, '\\.')}/?$`));
  });

  test('has no uncaught JavaScript errors', { tag: '@smoke' }, async ({ page, cfg }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('renders product images without broken sources', async ({ page, cfg }) => {
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    // displayed images only: themes ship hidden per-device variants (lazy, never loaded while hidden)
    const imgs = page.locator(`${cfg.selectors.listing.productImage}, .cms-image`).locator('visible=true');
    const count = await imgs.count();
    test.skip(count === 0, 'No product images on homepage');
    for (let i = 0; i < Math.min(count, 6); i++) {
      const img = imgs.nth(i);
      // plain scroll: sliders keep moving, Playwright's scrollIntoViewIfNeeded waits for a still element
      await img.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
  });
});
