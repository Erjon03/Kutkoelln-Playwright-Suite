import { expect, type Locator, type Page, type Response } from '@playwright/test';
import type { ResolvedConfig } from '../config/types';
import type { Selectors } from '../selectors/shopware67';

/**
 * Base for all page objects: config + selectors + common Shopware helpers.
 * Page objects expose *intent* (addToCart, applyFilter), specs contain assertions.
 */
export abstract class BasePage {
  protected readonly s: Selectors;

  constructor(
    readonly page: Page,
    protected readonly cfg: ResolvedConfig,
  ) {
    this.s = cfg.selectors;
  }

  $(selector: string): Locator {
    return this.page.locator(selector);
  }

  /**
   * Waits for `load` so Shopware's JS plugins are bound — clicking earlier submits
   * forms natively (e.g. add-to-cart reloads the page instead of opening the off-canvas).
   */
  async goto(path: string): Promise<Response | null> {
    const res = await this.page.goto(path, { waitUntil: 'load' });
    await this.pluginsReady();
    return res;
  }

  /** Clicks a link and waits for the next document's `load` (see `goto`). */
  async clickAndLoad(target: Locator): Promise<void> {
    await Promise.all([this.page.waitForEvent('load'), target.click()]);
    await this.pluginsReady();
  }

  /** cfg.waitForNetworkIdle: late-binding JS plugins are ready once the network is idle (capped, never fails). */
  async pluginsReady(): Promise<void> {
    if (this.cfg.waitForNetworkIdle) await this.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  }

  /** Shopware sets body classes like "is-ctl-checkout is-act-cartpage". */
  async expectController(ctl: string | RegExp): Promise<void> {
    const re = typeof ctl === 'string' ? new RegExp(`\\bis-ctl-${ctl}\\b`) : ctl;
    await expect(this.page.locator('body')).toHaveClass(re);
  }

  /** Selects the first option whose text matches `label` (case-insensitive); no-op without a label or visible select. */
  protected async selectOptionByLabel(select: Locator, label?: string, waitForOptions = false): Promise<void> {
    if (!label) return;
    if (waitForOptions) {
      // e.g. the state select is only shown/filled once the country is chosen
      await expect(select.locator('option').filter({ hasText: new RegExp(label, 'i') }).first())
        .toBeAttached({ timeout: 5_000 })
        .catch(() => undefined);
    }
    if (!(await select.isVisible())) return;
    const values = await select.locator('option').evaluateAll((opts, src) => {
      const rx = new RegExp(src, 'i');
      return opts.filter((o) => rx.test(o.textContent ?? '')).map((o) => (o as HTMLOptionElement).value);
    }, new RegExp(label, 'i').source);
    if (values[0]) await select.selectOption(values[0]);
  }

  async expectPath(path: string | RegExp): Promise<void> {
    const re = typeof path === 'string' ? new RegExp(`${escapeRegExp(path)}(\\?.*)?$`) : path;
    await expect(this.page).toHaveURL(re);
  }

  /** Waits for the Shopware AJAX call triggered by `action` (listing, offcanvas, cart …). */
  async waitForXhr(urlPart: string | RegExp, action: () => Promise<unknown>): Promise<Response> {
    const matcher = (r: Response) =>
      (typeof urlPart === 'string' ? r.url().includes(urlPart) : urlPart.test(r.url())) && r.status() < 400;
    const [res] = await Promise.all([this.page.waitForResponse(matcher), action()]);
    return res;
  }
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
