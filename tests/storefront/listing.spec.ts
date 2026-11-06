import { test, expect, skipUnless } from '../../src/fixtures';
import { isSortedAsc, isSortedDesc } from '../../src/utils/price';

test.describe('Product listing', () => {
  test.beforeEach(async ({ listing, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
  });

  test('shows product boxes with name, price and image', { tag: ['@smoke', '@mobile'] }, async ({ listing, cfg }) => {
    const s = cfg.selectors.listing;
    await expect(listing.productBoxes.first()).toBeVisible();
    expect(await listing.productBoxes.count()).toBeGreaterThan(0);
    // out-of-stock boxes may render without a price → check the first box that has one
    const first = listing.productBoxes.filter({ has: listing.page.locator(s.productPrice) }).first();
    await expect(first.locator(s.productName)).not.toBeEmpty();
    await expect(first.locator(s.productPrice).first()).toContainText(/\d/);
    await expect(first.locator(s.productImage).first()).toBeVisible();
  });

  test('product box links to the detail page', { tag: '@smoke' }, async ({ listing, product }) => {
    const name = await listing.openProduct(0);
    await expect(product.name).toHaveText(name);
  });

  test('items per page shows more products', async ({ listing, cfg }) => {
    test.skip(!cfg.selectors.listing.perPage, 'Shop has no items-per-page select');
    test.skip(!(await listing.pagination.isVisible()), 'Category fits on one page — nothing more to show');
    const max = await listing.showMaxPerPage();
    expect(await listing.productBoxes.count()).toBeLessThanOrEqual(max);
  });

  test('pagination navigates to the next page', async ({ page, listing, cfg }) => {
    test.skip(!(await listing.pagination.isVisible()), 'Category fits on one page — no pagination');
    const next = page.locator(cfg.selectors.listing.paginationNext).locator('a, label').first();
    const firstPage = await listing.productNames();
    await Promise.all([page.waitForResponse(/\/widgets\/cms/), next.click()]);
    await expect(page).toHaveURL(/[?&]p=\d/);
    await expect.poll(() => listing.productNames()).not.toEqual(firstPage);
  });
});

test.describe('Sorting', () => {
  test.beforeEach(async ({ listing, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
  });

  test('offers the expected sorting options', { tag: '@smoke' }, async ({ listing, cfg }) => {
    const options = await listing.sortingOptions();
    for (const key of cfg.testData.expectedSortings) expect(options).toContain(key);
  });

  test('sorts by price ascending', async ({ listing, cfg }) => {
    test.fail(cfg.features.listingPriceSorting === false, 'known issue: listing shows other prices than sorting uses');
    await listing.sortBy(cfg.testData.priceSortings?.asc ?? 'price-asc');
    const prices = await listing.productPrices();
    expect(prices.length).toBeGreaterThan(1);
    expect(isSortedAsc(prices), `prices not ascending: ${prices.join(', ')}`).toBe(true);
  });

  test('sorts by price descending', async ({ listing, cfg }) => {
    test.fail(cfg.features.listingPriceSorting === false, 'known issue: listing shows other prices than sorting uses');
    await listing.sortBy(cfg.testData.priceSortings?.desc ?? 'price-desc');
    const prices = await listing.productPrices();
    expect(isSortedDesc(prices), `prices not descending: ${prices.join(', ')}`).toBe(true);
  });

  test('sorts by name A-Z and Z-A', async ({ listing }) => {
    const options = await listing.sortingOptions();
    test.skip(!options.includes('name-asc') || !options.includes('name-desc'), 'Shop offers no name sorting');
    await listing.sortBy('name-asc');
    const asc = await listing.productNames();
    await listing.sortBy('name-desc');
    const desc = await listing.productNames();
    expect(asc[0]).not.toEqual(desc[0]);
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    expect(collator.compare(asc[0], asc[asc.length - 1])).toBeLessThanOrEqual(0);
  });
});

test.describe('Filters', () => {
  test.beforeEach(async ({ listing, cfg }) => {
    skipUnless(cfg.features.listingFilters !== false, 'listingFilters');
    await listing.open(cfg.testData.listingCategoryPath);
  });

  test('expected filter types are available', { tag: '@smoke' }, async ({ listing, cfg }) => {
    await listing.ensureFilterPanelVisible();
    for (const type of cfg.testData.expectedFilterTypes) {
      await expect(listing.filterOfType(type).first(), `filter "${type}" missing`).toBeAttached();
    }
  });

  test('manufacturer filter narrows results and can be reset', { tag: '@mobile' }, async ({ page, listing, cfg }) => {
    test.skip(!cfg.testData.expectedFilterTypes.includes('manufacturer'), 'Shop has no manufacturer filter (testData.expectedFilterTypes)');
    const before = await listing.productBoxes.count();
    const label = await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    await expect(page).toHaveURL(/manufacturer=/);
    await expect(listing.activeFilters.first()).toContainText(label);
    expect(await listing.productBoxes.count()).toBeLessThanOrEqual(before);

    await listing.resetAllFilters();
    await expect(listing.activeFilters).toHaveCount(0);
  });

  test('property filter narrows results', async ({ page, listing }) => {
    await listing.applyMultiSelectFilter(listing.filterOfType('properties'));
    await expect(page).toHaveURL(/properties=/);
    await expect(listing.activeFilters).toHaveCount(1);
    await expect(listing.productBoxes.first()).toBeVisible();
  });

  test('manufacturer and property filters can be combined', async ({ page, listing, cfg }) => {
    test.skip(!cfg.testData.expectedFilterTypes.includes('manufacturer'), 'Shop has no manufacturer filter (testData.expectedFilterTypes)');
    await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    const afterFirst = await listing.productBoxes.count();
    await listing.applyMultiSelectFilter(listing.filterOfType('properties'));
    await expect(page).toHaveURL(/manufacturer=/);
    await expect(page).toHaveURL(/properties=/);
    await expect(listing.activeFilters).toHaveCount(2);
    expect(await listing.productBoxes.count()).toBeLessThanOrEqual(afterFirst);
  });

  test('price filter limits product prices', async ({ page, listing }) => {
    await listing.ensureFilterPanelVisible();
    test.skip(!(await listing.filterOfType('price').locator('visible=true').count()), 'Price filter is hidden in this shop');
    const prices = await listing.productPrices();
    const max = Math.ceil(prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]);
    await listing.applyPriceFilter(undefined, max);
    await expect(page).toHaveURL(/max-price=/);
    const filtered = await listing.productPrices();
    expect(filtered.every((p) => p <= max + 0.01), `prices above ${max}: ${filtered.join(', ')}`).toBe(true);
  });
});

test.describe('Listing edge cases', () => {
  test('price filter with min above max does not crash', async ({ page, cfg }) => {
    const res = await page.goto(`${cfg.testData.listingCategoryPath}?min-price=500&max-price=1`);
    expect(res?.status()).toBeLessThan(500);
    // either an (empty) listing or the "no products" notice is rendered
    // visible only: hidden flash messages can use the same .alert-info class
    await expect(page.locator(`${cfg.selectors.listing.root}, ${cfg.selectors.listing.emptyResult}`).locator('visible=true').first()).toBeVisible();
  });

  test('sorting survives a page reload', async ({ page, listing, cfg }) => {
    const desc = cfg.testData.priceSortings?.desc ?? 'price-desc';
    const key = cfg.testData.expectedSortings.find((k) => k === desc) ?? cfg.testData.expectedSortings[0];
    await listing.open(cfg.testData.listingCategoryPath);
    await listing.sortBy(key);
    await expect(page).toHaveURL(new RegExp(`order=${key}`));
    await page.reload();
    await expect(listing.sorting).toHaveValue(key);
  });
});
