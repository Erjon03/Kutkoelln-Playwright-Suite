import type { ProjectConfig } from '../src/config/types';

/**
 * Project profile: solution25 Shopware 6.7 demo shop.
 *
 * Everything shop-specific lives here. For a new client copy
 * projects/_template.ts to projects/<client>.ts and run with PROJECT=<client>.
 * Secrets (admin credentials, basic auth) NEVER go here — use .env / CI variables.
 */
const config: ProjectConfig = {
  name: 'Shopware Demo (automated-testing)',
  baseURL: 'https://automated-testing.development-s25.com',
  locale: 'de-DE',
  currencySymbol: '€',

  features: {
    wishlist: false, // not enabled in the demo sales channel
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
    placeOrder: true,
  },

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
    contactPage: null, // discovered via footer link (contactLinkText)
  },

  testData: {
    mainCategories: ['New In', 'Women', 'Men', 'Shoes', 'Accessories', 'Sale'],
    listingCategoryPath: '/Women/',
    simpleProduct: {
      path: '/Canvas-Tote-Bag/A-BAG-001-CREAM',
      productNumber: 'A-BAG-001-CREAM',
      name: 'Canvas Tote Bag',
    },
    variantProduct: {
      path: '/Belted-Shirt-Dress/W-DRS-005-OLIVE-XL',
      productNumber: 'W-DRS-005-OLIVE-XL',
      name: 'Belted Shirt Dress',
      optionGroups: ['Color', 'Size'],
    },
    searchTerm: 'dress',
    searchMinResults: 2,
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    expectedFilterTypes: ['manufacturer', 'properties', 'price'],
    expectedSortings: ['name-asc', 'name-desc', 'price-asc', 'price-desc'],
    customer: {
      emailDomain: 'gmail.com',
      emailPrefix: 's25-erjonqatest',
      password: 'Shopware-E2E-2026!', // demo shop only; NEW_ACCOUNT_PASSWORD in .env wins
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
    paymentMethod: null,
    shippingMethod: null,
    promotionCode: null,
  },

  redirects: [
    { from: '/account', to: '/account/login' },
    { from: '/account/order', to: '/account/login' },
    { from: '/account/profile', to: '/account/login' },
    { from: '/checkout/confirm', to: '/checkout/cart' },
  ],

  importantLinks: [
    '/',
    '/New-In/',
    '/Women/',
    '/Men/',
    '/Shoes/',
    '/Accessories/',
    '/Sale/',
    '/checkout/cart',
    '/account/login',
    '/search?search=dress',
    '/sitemap.xml',
    '/robots.txt',
  ],

  // Demo shop uses the default Storefront theme → no overrides needed.
  selectors: {},
};

export default config;
