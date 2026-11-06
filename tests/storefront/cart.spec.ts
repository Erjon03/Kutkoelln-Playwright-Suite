import { test, expect } from '../../src/fixtures';
import { CartPage } from '../../src/pages/CartPage';

test.describe('Cart', () => {
  test('add product from detail page opens off-canvas cart', { tag: ['@smoke', '@mobile'] }, async ({ page, product, offcanvasCart, cart, header, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    const price = await product.priceValue();
    await product.addToCart();

    // order table: after "add all" the theme clicks the header cart button, which opens the cart page on mobile
    if (cfg.features.offcanvasCart === false) {
      // no off-canvas cart in this theme: the product must be on the cart page
      await cart.open();
      await expect(cart.lineItem(p.name)).toBeVisible();
    } else if (cfg.features.productOrderTable && (await page.waitForURL(new RegExp(cfg.routes.cart), { timeout: 3_000 }).then(() => true, () => false))) {
      await expect(cart.lineItem(p.name)).toBeVisible();
    } else {
      await offcanvasCart.expectOpen();
      await expect(offcanvasCart.lineItem(p.name)).toBeVisible();
    }

    // header widget refreshes asynchronously / on next page load → verify after reload
    // automatic cart promotions (e.g. a sitewide sale) can lower the total below the PDP price
    await product.page.reload();
    await expect.poll(() => header.cartTotal()).toBeGreaterThan(0);
    expect(await header.cartTotal()).toBeLessThanOrEqual(price + 0.001);
  });

  test('add product from listing', async ({ listing, product, offcanvasCart, cart, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
    const idx = await listing.firstBuyableIndex();
    let name: string;
    if (idx >= 0) {
      name = await listing.addToCartFromListing(idx);
    } else {
      // listing has no buy buttons → open products from the listing until one can be bought on its
      // detail page (bundles / out-of-stock products render a disabled buy button)
      const count = await listing.productBoxes.count();
      let found = false;
      name = '';
      for (let i = 0; i < count && !found; i++) {
        if (!(await listing.productBoxes.nth(i).locator(cfg.selectors.listing.productPrice).count())) continue;
        name = await listing.openProduct(i);
        found = await product.buyButton.isEnabled();
        if (!found) await listing.open(cfg.testData.listingCategoryPath);
      }
      test.skip(!found, 'No purchasable product on listing');
      await product.addToCart();
    }
    if (cfg.features.offcanvasCart === false) {
      await cart.open();
      await expect(cart.lineItem(name)).toBeVisible();
    } else {
      await offcanvasCart.expectOpen();
      await expect(offcanvasCart.lineItem(name)).toBeVisible();
    }
  });

  test('add with quantity > 1 from detail page', async ({ product, cart, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    await product.addToCart(3);
    await cart.open();
    expect(await cart.quantityOf(p.name)).toBe(3);
  });

  test('update quantity in off-canvas cart', async ({ product, offcanvasCart, cfg }) => {
    test.skip(cfg.features.offcanvasCart === false, 'Shop has no off-canvas cart (features.offcanvasCart) — covered by the cart page tests');
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    await product.addToCart();
    await offcanvasCart.increaseQuantity(p.name);
    await expect(offcanvasCart.lineItem(p.name).locator(cfg.selectors.offcanvasCart.quantityInput)).toHaveValue('2');
  });

  test('update quantity on cart page recalculates total', { tag: '@smoke' }, async ({ cart, cartHelper, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cart.open();
    const single = await cart.totalValue();
    await cart.setQuantity(p.name, 2);
    expect(await cart.quantityOf(p.name)).toBe(2);
    await expect.poll(() => cart.totalValue()).toBeGreaterThan(single);
  });

  test('remove product from cart page', { tag: '@smoke' }, async ({ cart, cartHelper, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cart.open();
    await expect(cart.lineItem(p.name)).toBeVisible();
    await cart.remove(p.name);
    await cart.expectEmpty();
  });

  test('remove product from off-canvas cart', async ({ product, offcanvasCart, cfg }) => {
    test.skip(cfg.features.offcanvasCart === false, 'Shop has no off-canvas cart (features.offcanvasCart) — covered by the cart page tests');
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    await product.addToCart();
    await offcanvasCart.remove(p.name);
    await expect(offcanvasCart.lineItems).toHaveCount(0);
  });

  test('cart persists across page navigation', async ({ page, cart, cartHelper, header, cfg }) => {
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await page.goto(cfg.testData.listingCategoryPath);
    await expect.poll(() => header.cartTotal()).toBeGreaterThan(0);
    await cart.open();
    await expect(cart.lineItems).toHaveCount(1);
  });

  test('invalid promotion code is rejected', async ({ page, cart, cartHelper, cfg }) => {
    test.skip(!cfg.features.promotionCodes, 'promotion codes disabled');
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await cart.open();
    await cart.applyPromotion('E2E-INVALID-CODE-4711');
    await expect(page.locator(`${cfg.selectors.page.alertDanger}, .alert-warning`).first()).toBeVisible();
  });

  test('valid promotion code reduces total', async ({ cart, cartHelper, cfg }) => {
    const code = cfg.testData.promotionCode;
    test.skip(!cfg.features.promotionCodes || !code, 'No promotion code configured');
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await cart.open();
    const before = await cart.totalValue();
    await cart.applyPromotion(code!);
    await expect.poll(() => cart.totalValue()).toBeLessThan(before);
  });
});

test.describe('Cart edge cases', () => {
  test('adding the same product twice merges into one line item', async ({ cart, cartHelper, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cartHelper.add(p, 1);
    await cart.open();
    await expect(cart.lineItems).toHaveCount(1);
    expect(await cart.quantityOf(p.name)).toBe(2);
  });

  test('quantity above the maximum is capped', async ({ cart, cartHelper, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cart.open();
    await cart.setQuantity(p.name, 9999);
    // Shopware clamps to the max purchase quantity / stock instead of taking the value as is
    const qty = await cart.quantityOf(p.name);
    expect(qty).toBeGreaterThanOrEqual(1);
    expect(qty).toBeLessThan(9999);
  });

  test('quantity 0 does not leave a zero-quantity line item', async ({ page, cart, cartHelper, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cart.open();
    const input = cart.lineItem(p.name).locator(cfg.selectors.cart.quantityInput);
    await input.fill('0');
    // let the quantity change request finish, otherwise it can abort the next page load
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/checkout/line-item/'), { timeout: 10_000 }).catch(() => undefined),
      input.press('Enter'),
    ]);
    await page.waitForLoadState('load');
    await cart.open();
    // either the item is removed or the quantity is reset to the minimum
    if (await cart.lineItems.count()) expect(await cart.quantityOf(p.name)).toBeGreaterThanOrEqual(1);
  });

  test('negative quantity sent to add-to-cart is not accepted', async ({ page, cart, storeApi, cfg }) => {
    test.skip(!storeApi, 'Store API access needed to resolve the product id');
    const p = cfg.testData.simpleProduct;
    const id = await storeApi!.productIdByNumber(p.productNumber);
    await page.goto(cfg.routes.home);
    const res = await page.request.post('/checkout/line-item/add', {
      form: {
        [`lineItems[${id}][id]`]: id,
        [`lineItems[${id}][referencedId]`]: id,
        [`lineItems[${id}][type]`]: 'product',
        [`lineItems[${id}][quantity]`]: '-5',
      },
    });
    expect(res.status()).toBeLessThan(500);
    await cart.open();
    if (await cart.lineItems.count()) expect(await cart.quantityOf(p.name)).toBeGreaterThanOrEqual(1);
  });

  test('empty cart shows a notice and no checkout button', async ({ page, cart, cfg }) => {
    await cart.open();
    await cart.expectEmpty();
    await expect(page.locator(cfg.selectors.cart.empty).first()).toBeVisible();
    await expect(cart.checkoutButton).toBeHidden();
  });

  test('cart is not shared between visitors', async ({ browser, cartHelper, cfg }) => {
    test.skip(!!cfg.features.loginRequired, 'Login-required shop: a second visitor cannot open the cart as a guest');
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    // second visitor: fresh browser context, no shared cookies
    const other = await browser.newContext({ baseURL: cfg.baseURL, httpCredentials: cfg.env.httpCredentials });
    try {
      const otherCart = new CartPage(await other.newPage(), cfg);
      await otherCart.open();
      await otherCart.expectEmpty();
    } finally {
      await other.close();
    }
  });
});
