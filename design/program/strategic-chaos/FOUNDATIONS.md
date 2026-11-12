# Executable foundations

The new code is authoring and evidence infrastructure, not a gameplay replacement. It is already used by the included CLI/tests. No unused gameplay service or parallel simulation is introduced.

## 1. Validated commissions

`program.json` is a read-only index of the thirteen packet documents. `strategicChaosProgram.mjs` validates exact source-base identity, concrete owner paths, existing parent references, useful acceptance/grunt work and an acyclic dependency graph. It rejects copied status/claim fields and unsafe repository paths. It does not decide which existing board row is currently free.

```sh
node scripts/strategic-chaos.mjs validate
node scripts/strategic-chaos.mjs brief SC-03
```

`validate` also checks documents, their local links and the existence of referenced source files. A source-only delivery must explicitly use `validate --bundle`; the result says `NOT_RUN_SOURCE_ONLY_BUNDLE` for source paths. Neither mode proves the referenced owner actually implements the proposed behavior.

The brief includes preflight, boundaries, live-PR rechecks, dependencies, full implementation steps, three bounded follow-ons, adversarial cases and delivery requirements. It launches nothing and changes no board status.

## 2. Existing B12 proof, guarded result handling

```sh
node scripts/strategic-chaos.mjs proof
```

A child process imports the existing `src/testing/lab/proofSixtySeconds.js` and calls `runProofSixtySecondsSuite()` with default arguments. It does not override seed selection, tape, runtime systems, threshold, relocation or window. The adapter checks that its understood contract matches the native owner before execution. The source snapshot inspected here defines seeds 47, 4242, 8008, 1337 and 2026, eleven named beats, a nine-beat requirement and a 90-second cap.

The existing native CLI prints a gate result without itself returning a nonzero exit for a measured miss. The new adapter separates PASS, FAIL and INCOMPLETE and preserves the native result. An empty suite, duplicate/missing seed, fabricated count, unknown beat, invalid time, lowered threshold, wrong backend, unready physics path or relocated diagnostic cannot qualify. This is a useful foundation because a test process exiting successfully is not the same as the gameplay criterion passing.

Execution is bounded by a 180,000 ms host-side timeout and an 8 MiB output limit. These are runner safety limits, not gameplay timing or performance targets. Timeout/import/missing-owner failures produce INCOMPLETE, never a substituted success. Evidence and logs go to a unique `.devshots/strategic-chaos/` run directory. No shared player save drawer is mounted.

The report records commit/tree and dirty-state limitations. Dirty source is diagnostic, not exact-commit evidence. The existing Ceres fixture setup remains disclosed. A B12 receipt pass is not proof that every beat is causally connected, that a new player discovered the encounter naturally, or that the game is visually polished or fun. This wrapper grants no new acceptance authority.

```sh
node scripts/strategic-chaos.mjs audit /path/to/native-report.json
```

Imported JSON is **always diagnostic**, exit 4 after successful parsing/inspection, even when its contents would satisfy the receipt criterion. File metadata or a claimed provenance string cannot turn imported data into a real runtime execution.

## 3. Matched strategy comparisons

```sh
node scripts/strategic-chaos.mjs compare defense.json theft.json
```

The comparator accepts two `spaceface.strategyTrial.v1` diagnostic records. Producers must come from the existing lab or ordinary-route instrumentation; this package does not generate fake measurements or certify caller assertions. Each record requires:

- `scenarioId`, `scenarioHash`, exact 40-hex `sourceTree`, integer `seed`;
- `initialStateHash`, `loadoutHash`, `strategyId`, `windowS`;
- `evidenceClass` (`focused-fixture`, `production-fixture` or `public-route`), explicit `setupExceptions`, actual `outcome`;
- `metrics`, each carrying finite numeric `value`, `unit` and a nonempty measurement `definition`.

Source, scenario, seed, kit, starting state, evidence class, window and setup exceptions must match. Strategy IDs must differ. Metric coverage and definitions must match. Missing values are not zero, Infinity/NaN are invalid, and overflowing differences are rejected. The result reports raw deltas and outcomes, never a weighted fun score or a declaration that one plan is best. One matched pair is useful diagnosis, not statistical proof of balance or causal inference.

A reasonable first producer records protected cargo delivered, protected hull lost, player resources spent, recovery quantity, witnessed incidents and completion/partial/abort outcome. Prefer the actual owner’s settlement to a display counter. Keep out-of-scope or unavailable metrics absent from both arms, not fabricated.

## 4. Safe map integration

```sh
node scripts/strategic-chaos.mjs map
node scripts/strategic-chaos.mjs map --apply
```

The first command previews. The second adds only the bounded navigation section to the current map. It refuses a dirty/staged board, foreign lock, symlink, missing package, changed source or conflicting existing section. It preserves CRLF/BOM and does not stage, commit or push. A stable Git head and double-read protect ordinary concurrent changes; this is not a claim of atomic coordination with arbitrary writers that ignore all locks. Inspect live claims first.

The fallback patch makes the same additive edit. It never carries a stale replacement for the whole board. See [integration](INTEGRATION.md).

## Tests and exit codes

```sh
node --test test/strategic-chaos-*.test.mjs
```

Tests run without npm installation, browser, renderer or game assets. They execute the new modules/CLI and use disposable Git repositories for map behavior. Fabricated report fixtures exercise validation only and are explicitly not gameplay evidence. A narrow read-only GitHub workflow runs the same tests and source-path validation; no package scripts, dependency lockfiles or existing CI gates are weakened.

Exit 0: static checks succeed, or the native B12 criterion was measured successfully on the qualified source boundary. Exit 1: a genuine measured B12 miss. Exit 2: malformed, blocked, timed-out or incomplete execution. Exit 4: diagnostic-only imported/paired evidence or an unqualified dirty-source diagnostic. No exit code means the thirteen commissions, presentation, performance or the entire game are accepted.
