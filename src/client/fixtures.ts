/**
 * Extension point for client projects.
 * Add client page objects here and extend the core fixtures — core stays untouched.
 */
import { test as core, expect } from '../fixtures';
import { BasePage } from '../pages/BasePage';

/** Example client page object (e.g. a custom "store locator" plugin). */
export class ExampleCustomPage extends BasePage {
  readonly path = '/store-locator';
  get root() {
    return this.$('.store-locator');
  }
  async open() {
    await this.goto(this.path);
  }
}

type ClientFixtures = {
  exampleCustomPage: ExampleCustomPage;
};

export const test = core.extend<ClientFixtures>({
  exampleCustomPage: async ({ page, cfg }, use) => use(new ExampleCustomPage(page, cfg)),
});

export { expect };
