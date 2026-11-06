# Client-specific tests

Put tests for **client-specific features and customisations** here — everything that is
not standard Shopware (custom plugins, B2B flows, configurators, custom CMS elements…).

Rules of thumb:

- Keep `tests/storefront/**` untouched in client projects. If a core test fails because
  the theme differs, fix it via `selectors` / `features` / `testData` in `projects/<client>.ts`.
- Put client page objects in `src/client/` and extend the fixtures there
  (see `example-custom-feature.spec.ts`).
- Tag client tests `@client` so they can be run separately: `npx playwright test --grep @client`.
