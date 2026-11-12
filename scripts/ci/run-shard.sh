#!/usr/bin/env bash
# Runs one shard of the suite inside a Bitbucket Pipelines parallel step.
# Needs PROJECT (set in bitbucket-pipelines.yml) and the repository variables (BASE_URL, credentials).
#
# Test failures do NOT fail this step: Bitbucket stops the pipeline after a failed step, and the
# merge step must still build the report. The exit code is stored in ci-status/ and the merge step
# fails the pipeline afterwards. Configuration errors (no tests listed, no results) fail right here.
set -uo pipefail

: "${PROJECT:?PROJECT is not set}"
export CI=true
# hardcoded on purpose: real contact form messages never run in CI
export SEND_MESSAGES=false

SHARD=$(( ${BITBUCKET_PARALLEL_STEP:-0} + 1 ))
TOTAL=${BITBUCKET_PARALLEL_STEP_COUNT:-1}

# pull requests: smoke only. Custom pipelines may pass GREP (empty = full suite).
GREP="${GREP:-}"
if [ -n "${BITBUCKET_PR_ID:-}" ]; then GREP="@smoke"; fi

# Guard: a failing listing (e.g. missing variable) stops the run before any test touches the shop
if ! LIST=$(npx playwright test --list); then
  echo "ERROR: could not list tests - check the BASE_URL variable and the secured repository variables"
  exit 1
fi
if echo "$LIST" | grep -q "@sends-message"; then
  echo "ERROR: a @sends-message test is in the test list - aborting"
  exit 1
fi

echo "Shard ${SHARD}/${TOTAL}, grep: '${GREP:-<full suite>}'"
npx playwright test ${GREP:+--grep "$GREP"} --shard="${SHARD}/${TOTAL}"
RC=$?

mkdir -p ci-status
echo "$RC" > "ci-status/shard-${SHARD}.rc"

# no blob report = Playwright did not really run (config or environment error)
if ! ls blob-report/*.zip >/dev/null 2>&1; then
  echo "ERROR: no blob report written (exit code ${RC}) - Playwright did not run, see the log above"
  exit 1
fi
exit 0
