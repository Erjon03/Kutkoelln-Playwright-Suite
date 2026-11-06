# Storefront E2E suite (Shopware 6)

**Playwright + TypeScript** end-to-end tests for a Shopware 6 storefront, built on the shared Shopware suite
skeleton. Shop specifics live in **one profile file** (`projects/<name>.ts`); everything environment-specific or
sensitive (URL, credentials, coupon codes) comes from `.env` locally and from GitHub Actions variables/secrets in CI.
Nothing in this repository can be used against the shop on its own.

---

## Quick start

```bash
npm ci
npx playwright install --with-deps chromium
cp .env.example .env          # fill in PROJECT, BASE_URL, credentials (see "Configuration")
npm run test:list             # what would run (does not contact the shop)
npm run test:smoke            # critical path, chromium + mobile
npm test                      # full suite: chromium + mobile (Pixel 7)
npm run report                # open the HTML report
```

| Script | What it does |
|---|---|
| `npm test` | full suite (never includes `@sends-message`) |
| `npm run test:smoke` | `@smoke` tests only |
| `npm run test:regression` | everything except the mobile project's `@mobile` copies |
| `npm run test:readonly` | `ALLOW_WRITE_TESTS=false`: nothing is created on the shop (no customers, orders, form submissions) |
| `npm run test:messages` | **only** the `@sends-message` tests (real contact form message) — run on purpose only |
| `npm run test:headed` / `test:ui` | debugging |
| `npm run typecheck` | TypeScript check, no shop traffic |

---

## Architecture

```
├── playwright.config.ts        # projects: setup → chromium/[firefox/webkit]/mobile → cleanup
├── .env.example                # every key the suite reads (never commit .env)
├── projects/                   # ★ one profile per shop — the ONLY file you normally edit
│   ├── _template.ts            #   copy for a new shop
│   └── demo.ts                 #   reference profile of the skeleton's demo shop
├── src/
│   ├── config/                 # types + loader (profile + env overrides + selector merge)
│   ├── selectors/shopware67.ts # core storefront selectors (class/id/name based, language independent)
│   ├── api/                    # AdminApiClient (setup/cleanup), StoreApiClient (fast data setup)
│   ├── data/                   # test identity + test data builders
│   ├── components/             # Header, MainNavigation, CookieBanner, OffcanvasCart
│   ├── pages/                  # Page Objects: Listing, Product, Cart, Auth, Account, Checkout, Contact
│   ├── fixtures/index.ts       # ★ extended `test` — page objects, API clients, customer, loggedInPage
│   ├── reporting/              # run summary reporter
│   └── client/                 # extension point for shop-specific page objects/fixtures
└── tests/
    ├── setup/                  # health check (before) + cleanup of stale test customers (after)
    ├── storefront/             # core Shopware tests — shop-agnostic, reused unchanged
    └── client/                 # shop-specific tests (@client)
```

### Design principles

| Principle | How |
|---|---|
| **No environment data in git** | Client profiles have no URL; `BASE_URL` is required from `.env` / CI. Passwords and coupon codes too. Reports contain no URL. |
| **Language independent** | Selectors use Shopware core classes, ids and form field names — never visible texts. Unavoidable texts live in the profile. |
| **Theme overrides without forking** | `selectors` in the profile is deep-merged over `shopware67Selectors`. Override only what the theme changes. |
| **Feature flags** | Tests for disabled features skip with a reason (`features.wishlist = false` → wishlist tests skip). |
| **Recognisable test data** | Everything the suite creates uses the test identity (below), so shop staff can tell it apart from real data. |
| **Few, cleaned-up customers** | One shared customer per worker (cart + wishlist emptied before every logged-in test); tests that change login data get their own. Customers are deleted via Admin API. |
| **Graceful degradation** | No Admin/Store API credentials? Customer registration and cart setup fall back to UI flows (then no cleanup). |
| **Safety switches** | `ALLOW_WRITE_TESTS=false` (nothing created), `SKIP_CHECKOUT_TESTS=true` (no orders), `@sends-message` excluded unless `SEND_MESSAGES=true`. |
| **No attack-like probes** | No SQL injection, XSS payloads, path traversal or fuzzing — shop monitoring treats them as real attacks. |

### Test identity

Everything the tests create — customers, addresses, guest orders, contact messages — uses

- first name and e-mail prefix/domain from the profile (`testData.customer`),
- a last name that names the flow (`Registration`, `GuestCheckout`, `ContactForm`, …; see `FLOWS` in `src/data/customer.ts`),
- e-mail `<prefix>-<flow>-<timestamp><random>@<domain>`.

Specs never hardcode names; they pick a flow. The cleanup deletes only e-mails in exactly this generated format
that are older than an hour, so manually created accounts and customers of a parallel run are never touched.

### Fixtures

```ts
import { test, expect } from '../../src/fixtures';

test('customer sees the order', async ({ loggedInPage, cartHelper, checkout, account, cfg }) => {
  await cartHelper.add(cfg.testData.simpleProduct, 2); // API speed, UI session
  await checkout.openConfirm();
  await checkout.placeOrder();
  await account.openOrders();
  await expect(account.orders.first()).toBeVisible();
});
```

| Fixture | Scope | Purpose |
|---|---|---|
| `cfg` | worker | resolved project config (profile + env + selectors) |
| `adminApi` / `storeApi` | worker | API clients, `null` without credentials |
| `header`, `navigation`, `listing`, `product`, `cart`, `offcanvasCart`, `auth`, `account`, `checkout`, `contact`, `cookieBanner` | test | page objects |
| `cartHelper` | test | put products into the storefront cart without UI clicks |
| `workerCustomer` | worker | one test customer per worker, created on first use, deleted when the worker ends |
| `customer` | test | the worker's shared customer, or with `freshCustomer` an own one (deleted afterwards) |
| `loggedInPage` | test | `page` logged in as `customer` (shared customer: cart + wishlist emptied first) |
| `freshCustomer` | option | `test.use({ freshCustomer: true })` for tests that change password / e-mail |
| `guest` | option | `test.use({ guest: true })` keeps the browser logged out on login-required shops |
| `acceptCookies` | option | `test.use({ acceptCookies: false })` to see the cookie banner |
| `requireWriteAccess` | test | skip the test when `ALLOW_WRITE_TESTS=false` |

### Tags

| Tag | Meaning |
|---|---|
| `@smoke` | critical path (`npm run test:smoke`), run on every PR |
| `@mobile` | also runs in the `mobile` project (Pixel 7) |
| `@mobile-only` | runs only in the `mobile` project |
| `@client` | shop-specific tests |
| `@sends-message` | sends a real message to the shop (contact form). Excluded from every run unless `SEND_MESSAGES=true` (`npm run test:messages`); never in CI |

---

## Coverage (tests/storefront)

| Spec | Covers | Creates data on the shop |
|---|---|---|
| `homepage` | header/nav/content/footer, SEO basics, logo link, JS errors, images | – |
| `cookie-consent` | banner shown, "only necessary", remembered | – |
| `navigation` | configured categories, every category opens, flyout, breadcrumb | – |
| `listing` | product boxes, PDP link, pagination, items per page, sorting, filters, edge cases | – |
| `product-detail` | core info, structured data, variant switch, quantity stepper, cross-selling, breadcrumb, reviews, 404 | – |
| `search` | header search, relevance, suggest, no result, special characters, edge cases | – |
| `cart` | add from PDP/listing, quantity, remove, persistence, promotion codes, edge cases | session cart only |
| `checkout` | empty cart guard, login gate, guest order, customer order, TOS required, payment/shipping | **orders**, guest customer |
| `registration` | register, validation, duplicate e-mail, password confirmation | **customers** |
| `login` | login/logout, wrong password, unknown user, header menu, cart kept after login, edge cases | shared customer |
| `account` | overview, profile, address book, change password / e-mail, recovery form (never submitted), orders | shared + own customers, addresses |
| `wishlist` | guest add, wishlist page + remove, persistence (feature-flagged) | wishlist entries |
| `forms` | contact form validation, **submit (`@sends-message`)**, newsletter form present | **contact message** (only with `SEND_MESSAGES=true`) |
| `mobile` | off-canvas nav, burger, no horizontal overflow, off-canvas filters | – |
| `links-and-errors` | important links, redirects, broken header/footer links, sitemap/robots, 404, security headers | – |

---

## Configuration

| Key | Required | Purpose |
|---|---|---|
| `PROJECT` | yes | profile name in `projects/` |
| `BASE_URL` | yes for client profiles | storefront URL of the environment under test |
| `HTTP_USERNAME` / `HTTP_PASSWORD` | if the environment has basic auth | |
| `ADMIN_CLIENT_ID` / `ADMIN_CLIENT_SECRET` (or `ADMIN_USERNAME` / `ADMIN_PASSWORD`) | strongly recommended | fast customer setup + **cleanup of test customers** |
| `SW_ACCESS_KEY` | optional | Store API key; resolved via Admin API when empty |
| `NEW_ACCOUNT_PASSWORD` | yes when the profile has no password | password of every test customer |
| `PROMOTION_CODE` | optional | valid coupon for the coupon test (skipped when empty) |
| `ALLOW_WRITE_TESTS` / `CLEANUP_TEST_DATA` / `SKIP_CHECKOUT_TESTS` | optional | safety switches (see `.env.example`) |
| `EXTRA_BROWSERS` | optional | `firefox,webkit` |

Every key can also be set per profile as `<KEY>_<PROFILE>` (e.g. `BASE_URL_MYSHOP`), which wins over the plain key.

**Admin API:** create an *Integration* in the admin (*Settings → System → Integrations*, with admin rights) and use
its id/secret. Without Admin API credentials, test customers are registered through the storefront and **not deleted**.

---

## Onboarding another shop with this skeleton

1. `cp projects/_template.ts projects/<shop>.ts` and fill in every `TODO`
   (features, test data, offline payment method, redirects, important links). No URL in the file.
2. `.env`: `PROJECT=<shop>`, `BASE_URL`, credentials.
3. `npm run test:list`, then `npm run test:smoke -- --headed`. For every failure decide:
   **different markup** → selector override in the profile; **feature not used** → feature flag off;
   **different data** → fix `testData`; **real bug** → report it.
4. Full run, then shop-only tests under `tests/client/` using `src/client/fixtures.ts`.

> Don't edit `tests/storefront/**` or `src/**` for one shop. If a core test needs a change for one shop, make it
> configurable (profile option) so every other profile keeps working.

---

## CI (GitHub Actions)

`.github/workflows/playwright.yml` runs smoke tests on pull requests and the full suite on pushes to `main`,
nightly and on demand. `@sends-message` tests never run in CI. The storefront URL and all credentials come
from repository variables/secrets (*Settings → Secrets and variables → Actions*).

### Run summary

Every local run writes `run-summary/<project>_<date>_<time>.html` / `.md` / `.json` (git-ignored): totals and every
test with status, browser, duration and the first error line. URLs in error messages are replaced by `<url>`, so the
summary can be forwarded as is. A one-line status message (e.g. for Teams) is printed after each run.
In CI the summary is shown on the run's summary page and uploaded as an artifact.
