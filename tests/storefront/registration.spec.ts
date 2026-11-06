import { test, expect, skipUnless } from '../../src/fixtures';
import { buildCustomer, CUSTOMER_CREATE_TIMEOUT } from '../../src/data/customer';

// login-required shops: registration is only reachable logged out
test.use({ guest: true });

test.describe('Customer registration', () => {
  test.beforeEach(async ({ cfg, auth }) => {
    skipUnless(cfg.features.registration, 'registration');
    await auth.openRegister();
  });

  test('new customer can register', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, auth, adminApi, requireWriteAccess }) => {
    void requireWriteAccess;
    test.setTimeout(test.info().timeout + CUSTOMER_CREATE_TIMEOUT);
    const customer = buildCustomer(cfg, 'registration');
    await auth.register(customer);

    if (cfg.features.doubleOptInRegistration) {
      await expect(page.locator(cfg.selectors.page.alertSuccess).first()).toBeVisible();
    } else {
      await expect(page).toHaveURL(new RegExp(`${cfg.routes.account}(\\?.*)?$`));
      // account sidebar is collapsed on mobile → check it is rendered, not visible
      await expect(page.locator(cfg.selectors.account.aside).first()).toBeAttached();
    }
    if (adminApi && cfg.env.cleanupTestData) await adminApi.deleteCustomerByEmail(customer.email);
  });

  test('empty form shows validation errors', { tag: '@smoke' }, async ({ page, cfg, auth }) => {
    await auth.submitRegistration();
    await expect(auth.validationErrors.first()).toBeVisible();
    // server-side validation re-renders the form on /account/register
    await expect(page).toHaveURL(/\/account\/(login|register)/);
    void cfg;
  });

  test('invalid e-mail is rejected', async ({ cfg, auth }) => {
    await auth.fillRegistration(buildCustomer(cfg, 'registrationInvalid', { email: 'not-an-email' }));
    await auth.submitRegistration();
    await expect(auth.registerForm.locator(`${cfg.selectors.register.email}${cfg.selectors.page.invalidField}`).or(auth.validationErrors).first()).toBeVisible();
  });

  test('too short password is rejected', async ({ cfg, auth }) => {
    await auth.fillRegistration(buildCustomer(cfg, 'registrationInvalid', { password: '123' }));
    await auth.submitRegistration();
    await expect(auth.registerForm.locator(`${cfg.selectors.register.password}${cfg.selectors.page.invalidField}`).or(auth.validationErrors).first()).toBeVisible();
  });

  test('already registered e-mail is rejected', async ({ page, cfg, auth, customer }) => {
    await auth.register(buildCustomer(cfg, 'registrationInvalid', { email: customer.email }));
    await expect(page).toHaveURL(/\/account\/(login|register)/);
    await expect(page.locator(`${cfg.selectors.page.alertDanger}, ${cfg.selectors.page.invalidFeedback}`).locator('visible=true').first()).toBeVisible();
  });
});

test.describe('Registration edge cases', () => {
  test('mismatching password confirmation is rejected', async ({ page, cfg, auth, adminApi, requireWriteAccess }) => {
    void requireWriteAccess;
    skipUnless(cfg.features.registration, 'registration');
    await auth.openRegister();
    const confirmation = auth.registerForm.locator(cfg.selectors.register.passwordConfirmation);
    test.skip(!(await confirmation.isVisible()), 'registration form has no password confirmation');
    const customer = buildCustomer(cfg, 'passwordMismatch');
    // all other fields first, then both passwords last, then Register right away
    await auth.fillRegistration(customer, { skipPasswords: true });
    await auth.registerForm.locator(cfg.selectors.register.password).fill(customer.password);
    await confirmation.fill(`${customer.password}-mismatch`);
    try {
      await auth.submitRegistration();
      await expect(page).toHaveURL(/\/account\/(login|register)/);
      await expect(auth.validationErrors.first()).toBeVisible();
    } finally {
      // only exists if the shop wrongly accepted the form
      if (adminApi && cfg.env.cleanupTestData) await adminApi.deleteCustomerByEmail(customer.email).catch(() => undefined);
    }
  });
});
