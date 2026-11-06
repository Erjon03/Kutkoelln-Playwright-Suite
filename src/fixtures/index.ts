import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { loadConfig, hasAdminCredentials } from '../config/loader';
import type { ResolvedConfig } from '../config/types';
import { AdminApiClient } from '../api/AdminApiClient';
import { StoreApiClient } from '../api/StoreApiClient';
import { buildCustomer, CUSTOMER_CREATE_TIMEOUT, type Flow, type TestCustomer } from '../data/customer';
import { Header } from '../components/Header';
import { MainNavigation } from '../components/MainNavigation';
import { CookieBanner } from '../components/CookieBanner';
import { OffcanvasCart } from '../components/OffcanvasCart';
import { ListingPage } from '../pages/ListingPage';
import { ProductPage } from '../pages/ProductPage';
import { CartPage } from '../pages/CartPage';
import { AuthPage } from '../pages/AuthPage';
import { AccountPage } from '../pages/AccountPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { ContactPage } from '../pages/ContactPage';

/** Applies the profile's browser preset (age gate storage, cookies, blocked popup scripts). */
/**
 * Staging environments in debug mode show the Symfony web debug toolbar fixed at the bottom of every page. It never
 * exists for real visitors but covers bottom elements (cookie banner buttons, sticky buy boxes) → hidden in tests.
 */
async function hideDebugToolbar(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const style = () => {
      const el = document.createElement('style');
      el.textContent = '.sf-toolbar, .sf-minitoolbar, [id^="sfwdt"] { display: none !important; }';
      document.head.appendChild(el);
    };
    if (document.head) style();
    else document.addEventListener('DOMContentLoaded', style);
  });
}

async function applyPreset(context: BrowserContext, cfg: ResolvedConfig): Promise<void> {
  const preset = cfg.preset;
  if (!preset) return;
  const { hostname, origin } = new URL(cfg.baseURL);
  if (preset.cookies) {
    await context.addCookies(
      Object.entries(preset.cookies).map(([name, value]) => ({ name, value, domain: hostname, path: '/', sameSite: 'Lax' as const })),
    );
  }
  if (preset.localStorage) {
    await context.addInitScript(
      ({ origin, entries }) => {
        if (location.origin !== origin) return;
        for (const [k, v] of entries) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
      },
      { origin, entries: Object.entries(preset.localStorage) },
    );
  }
  for (const pattern of preset.blockUrls ?? []) await context.route(pattern, (route) => route.abort());
}

/** Fast storefront cart setup through the storefront's own form endpoint (shares the browser session). */
export class CartHelper {
  constructor(
    private readonly page: Page,
    private readonly cfg: ResolvedConfig,
    private readonly storeApi: StoreApiClient | null,
  ) {}

  /** Adds a product by product number. Falls back to the UI (PDP) if Store API is unavailable. */
  async add(product = this.cfg.testData.simpleProduct, quantity = 1): Promise<void> {
    if (!this.storeApi) {
      const pdp = new ProductPage(this.page, this.cfg);
      await pdp.open(product);
      await pdp.addToCart(quantity);
      return;
    }
    const id = await this.storeApi.productIdByNumber(product.productNumber);
    const res = await this.page.request.post('/checkout/line-item/add', {
      form: {
        redirectTo: 'frontend.cart.offcanvas',
        [`lineItems[${id}][id]`]: id,
        [`lineItems[${id}][referencedId]`]: id,
        [`lineItems[${id}][type]`]: 'product',
        [`lineItems[${id}][quantity]`]: String(quantity),
        [`lineItems[${id}][stackable]`]: '1',
        [`lineItems[${id}][removable]`]: '1',
      },
    });
    expect(res.ok(), `add to cart via request failed: ${res.status()}`).toBeTruthy();
  }
}

type WorkerFixtures = {
  cfg: ResolvedConfig;
  adminApi: AdminApiClient | null;
  storeApi: StoreApiClient | null;
  /** The worker's shared test customer (see `customer` / `freshCustomer`). */
  workerCustomer: WorkerCustomer;
};

type TestFixtures = {
  /** Set false via test.use({ acceptCookies: false }) to see the cookie banner. */
  acceptCookies: boolean;
  /** Login-required shops (features.loginRequired): test.use({ guest: true }) keeps the browser logged out. */
  guest: boolean;
  /**
   * Set true via test.use({ freshCustomer: true }) for tests that change the customer's login data
   * (password, e-mail): they get their own customer instead of the worker's shared one.
   */
  freshCustomer: boolean;
  /** Login-required shops: the customer the browser is logged in as before the test starts; null elsewhere. */
  sessionCustomer: TestCustomer | null;
  header: Header;
  navigation: MainNavigation;
  cookieBanner: CookieBanner;
  offcanvasCart: OffcanvasCart;
  listing: ListingPage;
  product: ProductPage;
  cart: CartPage;
  auth: AuthPage;
  account: AccountPage;
  checkout: CheckoutPage;
  contact: ContactPage;
  cartHelper: CartHelper;
  /**
   * A registered customer: the worker's shared one (cart + wishlist emptied before logged-in tests),
   * or with freshCustomer a new one that is deleted afterwards if cleanup is on.
   */
  customer: TestCustomer;
  /** The page, logged in as `customer`. */
  loggedInPage: Page;
  /** Skips the test when ALLOW_WRITE_TESTS=false (production-safe runs). */
  requireWriteAccess: void;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // ---------- worker scoped (shared by all tests of a worker) ----------
  cfg: [async ({}, use) => use(loadConfig()), { scope: 'worker' }],

  adminApi: [
    async ({ cfg }, use) => {
      if (!hasAdminCredentials(cfg)) return use(null);
      const client = await AdminApiClient.create(cfg);
      await use(client);
      await client.dispose();
    },
    { scope: 'worker' },
  ],

  storeApi: [
    async ({ cfg, adminApi }, use) => {
      let key = cfg.env.accessKey;
      if (!key && adminApi) key = await adminApi.resolveAccessKey(cfg.baseURL).catch(() => undefined);
      if (!key) return use(null);
      const client = await StoreApiClient.create(cfg, key);
      await use(client);
      await client.dispose();
    },
    { scope: 'worker' },
  ],

  workerCustomer: [
    async ({ cfg, storeApi, adminApi, browser }, use) => {
      const shared = new WorkerCustomer(() => createCustomer(cfg, storeApi, adminApi, browser));
      await use(shared);
      const customer = await shared.created();
      if (customer && cfg.env.cleanupTestData && adminApi) await adminApi.deleteCustomerByEmail(customer.email).catch(() => undefined);
    },
    { scope: 'worker' },
  ],

  // ---------- test scoped ----------
  acceptCookies: [true, { option: true }],
  guest: [false, { option: true }],

  context: async ({ context, cfg, acceptCookies }, use) => {
    if (acceptCookies && cfg.features.cookieBanner) await CookieBanner.preAccept(context, cfg.baseURL);
    await applyPreset(context, cfg);
    await hideDebugToolbar(context);
    await use(context);
  },

  header: async ({ page, cfg }, use) => use(new Header(page, cfg)),
  navigation: async ({ page, cfg }, use) => use(new MainNavigation(page, cfg)),
  cookieBanner: async ({ page, cfg }, use) => use(new CookieBanner(page, cfg)),
  offcanvasCart: async ({ page, cfg }, use) => use(new OffcanvasCart(page, cfg)),
  listing: async ({ page, cfg }, use) => use(new ListingPage(page, cfg)),
  product: async ({ page, cfg }, use) => use(new ProductPage(page, cfg)),
  cart: async ({ page, cfg }, use) => use(new CartPage(page, cfg)),
  auth: async ({ page, cfg }, use) => use(new AuthPage(page, cfg)),
  account: async ({ page, cfg }, use) => use(new AccountPage(page, cfg)),
  checkout: async ({ page, cfg }, use) => use(new CheckoutPage(page, cfg)),
  contact: async ({ page, cfg }, use) => use(new ContactPage(page, cfg)),
  cartHelper: async ({ page, cfg, storeApi }, use) => use(new CartHelper(page, cfg, storeApi)),

  requireWriteAccess: async ({ cfg }, use) => {
    test.skip(!cfg.env.allowWriteTests, 'Write tests disabled (ALLOW_WRITE_TESTS=false)');
    await use();
  },

  freshCustomer: [false, { option: true }],

  sessionCustomer: [
    async ({ cfg, guest, context, storeApi, adminApi, browser, freshCustomer, workerCustomer }, use) => {
      if (!cfg.features.loginRequired || guest) return use(null);
      const fresh = freshCustomer ? await createFreshCustomer(cfg, storeApi, adminApi, browser) : null;
      const customer = fresh ?? (await workerCustomer.get());
      if (!fresh) await storeApi?.resetCustomer(customer);
      // log in through the storefront form endpoint: the context's pages share the session cookie.
      // Without the form's redirectTo the shop answers 200 without logging in → send it like the form does.
      const res = await context.request.post(cfg.routes.login, {
        form: { username: customer.email, password: customer.password, redirectTo: 'frontend.account.home.page', redirectParameters: '[]' },
        maxRedirects: 0,
      });
      const location = res.headers()['location'] ?? '';
      expect(res.status() === 302 && !location.includes(cfg.routes.login), `login of ${customer.email} failed (${res.status()} ${location})`).toBe(true);
      await use(customer);
      if (fresh && cfg.env.cleanupTestData && adminApi) await adminApi.deleteCustomerByEmail(fresh.email).catch(() => undefined);
    },
    { auto: true },
  ],

  customer: async ({ cfg, storeApi, adminApi, browser, requireWriteAccess, sessionCustomer, freshCustomer, workerCustomer }, use) => {
    void requireWriteAccess;
    // login-required shop: the browser is already logged in as this test's customer
    if (sessionCustomer) return use(sessionCustomer);
    if (!freshCustomer) return use(await workerCustomer.get());
    const customer = await createFreshCustomer(cfg, storeApi, adminApi, browser);
    await use(customer);
    if (cfg.env.cleanupTestData && adminApi) {
      await adminApi.deleteCustomerByEmail(customer.email).catch(() => undefined);
    }
  },

  loggedInPage: async ({ page, auth, customer, sessionCustomer, freshCustomer, storeApi }, use) => {
    if (!sessionCustomer) {
      if (!freshCustomer) await storeApi?.resetCustomer(customer);
      await auth.open();
      await auth.loginAndExpectSuccess(customer.email, customer.password);
    }
    await use(page);
  },
});

/** Gives the running test extra time for a (possibly slow) customer creation. */
function allowTimeForCustomerCreation(): void {
  test.info().setTimeout(test.info().timeout + CUSTOMER_CREATE_TIMEOUT);
}

/**
 * One test customer per worker, created when the first test needs it and deleted when the worker ends.
 * Saves a customer creation (and the shop's registration e-mails) per test.
 */
class WorkerCustomer {
  private pending?: Promise<TestCustomer>;

  constructor(private readonly create: () => Promise<TestCustomer>) {}

  /** Call from inside a test (it extends that test's timeout on the first call). */
  get(): Promise<TestCustomer> {
    if (!this.pending) {
      allowTimeForCustomerCreation();
      // a failed creation is retried by the next test instead of failing all of them
      this.pending = this.create().catch((e) => {
        this.pending = undefined;
        throw e;
      });
    }
    return this.pending;
  }

  /** The customer, if one was created. */
  async created(): Promise<TestCustomer | undefined> {
    return this.pending?.catch(() => undefined);
  }
}

async function createFreshCustomer(
  cfg: ResolvedConfig,
  storeApi: StoreApiClient | null,
  adminApi: AdminApiClient | null,
  browser: Browser,
): Promise<TestCustomer> {
  allowTimeForCustomerCreation();
  // fresh customers exist for tests that change login data (password / e-mail)
  return createCustomer(cfg, storeApi, adminApi, browser, 'loginData');
}

/** A fresh, registered (not logged-in) test customer: Admin API (customer group set), Store API or registration form. */
async function createCustomer(
  cfg: ResolvedConfig,
  storeApi: StoreApiClient | null,
  adminApi: AdminApiClient | null,
  browser: Browser,
  flow: Flow = 'customer',
): Promise<TestCustomer> {
  const customer = buildCustomer(cfg, flow);
  const group = cfg.testData.customer.customerGroup;

  if (group) {
    test.skip(!adminApi, `Admin API credentials needed to create test customers in "${group}"`);
  }
  try {
    if (group) {
      // B2B shops refuse self-registration → create the customer directly in its group
      await adminApi!.createCustomer(customer, group);
      return customer;
    }
    if (storeApi) {
      await storeApi.registerCustomer(customer);
    } else {
      // Fallback: register through the UI in an isolated context
      const ctx = await browser.newContext({ baseURL: cfg.baseURL, httpCredentials: cfg.env.httpCredentials });
      await CookieBanner.preAccept(ctx, cfg.baseURL);
      await applyPreset(ctx, cfg);
      const p = await ctx.newPage();
      const auth = new AuthPage(p, cfg);
      await auth.openRegister();
      await auth.register(customer);
      await expect(p).not.toHaveURL(/\/account\/login/);
      await ctx.close();
    }
  } catch (e) {
    // slow shops may time out or answer 5xx although the customer was saved
    if (!adminApi || !(await adminApi.findCustomerByEmail(customer.email).catch(() => undefined))) throw e;
    if (group) return customer;
  }
  if (cfg.features.doubleOptInRegistration) {
    test.skip(!adminApi, 'Double opt-in active: Admin API credentials needed to activate test customers');
    await adminApi!.activateCustomer(customer.email);
  }
  return customer;
}

export { expect };

/** Skip helper for feature-flagged tests: `skipUnless(cfg.features.wishlist, 'wishlist')` */
export function skipUnless(enabled: boolean, feature: string): void {
  test.skip(!enabled, `Feature "${feature}" disabled in project profile`);
}
