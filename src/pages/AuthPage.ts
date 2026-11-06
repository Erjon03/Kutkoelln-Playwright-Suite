import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { CUSTOMER_CREATE_TIMEOUT, type TestCustomer } from '../data/customer';

/**
 * Login + registration forms. Used on /account/login and /checkout/register
 * (checkout variant additionally offers guest checkout).
 */
export class AuthPage extends BasePage {
  get loginForm(): Locator {
    return this.$(this.s.login.form).first();
  }
  get registerForm(): Locator {
    return this.$(this.s.register.form).first();
  }

  async open(): Promise<void> {
    await this.goto(this.cfg.routes.login);
    await expect(this.loginForm).toBeVisible();
  }

  /** Registration route — core renders login + register there, some themes only register. */
  async openRegister(): Promise<void> {
    await this.goto(this.cfg.routes.register);
    await expect(this.registerForm).toBeVisible();
  }

  // ---------------- login ----------------
  async login(email: string, password: string): Promise<void> {
    // On /checkout/register the login form is collapsed
    const toggle = this.$(this.s.login.collapseToggle).first();
    if ((await toggle.isVisible()) && !(await this.$(this.s.login.email).isVisible())) await toggle.click();

    await this.$(this.s.login.email).fill(email);
    await this.$(this.s.login.password).fill(password);
    await this.$(this.s.login.submit).click();
  }

  async loginAndExpectSuccess(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await expect(this.page).not.toHaveURL(/\/account\/login/);
  }

  get loginError(): Locator {
    return this.loginForm.locator(this.s.page.alertDanger).or(this.$(`${this.s.page.main} ${this.s.page.alertDanger}`)).first();
  }

  // ---------------- registration ----------------
  /** skipPasswords: leave both password fields empty, so a test can fill them itself (e.g. last) */
  async fillRegistration(c: TestCustomer, opts: { guest?: boolean; skipPasswords?: boolean } = {}): Promise<void> {
    const r = this.s.register;
    const form = this.registerForm;

    // /checkout/register: checkbox; /account/login: hidden input (value=1) → leave it alone
    const createAccount = form.locator(`${r.createAccount}[type="checkbox"]`);
    if (await createAccount.count()) {
      // checkout variant: checked = create account, unchecked = guest
      await createAccount.setChecked(!opts.guest, { force: true });
    }

    const salutation = form.locator(r.salutation);
    if (await salutation.isVisible()) await salutation.selectOption({ index: c.salutationIndex });

    await form.locator(r.firstName).fill(c.firstName);
    await form.locator(r.lastName).fill(c.lastName);
    await form.locator(r.email).fill(c.email);

    const pw = form.locator(r.password);
    if (!opts.guest && !opts.skipPasswords && (await pw.isVisible())) {
      await pw.fill(c.password);
      const confirmation = form.locator(r.passwordConfirmation);
      if (await confirmation.isVisible()) await confirmation.fill(c.password);
    }

    await form.locator(r.street).fill(c.address.street);
    await form.locator(r.zipcode).fill(c.address.zipcode);
    await form.locator(r.city).fill(c.address.city);
    await this.selectOptionByLabel(form.locator(r.country).first(), c.address.countryLabel);
    // state options are loaded after the country is chosen
    await this.selectOptionByLabel(form.locator(r.countryState).first(), c.address.stateLabel, true);

    // B2B forms: company + VAT ID (only when the profile sets them and the form shows the fields)
    const company = form.locator(r.company).first();
    if (c.company && (await company.isVisible())) await company.fill(c.company);
    const vatId = form.locator(r.vatId).first();
    if (c.vatId && (await vatId.isVisible())) await vatId.fill(c.vatId);

    const phone = form.locator(r.phoneNumber).first();
    if (c.address.phoneNumber && (await phone.isVisible())) await phone.fill(c.address.phoneNumber);

    const dp = form.locator(r.dataProtection);
    if (await dp.count()) await dp.check({ force: true });
  }

  async submitRegistration(): Promise<void> {
    // the click waits for the navigation, i.e. until the customer is saved (slow on some shops)
    await this.registerForm.locator(this.s.register.submit).first().click({ timeout: CUSTOMER_CREATE_TIMEOUT });
  }

  async register(c: TestCustomer, opts: { guest?: boolean } = {}): Promise<void> {
    await this.fillRegistration(c, opts);
    await this.submitRegistration();
  }

  get invalidFields(): Locator {
    return this.registerForm.locator(this.s.page.invalidField);
  }

  /** Inline invalid fields (client/server validation) or an error alert on the page. */
  get validationErrors(): Locator {
    return this.invalidFields.or(this.page.locator(`${this.s.page.main} ${this.s.page.alertDanger}`)).locator('visible=true');
  }
}
