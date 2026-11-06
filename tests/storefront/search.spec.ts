import { test, expect } from '../../src/fixtures';

test.describe('Product search', () => {
  test('search via header returns matching products', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, header }) => {
    const { searchTerm, searchMinResults } = cfg.testData;
    const s = cfg.selectors.search;
    await page.goto(cfg.routes.home);
    if (cfg.features.headerSearchNavigates === false) {
      // results open in an overlay on the current page instead of /search
      await header.typeSearchSuggest(searchTerm);
      const hits = page.locator(cfg.selectors.header.searchSuggestProduct).locator('visible=true');
      await expect(hits.first()).toBeVisible();
      expect(await hits.count()).toBeGreaterThanOrEqual(searchMinResults);
      await expect(page.locator(s.headline).locator('visible=true').first()).toContainText(searchTerm, { ignoreCase: true });
      return;
    }
    await header.search(searchTerm);
    await expect(page.locator('body')).toHaveClass(/is-ctl-search/);
    await expect(page).toHaveURL(new RegExp(`search=${encodeURIComponent(searchTerm)}`));
    expect(await page.locator(s.productBox).count()).toBeGreaterThanOrEqual(searchMinResults);
    // some shops echo the term lower-cased ("11 products found for "cartridge"")
    await expect(page.locator(s.headline)).toContainText(searchTerm, { ignoreCase: true });
  });

  test('results contain the search term', async ({ page, cfg }) => {
    const s = cfg.selectors.search;
    await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(cfg.testData.searchTerm)}`);
    // results may be rendered client-side after load
    await expect(page.locator(s.productBox).first()).toBeVisible();
    const names = (await page.locator(`${s.productBox} ${s.productName}`).allInnerTexts()).map((t) => t.trim());
    const hits = names.filter((n) => n.toLowerCase().includes(cfg.testData.searchTerm.toLowerCase()));
    expect(hits.length, `names: ${names.join(' | ')}`).toBeGreaterThan(0);
  });

  test('search suggest shows products while typing', async ({ page, cfg, header }) => {
    await page.goto(cfg.routes.home);
    const suggest = await header.typeSearchSuggest(cfg.testData.searchTerm);
    await expect(suggest.locator(cfg.selectors.header.searchSuggestProduct).first()).toBeVisible();
  });

  test('no-result search shows an info message', { tag: '@smoke' }, async ({ page, cfg }) => {
    const s = cfg.selectors.search;
    await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(cfg.testData.searchNoResultTerm)}`);
    await expect(page.locator(s.emptyAlert).first()).toBeVisible();
    await expect(page.locator(s.productBox)).toHaveCount(0);
  });

  test('handles special characters', async ({ page, cfg }) => {
    const res = await page.goto(`${cfg.routes.search}?search=${encodeURIComponent('"ä&%')}`);
    expect(res?.status()).toBeLessThan(500);
  });
});

test.describe('Search edge cases', () => {
  test('empty search term does not error', async ({ page, cfg }) => {
    const res = await page.goto(`${cfg.routes.search}?search=`);
    expect(res?.status()).toBeLessThan(500);
  });

  test('very long search term does not error', async ({ page, cfg }) => {
    const res = await page.goto(`${cfg.routes.search}?search=${'a'.repeat(1000)}`);
    expect(res?.status()).toBeLessThan(500);
  });

  test('search ignores letter case and surrounding spaces', async ({ page, cfg }) => {
    const s = cfg.selectors.search;
    const count = async (term: string) => {
      await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(term)}`);
      await expect(page.locator(s.productBox).first()).toBeVisible();
      return page.locator(s.productBox).count();
    };
    const term = cfg.testData.searchTerm;
    const base = await count(term.toLowerCase());
    expect(await count(term.toUpperCase())).toBe(base);
    expect(await count(`  ${term}  `)).toBe(base);
  });
});
