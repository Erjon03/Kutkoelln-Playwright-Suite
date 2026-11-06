import type { ProjectConfig } from '../src/config/types';

/**
 * TEMPLATE for a new client project.
 *
 *   cp projects/_template.ts projects/<client>.ts
 *   PROJECT=<client> npx playwright test --grep @smoke
 *
 * Fill in every "TODO". Keep secrets and environment details (URL, credentials, coupon codes)
 * out of this file — they belong in .env / CI variables.
 */
const config: ProjectConfig = {
  name: 'TODO Client name (staging)',
  // No baseURL here: the storefront URL comes from BASE_URL in .env / CI variables, so it never ends up in git.
  locale: 'de-DE',
  currencySymbol: '€',

  features: {
    wishlist: false, // TODO: Settings > Cart & Checkout > Wishlist
    guestCheckout: true,
    registration: true,
    doubleOptInRegistration: false,
    productReviews: true,
    contactForm: true,
    newsletter: false,
    promotionCodes: true,
    cookieBanner: true,
    languageSwitch: false,
    currencySwitch: false,
    mobileNavigation: true,
    placeOrder: true, // false = card-only shop (no offline payment method)
  },

  // Only change if the client uses custom routes / SEO URLs for these.
  routes: {
    home: '/',
    login: '/account/login',
    register: '/account/register',
    account: '/account',
    accountProfile: '/account/profile',
    accountAddresses: '/account/address',
    accountOrders: '/account/order',
    accountRecover: '/account/recover',
    logout: '/account/logout',
    cart: '/checkout/cart',
    checkoutRegister: '/checkout/register',
    checkoutConfirm: '/checkout/confirm',
    checkoutFinish: '/checkout/finish',
    search: '/search',
    wishlist: '/wishlist',
    contactPage: null, // TODO: e.g. '/Kontakt/' — or null to find it via footer link
  },

  testData: {
    mainCategories: ['TODO Category 1', 'TODO Category 2'],
    listingCategoryPath: '/TODO-Category/',
    simpleProduct: { path: '/TODO-product/SW10000', productNumber: 'SW10000', name: 'TODO' },
    variantProduct: {
      path: '/TODO-variant-product/SW10001.1',
      productNumber: 'SW10001.1',
      name: 'TODO',
      optionGroups: ['Size'],
    },
    searchTerm: 'TODO',
    searchMinResults: 1,
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    expectedFilterTypes: ['manufacturer', 'properties', 'price'],
    expectedSortings: ['name-asc', 'name-desc', 'price-asc', 'price-desc'],
    customer: {
      // test identity (see FLOWS in src/data/customer.ts for the last names per flow)
      emailDomain: 'gmail.com',
      emailPrefix: 's25-erjonqatest',
      password: '', // from NEW_ACCOUNT_PASSWORD in .env / CI secrets
      firstName: 'S25-ErjonQATest',
      salutationIndex: 1,
      address: {
        street: 'Teststraße 1',
        zipcode: '48624',
        city: 'Schöppingen',
        countryIso: 'DE',
        countryLabel: 'Deutschland|Germany',
      },
    },
    contactLinkText: /Kontakt|Contact/i,
    paymentMethod: null, // TODO: e.g. 'Vorkasse' — must be an offline method (no redirect)
    shippingMethod: null,
    promotionCode: null, // real codes go in PROMOTION_CODE (.env / CI secret), never here
  },

  redirects: [
    { from: '/account', to: '/account/login' },
    { from: '/checkout/confirm', to: '/checkout/cart' },
    // TODO: client-specific SEO redirects, e.g. { from: '/old-url', to: '/new-url/', guestOnly: false }
  ],

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt'],

  // TODO: only if the client theme changes core markup
  selectors: {
    // header: { cart: '.my-theme-cart-button' },
  },
};

export default config;
