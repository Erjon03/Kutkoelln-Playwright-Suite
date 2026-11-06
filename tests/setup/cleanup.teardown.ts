import { test } from '../../src/fixtures';

test.use({ guest: true });

/**
 * Removes leftover test customers (e-mail prefix/domain from the project profile) older than an hour.
 * Younger ones may still be in use by a parallel run (the other CI shard runs at the same time);
 * every worker deletes its own customers when it ends.
 */
test('delete leftover test customers', async ({ cfg, adminApi }) => {
  test.skip(!adminApi || !cfg.env.cleanupTestData, 'Cleanup disabled or no Admin API credentials');
  const { emailPrefix, emailDomain } = cfg.testData.customer;
  const deleted = await adminApi!.deleteTestCustomers(emailPrefix, emailDomain, new Date(Date.now() - 60 * 60_000));
  test.info().annotations.push({ type: 'cleanup', description: `Deleted ${deleted} test customers` });
});
