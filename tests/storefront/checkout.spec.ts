import { test, expect, skipUnless } from '../../src/fixtures';
import { buildCustomer } from '../../src/data/customer';
import { orderQuantity } from '../../src/data/order';

test.describe('Checkout', () => {
  test('empty cart cannot proceed to checkout', { tag: '@smoke' }, async ({ page, cfg }) => {
    await page.goto(cfg.routes.checkoutConfirm);
    await expect(page).toHaveURL(new RegExp(cfg.routes.cart));
  });

  test('guest is asked to log in or register before confirm', { tag: '@smoke' }, async ({ page, cartHelper, cfg, auth }) => {
    await cartHelper.add(cfg.testData.simpleProduct);
    await page.goto(cfg.routes.checkoutConfirm);
    await expect(page).toHaveURL(new RegExp(cfg.routes.checkoutRegister));
    await expect(auth.registerForm).toBeVisible();
  });

  test('guest checkout places an order', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, cart, cartHelper, auth, checkout, requireWriteAccess }) => {
    void requireWriteAccess;
    skipUnless(cfg.features.guestCheckout, 'guestCheckout');
    skipUnless(cfg.features.placeOrder, 'placeOrder');

    await cartHelper.add(cfg.testData.simpleProduct, orderQuantity(cfg, 1));
    await cart.open();
    await cart.proceedToCheckout();
    await expect(page).toHaveURL(new RegExp(cfg.routes.checkoutRegister));

    await auth.register(buildCustomer(cfg, 'guestCheckout'), { guest: true });
    await checkout.expectOnConfirm();
    await expect(checkout.lineItems.filter({ hasText: cfg.testData.simpleProduct.name })).toHaveCount(1);

    await checkout.placeOrder();
    await expect(page.locator('body')).toHaveClass(/is-act-finishpage/);
    await expect(checkout.finishHeader).toBeVisible();
  });

  test('registered customer places an order and sees it in the account', { tag: '@smoke' }, async ({ loggedInPage: page, cfg, cartHelper, checkout, account }) => {
    skipUnless(cfg.features.placeOrder, 'placeOrder');
    await cartHelper.add(cfg.testData.simpleProduct, orderQuantity(cfg, 2));
    await checkout.openConfirm();
    await checkout.expectOnConfirm();
    await expect(page.locator(cfg.selectors.checkout.address).first()).toBeVisible();

    await checkout.placeOrder();
    await expect(checkout.finishHeader).toBeVisible();

    await account.openOrders();
    await expect(account.orders.first()).toBeVisible();
  });

  test('order cannot be placed without accepting terms', async ({ loggedInPage: page, cfg, cartHelper, checkout }) => {
    await cartHelper.add(cfg.testData.simpleProduct);
    await checkout.openConfirm();
    const tos = page.locator(cfg.selectors.checkout.tos);
    test.skip((await tos.count()) === 0, 'Shop has no TOS checkbox');
    // some payment plugins block the submit button until TOS is accepted
    const clicked = await checkout.submitButton.click({ timeout: 5_000 }).then(() => true, () => false);
    // Shopware rewrites the URL client-side (history API) without submitting — assert
    // we are still on the confirm page instead of matching the URL.
    await expect(page).not.toHaveURL(/\/checkout\/finish/);
    await expect(checkout.submitButton).toBeVisible();
    const s = cfg.selectors.checkout.tos;
    if (clicked) await expect(page.locator(`${s}:invalid, ${s}${cfg.selectors.page.invalidField}`)).toHaveCount(1);
  });

  test('confirm page lists payment and shipping methods', async ({ loggedInPage: page, cfg, cartHelper, checkout }) => {
    await cartHelper.add(cfg.testData.simpleProduct);
    await checkout.openConfirm();
    expect(await page.locator(cfg.selectors.checkout.paymentMethod).count()).toBeGreaterThan(0);
    expect(await page.locator(cfg.selectors.checkout.shippingMethod).count()).toBeGreaterThan(0);
    await expect(page.locator(`${cfg.selectors.checkout.paymentMethod}:checked`)).toHaveCount(1);
  });
});
