import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { parsePrice } from '../utils/price';
import type { ProductRef } from '../config/types';

export class ProductPage extends BasePage {
  get name(): Locator {
    return this.$(this.s.product.name).first();
  }
  get price(): Locator {
    return this.$(this.s.product.price).first();
  }
  get productNumber(): Locator {
    return this.$(this.s.product.productNumber).first();
  }
  get buyButton(): Locator {
    return this.$(this.s.product.buyButton).first();
  }
  get quantity(): Locator {
    return this.$(this.s.product.quantityInput).first();
  }
  get quantityPlus(): Locator {
    return this.$(this.s.product.quantityPlus).locator('visible=true').first();
  }
  get quantityMinus(): Locator {
    return this.$(this.s.product.quantityMinus).locator('visible=true').first();
  }
  /** Product boxes of the cross-selling element(s) (sliders may clone boxes → visible ones only). */
  get crossSellingProducts(): Locator {
    return this.$(this.s.product.crossSelling).locator(this.s.listing.productBox).locator('visible=true');
  }
  get configuratorGroups(): Locator {
    return this.$(this.s.product.configuratorGroup);
  }

  async open(product: ProductRef | string): Promise<void> {
    await this.goto(typeof product === 'string' ? product : product.path);
    await expect(this.name).toBeVisible();
  }

  /** Product number text — themes that hide it only render it as `<meta itemprop="sku" content>`. */
  async productNumberValue(): Promise<string> {
    const el = this.productNumber;
    await expect(el).toBeAttached();
    return ((await el.getAttribute('content')) ?? (await el.innerText())).trim();
  }

  async priceValue(): Promise<number> {
    return parsePrice(await this.price.innerText());
  }

  async setQuantity(qty: number): Promise<void> {
    await this.quantity.fill(String(qty));
  }

  async addToCart(qty?: number): Promise<void> {
    // order table: every row starts at quantity 0 → the first row needs a quantity before "add all"
    if (this.cfg.features.productOrderTable) qty ??= 1;
    if (qty) await this.setQuantity(qty);
    await this.waitForXhr('/checkout/offcanvas', () => this.buyButton.click());
  }

  /**
   * Selects another option in the given configurator group (by index).
   * Shopware reloads the page/URL for the new variant.
   */
  async switchVariant(groupIndex: number): Promise<{ before: string; after: string }> {
    const group = this.configuratorGroups.nth(groupIndex);
    if (this.s.product.variantOptionLink) {
      // theme renders variant options as plain links to the variant URL
      const before = await this.productNumberValue();
      const option = group.locator(this.s.product.variantOptionLink).first();
      const label = (await option.innerText()).split('\n')[0].trim();
      // theme JS may fetch the variant and swap the buy box in place instead of navigating
      await option.click();
      await expect.poll(() => this.productNumberValue(), { timeout: 15_000 }).not.toBe(before);
      if (this.s.product.variantSelectedOption) {
        await expect(this.configuratorGroups.nth(groupIndex).locator(this.s.product.variantSelectedOption)).toContainText(label);
      }
      return { before, after: await this.productNumberValue() };
    }
    const before = (await this.productNumber.innerText()).trim();
    const options = group.locator(this.s.product.configuratorOptionInput);
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      if ((await opt.isChecked()) || (await opt.isDisabled())) continue;
      const cls = (await opt.getAttribute('class')) ?? '';
      if (!cls.includes('is-combinable')) continue;
      const id = await opt.getAttribute('id');
      // wait for the variant's own URL (SEO URLs may not contain the product number verbatim)
      const current = this.page.url();
      await Promise.all([
        this.page.waitForURL((u) => u.href !== current, { timeout: 30_000 }),
        this.page.locator(`label[for="${id}"]`).click(),
      ]);
      await expect(this.productNumber).not.toHaveText(before);
      return { before, after: (await this.productNumber.innerText()).trim() };
    }
    throw new Error('No alternative combinable variant option found');
  }

  get wishlistButton(): Locator {
    return this.$(this.s.product.wishlistButton).first();
  }

  /** Clicks the heart and waits until Shopware marks it as added (the add request has succeeded). */
  async addToWishlist(): Promise<void> {
    await this.wishlistButton.click();
    await expect(this.wishlistButton).toHaveClass(/product-wishlist-added/);
  }
}
