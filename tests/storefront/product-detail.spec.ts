import { test, expect, skipUnless } from '../../src/fixtures';

test.describe('Product detail page', () => {
  test('shows core product information', { tag: ['@smoke', '@mobile'] }, async ({ product, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    const s = cfg.selectors.product;
    await expect(product.name).toHaveText(p.name);
    expect(await product.productNumberValue()).toContain(p.productNumber);
    expect(await product.priceValue()).toBeGreaterThan(0);
    await expect(product.buyButton).toBeEnabled();
    await expect(product.page.locator(s.gallery).first()).toBeVisible();
    // '' = shop shows no tax notice on the PDP (e.g. US prices are net)
    if (s.tax) await expect(product.page.locator(s.tax).first()).toBeVisible();
    if (s.delivery) await expect(product.page.locator(s.delivery).first()).toBeVisible();
    await expect(product.page.locator(s.description).first()).toBeAttached();
  });

  test('has product structured data / canonical link', async ({ product, cfg, page }) => {
    await product.open(cfg.testData.simpleProduct);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('[itemtype*="schema.org/Product"], script[type="application/ld+json"]').first()).toBeAttached();
  });

  test('variant switch updates product number and URL', { tag: '@smoke' }, async ({ product, cfg, page }) => {
    const v = cfg.testData.variantProduct;
    if (!v) return test.skip(true, 'Shop sells no variant products');
    await product.open(v);
    await expect(product.configuratorGroups).toHaveCount(v.optionGroups.length);
    const { before, after } = await product.switchVariant(v.optionGroups.length - 1);
    expect(after).not.toEqual(before);
    // link-style variant pickers may swap the buy box in place without changing the URL
    // SEO URLs may write the number lower-case with separators as '-' (e.g. 'AB_12/M' → 'ab-12-m')
    const numberInUrl = new RegExp(after.split(/[^a-z0-9]+/i).filter(Boolean).join('[^a-z0-9]+'), 'i');
    if (!cfg.selectors.product.variantOptionLink) await expect(page).toHaveURL(numberInUrl);
  });

  test('breadcrumb links back to the category', async ({ product, cfg, page }) => {
    await product.open(cfg.testData.variantProduct ?? cfg.testData.simpleProduct);
    const crumb = page.locator(`${cfg.selectors.page.breadcrumb} a`).first();
    await expect(crumb).toBeVisible();
    await Promise.all([page.waitForLoadState('domcontentloaded'), crumb.click()]);
    await expect(page.locator('body')).toHaveClass(/is-ctl-navigation/);
  });

  test('reviews tab/teaser is present', async ({ product, cfg }) => {
    skipUnless(cfg.features.productReviews, 'productReviews');
    await product.open(cfg.testData.simpleProduct);
    await expect(product.page.locator(cfg.selectors.product.reviewTeaser).first()).toBeAttached();
  });

  test('quantity stepper increases and decreases, not below the minimum', async ({ product, cfg }) => {
    test.skip(!!cfg.features.productOrderTable, 'Order table has plain quantity fields, no stepper');
    await product.open(cfg.testData.simpleProduct);
    const min = Number(await product.quantity.inputValue());
    await product.quantityPlus.click();
    await expect(product.quantity).toHaveValue(String(min + 1));
    await product.quantityMinus.click();
    await expect(product.quantity).toHaveValue(String(min));
    await product.quantityMinus.click();
    await expect(product.quantity).toHaveValue(String(min));
  });

  test('cross-selling products link to their detail pages', async ({ product, cfg, page }) => {
    await product.open(cfg.testData.simpleProduct);
    const box = product.crossSellingProducts.first();
    test.skip(!(await box.count()), 'Test product has no cross-selling products');
    const link = box.locator(cfg.selectors.listing.productName).first();
    await expect(link).not.toBeEmpty();
    await product.clickAndLoad(link);
    await expect(page).not.toHaveURL(new RegExp(`${cfg.testData.simpleProduct.path}$`));
    await expect(product.name).toBeVisible();
  });

  test('unknown product URL returns 404', async ({ page, cfg }) => {
    const res = await page.goto('/this-product-does-not-exist-e2e/XX-000');
    expect(res?.status()).toBe(404);
    if (cfg.features.themedErrorPages !== false) await expect(page.locator(cfg.selectors.error.body)).toBeAttached();
  });
});

test.describe('Product detail edge cases', () => {
  test('unknown query parameters do not break the product page', async ({ page, product, cfg }) => {
    const res = await page.goto(`${cfg.testData.simpleProduct.path}?variant=does-not-exist&utm_source=e2e&foo[]=bar`);
    expect(res?.status()).toBeLessThan(500);
    await expect(product.name).toBeVisible();
  });
});
