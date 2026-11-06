import { test, expect, skipUnless } from '../../src/fixtures';

test.describe('Cookie consent', () => {
  test.use({ acceptCookies: false });

  test.beforeEach(({ cfg }) => skipUnless(cfg.features.cookieBanner, 'cookieBanner'));

  test('banner is shown to new visitors and remembered after choice', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, cookieBanner, context }) => {
    await page.goto(cfg.routes.home);
    await expect(cookieBanner.banner).toBeVisible();

    await cookieBanner.acceptOnlyNecessary();
    await expect(cookieBanner.banner).toBeHidden();

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'cookie-preference')?.value).toBe('1');

    await page.reload();
    await expect(cookieBanner.banner).toBeHidden();
  });
});
