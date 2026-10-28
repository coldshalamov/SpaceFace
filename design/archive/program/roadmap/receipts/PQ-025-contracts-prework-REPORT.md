<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-025
leafId: PQ-025.contracts-prework
acceptance: focused_green
disposition: PASS
candidateCommit: 1bf605850974b747af8fd82e990cceb6dceb5e84
-->

# PQ-025 leaf — held-out Gold Corridor acceptance contracts (Phase 0 + Phase 1 only)

**Worktree:** `C:\Users\93rob\sf-l20` · branch `claude/pq025-prework-20260728` · based at `aa0f0729`.

`candidateCommit` above names `1bf60585`, the commit containing the attested modules and tests.
This report is committed on top of it, so the branch tip is one commit later; the receipt attests
the code, not itself.

**Scope actually performed:** Phase 0 (contract/owner freeze — semantic map) and Phase 1 (pure
contracts and adversarial fixtures). Nothing else. Zero game launches.

---

## 1. Phase-0 semantic map

Encoded as data in `scripts/lib/goldCorridorAcceptanceContracts.mjs` (`SEMANTIC_OUTCOME_MAP`), one
row per outcome as `{outcome, owner, module, symbol, evidenceKind, rawRef, confidence, note}`. Every
row carries a file:line raw reference located by reading the live source at this revision.

**34 rows total: 28 verified, 1 degraded, 5 absent.**

### 1.1 Verified owner surfaces (summary)

| Required outcome | Owner module | Symbol | Kind | Raw ref |
|---|---|---|---|---|
| economy meaningfulness | `src/systems/economy.js` | `economy:tradeCompleted` | event | economy.js:1047 |
| economy credit movement | `src/systems/economy.js` | `credits:changed` (`grant`/`charge`) | event | economy.js:1188,1199 |
| progression career loop | `src/systems/missions.js` | `mission:accepted` / `mission:conditionSatisfied` | event | missions.js:1498,697 |
| progression career ladder | `src/careers/ladders/careerLadders.js` | `getLadderProgress(state, careerId)` | projection | careerLadders.js:107 |
| career identity | `src/careers/origins/` | `career:origin:offered`, `HUNTER_ORIGIN_EVENTS.*`, `PROSPECTOR_EVENTS.*` | event | haulerOriginSystem.js:176; hunterOrigin.js:169,222; prospectorOrigin.js:111 |
| legal purchase | `src/systems/ships.js` | `module:purchased` / `ship:purchased` | event | ships.js:739,803 |
| ownership | `src/systems/ships.js` | `module:granted` | event | ships.js:752 |
| legal fit | `src/systems/ships.js` | `module:equipped` | event | ships.js:929 |
| capability delta | `src/systems/ships.js` | `ship:statsChanged` / `ship:cargoCapChanged` / `ship:massChanged` | event | ships.js:645,646,768 |
| capability persistence | `src/core/fittedModules.js` | `fittedModuleIds` / `hasFittedModule` | projection | fittedModules.js:14,24 |
| combat encounter | `src/systems/combatOutcome.js` | `combat:outcome` | event | combatOutcome.js:160 |
| failure / recovery | `src/systems/recoveryEncounter.js` | `recovery:completed` / `recovery:receipt` | receipt | recoveryEncounter.js:445,446 |
| save write | `src/save/saveSystem.js` | `save:completed` | event | saveSystem.js:707 |
| cold Continue | `src/save/saveSystem.js` | `save:loaded` + `mode:changed` | event | saveSystem.js:2129,2126 |
| World Site outcome | `src/systems/asteroidSites.js` | `worldSite:operationReceipt` / `worldSite:failureReceipt` | receipt | asteroidSites.js:452,498 |
| Cathedral outcome | `src/systems/worldSiteKernel.js` | `projectWorldSite(manifest, record)` | projection | worldSiteKernel.js:732 |
| Ledger pages | `src/systems/shipLedger.js` | `buildShipLedger(state, options)` | projection | shipLedger.js:528 |
| Ledger Cathedral evidence | `src/systems/shipLedger.js` | `collectWreckCathedralEvidence(state)` | projection | shipLedger.js:230 |
| Asteroid Ops outcome | `src/systems/asteroidSites.js` | `site:created` / `site:machineInstalled` / `site:courierDelivered` | event | asteroidSites.js:745,769,1432 |
| **Massline attach (authoritative)** | `src/combat/attachments.js` | `tether:attached` | event | attachments.js:212 |
| Massline attach denial | `src/systems/tetherGameplay.js` | `tether:latchDenied` | event | tetherGameplay.js:100,265,270,280,299 |
| Massline release | `src/systems/masslineThrow.js` | `massline:releaseValidated` / `tether:released` | receipt | masslineThrow.js:478; tetherGameplay.js:527 |
| run identity (C0) | `src/core/gameState.js` | `state.meta.seed` / `state.meta.version` | projection | gameState.js:87-90 |
| timeScale | `src/core/gameState.js` | `state.timeScale` | projection | gameState.js:93 |
| perf p95 / max / multi-step / save blocking | `src/core/perfRuntime.js` | `reportStat()`, `loop.multiStepFrames`, `saveStats.*` | projection | perfRuntime.js:55,63,128-129,172-173,466-467 |

Two facts worth naming because they were nearly mis-recorded:

- **`asteroidSites.js` is the World Site runtime host.** A `wreck_cathedral` string grep does not
  return it (the site is resolved by manifest id from data, not by literal). It imports
  `worldSiteKernel` and calls `applyWorldSiteOperation` (asteroidSites.js:41-43, 436), then emits
  both receipts. Verified by import/call-site, not by name.
- **`tether:attached` is the attach authority, not `tether:latched`.** It is emitted only after
  `createPhysicsAttachment` succeeds and the record is stored with `state: 'active'`
  (attachments.js:198-205). This is what makes "attach success, not opportunity" checkable.

### 1.2 Findings — `absent` owner facts (Phase-0 stop conditions)

Each of these is a required per-attempt fact in the packet's performance profile contract with **no
owner surface at this revision**. Each needs a narrow owner-owned read seam; per the packet, an
acceptance-only gameplay event is not an acceptable substitute. Integrator decides the request.

| # | Missing fact | Evidence of absence |
|---|---|---|
| F1 | **`perf.p50`** | `reportStat` (perfRuntime.js:42-67) returns `{last, avg, min, max, p95, samples}`. No median, and the raw sample array (`stat.values`) is internal, so p50 is not derivable read-only. |
| F2 | **`perf.p99`** | `grep p99` across `src/` and `scripts/` returns no metric occurrence anywhere in product or harness. |
| F3 | **`perf.missedVsync`** | `grep missedVsync\|missed-vsync` across `src/` and `scripts/` returns nothing. |
| F4 | **`perf.residency` (baseline/peak/end)** | The product publishes no memory-residency metric. Only harness probes read the Chrome-only `performance.memory` API (`releaseSoakProbe.mjs:804-806`, `pq017WorldSitePublicRoute.mjs:7176-7183`). That is a harness fact, not an owner fact, and is unavailable outside Chromium. |
| F5 | **`perf.drawTriangleCounts`** | Draw/triangle/particle/light counts are required per attempt; `perfRuntime` reports entity counts only. |

Consequence, stated plainly: **the performance half of a qualification attempt cannot be satisfied
today.** The contract already refuses to paper over this — `evaluatePerformanceSample` rejects a
sample missing any required metric, and `normalizeOwnerEvidence` returns `unknown` (never a pass)
for any outcome whose map row is `absent`, even if the caller claims `verified`. Both behaviours are
pinned by tests.

### 1.3 Finding — `degraded` owner fact

| # | Fact | Status |
|---|---|---|
| F6 | `tether:latched.selectionReceiptId` (tetherGameplay.js:319-322) | Reads `state.masslineAcquisition`, whose only publisher `_refreshAcquisitionPreview` has **zero call sites**, so the field is permanently `null`. Recorded as `degraded`: do not build Massline evidence on it. The attach authority (`tether:attached`) is unaffected and is what the contract uses. |

### 1.4 Finding — observer seam is debug-gated (single point of failure)

Every `projection`-kind row (11 of 34, including Ledger pages, Cathedral projection, ladder
progress, `timeScale`, and all four surviving perf metrics) is reachable only through the
`window.SF` handle installed under `SF_DEBUG` (`src/main.js:189,198`).

Checked, and it is better than feared: `electron/main.cjs:149` loads the app from an in-process
static server on localhost — the same source the Browser runtime loads — and `src/main.js:36-37`
states launcher URLs stay identical for browser/Electron. So the seam is **shared across both
runtimes** and Electron is not a stop condition here. It would only vanish for a packaged
production build (`__SPACEFACE_PRODUCTION__`), which is not how qualification is launched.

---

## 2. Phase-1 modules

All new files. No gameplay source was modified; `package.json` untouched.

| Path | Contents |
|---|---|
| `scripts/lib/goldCorridorAcceptanceContracts.mjs` | Semantic map; matrix vocabulary; runtime-independent seed derivation (frozen input allowlist + explicit forbidden list) and commit-reveal; attempt-identity schema covering the packet JSON exactly; append-only ledger with hash chain; failure taxonomy + rerun policy; profile contract (16.7 / 33.3 ms); accessibility contract (9 required checks, profile validated against the enum at matrix construction); native duration + sim reconciliation; owner-evidence normalization; Massline and purchase claim evaluators; capture fingerprint registry; matrix completeness + relabel guard. |
| `scripts/lib/goldCorridorAcceptanceSession.mjs` | Actor/observer/judge capabilities with construction-time information-flow enforcement; checkpoint schemas (C0/C1/C2 and C0..C4); evidence buffer with non-erasing bounded high-water; injection classification. Pure — no process/browser code. |
| `scripts/lib/goldCorridorAcceptanceAggregate.mjs` | Aggregate validator (hard-cell rule, averages diagnostic-only, rerun-legality audit, capture-uniqueness sweep, human verdict coverage, dependency hash exactness) and immutable receipt publisher + verifier. |
| `scripts/validation-manifests/pq025-gold-corridor-smoke.mjs` | Phase-2 calibration manifest. `mode: 'diagnostic'`, `acceptanceEligible: false`, `maxLaunchesPerCandidate: 1`. |
| `scripts/validation-manifests/pq025-gold-corridor-qualification.mjs` | Phase-4/5 manifest. No fixed seed (seeds are derived per cell after reveal); carries an explicit `entryConditionsUnmet` list. |

**Both manifests are created and never executed, and are deliberately NOT registered in
`MANIFEST_LOADERS` in `scripts/validation-broker-cli.mjs`.** Registration is an integrator step and
is legal only once the entry conditions hold. No Browser/Electron adapter was built — those are
items 3 and 4 of the packet's bounded write set and belong to Phase 2+.

### 2.1 Defects found in this leaf's own contracts, and closed

Four holes were found by adversarial self-review and fixed with tests. All four had the same shape —
illegal or absent evidence resolving to `pass` — which is precisely what this packet exists to
prevent, so they are recorded rather than quietly repaired.

1. **Ledger relabelling** (commit `e6701d1a`). `cellKey` was not covered by the entry hash, so a
   retained red attempt could be moved onto a different matrix cell without breaking the chain.
   `cellKey` now enters the hash, and `verifyLedgerIntegrity` rejects an entry whose `cellKey` or
   identity ordinal disagrees with its own identity.
2. **Best-of-N passed** (this commit). `validateAggregate` never consumed `evaluateRerunRequest`:
   a cell whose ledger read `fail -> fail -> pass` on an unchanged candidate and harness resolved to
   a terminal `pass` and published `PASS`. Confirmed empirically before fixing. New
   `auditRerunLegality` walks every consecutive attempt pair per cell and turns any denial into an
   `illegal-rerun:` blocker; an attempt following a passing attempt is also rejected.
3. **Zero human verdicts passed** (this commit). `evaluateHumanVerdicts` returned `ok` for an empty
   verdict array, so a fully green matrix that no human ever judged published `PASS`. The frozen
   critical-question set now lives on the matrix (`criticalQuestionIds`); an empty verdict set, an
   unfrozen question set, and any unanswered critical question are each blockers. An unanswered
   critical question is unknown evidence, and unknown is never a pass.
4. **Capture reuse was only caught at registration** (this commit). `auditCaptureUniqueness` now
   sweeps `captureId` across the whole ledger inside `validateAggregate`, closing ADV-13 at the
   decision point as well as at registration time.

---

## 3. Tests

| Suite | Tests |
|---|---|
| `test/pq025-acceptance-contracts.test.mjs` | 60 |
| `test/pq025-acceptance-session.test.mjs` | 22 |
| `test/pq025-acceptance-aggregate.test.mjs` | 26 |
| **Total** | **108 pass / 0 fail** |

### Adversarial contract minimum

The packet's "Adversarial contract minimum" section contains **17 bullets** (counted directly). The
task brief referred to 18; rather than guess at the discrepancy, each bullet was given a stable id
`ADV-01..ADV-17` verbatim, and every independently gameable **sub-condition** of a compound bullet
was given its own rejection test. That yields **40 distinct rejection ids**, so the coverage is
above either figure and the enumeration is auditable.

| Bullet | Ids | Rejection proven |
|---|---|---|
| 1 | ADV-01a/b | runtime (and 9 other keys) in seed derivation throws; parity seeds proven identical across runtimes |
| 2 | ADV-02a/b | scenario, profile, career, horizon relabel after observation |
| 3 | ADV-03 | required failure/recovery cell omitted |
| 4 | ADV-04a/b | attempt deleted; attempt replaced (caught twice: continuity + hash chain) |
| 5 | ADV-05a/b | actor referencing observer (direct and nested); actor holding any hidden-state surface |
| 6 | ADV-06a/b/c | transition, state, event injection (+ teleport, credit/cargo/mission write, time compression) |
| 7 | ADV-07a..e | short duration; pause/unfocus/loading counted; timeScale ≠ 1; sim reconciliation failure; focused idling |
| 8 | ADV-08a..e | purchase missing charge / ownership / fit / capability / Continue (+ charged twice, owned twice, zero delta) |
| 9 | ADV-09 | research / preview / affordability counted as purchase |
| 10 | ADV-10 | Massline attempt without authoritative attach success |
| 11 | ADV-11a/b/c | target evaluated at floor threshold; floor blindly zero-gating raw >32 ms; diagnostic acceptance-eligible |
| 12 | ADV-12a..f | missing p99 / max / missed-vsync / multi-step / residency / save blocking (+ p50, backlog, phase costs, entity counts) |
| 13 | ADV-13 | one capture satisfying two cells |
| 14 | ADV-14 | quality reduced to pass |
| 15 | ADV-15 | bounded buffer erasing evidence |
| 16 | ADV-16a/b/c | stale media / receipt / save content re-submitted under a new id |
| 17 | ADV-17 | unknown owner evidence treated as warning or pass |

Information-flow violations are covered beyond the bullet list: observer carrying a mutating
surface, judge constructed with a mutating validator, and a judge's ledger prefix rewritten
underneath it.

---

## 4. Gates

| Gate | Result |
|---|---|
| `node --test` on all three new suites | **96 pass, 0 fail** |
| `node --check` on all five new modules | clean |
| `npm run check:sim:compare` (baseline, at `aa0f0729`, before any edit) | `hashEqual: true`, `ok: true` |
| `npm run check:sim:compare` (after all edits) | `hashEqual: true`, `ok: true` |
| `git status` | clean |

The sim-compare pair is structural: no gameplay source was touched, so the identical result is the
expected outcome and is recorded as a before/after pair rather than a single post-hoc run.

---

## 5. Explicitly NOT claimed

- **No calibration, no smoke.** Phase 2 was not entered. No probe was run.
- **No launches of any kind.** Zero Browser, Electron, Playwright, validation-broker, or performance
  capture executions. Phase-1 budget `acceptanceLaunches: 0` was honoured literally.
- **No qualification.** No 30-minute or 90-minute cell exists, was attempted, or is claimed. The
  attempt ledger is empty of real attempts; every ledger in this work is a test fixture.
- **Matrix, rubric, profile, and retention values are DRAFT.** The matrix in the tests is an example
  shaped to exercise completeness rules, not a frozen qualification matrix. Freezing the
  career/horizon/scenario/runtime/accessibility/profile matrix, the human rubric and its failure
  thresholds, capture identity, and artifact retention is an integrator action (packet Phase 0
  checkboxes 2 and 3), and must happen before any reveal.
- **Held-out salt is not committed.** `createSeedCommitment` exists; no commitment was made.
- **No entry condition is asserted as met.** PQ-019/020/021/022/023/024 receipt exactness, lease
  exclusivity, and frozen hardware/execution profiles were not checked and are not claimed.
- **Broker manifests are unregistered and unexecuted**; adapters (bounded write set items 3 and 4)
  do not exist.
- **The five absent perf facts (F1-F5) block native qualification** until an owner read seam exists.
  This leaf does not request that seam; per the packet, it is a shared-change request the integrator
  owns.
- **Accessibility coverage is the automation half only** — roles/names, focus, contrast, reduced
  motion, flash safety, non-color and non-audio cues, text scale, input reachability. Whether cues
  are actually clear is the human rubric's job and is not automatable here.
- **The media contract is capture-identity only.** Uniqueness, staleness, and cross-cell reuse are
  enforced by content hash; nothing decodes, compares, or judges the media itself.
- **Parity is identity-level, not evidence-level.** `parityPairId` plus runtime-excluded seed
  derivation guarantee the two runtimes of a pair run the same cell with the same seed, and that is
  tested. A cross-runtime evidence comparator (same checkpoints producing equivalent semantic
  digests) is not built and is Phase-3/4 work.

---

## 6. Handoff — what the integrator decides next

1. Accept or reject the five read-seam requests F1-F5 (`p50`, `p99`, `missedVsync`, residency,
   draw/triangle counts). Without them the performance contract cannot be satisfied by any attempt.
2. Note F6: no packet work should depend on `state.masslineAcquisition` until its dead publisher is
   fixed; that is a shared-change request, not a PQ-025 edit.
3. Freeze matrix / rubric / profile manifest / retention, then commit the held-out salt.
4. Register the two broker manifests in `scripts/validation-broker-cli.mjs` and add `package.json`
   aliases — both deliberately left undone here.
