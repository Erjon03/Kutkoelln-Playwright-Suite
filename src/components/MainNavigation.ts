import { expect, type Locator } from '@playwright/test';
import { BasePage, escapeRegExp } from '../pages/BasePage';

/**
 * Desktop main navigation + mobile off-canvas navigation.
 *
 * Shopware 6.7: root categories with children are Bootstrap dropdown toggles
 * (data-bs-toggle="dropdown"), so a click opens the flyout instead of navigating.
 * The flyout then contains a "go to category" link with the same href.
 */
export class MainNavigation extends BasePage {
  rootLink(name: string): Locator {
    return this.$(this.s.navigation.rootLink)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`, 'i') })
      .first();
  }

  async rootLinkTexts(): Promise<string[]> {
    return (await this.$(this.s.navigation.rootLink).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  async openCategory(name: string): Promise<void> {
    const link = this.rootLink(name);
    const href = (await link.getAttribute('href')) ?? '';
    const target = new URL(href, this.cfg.baseURL).pathname;
    await link.click();
    const navigated = await this.page
      .waitForURL((u) => u.pathname === target, { timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!navigated) {
      // dropdown opened → use the "show category" link inside the flyout
      const inFlyout = this.$(this.s.navigation.flyout).locator('visible=true').locator(`a[href="${href}"]`).first();
      if (await inFlyout.isVisible()) {
        await Promise.all([this.page.waitForURL((u) => u.pathname === target), inFlyout.click()]);
      } else {
        // plain link (no dropdown) on a slow page load
        await this.page.waitForURL((u) => u.pathname === target);
      }
    }
  }

  /** Opens the flyout of a root category (hover, fallback click) and returns it. */
  async openFlyout(name: string): Promise<Locator> {
    const link = this.rootLink(name);
    await link.hover();
    const visible = this.$(this.s.navigation.flyout).locator('visible=true').first();
    if (!(await visible.isVisible().catch(() => false))) {
      await this.page.waitForTimeout(500);
      if (!(await visible.isVisible())) await link.click();
    }
    await expect(visible).toBeVisible();
    return visible;
  }

  // --- mobile ---
  async openMobileMenu(): Promise<Locator> {
    const toggle = this.$(this.s.header.mobileMenuToggle).locator('visible=true').first();
    await toggle.click();
    const oc = this.$(this.s.navigation.offcanvas).first();
    await expect(oc).toBeVisible();
    // Shopware lazy-loads the menu content (/widgets/menu/offcanvas)
    // (visible only: some themes put a hidden logo link into the menu)
    await expect(oc.locator('a').locator('visible=true').first()).toBeVisible();
    return oc;
  }
}
