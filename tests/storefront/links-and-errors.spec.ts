import { test, expect } from '../../src/fixtures';
import { loadConfig } from '../../src/config/loader';

test.describe('Important links & redirects', () => {
  test('important pages respond without error', { tag: '@smoke' }, async ({ request, cfg }) => {
    test.slow(); // full page fetches on a slow staging server
    const failures: string[] = [];
    for (const path of cfg.importantLinks) {
      const res = await request.get(path, { timeout: 30_000 }); // whole HTML page, like a navigation
      if (res.status() >= 400) failures.push(`${path} → ${res.status()}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('header and footer links on the homepage are not broken', async ({ page, request, cfg }) => {
    test.slow(); // up to 60 sequential requests
    await page.goto(cfg.routes.home);
    const hrefs = await page
      .locator(`${cfg.selectors.header.root} a[href], ${cfg.selectors.footer.root} a[href]`)
      // getAttribute: SVG <a> elements expose href as SVGAnimatedString, not a string
      .evaluateAll((as) => as.map((a) => new URL(a.getAttribute('href') ?? '', document.baseURI).href));
    const origin = new URL(cfg.baseURL).origin;
    const internal = [...new Set(hrefs)].filter((h) => h.startsWith(origin) && !h.includes('/account/logout')).slice(0, 60);
    const broken: string[] = [];
    for (const href of internal) {
      const res = await request.get(href, { maxRedirects: 5, timeout: 30_000 });
      if (res.status() >= 400) broken.push(`${href} → ${res.status()}`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  test('sitemap and robots.txt are served', async ({ page }) => {
    // the page's session: login-required shops only serve the sitemap to logged-in customers
    const robots = await page.request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    const sitemap = await page.request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<sitemapindex');
  });
});

test.describe('Redirects', () => {
  // rules are checked for visitors who are not logged in
  test.use({ guest: true });

  for (const rule of loadConfig().redirects) {
    test(`redirect ${rule.from} → ${rule.to}`, async ({ page }) => {
      await page.goto(rule.from);
      await expect(page).toHaveURL(new RegExp(rule.to));
    });
  }
});

test.describe('Error handling', () => {
  test('unknown URL shows a 404 page with a way back', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg }) => {
    const res = await page.goto(`/e2e-not-existing-${Date.now()}`);
    expect(res?.status()).toBe(404);
    // debug-mode environments render the framework's exception page → status check only
    if (cfg.features.themedErrorPages === false) return;
    await expect(page.locator(cfg.selectors.error.body)).toBeAttached();
    await expect(page.locator(cfg.selectors.header.logo)).toBeVisible();
    await expect(page.locator(cfg.selectors.error.backToShop).first()).toBeVisible();
  });

  test('unknown category/deep URL returns 404, not 500', async ({ request, cfg }) => {
    const res = await request.get(`${cfg.testData.listingCategoryPath.replace(/\/$/, '')}/does-not-exist-${Date.now()}/`);
    expect(res.status()).toBe(404);
  });

  test('invalid listing parameters do not crash the page', async ({ page, cfg }) => {
    const res = await page.goto(`${cfg.testData.listingCategoryPath}?order=invalid&p=99999&manufacturer=xyz`);
    expect(res?.status()).toBeLessThan(500);
  });

  test('POST to add-to-cart with invalid product does not 500', async ({ page, cfg }) => {
    await page.goto(cfg.routes.home);
    const res = await page.request.post('/checkout/line-item/add', {
      form: { 'lineItems[x][id]': 'x', 'lineItems[x][type]': 'product', 'lineItems[x][referencedId]': 'invalid', 'lineItems[x][quantity]': '1' },
      maxRedirects: 0,
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('Security edge cases', () => {
  test('session cookie is HttpOnly (and Secure on https)', async ({ page, cfg }) => {
    await page.goto(cfg.routes.home);
    // a cached homepage sets no cookie itself; a background widget request sets it a moment later
    const sessionCookies = async () => (await page.context().cookies()).filter((c) => c.name.startsWith('session-'));
    await expect
      .poll(async () => (await sessionCookies()).length, { message: 'no Shopware session cookie set' })
      .toBeGreaterThan(0);
    for (const c of await sessionCookies()) {
      expect(c.httpOnly, `${c.name} HttpOnly`).toBe(true);
      if (cfg.baseURL.startsWith('https')) expect(c.secure, `${c.name} Secure`).toBe(true);
    }
  });

  test('responses send X-Content-Type-Options: nosniff', async ({ request, cfg }) => {
    const res = await request.get(cfg.routes.home);
    expect(res.headers()['x-content-type-options'], 'X-Content-Type-Options').toBe('nosniff');
  });

  test('responses send clickjacking protection', async ({ request, cfg }) => {
    // known missing on this shop → expected to fail; turns red as soon as the header is added
    test.fail(cfg.features.clickjackingProtection === false, 'known issue: no X-Frame-Options / CSP frame-ancestors');
    const res = await request.get(cfg.routes.home);
    const h = res.headers();
    // X-Frame-Options or a CSP frame-ancestors rule
    const frameProtected = !!h['x-frame-options'] || /frame-ancestors/i.test(h['content-security-policy'] ?? '');
    expect(frameProtected, 'X-Frame-Options / CSP frame-ancestors').toBe(true);
  });

  test('GET on a POST-only route does not 500', async ({ request }) => {
    const res = await request.get('/checkout/line-item/add', { maxRedirects: 0 });
    expect(res.status()).toBeLessThan(500);
  });
});
