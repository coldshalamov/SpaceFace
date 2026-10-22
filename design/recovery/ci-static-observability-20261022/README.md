# Static CI observability recovery, 2026-10-22

The source fix is published in PR #500 at commit `2f99054e59e6bdd2d0cae722ffa02930ff3f8e90` (parent `47a4a8f55c36f472ec73081acae63332fb497575`, tree `06c726dcb22bd4fe66bb7a5da6ae3b94b9f00b14`). This recovery subtree preserves its patch, baseline, validation and evidence. It does not install another workflow or change any executable repository workflow.

## Source identities

Baseline public master: `53e32775ecd450992e0d8cea34a670b66c52cdf9`.
Baseline `.github/workflows/check.yml` blob: `ea472f463250011a3bf0f8b65d80c07867e54229`.
Published candidate blob: `031235fdfb06eb141e69ae1b29e8cf0f7001100a`.
The only source change is three added lines: the npm ci step ID, a comment, and the static matrix condition requiring non-cancellation and successful dependency installation. Existing setup success guards, prechecks, final failure aggregation, timeout and matrix commands are unchanged. Failed prechecks are not suppressed.

## Reproduction

Requirements: Python 3 with PyYAML available, Bash, Git, and Node.js (CI uses Node 22). Run from this directory:

    python validate.py
    node --test context/test/check-ci-report.test.mjs
    git apply --check --directory=baseline candidate.patch
    git hash-object baseline/.github/workflows/check.yml candidate/.github/workflows/check.yml

The context directory contains the baseline package scripts, CI report implementation, shared gate-graph module and focused tests. Do not run npm install or package aggregate commands here. The focused Node tests only classify command definitions; they do not execute the gameplay matrix.

## Recorded results

- `validation.log`: 512 setup/precheck/cancellation combinations passed. YAML semantic equality holds except the new step ID and runner condition. The actual unchanged final aggregation shell returns 0 for success and 1 for failure, skipped and cancelled static results.
- `routing-tests.log`: 30 focused classifier/report/sharding tests passed, zero failures.
- Read-only classification placed `check-settings-profile` in static shard 1 of 3, with 77 command definitions in each shard.
- Patch applicability and both workflow blob hashes were verified.

## Public evidence and semantics

Before the fix, [run 39775114111, static (1) job 119811969256](https://github.com/coldshalamov/SpaceFace/actions/runs/39775114111/job/119811969256) completed setup steps 2/3/4 successfully. Orchard step 9 and Ceres workfleet step 10 failed; static matrix step 13 was skipped. `ci-evidence.json` preserves that public job-step response.

[GitHub expression documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions) explains the implicit success condition and explicit cancellation-aware status function. [Step context documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context) defines outcome before continue-on-error. The dependency-install step retains implicit success, so its success also requires the preceding checkout and Node setup to succeed.

## Limits and current state

The Python validation is a restricted Boolean/string model, not a GitHub Actions emulator. There was no actionlint binary available. No full matrix, prohibited receiver-delivery test, browser, dependency installation or deployment was executed for this repair. A new hosted run was being observed when this package was prepared; no hosted pass is claimed here. The existing 20-minute budget can still limit completion after long prechecks. This fix removes failure-based skipping, not runtime failures, cancellation or timeouts, and does not repair the Orchard/Ceres failures.
