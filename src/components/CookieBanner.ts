import { expect, type BrowserContext, type Locator } from '@playwright/test';
import { BasePage } from '../pages/BasePage';

/** Shopware core cookie consent ("cookie-preference" cookie). */
export class CookieBanner extends BasePage {
  get banner(): Locator {
    return this.$(this.s.cookie.banner);
  }

  /** Retries the click: on slow (mobile) page loads the first tap can land before the consent plugin is bound. */
  async acceptOnlyNecessary(): Promise<void> {
    // Shopware < 6.7 binds touchstart instead of click on touch devices
    const touch = await this.page.evaluate(() => 'ontouchstart' in window);
    const press = (l: Locator) => (touch ? l.tap() : l.click());
    await expect(async () => {
      const button = this.$(this.s.cookie.onlyNecessary).locator('visible=true').first();
      if (await button.count()) {
        await press(button);
      } else {
        // shops without an "only necessary" button: configure → save with nothing optional selected
        const submit = this.$(this.s.cookie.configurationSubmit).locator('visible=true').first();
        // 6.6 core wraps the button in a <span class="js-cookie-configuration-button">, 6.7 puts the class on the button
        const configure = this.$(`${this.s.cookie.configure} button, button${this.s.cookie.configure}`).locator('visible=true').first();
        if (!(await submit.count())) await press(configure);
        await press(submit);
      }
      await expect(this.banner).toBeHidden({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  }

  async acceptAll(): Promise<void> {
    const all = this.$(this.s.cookie.acceptAll).first();
    if (await all.isVisible()) await all.click();
    else await this.acceptOnlyNecessary();
  }

  /**
   * Pre-sets consent so the banner never overlays elements in functional tests.
   * Used by the base fixture for every test (except the cookie banner test).
   */
  static async preAccept(context: BrowserContext, baseURL: string): Promise<void> {
    const { hostname } = new URL(baseURL);
    await context.addCookies([
      { name: 'cookie-preference', value: '1', domain: hostname, path: '/', sameSite: 'Lax' },
    ]);
  }
}
