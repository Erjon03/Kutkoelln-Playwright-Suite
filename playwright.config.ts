import { defineConfig, devices, type Project } from '@playwright/test';
import { loadConfig } from './src/config/loader';

const cfg = loadConfig();
const isCI = !!process.env.CI;

// SKIP_CHECKOUT_TESTS=true → checkout specs are never collected (e.g. client froze test orders)
const ignoredTests = [/setup\/.*/, ...(process.env.SKIP_CHECKOUT_TESTS === 'true' ? [/checkout\.spec\.ts/] : [])];

// @sends-message tests send a real message to the shop (contact form). Never part of a normal run:
// they only run with SEND_MESSAGES=true (npm run test:messages), on purpose and after an explicit OK.
const sendsMessage = process.env.SEND_MESSAGES === 'true' ? undefined : /@sends-message/;

const extraBrowsers = (process.env.EXTRA_BROWSERS ?? '')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

const browserDevices: Record<string, (typeof devices)[string]> = {
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

const desktopProjects: Project[] = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ...extraBrowsers
    .filter((b) => browserDevices[b])
    .map((b) => ({ name: b, use: { ...browserDevices[b] } })),
].map((p) => ({
  ...p,
  testDir: './tests',
  testIgnore: ignoredTests,
  grepInvert: [/@mobile-only/, ...(sendsMessage ? [sendsMessage] : [])],
  dependencies: ['setup'],
}));

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // the profile can cap parallel browsers for rate-limited environments (maxWorkers)
  workers: cfg.maxWorkers ?? (isCI ? 2 : undefined),
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // CI: each shard writes a blob report; the merge-reports job turns them into one HTML + JUnit report + run summary.
  // Local: run-summary/<project>_<date>_<time>.html/.md is kept per run (shareable overview, no URLs).
  reporter: isCI
    ? [['list'], ['blob']]
    : [['list'], ['html', { open: 'on-failure' }], ['./src/reporting/RunSummaryReporter.ts']],

  // no baseURL here: reports get shared and must not contain the environment's URL
  metadata: { project: cfg.name },

  use: {
    baseURL: cfg.baseURL,
    httpCredentials: cfg.env.httpCredentials,
    locale: cfg.locale,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /setup\/.*\.setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: /setup\/.*\.teardown\.ts/,
    },
    ...desktopProjects,
    {
      name: 'mobile',
      testDir: './tests',
      testIgnore: ignoredTests,
      grep: /@mobile/,
      grepInvert: sendsMessage,
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
  ],
});
