import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { parsePrice } from '../utils/price';

/** Category listing & search result page (same CMS listing element). */
export class ListingPage extends BasePage {
  /** Shopware reloads the listing via /widgets/cms/navigation/... or /widgets/search */
  private static readonly LISTING_XHR = /\/widgets\/(cms|search)/;

  get productBoxes(): Locator {
    return this.$(this.s.listing.productBox);
  }
  get sorting(): Locator {
    return this.$(this.s.listing.sorting).first();
  }
  get pagination(): Locator {
    return this.$(this.s.listing.pagination).first();
  }

  async open(path: string): Promise<void> {
    await this.goto(path);
    await expect(this.$(this.s.listing.root).first()).toBeVisible();
  }

  async productNames(): Promise<string[]> {
    return (await this.productBoxes.locator(this.s.listing.productName).allInnerTexts()).map((t) => t.trim());
  }

  /** Current prices (ignores strike-through list prices). */
  async productPrices(): Promise<number[]> {
    const listPrice = this.s.listing.listPrice;
    const texts = await this.productBoxes.locator(this.s.listing.productPrice).evaluateAll(
      (els, lp) =>
        els.map((el) => {
          const clone = el.cloneNode(true) as HTMLElement;
          clone.querySelectorAll(lp).forEach((n) => n.remove());
          return clone.textContent ?? '';
        }),
      listPrice,
    );
    return texts.map(parsePrice).filter((n) => !Number.isNaN(n));
  }

  async sortingOptions(): Promise<string[]> {
    return this.sorting.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
  }

  /**
   * Runs `action` and waits until Shopware has swapped in the new listing HTML —
   * the XHR response alone arrives before the old product boxes are replaced.
   */
  private async reloadListing(action: () => Promise<unknown>): Promise<void> {
    const oldBox = await this.productBoxes.first().elementHandle({ timeout: 1_000 }).catch(() => null);
    await this.waitForXhr(ListingPage.LISTING_XHR, action);
    if (oldBox) await this.page.waitForFunction((el) => !el.isConnected, oldBox);
  }

  /** Open filter dropdowns overlay the "reset all" button and the listing. */
  private async closeFilterDropdowns(): Promise<void> {
    // only dropdown-style filters overlay the listing; sidebar layouts keep filters expanded inline
    const open = this.$(`${this.s.listing.filterItemToggle}[aria-expanded="true"]:not([disabled])`).locator('visible=true');
    for (const toggle of await open.elementHandles()) {
      const inline = await toggle.evaluate((el: Element) => {
        const target = el.getAttribute('data-bs-target');
        return !!target && document.querySelector(target)?.classList.contains('collapse') === true;
      });
      if (!inline) await toggle.click();
    }
  }

  async sortBy(key: string): Promise<void> {
    await this.reloadListing(() => this.sorting.selectOption(key));
    await expect(this.page).toHaveURL(new RegExp(`order=${key}`));
  }

  /** On mobile the filter panel sits in an off-canvas behind a toggle button. */
  async ensureFilterPanelVisible(): Promise<Locator> {
    const panel = this.$(this.s.listing.filterPanel).locator('visible=true').first();
    if (await panel.isVisible()) return panel;
    await this.$(this.s.listing.filterPanelToggle).locator('visible=true').first().click();
    await expect(panel).toBeVisible();
    await this.waitUntilStill(panel); // off-canvas panels slide in; clicks during the animation miss
    return panel;
  }

  /** Waits until the element's position stops changing between two checks. */
  private async waitUntilStill(el: Locator): Promise<void> {
    let last = '';
    await expect
      .poll(async () => {
        const box = JSON.stringify(await el.boundingBox());
        const still = box === last;
        last = box;
        return still;
      }, { intervals: [100] })
      .toBe(true);
  }

  filterOfType(type: 'manufacturer' | 'properties' | 'price' | 'rating' | 'boolean'): Locator {
    const map = {
      manufacturer: this.s.listing.filterManufacturer,
      properties: this.s.listing.filterProperty,
      price: this.s.listing.filterPrice,
      rating: '.filter-multi-select-rating',
      boolean: '.filter-boolean',
    } as const;
    return this.$(map[type]);
  }

  /** Opens a filter's dropdown — sidebar layouts render some filters already expanded, a click would collapse them. */
  private async expandFilter(filter: Locator): Promise<void> {
    const toggle = filter.locator(this.s.listing.filterItemToggle).first();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }

  /**
   * Opens a multi-select filter dropdown and ticks its n-th selectable option. Returns the option label.
   * Options without matches for the active filters are disabled by Shopware and skipped.
   */
  async applyMultiSelectFilter(filter: Locator, optionIndex = 0): Promise<string> {
    await this.ensureFilterPanelVisible();
    const target = filter.locator('visible=true').first();
    await this.expandFilter(target);
    const option = target
      .locator(this.s.listing.filterOption)
      .filter({ has: this.page.locator('input:not([disabled])') })
      .nth(optionIndex);
    const label = (await option.innerText()).trim();
    await this.reloadListing(() => option.locator('input').check({ force: true }));
    await this.closeFilterDropdowns();
    return label;
  }

  async applyPriceFilter(min?: number, max?: number): Promise<void> {
    await this.ensureFilterPanelVisible();
    const price = this.$(this.s.listing.filterPrice).locator('visible=true').first();
    await this.expandFilter(price);
    await this.reloadListing(async () => {
      if (min !== undefined) await price.locator('input[name="min-price"]').fill(String(min));
      if (max !== undefined) await price.locator('input[name="max-price"]').fill(String(max));
      await price.locator('input[name="max-price"]').press('Tab');
    });
    await this.closeFilterDropdowns();
  }

  get perPage(): Locator {
    return this.$(this.s.listing.perPage).locator('visible=true').first();
  }

  /** Picks the largest "items per page" value and waits until more products are shown. Returns that value. */
  async showMaxPerPage(): Promise<number> {
    const before = await this.productBoxes.count();
    const values = (await this.perPage.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value)))
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    const max = Math.max(...values);
    // the plugin stores the choice server-side and re-renders the listing (XHR or full reload)
    await this.perPage.selectOption(String(max));
    await expect.poll(() => this.productBoxes.count(), { timeout: 15_000 }).toBeGreaterThan(before);
    return max;
  }

  get activeFilters(): Locator {
    return this.$(`${this.s.listing.activeFilterContainer} ${this.s.listing.activeFilter}`);
  }

  async resetAllFilters(): Promise<void> {
    await this.closeFilterDropdowns();
    await this.reloadListing(() =>
      this.$(this.s.listing.resetAllFilters).locator('visible=true').first().click(),
    );
  }

  async openProduct(index = 0): Promise<string> {
    const link = this.productBoxes.nth(index).locator(this.s.listing.productName);
    const name = (await link.innerText()).trim();
    await this.clickAndLoad(link);
    return name;
  }

  async addToCartFromListing(index = 0): Promise<string> {
    const box = this.productBoxes.nth(index);
    const name = (await box.locator(this.s.listing.productName).innerText()).trim();
    await this.waitForXhr('/checkout/offcanvas', () => box.locator(this.s.listing.buyButton).click());
    return name;
  }

  /** Index of first box that has a direct buy button (no variant selection needed). */
  async firstBuyableIndex(): Promise<number> {
    const count = await this.productBoxes.count();
    for (let i = 0; i < count; i++) {
      if (await this.productBoxes.nth(i).locator(this.s.listing.buyButton).isVisible()) return i;
    }
    return -1;
  }
}
