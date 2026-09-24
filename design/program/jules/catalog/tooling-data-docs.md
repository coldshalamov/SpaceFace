<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# Tooling, data integrity, diagnostics, and documentation drift

Make the repository easier to trust and operate by reducing false greens, false reds, and stale routing knowledge.

**Tasks:** 7 · **Range:** `JULES-0156`–`JULES-0162`

## JULES-0156 — Package scripts and aggregate check topology — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-package-checks`

**Objective:** Construct a valid edge fixture for package scripts and aggregate check topology that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Context:** package scripts and aggregate check topology: missing commands, accidental lifecycle hooks, fail-fast under-reporting, duplicate links, exit propagation, and clear check ownership.

**Inspect:** `package.json` `scripts/check-ci-report.mjs`

**Read first:** `build_map.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0156 --format prompt`

## JULES-0157 — Generated system and event registries — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-generated-registries`

**Objective:** Construct a valid edge fixture for generated system and event registries that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Context:** generated system and event registries: source-of-truth extraction, stable ordering, stale output detection, alias resolution, duplicate ownership, and useful drift errors.

**Inspect:** `scripts` `docs/SYSTEM_REGISTRY.md` `docs/EVENT_ROUTING.md` `src/core/registry.js`

**Read first:** `build_map.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0157 --format prompt`

## JULES-0158 — Source reachability, import graph, and dead-route checks — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-source-reachability`

**Objective:** Construct a valid edge fixture for source reachability, import graph, and dead-route checks that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Context:** source reachability, import graph, and dead-route checks: dynamic imports, compatibility modules, false dead-code reports, missing entrypoints, circular ownership, and actionable path traces.

**Inspect:** `scripts/check-src-reachability.mjs` `src`

**Read first:** `build_map.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0158 --format prompt`

## JULES-0159 — Data identifiers and cross-catalog references — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `tool-data-integrity`

**Objective:** Construct a valid edge fixture for data identifiers and cross-catalog references that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Context:** data identifiers and cross-catalog references: duplicate IDs, dangling references, wrong namespaces, casing drift, invalid numbers, graph cycles, and cross-catalog reachability diagnostics.

**Inspect:** `src/data` `scripts`

**Read first:** `build_map.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0159 --format prompt`

## JULES-0160 — Asset manifest, classification, and reachability checks — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-asset-integrity`

**Objective:** Construct a valid edge fixture for asset manifest, classification, and reachability checks that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Context:** asset manifest, classification, and reachability checks: false green and false red paths, exact release/source identity, stale evidence, missing runtime routes, diagnostic precision, and self-test coverage.

**Inspect:** `scripts/check-asset-classifications.mjs` `scripts` `assets/ships/parts/parts_manifest.json` `assets/ships/release/release_manifest.json`

**Read first:** `build_map.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0160 --format prompt`

## JULES-0161 — Save schema and migration validation tooling — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-save-schema`

**Objective:** Construct a valid edge fixture for save schema and migration validation tooling that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Context:** save schema and migration validation tooling: fixture version coverage, migration chain gaps, unknown future versions, normalization drift, destructive mutation detection, and semantic diff output.

**Inspect:** `src/save/saveSystem.js` `test` `scripts`

**Read first:** `build_map.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0161 --format prompt`

## JULES-0162 — Validation broker and route manifests — remove one false-positive path

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `tool-validation-broker`

**Objective:** Construct a valid edge fixture for validation broker and route manifests that the current tool/check could incorrectly reject. Make diagnostics and logic accept the valid case without weakening the real invariant in manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Context:** validation broker and route manifests: manifest parsing, environment isolation, subprocess cleanup, artifact identity, stale-route evidence, retries, and honest unproven results.

**Inspect:** `scripts/validation-broker-cli.mjs` `scripts` `docs/VALIDATION_WORKFLOW.md`

**Read first:** `build_map.md`, `AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0162 --format prompt`
