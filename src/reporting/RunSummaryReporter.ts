import * as fs from 'fs';
import * as path from 'path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';

/**
 * Writes a short run summary (every test with its status) next to the full HTML report:
 *   run-summary/<project>_<date>_<time>.md / .html / .json
 * In GitHub Actions the Markdown is also added to the run's summary page.
 * The .json files feed scripts/combine-run-summaries.ts (one report for all shops).
 *
 * The files get shared with people outside the repo, so they carry no environment details:
 * URLs in error messages are replaced by <url>.
 */

export type Status = 'passed' | 'failed' | 'flaky' | 'skipped';

export interface Row {
  browser: string;
  file: string;
  title: string;
  status: Status;
  durationMs: number;
  error?: string;
}

export interface RunInfo {
  project: string;
  started: string; // ISO date
  durationMs: number;
  overall: FullResult['status'];
  trigger: string;
  runUrl?: string;
}

export interface RunSummary {
  info: RunInfo;
  rows: Row[];
}

interface Options {
  outputDir?: string;
}

const STATUS_ORDER: Status[] = ['failed', 'flaky', 'passed', 'skipped'];
const STATUS_LABEL: Record<Status, string> = {
  failed: '❌ failed',
  flaky: '⚠️ flaky',
  passed: '✅ passed',
  skipped: '⏭️ skipped',
};

export default class RunSummaryReporter implements Reporter {
  private config!: FullConfig;
  private suite!: Suite;
  private readonly outputDir: string;

  constructor(options: Options = {}) {
    this.outputDir = options.outputDir ?? 'run-summary';
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.suite = suite;
  }

  onEnd(result: FullResult): void {
    // `playwright test --list` also ends here, without running anything → no summary
    if (this.suite.allTests().every((t) => t.results.length === 0)) return;
    const rows = this.suite.allTests().map((t) => this.toRow(t));
    rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

    const summary: RunSummary = {
      info: {
        project: String(this.config.metadata?.project ?? process.env.PROJECT ?? 'unknown'),
        started: result.startTime.toISOString(),
        durationMs: result.duration,
        overall: result.status,
        trigger: describeTrigger(),
        runUrl: githubRunUrl(),
      },
      rows,
    };

    const base = path.join(this.outputDir, `${slug(summary.info.project)}_${fileStamp(summary.info.started)}`);
    const md = toMarkdown(summary);
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(`${base}.md`, md);
    fs.writeFileSync(`${base}.html`, toHtml([summary]));
    fs.writeFileSync(`${base}.json`, JSON.stringify(summary, null, 2));

    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
    console.log(`Run summary: ${base}.html\nStatus message: ${toTeamsLine(summary)}`);
  }

  private toRow(test: TestCase): Row {
    const outcome = test.outcome();
    const last = test.results[test.results.length - 1];
    const status: Status =
      outcome === 'expected' ? 'passed' : outcome === 'unexpected' ? 'failed' : outcome;
    return {
      browser: test.parent.project()?.name ?? '',
      file: path.relative(this.config.rootDir, test.location.file),
      // titlePath: ['', project, file, ...describe blocks, test title]
      title: test.titlePath().slice(3).join(' › '),
      status,
      durationMs: test.results.reduce((sum, r) => sum + r.duration, 0),
      error: status === 'failed' || status === 'flaky' ? firstErrorLine(test, last) : undefined,
    };
  }
}

function firstErrorLine(test: TestCase, last: TestCase['results'][number] | undefined): string | undefined {
  // flaky: the last attempt passed, so take the error of the first failed attempt
  const result = last?.errors.length ? last : test.results.find((r) => r.errors.length);
  const message = result?.errors[0]?.message;
  if (!message) {
    // test.fail() for a known issue, but the test passed → no error, the issue may be fixed
    if (test.expectedStatus === 'failed' && last?.status === 'passed') {
      const reason = test.annotations.find((a) => a.type === 'fail')?.description;
      return `Expected to fail${reason ? ` (${reason})` : ''}, but passed: issue may be fixed`;
    }
    return undefined;
  }
  const line = stripAnsi(message).split('\n').find((l) => l.trim()) ?? '';
  return redact(line.trim()).slice(0, 200);
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function redact(s: string): string {
  return s.replace(/https?:\/\/\S+/g, '<url>');
}

function describeTrigger(): string {
  if (!process.env.GITHUB_ACTIONS) return 'local run';
  const event = process.env.GITHUB_EVENT_NAME ?? '';
  const labels: Record<string, string> = {
    schedule: 'daily CI run',
    push: 'CI run (push to main)',
    pull_request: 'CI run (pull request, @smoke only)',
    workflow_dispatch: 'CI run (started manually)',
  };
  return labels[event] ?? `CI run (${event})`;
}

function githubRunUrl(): string | undefined {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return undefined;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

// display name e.g. "My Shop (staging)" → "my-shop-staging"
export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ISO date → "2026-11-04_0300"
export function fileStamp(iso: string): string {
  return iso.slice(0, 16).replace('T', '_').replace(':', '');
}

function count(rows: Row[]): Record<Status, number> {
  const c: Record<Status, number> = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

function isFailed(run: RunSummary): boolean {
  return run.rows.some((r) => r.status === 'failed') || run.info.overall !== 'passed';
}

function endedEarly(run: RunSummary): boolean {
  return run.info.overall === 'interrupted' || run.info.overall === 'timedout';
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ') + ' UTC';
}

function md(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function mdTable(list: Row[], withError: boolean): string {
  return [
    `| Status | Test | File | Browser | Time${withError ? ' | Error' : ''} |`,
    `|---|---|---|---|---${withError ? '|---' : ''}|`,
    ...list.map(
      (r) =>
        `| ${STATUS_LABEL[r.status]} | ${md(r.title)} | ${md(r.file)} | ${r.browser} | ${formatDuration(r.durationMs)}` +
        (withError ? ` | ${md(r.error ?? '')}` : '') +
        ' |',
    ),
  ].join('\n');
}

export function toMarkdown(run: RunSummary): string {
  const { info, rows } = run;
  const c = count(rows);
  const problems = rows.filter((r) => r.status === 'failed' || r.status === 'flaky');
  const lines = [
    `## Test run: ${info.project} ${isFailed(run) ? '❌ FAILED' : '✅ PASSED'}`,
    '',
    `**${formatDate(info.started)}** · ${info.trigger} · duration ${formatDuration(info.durationMs)}` +
      (info.runUrl ? ` · [full report and traces](${info.runUrl})` : ''),
    '',
    `| Total | ✅ Passed | ❌ Failed | ⚠️ Flaky | ⏭️ Skipped |`,
    `|---|---|---|---|---|`,
    `| ${rows.length} | ${c.passed} | ${c.failed} | ${c.flaky} | ${c.skipped} |`,
    '',
  ];
  if (endedEarly(run)) lines.push(`> Run ended early (${info.overall}): not every test ran.`, '');
  if (problems.length) lines.push('### Failed and flaky tests', '', mdTable(problems, true), '');
  lines.push('<details><summary>All tests</summary>', '', mdTable(rows, false), '', '</details>', '');
  return lines.join('\n');
}

/**
 * One line per shop for a Teams/chat status message, e.g.
 *   "My Shop (staging) - 120 tests ran - fully green"
 *   "My Shop (staging) - 120 tests ran - 2 issues - already known - now passing, may be fixed"
 * New failures say "to be checked": whether it's a shop bug (ticket) or a test/workflow issue is decided by a person.
 */
export function toTeamsLine(run: RunSummary): string {
  const c = count(run.rows);
  const ran = run.rows.length - c.skipped;
  const head = `${run.info.project} - ${ran} test${ran === 1 ? '' : 's'} ran`;
  const flaky = c.flaky ? ` (${c.flaky} flaky, passed on retry)` : '';
  const failed = run.rows.filter((r) => r.status === 'failed');
  if (!failed.length && !endedEarly(run)) return `${head} - fully green${flaky}`;

  const knownFixed = failed.filter((r) => r.error?.startsWith('Expected to fail')).length;
  const unknown = failed.length - knownFixed;
  const parts = [
    unknown ? `${unknown} to be checked` : '',
    knownFixed ? `${knownFixed} already known - now passing, may be fixed` : '',
  ].filter(Boolean);
  const issues = `${failed.length} issue${failed.length === 1 ? '' : 's'}`;
  // only one kind → no need to repeat the count
  const detail = !unknown
    ? 'already known - now passing, may be fixed'
    : !knownFixed
      ? 'to be checked'
      : parts.join(', ');
  const early = endedEarly(run) ? ` - run ended early (${run.info.overall})` : '';
  return `${head} - ${issues}${failed.length ? ` - ${detail}` : ''}${early}${flaky}`;
}

export const TEAMS_HINT =
  'replace "to be checked" with e.g. "confirmed bugs - tickets opened" or "workflow issue - button id changed" before posting';

export function toCombinedMarkdown(runs: RunSummary[]): string {
  const overview = [
    `# Test runs: ${runs.length} shops ${runs.some(isFailed) ? '❌ FAILED' : '✅ PASSED'}`,
    '',
    `**Status message** (${TEAMS_HINT}):`,
    '',
    '```',
    ...runs.map(toTeamsLine),
    '```',
    '',
    `| Shop | Result | Total | ✅ Passed | ❌ Failed | ⚠️ Flaky | ⏭️ Skipped | Started | Duration |`,
    `|---|---|---|---|---|---|---|---|---|`,
    ...runs.map((run) => {
      const c = count(run.rows);
      return (
        `| ${md(run.info.project)} | ${isFailed(run) ? '❌ failed' : '✅ passed'} | ${run.rows.length} | ${c.passed} | ` +
        `${c.failed} | ${c.flaky} | ${c.skipped} | ${formatDate(run.info.started)} | ${formatDuration(run.info.durationMs)} |`
      );
    }),
    '',
  ];
  return [...overview, ...runs.map(toMarkdown)].join('\n');
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

function tiles(rows: Row[]): string {
  const c = count(rows);
  return `<div class="tiles">
    <div class="tile"><b>${rows.length}</b><span>Total</span></div>
    <div class="tile"><b class="t-pass">${c.passed}</b><span>Passed</span></div>
    <div class="tile"><b class="t-fail">${c.failed}</b><span>Failed</span></div>
    <div class="tile"><b class="t-flaky">${c.flaky}</b><span>Flaky</span></div>
    <div class="tile"><b class="t-skip">${c.skipped}</b><span>Skipped</span></div>
  </div>`;
}

function result(failed: boolean): string {
  return `<span class="result ${failed ? 't-fail' : 't-pass'}">${failed ? 'FAILED' : 'PASSED'}</span>`;
}

function runSection(run: RunSummary, heading: 'h1' | 'h2'): string {
  const { info, rows } = run;
  const body = rows
    .map(
      (r) => `<tr class="${r.status}">
  <td><span class="badge">${r.status}</span></td>
  <td>${esc(r.title)}${r.error ? `<div class="err">${esc(r.error)}</div>` : ''}</td>
  <td class="mono">${esc(r.file)}</td>
  <td>${esc(r.browser)}</td>
  <td class="num">${formatDuration(r.durationMs)}</td>
</tr>`,
    )
    .join('\n');
  const prefix = heading === 'h1' ? 'Test run: ' : '';
  return `<section id="${slug(info.project)}">
  <${heading}>${prefix}${esc(info.project)} ${result(isFailed(run))}</${heading}>
  <div class="meta">${formatDate(info.started)} · ${esc(info.trigger)} · duration ${formatDuration(info.durationMs)}${
    endedEarly(run) ? ` · ended early (${info.overall})` : ''
  }${info.runUrl ? ` · <a href="${esc(info.runUrl)}">full report and traces</a>` : ''}</div>
  ${tiles(rows)}
  <div class="table-wrap">
  <table>
    <thead><tr><th>Status</th><th>Test</th><th>File</th><th>Browser</th><th class="num">Time</th></tr></thead>
    <tbody>
${body}
    </tbody>
  </table>
  </div>
</section>`;
}

function overviewSection(runs: RunSummary[]): string {
  const rows = runs
    .map((run) => {
      const c = count(run.rows);
      return `<tr>
  <td><a href="#${slug(run.info.project)}">${esc(run.info.project)}</a></td>
  <td>${result(isFailed(run))}</td>
  <td class="num">${run.rows.length}</td>
  <td class="num t-pass">${c.passed}</td>
  <td class="num t-fail">${c.failed}</td>
  <td class="num t-flaky">${c.flaky}</td>
  <td class="num t-skip">${c.skipped}</td>
  <td class="num">${formatDate(run.info.started)}</td>
  <td class="num">${formatDuration(run.info.durationMs)}</td>
</tr>`;
    })
    .join('\n');
  return `<section>
  <h1>Test runs: ${runs.length} shops ${result(runs.some(isFailed))}</h1>
  ${tiles(runs.flatMap((r) => r.rows))}
  <div class="table-wrap">
  <table>
    <thead><tr><th>Shop</th><th>Result</th><th class="num">Total</th><th class="num">Passed</th><th class="num">Failed</th>
      <th class="num">Flaky</th><th class="num">Skipped</th><th class="num">Started</th><th class="num">Duration</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  </div>
</section>`;
}

/** One run → single-shop page; several runs → overview table on top, then one section per shop. */
export function toHtml(runs: RunSummary[]): string {
  const title = runs.length === 1 ? `Test run ${runs[0].info.project}` : `Test runs ${runs.length} shops`;
  const teams = `<div class="teams">
  <div class="teams-head"><b>Status message</b><span>${esc(TEAMS_HINT)}</span></div>
  <pre>${esc(runs.map(toTeamsLine).join('\n'))}</pre>
</div>`;
  const content =
    runs.length === 1
      ? runSection(runs[0], 'h1').replace('<div class="tiles">', `${teams}\n  <div class="tiles">`)
      : [overviewSection(runs).replace('<div class="tiles">', `${teams}\n  <div class="tiles">`), ...runs.map((r) => runSection(r, 'h2'))].join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --bg:#fff; --fg:#1d2330; --muted:#667085; --line:#e4e7ec; --pass:#12805c; --fail:#c4320a; --flaky:#b54708; --skip:#667085; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14171f; --fg:#e6e8ee; --muted:#98a2b3; --line:#2b313d; --pass:#47cd89; --fail:#f97066; --flaky:#fdb022; --skip:#98a2b3; } }
  body { margin:0; padding:24px 16px; background:var(--bg); color:var(--fg); font:14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; }
  main { max-width:1100px; margin:0 auto; }
  section + section { margin-top:48px; padding-top:24px; border-top:2px solid var(--line); }
  h1 { font-size:22px; margin:0 0 4px; }
  h2 { font-size:18px; margin:0 0 4px; }
  a { color:inherit; }
  .meta { color:var(--muted); margin-bottom:20px; }
  .result { font-weight:600; }
  .t-pass { color:var(--pass); } .t-fail { color:var(--fail); } .t-flaky { color:var(--flaky); } .t-skip { color:var(--skip); }
  .tiles { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0 24px; }
  .tile { border:1px solid var(--line); border-radius:8px; padding:10px 16px; min-width:90px; }
  .tile b { display:block; font-size:22px; }
  .tile span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .table-wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:500; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .mono { font-family:ui-monospace, Menlo, monospace; font-size:12px; color:var(--muted); }
  .num { white-space:nowrap; text-align:right; }
  .badge { font-size:12px; font-weight:600; text-transform:uppercase; }
  .passed .badge { color:var(--pass); } .failed .badge { color:var(--fail); }
  .flaky .badge { color:var(--flaky); } .skipped .badge { color:var(--skip); }
  .teams { border:1px solid var(--line); border-left:4px solid var(--muted); border-radius:8px; padding:12px 16px; margin:16px 0; }
  .teams-head { display:flex; gap:12px; flex-wrap:wrap; align-items:baseline; }
  .teams-head span { color:var(--muted); font-size:12px; }
  .teams pre { margin:8px 0 0; font:13px/1.6 ui-monospace, Menlo, monospace; white-space:pre-wrap; user-select:all; }
  .err { margin-top:4px; font-family:ui-monospace, Menlo, monospace; font-size:12px; color:var(--fail); word-break:break-word; }
</style>
</head>
<body>
<main>
${content}
</main>
</body>
</html>
`;
}
