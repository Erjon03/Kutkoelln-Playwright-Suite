import { test, expect } from '../../src/fixtures';

// checks the shop itself → no test customer, even on login-required shops
test.use({ guest: true });

/**
 * Runs once before all tests. Fails fast (with a clear message) when the
 * shop is down, behind unexpected auth, or in maintenance mode.
 */
test('storefront is reachable', async ({ request, cfg }) => {
  const res = await request.get('/');
  expect(res.status(), `homepage returned ${res.status()} — shop down, maintenance mode or basic auth missing?`).toBe(200);
  const html = await res.text();
  expect(html).toContain('is-ctl-');
  // several shops share one .env → catch a BASE_URL that belongs to another shop's profile
  const category = cfg.testData.mainCategories[0];
  expect(html.toLowerCase(), `"${category}" not on the homepage — does BASE_URL belong to profile "${cfg.name}"?`).toContain(category.toLowerCase());
});

test('API access for test data setup', async ({ cfg, adminApi, storeApi }) => {
  if (!adminApi) {
    test.info().annotations.push({
      type: 'warning',
      description: 'No Admin API credentials — customers are registered via UI and not cleaned up.',
    });
  }
  if (!storeApi) {
    test.info().annotations.push({
      type: 'warning',
      description: 'No Store API access key — cart/customer setup falls back to slower UI flows.',
    });
    return;
  }
  // Smoke-check the Store API with the configured product
  const id = await storeApi.productIdByNumber(cfg.testData.simpleProduct.productNumber);
  expect(id).toMatch(/^[0-9a-f]{32}$/);
});
