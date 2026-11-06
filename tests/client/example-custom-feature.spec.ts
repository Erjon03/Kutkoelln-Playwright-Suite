import { test, expect } from '../../src/client/fixtures';

/**
 * Example of a client-specific test. Delete or replace in client projects.
 * Skipped by default — the demo shop has no store locator.
 */
test.describe('Client: store locator (example)', { tag: '@client' }, () => {
  test.skip(true, 'Example only — replace with real client features');

  test('store locator page lists stores', async ({ exampleCustomPage }) => {
    await exampleCustomPage.open();
    await expect(exampleCustomPage.root).toBeVisible();
  });
});
