import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import type { CustomerAddress } from '../config/types';

export class AccountPage extends BasePage {
  get asideItems(): Locator {
    return this.$(this.s.account.asideItem);
  }

  async open(): Promise<void> {
    await this.goto(this.cfg.routes.account);
    await this.expectPath(this.cfg.routes.account);
  }

  async openProfile(): Promise<void> {
    await this.goto(this.cfg.routes.accountProfile);
    const form = this.$(this.s.account.profileForm);
    if (this.s.account.profileEditToggle && !(await form.isVisible())) {
      await this.$(this.s.account.profileEditToggle).locator('visible=true').first().click();
    }
    await expect(form).toBeVisible();
  }

  async updateName(firstName: string, lastName: string): Promise<void> {
    await this.$(this.s.account.profileFirstName).fill(firstName);
    await this.$(this.s.account.profileLastName).fill(lastName);
    await Promise.all([
      this.page.waitForLoadState('domcontentloaded'),
      this.$(this.s.account.profileSubmit).first().click(),
    ]);
  }

  async openAddresses(): Promise<void> {
    await this.goto(this.cfg.routes.accountAddresses);
    await this.expectPath(this.cfg.routes.accountAddresses);
  }

  get addressForm(): Locator {
    return this.$(this.s.account.addressForm).first();
  }

  /** Address card containing `text` (e.g. the street). */
  addressCard(text: string): Locator {
    return this.$(this.s.account.addressCard).filter({ hasText: text });
  }

  async openNewAddress(): Promise<void> {
    await this.goto(`${this.cfg.routes.accountAddresses}/create`);
    await expect(this.addressForm).toBeVisible();
  }

  async openEditAddress(street: string): Promise<void> {
    await this.clickAndLoad(this.addressCard(street).locator(this.s.account.addressEditLink).first());
    await expect(this.addressForm).toBeVisible();
  }

  /** Fills the open address form and saves it (lands back on the address book). */
  async saveAddress(a: { firstName: string; lastName: string; company?: string } & CustomerAddress): Promise<void> {
    const s = this.s.account;
    const form = this.addressForm;
    const salutation = form.locator(s.addressSalutation);
    if (await salutation.isVisible()) await salutation.selectOption({ index: this.cfg.testData.customer.salutationIndex });
    await form.locator(s.addressFirstName).fill(a.firstName);
    await form.locator(s.addressLastName).fill(a.lastName);
    // B2B shops require a company on every address
    const company = form.locator(s.addressCompany).first();
    if (a.company && (await company.isVisible())) await company.fill(a.company);
    await form.locator(s.addressStreet).fill(a.street);
    await form.locator(s.addressZipcode).fill(a.zipcode);
    await form.locator(s.addressCity).fill(a.city);
    await this.selectOptionByLabel(form.locator(s.addressCountry).first(), a.countryLabel);
    // state options are loaded after the country is chosen
    await this.selectOptionByLabel(form.locator(s.addressCountryState).first(), a.stateLabel, true);
    const phone = form.locator(s.addressPhoneNumber).first();
    if (a.phoneNumber && (await phone.isVisible())) await phone.fill(a.phoneNumber);
    await this.clickAndLoad(form.locator(s.addressSubmit).first());
    await this.expectPath(this.cfg.routes.accountAddresses);
  }

  /** Opens a collapsed profile form (e-mail / password) via its toggle. */
  private async openProfileForm(form: string, toggle: string): Promise<Locator> {
    await this.goto(this.cfg.routes.accountProfile);
    const f = this.$(form).first();
    if (!(await f.isVisible())) await this.$(toggle).locator('visible=true').first().click();
    await expect(f).toBeVisible();
    return f;
  }

  async changeEmail(newEmail: string, currentPassword: string): Promise<void> {
    const s = this.s.account;
    const form = await this.openProfileForm(s.emailForm, s.emailEditToggle);
    await form.locator(s.emailNew).fill(newEmail);
    await form.locator(s.emailConfirmation).fill(newEmail);
    await form.locator(s.emailPassword).fill(currentPassword);
    await this.clickAndLoad(form.locator('button[type="submit"]').first());
  }

  async changePassword(newPassword: string, currentPassword: string): Promise<void> {
    const s = this.s.account;
    const form = await this.openProfileForm(s.passwordForm, s.passwordEditToggle);
    await form.locator(s.passwordNew).fill(newPassword);
    await form.locator(s.passwordConfirmation).fill(newPassword);
    await form.locator(s.passwordCurrent).fill(currentPassword);
    await this.clickAndLoad(form.locator('button[type="submit"]').first());
  }

  get recoverForm(): Locator {
    return this.$(this.s.recover.form).first();
  }

  async openOrders(): Promise<void> {
    await this.goto(this.cfg.routes.accountOrders);
    await this.expectPath(this.cfg.routes.accountOrders);
  }

  get orders(): Locator {
    return this.$(this.s.account.orderItem);
  }

  get successAlert(): Locator {
    return this.$(this.s.account.profileSuccess || this.s.page.alertSuccess).first();
  }

  async logout(): Promise<void> {
    await this.goto(this.cfg.routes.logout);
  }
}
