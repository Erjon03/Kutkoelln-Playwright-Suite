import { test, expect, skipUnless } from '../../src/fixtures';
import { flowLastName, uniqueEmail } from '../../src/data/customer';

test.describe('Contact form', () => {
  test.beforeEach(async ({ cfg, contact }) => {
    skipUnless(cfg.features.contactForm, 'contactForm');
    await contact.open();
  });

  test('empty submit shows validation errors', { tag: '@smoke' }, async ({ contact }) => {
    await contact.submit();
    // Shopware shows either inline field errors or a server-side alert list
    await expect(contact.validationErrors.first()).toBeVisible();
  });

  test('invalid e-mail is flagged', async ({ contact, cfg }) => {
    const { firstName } = cfg.testData.customer;
    await contact.fill({ email: 'invalid@', firstName, lastName: flowLastName('contactInvalid') });
    await contact.submit();
    await expect(
      contact.form.locator(`${cfg.selectors.contact.email}${cfg.selectors.page.invalidField}`).or(contact.validationErrors).first(),
    ).toBeVisible();
  });

  // sends a real message to the shop → excluded in CI (--grep-invert @sends-message), run locally on purpose
  test('valid submission shows a confirmation', { tag: '@sends-message' }, async ({ page, cfg, contact, requireWriteAccess }) => {
    void requireWriteAccess;
    const c = cfg.testData.customer;
    await contact.fill({
      salutationIndex: c.salutationIndex,
      firstName: c.firstName,
      lastName: flowLastName('contact'),
      email: uniqueEmail(cfg, 'contact'),
      phone: '0123456789',
      subject: `${c.firstName} contact form test – please ignore`,
      comment: 'Automated Playwright test message. Please ignore.',
    });
    await contact.submitAndWait();
    await expect(page.locator(cfg.selectors.contact.success).first()).toBeVisible();
  });
});

test.describe('Newsletter', () => {
  test('newsletter form is present', async ({ page, cfg }) => {
    skipUnless(cfg.features.newsletter, 'newsletter');
    await page.goto(cfg.routes.home);
    await expect(page.locator('form[action*="newsletter"]').first()).toBeAttached();
  });
});
