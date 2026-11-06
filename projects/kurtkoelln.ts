import type { ProjectConfig } from '../src/config/types';

/**
 * Kurt Kölln — B2B wholesale storefront (Shopware 6.6, ThemeWare "Clean" theme, Maxia variants table).
 * Guests see no prices and cannot buy: every test runs logged in, except tests marked guest.
 *
 * No URL or credentials here — BASE_URL, basic auth and API credentials come from .env / CI.
 */
const config: ProjectConfig = {
  name: 'Kurt Kölln (develop)',
  locale: 'de-DE',
  currencySymbol: '€',

  features: {
    wishlist: true,
    // B2B: prices and the cart only after login
    guestCheckout: false,
    registration: true,
    // registration ends with "confirm your e-mail"
    doubleOptInRegistration: true,
    // no reviews on product pages
    productReviews: false,
    // no contact form linked in the footer
    contactForm: false,
    // no newsletter form in the storefront
    newsletter: false,
    promotionCodes: true,
    cookieBanner: true,
    // not visible in the desktop header
    languageSwitch: false,
    currencySwitch: false,
    mobileNavigation: true,
    placeOrder: true,
    // the header account button links to the login page
    guestAccountDropdown: false,
    // develop runs in debug mode: unknown URLs show the framework error page
    themedErrorPages: false,
    productOrderTable: true,
    loginRequired: true,
    // no off-canvas cart: adding shows a message, the header cart links to the cart page
    offcanvasCart: false,
    // account profile offers password change only
    emailChange: false,
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
    contactPage: null,
  },

  testData: {
    mainCategories: ['New In', 'Bestseller', 'Shopper & Bags', 'Bekleidung', 'Tücher & Schals'],
    // first products here have images (some test articles on develop have none)
    listingCategoryPath: '/tuecher-schals/',
    // the shop sells variants only; this test article has a single variant (one colour, one size)
    simpleProduct: {
      path: '/test-xxl-shopper/260520261-015-onesize',
      productNumber: '260520261_015_OneSize',
      name: 'TEST XXL Shopper',
    },
    variantProduct: {
      path: '/cardigan-gestrickter-leo/33142-28-022-l-xl',
      productNumber: '33142-28_022_L/XL',
      name: 'Cardigan "gestrickter-Leo"',
      optionGroups: ['Farbe', 'Größe'],
    },
    searchTerm: 'Cardigan',
    searchMinResults: 1,
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    expectedFilterTypes: ['properties'],
    expectedSortings: ['topseller', 'preisauf', 'preisab'],
    priceSortings: { asc: 'preisauf', desc: 'preisab' },
    customer: {
      emailDomain: 'gmail.com',
      emailPrefix: 's25-erjonqatest',
      password: '', // from NEW_ACCOUNT_PASSWORD
      firstName: 'S25-ErjonQATest',
      salutationIndex: 1,
      address: {
        street: 'Teststraße 1',
        zipcode: '20095',
        city: 'Hamburg',
        countryIso: 'DE',
        countryLabel: 'Deutschland|Germany',
      },
      // approved customer group (new dealers wait in "Händler" until approved and see no prices)
      customerGroup: 'Hamburg',
      // registration form requires company + VAT ID; dummy VAT ID with a valid DE format
      company: 'S25-ErjonQATest',
      vatId: 'DE123456789',
    },
    contactLinkText: /Kontakt|Contact/i,
    paymentMethod: 'Vorkasse', // offline, no payment redirect
    shippingMethod: null,
    promotionCode: null, // real codes only via PROMOTION_CODE
  },

  redirects: [
    { from: '/account', to: '/account/login' },
    { from: '/checkout/confirm', to: '/checkout/cart' },
  ],

  // develop runs in debug mode and binds its JS plugins seconds after `load`
  waitForNetworkIdle: true,
  // develop rate-limits per IP: already 2 parallel browsers get 503 for theme JS chunks (plugins then never start)
  maxWorkers: 1,

  // tracking is blocked in test browsers: keeps test visits out of the shop's statistics and lets the network go idle
  preset: {
    blockUrls: [
      /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|googlesyndication\.com|doubleclick\.net|googleadservices\.com/,
      /klaviyo\.com/,
      // first-party tag manager proxy: random path + base64 payload parameter
      /\/[a-z0-9]{12,}(\/[a-z0-9]+)?\?[a-z0-9]{6,}=/,
      /\/widgets\/cbax\/analytics\//,
    ],
  },

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt'],

  // Shopware 6.6 markup (core selectors follow 6.7)
  selectors: {
    navigation: { rootLink: '.main-navigation-link:not(.home-link)' },
    register: { firstName: '#personalFirstName', lastName: '#personalLastName' },
    // product description is a CMS block in this theme
    product: { description: '.cms-block-product-description-reviews' },
  },
};

export default config;
