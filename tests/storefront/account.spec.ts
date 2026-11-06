import { test, expect } from '../../src/fixtures';
import { flowLastName, uniqueEmail, type Flow } from '../../src/data/customer';
import type { ResolvedConfig } from '../../src/config/types';

test.describe('Customer account', () => {
  test('overview shows account navigation', { tag: ['@smoke', '@mobile'] }, async ({ loggedInPage: page, account, cfg }) => {
    await account.open();
    // account sidebar is collapsed on mobile → check it is rendered, not visible
    await expect(page.locator(cfg.selectors.account.aside).first()).toBeAttached();
    expect(await account.asideItems.count()).toBeGreaterThanOrEqual(3);
  });

  test('profile name can be changed', async ({ loggedInPage: page, account, cfg }) => {
    await account.openProfile();
    const { firstName } = cfg.testData.customer;
    await account.updateName(firstName, flowLastName('profileChange'));
    if (cfg.selectors.account.profileSuccess !== 'none') await expect(account.successAlert).toBeVisible();
    await page.reload();
    await expect(page.locator(cfg.selectors.account.profileLastName)).toHaveValue(flowLastName('profileChange'));
  });

  test('addresses page lists the default address', async ({ loggedInPage: page, account, customer }) => {
    await account.openAddresses();
    await expect(page.getByText(customer.address.street).first()).toBeVisible();
  });

  test('orders page is reachable', async ({ loggedInPage: _page, account }) => {
    await account.openOrders();
  });
});

test.describe('Customer account (logged out)', () => {
  test.use({ guest: true });

  test('account pages require login', { tag: '@smoke' }, async ({ page, cfg }) => {
    for (const path of [cfg.routes.account, cfg.routes.accountProfile, cfg.routes.accountOrders, cfg.routes.accountAddresses]) {
      await page.goto(path);
      await expect(page, `${path} should redirect to login`).toHaveURL(new RegExp(cfg.routes.login));
    }
  });
});

test.describe('Address book', () => {
  /** Address of the test identity with a flow-specific last name and street suffix. */
  const testAddress = (cfg: ResolvedConfig, flow: Flow, unit: string) => {
    const c = cfg.testData.customer;
    return { ...c.address, firstName: c.firstName, lastName: flowLastName(flow), company: c.company, street: `${c.address.street} ${unit}` };
  };

  test('new address can be added', async ({ loggedInPage: _page, account, cfg }) => {
    const address = testAddress(cfg, 'addressAdd', 'Unit 2');
    await account.openNewAddress();
    await account.saveAddress(address);
    await expect(account.addressCard(address.street).first()).toContainText(address.lastName);
  });

  test('address can be edited', async ({ loggedInPage: _page, account, cfg }) => {
    const original = testAddress(cfg, 'addressEdit', 'Unit 3');
    const edited = { ...original, street: `${cfg.testData.customer.address.street} Unit 4` };
    await account.openNewAddress();
    await account.saveAddress(original);
    await account.openEditAddress(original.street);
    await account.saveAddress(edited);
    await expect(account.addressCard(edited.street).first()).toBeVisible();
    await expect(account.addressCard(original.street)).toHaveCount(0);
  });
});

test.describe('Login data', () => {
  // these change the customer's password / e-mail → not the worker's shared customer
  test.use({ freshCustomer: true });

  test('password can be changed', async ({ loggedInPage: _page, account, auth, customer }) => {
    const newPassword = `${customer.password}-Changed1`;
    await account.changePassword(newPassword, customer.password);
    await account.logout();

    await auth.open();
    await auth.login(customer.email, customer.password);
    await expect(auth.loginError).toBeVisible();
    await auth.open();
    await auth.loginAndExpectSuccess(customer.email, newPassword);
  });

  test('password change with a wrong current password is rejected', async ({ loggedInPage: _page, account, auth, customer }) => {
    await account.changePassword(`${customer.password}-Changed1`, `${customer.password}-Wrong`);
    await account.logout();

    await auth.open();
    await auth.loginAndExpectSuccess(customer.email, customer.password);
  });

  test('e-mail address can be changed', async ({ loggedInPage: _page, account, auth, customer, cfg, adminApi }) => {
    // same prefix as all test customers → the cleanup teardown finds it as well
    test.skip(cfg.features.emailChange === false, 'Shop offers no e-mail change in the account (features.emailChange)');
    const newEmail = uniqueEmail(cfg, 'emailChange');
    try {
      await account.changeEmail(newEmail, customer.password);
      await account.logout();

      await auth.open();
      await auth.loginAndExpectSuccess(newEmail, customer.password);
    } finally {
      if (cfg.env.cleanupTestData && adminApi) await adminApi.deleteCustomerByEmail(newEmail).catch(() => undefined);
    }
  });
});

test.describe('Password recovery', () => {
  test.use({ guest: true });
  // the form is never submitted with a real address: that would send a reset e-mail
  test('login page links to the password recovery form', async ({ page, auth, account, cfg }) => {
    await auth.open();
    await auth.clickAndLoad(page.locator(cfg.selectors.recover.link).locator('visible=true').first());
    await expect(page).toHaveURL(new RegExp(cfg.routes.accountRecover));
    await expect(account.recoverForm).toBeVisible();
  });

  test('empty recovery form is not submitted', async ({ page, account, cfg }) => {
    await page.goto(cfg.routes.accountRecover);
    const form = account.recoverForm;
    const email = form.locator(cfg.selectors.recover.email);
    await form.locator(cfg.selectors.recover.submit).first().click();
    await expect(page).toHaveURL(new RegExp(`${cfg.routes.accountRecover}(\\?.*)?$`));
    expect(await email.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
  });
});

test.describe('Account edge cases', () => {
  test('after logout the back button does not reveal account pages', async ({ loggedInPage: page, account, cfg }) => {
    await account.openProfile();
    await account.logout();
    await page.goBack();
    // the browser may show a cached copy → a reload must ask the server again
    await page.reload();
    await expect(page).toHaveURL(new RegExp(cfg.routes.login));
  });

  test('session is shared with a second tab', async ({ loggedInPage: page, cfg }) => {
    const tab = await page.context().newPage();
    await tab.goto(cfg.routes.account);
    await expect(tab).toHaveURL(new RegExp(`${cfg.routes.account}(\\?.*)?$`));
    await tab.close();
  });
});
