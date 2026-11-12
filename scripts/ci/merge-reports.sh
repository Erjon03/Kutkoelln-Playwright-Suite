#!/usr/bin/env bash
# Merges the shard blob reports into one HTML + JUnit report + run summary, prints the summary,
# then fails the pipeline if any shard had failing tests (see run-shard.sh).
set -uo pipefail

# test-reports/ is picked up by Bitbucket's "Tests" tab
PLAYWRIGHT_JUNIT_OUTPUT_FILE=test-reports/junit.xml \
  npx playwright merge-reports --reporter html,junit,./src/reporting/RunSummaryReporter.ts ./blob-report
MERGE_RC=$?

FAILED=0
for f in ci-status/shard-*.rc; do
  [ -e "$f" ] || { echo "ERROR: no shard status found"; exit 1; }
  RC=$(cat "$f")
  if [ "$RC" != "0" ]; then
    echo "$(basename "$f" .rc): tests failed (exit code ${RC})"
    FAILED=1
  fi
done

[ "$MERGE_RC" = "0" ] || { echo "ERROR: merging the reports failed"; exit 1; }
if [ "$FAILED" = "1" ]; then
  echo "Download the playwright-report artifact (Artifacts tab) for traces and screenshots."
  exit 1
fi
