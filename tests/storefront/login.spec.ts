import { test, expect } from '../../src/fixtures';
import { uniqueEmail } from '../../src/data/customer';

// these tests log in (or fail to) themselves → start logged out, also on login-required shops
test.use({ guest: true });

test.describe('Login / logout', () => {
  test('customer can log in and log out', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, auth, account, customer }) => {
    await auth.open();
    await auth.loginAndExpectSuccess(customer.email, customer.password);
    await expect(page).toHaveURL(new RegExp(`${cfg.routes.account}(\\?.*)?$`));

    await account.logout();
    await page.goto(cfg.routes.account);
    await expect(page).toHaveURL(new RegExp(cfg.routes.login));
  });

  test('wrong password shows an error', { tag: '@smoke' }, async ({ page, cfg, auth, customer }) => {
    await auth.open();
    await auth.login(customer.email, 'wrong-password-123');
    await expect(page).toHaveURL(new RegExp(cfg.routes.login));
    await expect(auth.loginError).toBeVisible();
  });

  test('unknown user shows an error', async ({ page, cfg, auth }) => {
    await auth.open();
    await auth.login(uniqueEmail(cfg, 'unknownUser'), 'whatever-123');
    await expect(page).toHaveURL(new RegExp(cfg.routes.login));
    await expect(auth.loginError).toBeVisible();
  });

  test('account menu in header offers login', async ({ page, cfg, header }) => {
    const res = await page.goto(cfg.routes.home);
    // evidence for cache issues (a guest served a cached logged-in page): keep the response headers in the report
    const h = res?.headers() ?? {};
    await test.info().attach('homepage response headers', {
      contentType: 'application/json',
      body: JSON.stringify({
        path: res ? new URL(res.url()).pathname : undefined,
        status: res?.status(),
        'x-symfony-cache': h['x-symfony-cache'],
        age: h['age'],
        'cache-control': h['cache-control'],
        'set-cookie (names)': (h['set-cookie'] ?? '').split('\n').map((c) => c.split('=')[0]).filter(Boolean),
      }, null, 2),
    });
    if (cfg.features.guestAccountDropdown === false) {
      // theme links the account icon straight to the login page
      await Promise.all([page.waitForURL(new RegExp(cfg.routes.login)), header.accountButton.click()]);
      return;
    }
    const dd = await header.openAccountMenu();
    await expect(dd.locator(cfg.selectors.header.accountLoginLink).first()).toBeVisible();
  });

  test('logged-in header menu offers logout', async ({ loggedInPage: page, cfg, header }) => {
    await page.goto(cfg.routes.home);
    const dd = await header.openAccountMenu();
    await expect(dd.locator(cfg.selectors.header.accountLogoutLink).first()).toBeVisible();
  });

  test('cart is kept after login', async ({ page, cfg, auth, cart, cartHelper, customer }) => {
    await cartHelper.add(cfg.testData.simpleProduct);
    await auth.open();
    await auth.loginAndExpectSuccess(customer.email, customer.password);
    await cart.open();
    await expect(cart.lineItem(cfg.testData.simpleProduct.name)).toBeVisible();
    void page;
  });
});

test.describe('Login edge cases', () => {
  test('empty login form is not submitted', async ({ page, cfg, auth }) => {
    await auth.open();
    await auth.login('', '');
    await expect(page).toHaveURL(new RegExp(cfg.routes.login));
    await expect(auth.loginForm.locator('input:invalid').or(auth.loginError).first()).toBeVisible();
  });

  test('e-mail is matched case-insensitively', async ({ auth, customer }) => {
    await auth.open();
    await auth.loginAndExpectSuccess(customer.email.toUpperCase(), customer.password);
  });

  test('password is case-sensitive', async ({ page, cfg, auth, customer }) => {
    const swapped = [...customer.password].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('');
    test.skip(swapped === customer.password, 'password has no letters');
    await auth.open();
    await auth.login(customer.email, swapped);
    await expect(page).toHaveURL(new RegExp(cfg.routes.login));
    await expect(auth.loginError).toBeVisible();
  });
});
