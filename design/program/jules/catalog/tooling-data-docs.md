<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# Tooling, data integrity, diagnostics, and documentation drift

Make the repository easier to trust and operate by reducing false greens, false reds, and stale routing knowledge.

**Tasks:** 70 · **Range:** `JULES-0881`–`JULES-0950`

## JULES-0881 — Package scripts and aggregate check topology — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-package-checks`

**Objective:** Construct a valid edge fixture for package scripts and aggregate check topology that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Context:** package scripts and aggregate check topology: missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Inspect:** `package.json`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that package scripts and aggregate check topology is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0881 --format prompt`

## JULES-0882 — Package scripts and aggregate check topology — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-package-checks`

**Objective:** Construct a realistic broken fixture for package scripts and aggregate check topology that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** package scripts and aggregate check topology: missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Inspect:** `package.json`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that package scripts and aggregate check topology is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0882 --format prompt`

## JULES-0883 — Package scripts and aggregate check topology — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-package-checks`

**Objective:** Audit package scripts and aggregate check topology output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** package scripts and aggregate check topology: missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Inspect:** `package.json`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that package scripts and aggregate check topology is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0883 --format prompt`

## JULES-0884 — Package scripts and aggregate check topology — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-package-checks`

**Objective:** Add a compact self-test/fixture matrix for package scripts and aggregate check topology covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Context:** package scripts and aggregate check topology: missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Inspect:** `package.json`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that package scripts and aggregate check topology is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0884 --format prompt`

## JULES-0885 — Package scripts and aggregate check topology — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `tool-package-checks`

**Objective:** Make one bounded operator improvement to package scripts and aggregate check topology: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** package scripts and aggregate check topology: missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Inspect:** `package.json`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that package scripts and aggregate check topology is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0885 --format prompt`

## JULES-0886 — Baseline gate and ci report accuracy — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-baseline-ci`

**Objective:** Construct a valid edge fixture for baseline gate and CI report accuracy that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries.

**Context:** baseline gate and CI report accuracy: test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries.

**Inspect:** `scripts/check-baseline.mjs`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that baseline gate and CI report accuracy is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0886 --format prompt`

## JULES-0887 — Baseline gate and ci report accuracy — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-baseline-ci`

**Objective:** Construct a realistic broken fixture for baseline gate and CI report accuracy that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** baseline gate and CI report accuracy: test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries.

**Inspect:** `scripts/check-baseline.mjs`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that baseline gate and CI report accuracy is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0887 --format prompt`

## JULES-0888 — Baseline gate and ci report accuracy — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-baseline-ci`

**Objective:** Audit baseline gate and CI report accuracy output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** baseline gate and CI report accuracy: test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries.

**Inspect:** `scripts/check-baseline.mjs`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that baseline gate and CI report accuracy is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0888 --format prompt`

## JULES-0889 — Baseline gate and ci report accuracy — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-baseline-ci`

**Objective:** Add a compact self-test/fixture matrix for baseline gate and CI report accuracy covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries.

**Context:** baseline gate and CI report accuracy: test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries.

**Inspect:** `scripts/check-baseline.mjs`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that baseline gate and CI report accuracy is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0889 --format prompt`

## JULES-0890 — Baseline gate and ci report accuracy — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `tool-baseline-ci`

**Objective:** Make one bounded operator improvement to baseline gate and CI report accuracy: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** baseline gate and CI report accuracy: test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries.

**Inspect:** `scripts/check-baseline.mjs`, `scripts/check-ci-report.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that baseline gate and CI report accuracy is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test test discovery, subprocess exit handling, timeout and signal behavior, complete red-result reporting, deterministic order, and machine-readable summaries and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0890 --format prompt`

## JULES-0891 — Simulation golden differential tooling — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-sim-golden-diff`

**Objective:** Construct a valid edge fixture for simulation golden differential tooling that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording.

**Context:** simulation golden differential tooling: reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording.

**Inspect:** `scripts/sim-golden-diff.mjs`, `scripts/sf-sim.mjs`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that simulation golden differential tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0891 --format prompt`

## JULES-0892 — Simulation golden differential tooling — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-sim-golden-diff`

**Objective:** Construct a realistic broken fixture for simulation golden differential tooling that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** simulation golden differential tooling: reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording.

**Inspect:** `scripts/sim-golden-diff.mjs`, `scripts/sf-sim.mjs`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that simulation golden differential tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0892 --format prompt`

## JULES-0893 — Simulation golden differential tooling — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-sim-golden-diff`

**Objective:** Audit simulation golden differential tooling output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** simulation golden differential tooling: reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording.

**Inspect:** `scripts/sim-golden-diff.mjs`, `scripts/sf-sim.mjs`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that simulation golden differential tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0893 --format prompt`

## JULES-0894 — Simulation golden differential tooling — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-sim-golden-diff`

**Objective:** Add a compact self-test/fixture matrix for simulation golden differential tooling covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording.

**Context:** simulation golden differential tooling: reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording.

**Inspect:** `scripts/sim-golden-diff.mjs`, `scripts/sf-sim.mjs`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that simulation golden differential tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0894 --format prompt`

## JULES-0895 — Simulation golden differential tooling — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `tool-sim-golden-diff`

**Objective:** Make one bounded operator improvement to simulation golden differential tooling: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** simulation golden differential tooling: reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording.

**Inspect:** `scripts/sim-golden-diff.mjs`, `scripts/sf-sim.mjs`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that simulation golden differential tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test reference extraction, exact command parity, motion/content classification, malformed fixtures, cleanup, and diagnostics that cannot authorize blind re-recording and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0895 --format prompt`

## JULES-0896 — Generated system and event registries — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-generated-registries`

**Objective:** Construct a valid edge fixture for generated system and event registries that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Context:** generated system and event registries: source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Inspect:** `scripts`, `docs/SYSTEM_REGISTRY.md`, `docs/EVENT_ROUTING.md`, `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that generated system and event registries is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0896 --format prompt`

## JULES-0897 — Generated system and event registries — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-generated-registries`

**Objective:** Construct a realistic broken fixture for generated system and event registries that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** generated system and event registries: source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Inspect:** `scripts`, `docs/SYSTEM_REGISTRY.md`, `docs/EVENT_ROUTING.md`, `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that generated system and event registries is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0897 --format prompt`

## JULES-0898 — Generated system and event registries — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-generated-registries`

**Objective:** Audit generated system and event registries output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** generated system and event registries: source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Inspect:** `scripts`, `docs/SYSTEM_REGISTRY.md`, `docs/EVENT_ROUTING.md`, `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that generated system and event registries is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0898 --format prompt`

## JULES-0899 — Generated system and event registries — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-generated-registries`

**Objective:** Add a compact self-test/fixture matrix for generated system and event registries covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Context:** generated system and event registries: source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Inspect:** `scripts`, `docs/SYSTEM_REGISTRY.md`, `docs/EVENT_ROUTING.md`, `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that generated system and event registries is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0899 --format prompt`

## JULES-0900 — Generated system and event registries — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `tool-generated-registries`

**Objective:** Make one bounded operator improvement to generated system and event registries: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** generated system and event registries: source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Inspect:** `scripts`, `docs/SYSTEM_REGISTRY.md`, `docs/EVENT_ROUTING.md`, `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that generated system and event registries is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0900 --format prompt`

## JULES-0901 — Source reachability, import graph, and dead-route checks — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-source-reachability`

**Objective:** Construct a valid edge fixture for source reachability, import graph, and dead-route checks that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Context:** source reachability, import graph, and dead-route checks: dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Inspect:** `scripts/check-src-reachability.mjs`, `src`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that source reachability, import graph, and dead-route checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0901 --format prompt`

## JULES-0902 — Source reachability, import graph, and dead-route checks — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-source-reachability`

**Objective:** Construct a realistic broken fixture for source reachability, import graph, and dead-route checks that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** source reachability, import graph, and dead-route checks: dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Inspect:** `scripts/check-src-reachability.mjs`, `src`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that source reachability, import graph, and dead-route checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0902 --format prompt`

## JULES-0903 — Source reachability, import graph, and dead-route checks — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-source-reachability`

**Objective:** Audit source reachability, import graph, and dead-route checks output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** source reachability, import graph, and dead-route checks: dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Inspect:** `scripts/check-src-reachability.mjs`, `src`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that source reachability, import graph, and dead-route checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0903 --format prompt`

## JULES-0904 — Source reachability, import graph, and dead-route checks — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-source-reachability`

**Objective:** Add a compact self-test/fixture matrix for source reachability, import graph, and dead-route checks covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Context:** source reachability, import graph, and dead-route checks: dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Inspect:** `scripts/check-src-reachability.mjs`, `src`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that source reachability, import graph, and dead-route checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0904 --format prompt`

## JULES-0905 — Source reachability, import graph, and dead-route checks — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `tool-source-reachability`

**Objective:** Make one bounded operator improvement to source reachability, import graph, and dead-route checks: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** source reachability, import graph, and dead-route checks: dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Inspect:** `scripts/check-src-reachability.mjs`, `src`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that source reachability, import graph, and dead-route checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0905 --format prompt`

## JULES-0906 — Data identifiers and cross-catalog references — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-data-integrity`

**Objective:** Construct a valid edge fixture for data identifiers and cross-catalog references that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Context:** data identifiers and cross-catalog references: duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Inspect:** `src/data`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that data identifiers and cross-catalog references is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0906 --format prompt`

## JULES-0907 — Data identifiers and cross-catalog references — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-data-integrity`

**Objective:** Construct a realistic broken fixture for data identifiers and cross-catalog references that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** data identifiers and cross-catalog references: duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Inspect:** `src/data`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that data identifiers and cross-catalog references is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0907 --format prompt`

## JULES-0908 — Data identifiers and cross-catalog references — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-data-integrity`

**Objective:** Audit data identifiers and cross-catalog references output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** data identifiers and cross-catalog references: duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Inspect:** `src/data`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that data identifiers and cross-catalog references is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0908 --format prompt`

## JULES-0909 — Data identifiers and cross-catalog references — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-data-integrity`

**Objective:** Add a compact self-test/fixture matrix for data identifiers and cross-catalog references covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Context:** data identifiers and cross-catalog references: duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Inspect:** `src/data`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that data identifiers and cross-catalog references is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0909 --format prompt`

## JULES-0910 — Data identifiers and cross-catalog references — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `tool-data-integrity`

**Objective:** Make one bounded operator improvement to data identifiers and cross-catalog references: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** data identifiers and cross-catalog references: duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Inspect:** `src/data`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that data identifiers and cross-catalog references is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0910 --format prompt`

## JULES-0911 — Asset manifest, classification, and reachability checks — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-asset-integrity`

**Objective:** Construct a valid edge fixture for asset manifest, classification, and reachability checks that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Context:** asset manifest, classification, and reachability checks: false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Inspect:** `scripts/check-asset-classifications.mjs`, `scripts`, `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that asset manifest, classification, and reachability checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0911 --format prompt`

## JULES-0912 — Asset manifest, classification, and reachability checks — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-asset-integrity`

**Objective:** Construct a realistic broken fixture for asset manifest, classification, and reachability checks that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** asset manifest, classification, and reachability checks: false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Inspect:** `scripts/check-asset-classifications.mjs`, `scripts`, `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that asset manifest, classification, and reachability checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0912 --format prompt`

## JULES-0913 — Asset manifest, classification, and reachability checks — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-asset-integrity`

**Objective:** Audit asset manifest, classification, and reachability checks output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** asset manifest, classification, and reachability checks: false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Inspect:** `scripts/check-asset-classifications.mjs`, `scripts`, `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that asset manifest, classification, and reachability checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0913 --format prompt`

## JULES-0914 — Asset manifest, classification, and reachability checks — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-asset-integrity`

**Objective:** Add a compact self-test/fixture matrix for asset manifest, classification, and reachability checks covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Context:** asset manifest, classification, and reachability checks: false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Inspect:** `scripts/check-asset-classifications.mjs`, `scripts`, `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that asset manifest, classification, and reachability checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0914 --format prompt`

## JULES-0915 — Asset manifest, classification, and reachability checks — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `tool-asset-integrity`

**Objective:** Make one bounded operator improvement to asset manifest, classification, and reachability checks: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** asset manifest, classification, and reachability checks: false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Inspect:** `scripts/check-asset-classifications.mjs`, `scripts`, `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that asset manifest, classification, and reachability checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0915 --format prompt`

## JULES-0916 — Save schema and migration validation tooling — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-save-schema`

**Objective:** Construct a valid edge fixture for save schema and migration validation tooling that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Context:** save schema and migration validation tooling: fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Inspect:** `src/save/saveSystem.js`, `test`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that save schema and migration validation tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0916 --format prompt`

## JULES-0917 — Save schema and migration validation tooling — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-save-schema`

**Objective:** Construct a realistic broken fixture for save schema and migration validation tooling that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** save schema and migration validation tooling: fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Inspect:** `src/save/saveSystem.js`, `test`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that save schema and migration validation tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0917 --format prompt`

## JULES-0918 — Save schema and migration validation tooling — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-save-schema`

**Objective:** Audit save schema and migration validation tooling output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** save schema and migration validation tooling: fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Inspect:** `src/save/saveSystem.js`, `test`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that save schema and migration validation tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0918 --format prompt`

## JULES-0919 — Save schema and migration validation tooling — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-save-schema`

**Objective:** Add a compact self-test/fixture matrix for save schema and migration validation tooling covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Context:** save schema and migration validation tooling: fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Inspect:** `src/save/saveSystem.js`, `test`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that save schema and migration validation tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0919 --format prompt`

## JULES-0920 — Save schema and migration validation tooling — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `tool-save-schema`

**Objective:** Make one bounded operator improvement to save schema and migration validation tooling: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** save schema and migration validation tooling: fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Inspect:** `src/save/saveSystem.js`, `test`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that save schema and migration validation tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0920 --format prompt`

## JULES-0921 — Validation broker and route manifests — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-validation-broker`

**Objective:** Construct a valid edge fixture for validation broker and route manifests that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Context:** validation broker and route manifests: manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Inspect:** `scripts/validation-broker-cli.mjs`, `scripts`, `docs/VALIDATION_WORKFLOW.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that validation broker and route manifests is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:strict:play-harness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0921 --format prompt`

## JULES-0922 — Validation broker and route manifests — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** s · **Collision:** `tool-validation-broker`

**Objective:** Construct a realistic broken fixture for validation broker and route manifests that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** validation broker and route manifests: manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Inspect:** `scripts/validation-broker-cli.mjs`, `scripts`, `docs/VALIDATION_WORKFLOW.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that validation broker and route manifests is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:strict:play-harness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0922 --format prompt`

## JULES-0923 — Validation broker and route manifests — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** s · **Collision:** `tool-validation-broker`

**Objective:** Audit validation broker and route manifests output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** validation broker and route manifests: manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Inspect:** `scripts/validation-broker-cli.mjs`, `scripts`, `docs/VALIDATION_WORKFLOW.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that validation broker and route manifests is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:strict:play-harness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0923 --format prompt`

## JULES-0924 — Validation broker and route manifests — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** s · **Collision:** `tool-validation-broker`

**Objective:** Add a compact self-test/fixture matrix for validation broker and route manifests covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Context:** validation broker and route manifests: manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Inspect:** `scripts/validation-broker-cli.mjs`, `scripts`, `docs/VALIDATION_WORKFLOW.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that validation broker and route manifests is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:strict:play-harness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0924 --format prompt`

## JULES-0925 — Validation broker and route manifests — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `tool-validation-broker`

**Objective:** Make one bounded operator improvement to validation broker and route manifests: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** validation broker and route manifests: manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Inspect:** `scripts/validation-broker-cli.mjs`, `scripts`, `docs/VALIDATION_WORKFLOW.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that validation broker and route manifests is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:strict:play-harness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0925 --format prompt`

## JULES-0926 — Browser and electron launch parity tooling — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-launch-parity`

**Objective:** Construct a valid edge fixture for Browser and Electron launch parity tooling that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics.

**Context:** Browser and Electron launch parity tooling: same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics.

**Inspect:** `server.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that Browser and Electron launch parity tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:build-identity`
- `npm run check:alpha:baseline:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0926 --format prompt`

## JULES-0927 — Browser and electron launch parity tooling — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-launch-parity`

**Objective:** Construct a realistic broken fixture for Browser and Electron launch parity tooling that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** Browser and Electron launch parity tooling: same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics.

**Inspect:** `server.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that Browser and Electron launch parity tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:build-identity`
- `npm run check:alpha:baseline:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0927 --format prompt`

## JULES-0928 — Browser and electron launch parity tooling — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-launch-parity`

**Objective:** Audit Browser and Electron launch parity tooling output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** Browser and Electron launch parity tooling: same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics.

**Inspect:** `server.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that Browser and Electron launch parity tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:build-identity`
- `npm run check:alpha:baseline:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0928 --format prompt`

## JULES-0929 — Browser and electron launch parity tooling — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-launch-parity`

**Objective:** Add a compact self-test/fixture matrix for Browser and Electron launch parity tooling covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics.

**Context:** Browser and Electron launch parity tooling: same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics.

**Inspect:** `server.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that Browser and Electron launch parity tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:build-identity`
- `npm run check:alpha:baseline:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0929 --format prompt`

## JULES-0930 — Browser and electron launch parity tooling — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `tool-launch-parity`

**Objective:** Make one bounded operator improvement to Browser and Electron launch parity tooling: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** Browser and Electron launch parity tooling: same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics.

**Inspect:** `server.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`, `scripts`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that Browser and Electron launch parity tooling is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test same-route guarantees, port/origin handling, player-save isolation, process cleanup, build identity, and actionable shell divergence diagnostics and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:build-identity`
- `npm run check:alpha:baseline:contracts`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0930 --format prompt`

## JULES-0931 — Css color, type, and frontend grammar checks — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-frontend-grammar`

**Objective:** Construct a valid edge fixture for CSS color, type, and frontend grammar checks that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar.

**Context:** CSS color, type, and frontend grammar checks: token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar.

**Inspect:** `scripts/check-colour-tokens.mjs`, `scripts/check-type-floor.mjs`, `styles`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that CSS color, type, and frontend grammar checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:colour-tokens`
- `npm run check:type-floor`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0931 --format prompt`

## JULES-0932 — Css color, type, and frontend grammar checks — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-frontend-grammar`

**Objective:** Construct a realistic broken fixture for CSS color, type, and frontend grammar checks that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** CSS color, type, and frontend grammar checks: token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar.

**Inspect:** `scripts/check-colour-tokens.mjs`, `scripts/check-type-floor.mjs`, `styles`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that CSS color, type, and frontend grammar checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:colour-tokens`
- `npm run check:type-floor`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0932 --format prompt`

## JULES-0933 — Css color, type, and frontend grammar checks — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-frontend-grammar`

**Objective:** Audit CSS color, type, and frontend grammar checks output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** CSS color, type, and frontend grammar checks: token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar.

**Inspect:** `scripts/check-colour-tokens.mjs`, `scripts/check-type-floor.mjs`, `styles`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that CSS color, type, and frontend grammar checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:colour-tokens`
- `npm run check:type-floor`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0933 --format prompt`

## JULES-0934 — Css color, type, and frontend grammar checks — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-frontend-grammar`

**Objective:** Add a compact self-test/fixture matrix for CSS color, type, and frontend grammar checks covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar.

**Context:** CSS color, type, and frontend grammar checks: token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar.

**Inspect:** `scripts/check-colour-tokens.mjs`, `scripts/check-type-floor.mjs`, `styles`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that CSS color, type, and frontend grammar checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:colour-tokens`
- `npm run check:type-floor`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0934 --format prompt`

## JULES-0935 — Css color, type, and frontend grammar checks — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `tool-frontend-grammar`

**Objective:** Make one bounded operator improvement to CSS color, type, and frontend grammar checks: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** CSS color, type, and frontend grammar checks: token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar.

**Inspect:** `scripts/check-colour-tokens.mjs`, `scripts/check-type-floor.mjs`, `styles`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that CSS color, type, and frontend grammar checks is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test token detection, computed-vs-source limitations, false exemptions, text floors, responsive states, and diagnostics tied to visual grammar and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:colour-tokens`
- `npm run check:type-floor`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0935 --format prompt`

## JULES-0936 — Dependency, license, and vendored-code hygiene — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-dependency-hygiene`

**Objective:** Construct a valid edge fixture for dependency, license, and vendored-code hygiene that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs.

**Context:** dependency, license, and vendored-code hygiene: unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs.

**Inspect:** `package.json`, `package-lock.json`, `src/render/GLTFLoader.js`, `vendor`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that dependency, license, and vendored-code hygiene is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0936 --format prompt`

## JULES-0937 — Dependency, license, and vendored-code hygiene — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P3 · **Risk:** medium · **Size:** s · **Collision:** `tool-dependency-hygiene`

**Objective:** Construct a realistic broken fixture for dependency, license, and vendored-code hygiene that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** dependency, license, and vendored-code hygiene: unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs.

**Inspect:** `package.json`, `package-lock.json`, `src/render/GLTFLoader.js`, `vendor`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that dependency, license, and vendored-code hygiene is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0937 --format prompt`

## JULES-0938 — Dependency, license, and vendored-code hygiene — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P3 · **Risk:** medium · **Size:** s · **Collision:** `tool-dependency-hygiene`

**Objective:** Audit dependency, license, and vendored-code hygiene output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** dependency, license, and vendored-code hygiene: unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs.

**Inspect:** `package.json`, `package-lock.json`, `src/render/GLTFLoader.js`, `vendor`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that dependency, license, and vendored-code hygiene is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0938 --format prompt`

## JULES-0939 — Dependency, license, and vendored-code hygiene — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P3 · **Risk:** medium · **Size:** s · **Collision:** `tool-dependency-hygiene`

**Objective:** Add a compact self-test/fixture matrix for dependency, license, and vendored-code hygiene covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs.

**Context:** dependency, license, and vendored-code hygiene: unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs.

**Inspect:** `package.json`, `package-lock.json`, `src/render/GLTFLoader.js`, `vendor`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that dependency, license, and vendored-code hygiene is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0939 --format prompt`

## JULES-0940 — Dependency, license, and vendored-code hygiene — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P3 · **Risk:** medium · **Size:** m · **Collision:** `tool-dependency-hygiene`

**Objective:** Make one bounded operator improvement to dependency, license, and vendored-code hygiene: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** dependency, license, and vendored-code hygiene: unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs.

**Inspect:** `package.json`, `package-lock.json`, `src/render/GLTFLoader.js`, `vendor`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Read the live production contract that dependency, license, and vendored-code hygiene is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test unused dependencies, duplicate packages, engine incompatibility, license/provenance records, vendored divergence, and deterministic installs and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0940 --format prompt`

## JULES-0941 — Architecture and module-map drift detection — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-doc-drift`

**Objective:** Construct a valid edge fixture for architecture and module-map drift detection that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code.

**Context:** architecture and module-map drift detection: claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code.

**Inspect:** `docs/MODULE_MAP.md`, `docs/COMMON_BUGS.md`, `src/core/registry.js`, `package.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `ARCHITECTURE.md`

**Work:**
1. Read the live production contract that architecture and module-map drift detection is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0941 --format prompt`

## JULES-0942 — Architecture and module-map drift detection — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-doc-drift`

**Objective:** Construct a realistic broken fixture for architecture and module-map drift detection that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** architecture and module-map drift detection: claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code.

**Inspect:** `docs/MODULE_MAP.md`, `docs/COMMON_BUGS.md`, `src/core/registry.js`, `package.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `ARCHITECTURE.md`

**Work:**
1. Read the live production contract that architecture and module-map drift detection is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0942 --format prompt`

## JULES-0943 — Architecture and module-map drift detection — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-doc-drift`

**Objective:** Audit architecture and module-map drift detection output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** architecture and module-map drift detection: claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code.

**Inspect:** `docs/MODULE_MAP.md`, `docs/COMMON_BUGS.md`, `src/core/registry.js`, `package.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `ARCHITECTURE.md`

**Work:**
1. Read the live production contract that architecture and module-map drift detection is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0943 --format prompt`

## JULES-0944 — Architecture and module-map drift detection — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `tool-doc-drift`

**Objective:** Add a compact self-test/fixture matrix for architecture and module-map drift detection covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code.

**Context:** architecture and module-map drift detection: claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code.

**Inspect:** `docs/MODULE_MAP.md`, `docs/COMMON_BUGS.md`, `src/core/registry.js`, `package.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `ARCHITECTURE.md`

**Work:**
1. Read the live production contract that architecture and module-map drift detection is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0944 --format prompt`

## JULES-0945 — Architecture and module-map drift detection — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `tool-doc-drift`

**Objective:** Make one bounded operator improvement to architecture and module-map drift detection: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** architecture and module-map drift detection: claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code.

**Inspect:** `docs/MODULE_MAP.md`, `docs/COMMON_BUGS.md`, `src/core/registry.js`, `package.json`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `ARCHITECTURE.md`

**Work:**
1. Read the live production contract that architecture and module-map drift detection is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test claims about live owners, backend selection, scripts, paths, data counts, and recurring-bug routes that no longer match code and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0945 --format prompt`

## JULES-0946 — Program and inference dispatcher contracts — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-program-dispatch`

**Objective:** Construct a valid edge fixture for program and inference dispatcher contracts that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance.

**Context:** program and inference dispatcher contracts: dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance.

**Inspect:** `scripts/program-dispatch.mjs`, `scripts/inference-record.mjs`, `test`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `design/program/roadmap/program-queue.json`, `design/program/INFERENCE_LANES.md`, `design/program/AGENTS.md`

**Work:**
1. Read the live production contract that program and inference dispatcher contracts is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The fixture is valid under current production authority and fails before the correction when a false positive exists.
- The change narrows the rule instead of adding a broad exemption or ignored path.
- A nearby truly invalid fixture remains red.
- Exit status and machine-readable output stay deterministic.

**Suggested proof:**
- `node scripts/program-dispatch.mjs --ready`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0946 --format prompt`

## JULES-0947 — Program and inference dispatcher contracts — close one false-negative path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** s · **Collision:** `tool-program-dispatch`

**Objective:** Construct a realistic broken fixture for program and inference dispatcher contracts that could currently pass. Strengthen the check/tool so the invalid production state fails with a precise owner-level diagnostic.

**Context:** program and inference dispatcher contracts: dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance.

**Inspect:** `scripts/program-dispatch.mjs`, `scripts/inference-record.mjs`, `test`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `design/program/roadmap/program-queue.json`, `design/program/INFERENCE_LANES.md`, `design/program/AGENTS.md`

**Work:**
1. Read the live production contract that program and inference dispatcher contracts is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The malformed fixture represents a real failure mode, not arbitrary syntax damage.
- The old tool passes or under-reports it; the new tool fails with the exact path/ID/reason.
- Valid production and fixtures remain green.
- The check avoids hard-coded counts and stale copied inventories.

**Suggested proof:**
- `node scripts/program-dispatch.mjs --ready`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0947 --format prompt`

## JULES-0948 — Program and inference dispatcher contracts — make diagnostics complete and deterministic

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** s · **Collision:** `tool-program-dispatch`

**Objective:** Audit program and inference dispatcher contracts output ordering, subprocess/error propagation, path normalization, and multi-failure reporting. Repair one nondeterministic, truncated, misleading, or non-actionable diagnostic behavior.

**Context:** program and inference dispatcher contracts: dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance.

**Inspect:** `scripts/program-dispatch.mjs`, `scripts/inference-record.mjs`, `test`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `design/program/roadmap/program-queue.json`, `design/program/INFERENCE_LANES.md`, `design/program/AGENTS.md`

**Work:**
1. Read the live production contract that program and inference dispatcher contracts is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Equivalent inputs produce byte-stable or semantically stable diagnostic order.
- Multiple independent failures are reported when the command claims broad coverage.
- The original exit code/signal/timeout cause is preserved.
- Messages name the owning file/key and next executable verification step.

**Suggested proof:**
- `node scripts/program-dispatch.mjs --ready`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0948 --format prompt`

## JULES-0949 — Program and inference dispatcher contracts — add adversarial self-tests

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** s · **Collision:** `tool-program-dispatch`

**Objective:** Add a compact self-test/fixture matrix for program and inference dispatcher contracts covering one valid case, one direct invalid case, one malformed case, and one stale/partial case relevant to dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance.

**Context:** program and inference dispatcher contracts: dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance.

**Inspect:** `scripts/program-dispatch.mjs`, `scripts/inference-record.mjs`, `test`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `design/program/roadmap/program-queue.json`, `design/program/INFERENCE_LANES.md`, `design/program/AGENTS.md`

**Work:**
1. Read the live production contract that program and inference dispatcher contracts is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- Self-tests run without mutating production files or requiring the player save directory.
- Each fixture states the semantic contract and expected exit/result.
- Temporary files/processes are cleaned on success and failure.
- The normal command remains fast enough for its intended gate tier.

**Suggested proof:**
- `node scripts/program-dispatch.mjs --ready`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0949 --format prompt`

## JULES-0950 — Program and inference dispatcher contracts — improve CLI and operator integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `tool-program-dispatch`

**Objective:** Make one bounded operator improvement to program and inference dispatcher contracts: discoverability, `--help`, machine-readable output, exact dry-run, path routing, or documentation generated from live code. Do not create a competing workflow.

**Context:** program and inference dispatcher contracts: dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance.

**Inspect:** `scripts/program-dispatch.mjs`, `scripts/inference-record.mjs`, `test`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `design/program/roadmap/program-queue.json`, `design/program/INFERENCE_LANES.md`, `design/program/AGENTS.md`

**Work:**
1. Read the live production contract that program and inference dispatcher contracts is supposed to validate or explain.
2. Construct the smallest valid and invalid fixtures needed to test dependency-front selection, identity stability, state mutation boundaries, malformed rows, deterministic output, and no accidental admission or acceptance and the selected facet.
3. Repair the tool/check/derived documentation at its existing owner; do not create a competing queue, registry, or acceptance system.
4. Run self-tests plus the real command and preserve deterministic exit/diagnostic behavior.

**Acceptance:**
- The operator can execute the path from a clean checkout with one documented command.
- Dry-run/read-only modes cannot mutate repository or player state.
- Documentation derives volatile facts from code or clearly marks them as generated.
- The change plugs into existing package/check/program routing rather than creating a second queue or acceptance authority.

**Suggested proof:**
- `node scripts/program-dispatch.mjs --ready`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the tool already distinguishes the scoped valid/invalid cases and its diagnostics are complete. Do not churn documentation for style.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0950 --format prompt`
