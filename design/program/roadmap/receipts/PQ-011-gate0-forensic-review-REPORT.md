# Gate-0 Forensic Re-measurement (second independent reviewer)

Adversarial re-measurement of the two Gate-0 repair commits, from an isolated worktree
(`sf-g0-forensic`, branch `g0/forensic-review-20260721`, base master `2d616dfa` — which contains both
commits under review). No git writes; every tracked file left byte-identical to HEAD; only new
untracked files added. Browser NOT launched (owned by another lane) — the flight verdict is
code-level + artifact-audit only.

## Bottom line

Both repairs **hold**. The massSeed FINDING-01 fix is sound (red-before/green-after reproduced with
the exact double-emit signature; 7/7 mutants re-caught with byte-identical documented splits; the
repaired branch survives every attack scenario a-f). The flight-probe change is provably probe-only
and its pin is fail-safe by construction (cannot convert a real red into a pass). The stranded-freighter
diagnosis is accurate at all three cited source sites.

**One NEW finding surfaced while attacking the massSeed repair** (FORENSIC-FINDING-02, **P2/P3**): the
repair's own new window (deploy allowed during the dead-collapsing beat) *widens* the exposure of a
pre-existing entity-id-aliasing latent bug, under which a replacement deployed in that window can be
killed ~0.45 s into its life by the retired seed's dying-beat cleanup. It does **not** breach the
canonical acceptance bar (no NaN, no constraint leak, no orphaned tether, determinism/hashEqual green),
so it does **not** block Gate-0 — it is filed for the massSeed owner. Discovering it is the review
succeeding, not the repair failing.

> **HAND-OFF WARNING (gate hygiene):** `test/mass-seed-forensic-findings.test.mjs` is **expected-RED on
> the current tree BY DESIGN** (it asserts the not-yet-fixed corrected behavior). Unlike the phys lane's
> findings file — which is GREEN post-repair — this one is RED. **Exclude it from any aggregate green
> gate** (`npm run check`, any `test/*.test.mjs` glob) until FORENSIC-FINDING-02 is fixed, or leave it
> unstaged, so it is NOT misread as a regression. `test/mass-seed-forensic.test.mjs` (7 tests) IS green.

---

## A. massSeed repair (commit `27bba37d`)

### A1 - Gates on the as-shipped tree

| Command | Exit | Result |
|---|---|---|
| `npm run check:mass-seed` | 0 | **41/41 pass** (base 20 + adversarial 20 + findings 1) |
| `npm run check:physics-authority` | 0 | `Physics authority membrane checks OK` |
| `npm run check:sim:compare` | 0 | `ok:true`, `deterministic:true`, `hashEqual:true`, `firstDivergentTick:null` |
| `npm run check:massline` | 0 | `PASS - 23 child checks green` |

Note: `check:sim:compare` prints informational `phase0ObservedTraceCounts` deltas
(`presentation:cue` 14->15, `audio:cue` 3->4) but its top-level `ok`/`deterministic`/`hashEqual` are all
green and exit 0. Neither commit under review touches the 47a golden or its expected telemetry, so this
is pre-existing and out of scope.

### A2 - Revert-to-red (regression pin is genuine)

Reverted the 9-line repair in `_tickSeed`'s entity-lost path (removed the `ms.phase === 'collapsing'`
branch via a CRLF-safe Python edit; `git diff` confirmed `index 67e87f59..81ce48c1`, i.e. the working
tree became the exact pre-repair blob `81ce48c1`).

| Command | Exit | Result |
|---|---|---|
| `node --test test/mass-seed-findings.test.mjs` (pre-repair) | 1 | **RED** - `massSeed:collapsing` reasons = `["seed_expired","seed_destroyed"]` (expected `["seed_expired"]`) |

The failure is the exact FINDING-01 double-emit + reason-flip signature (collapse re-emitted with the
reason flipped `seed_expired`->`seed_destroyed`). Restored byte-exact from a pristine backup (`cp`, not
`git checkout`, to avoid the repo's known LF/CRLF checkout churn); `git diff --stat` clean afterward.

### A3 - Attacking the repair (new file `test/mass-seed-forensic.test.mjs`, 7 tests, all green)

Every charter scenario a-f plus a guard, each written as a genuine attack. All PASS on the repaired
tree; 6 of them (a-f) go **RED on the pre-repair tree** and the guard stays green on both - i.e. they
are sensitive probes of the repaired behavior, not vacuous passes (verified by re-running the suite
against the reverted tree: 1 pass / 6 fail, guard the sole pass).

| Test | Verifies | Repaired | Pre-repair (sensitivity) |
|---|---|---|---|
| FORENSIC-a | `_tickDying` runs BEFORE the early-return -> dying entries despawn on schedule during a dead-collapsing window | PASS | RED |
| FORENSIC-b | boundary `nowOf===collapseAt`: exactly one collapse, reason `expired`, cooldown once and **on schedule** (`collapseAt + cooldownS`, not `killTime + cooldownS`) | PASS | RED |
| FORENSIC-c | deploy in the dead-collapsing window is **allowed** (cooldown unset, phase stays collapsing, no destroyed) and behaves as a clean replacement at deploy time | PASS | RED |
| FORENSIC-d | `save:loaded` (`_clearSeed`) during the window -> clean idle baseline, fresh deploy works | PASS | RED |
| FORENSIC-e | `sector:exit` during the window -> `_clearSeed` drains with the exact `cleared` reason | PASS | RED |
| FORENSIC-f | entity fully removed mid-collapse -> `_finishCollapse(null)` does not throw, completes as `expired` | PASS | RED |
| FORENSIC-guard | a kill in a NON-collapsing phase (`active`) still routes to `_onSeedEntityLost` -> `destroyed` (branch does not swallow legit destroyed) | PASS | PASS |

Charter A3 sub-answers confirmed:
- **(a)** `_tickSeed` calls `_tickDying` as its FIRST statement (`massSeed.js:264`), before the entity-lost
  branch, so the early `return` never skips scheduled despawns. Confirmed by test + code read.
- **(b)** The branch uses `>=` (`nowOf(state) >= ms.collapseAt`), matching the normal `case 'collapsing'`
  path; one collapse, original reason, cooldown once, on-schedule (~0.45 s later than the pre-repair
  kill-instant cooldown - the intended fix).
- **(c)** Deploy in the window is allowed and clean **at deploy time** - this is the correct repair
  behavior. (Its *downstream* consequence is the new finding below.)
- **(d)/(e)** `_clearSeed` (via `save:loaded` and `sector:exit`) drains the window cleanly.
- **(f)** `_finishCollapse` is null-safe (`if (entity && entity.alive !== false)`), correct for both a
  dead-but-present entity (b) and a fully-removed one (f).

### A3 (finding) - FORENSIC-FINDING-02 (P2/P3): repair-widened entity-id aliasing

New file `test/mass-seed-forensic-findings.test.mjs` (1 test, **expected-RED** - asserts the CORRECTED
behavior, so it flips green once fixed; exclude from any aggregate green gate).

| Command | Exit | Result |
|---|---|---|
| `node --test test/mass-seed-forensic-findings.test.mjs` (repaired tree) | 1 | RED by design - `the replacement survives the retired seed's dying-beat` fails |

**Mechanism (verified at source + realistic projectile repro):**
1. The sim recycles entity ids via a LIFO free-list - `coreSystem.js:25` (`state.freeIds.length ?
   state.freeIds.pop() : state.nextEntityId++`) and `:115` (pushes a swept entity's id back).
2. A seed that expires -> is shot inside the 0.45 s collapse beat -> is swept; its id is freed.
3. The repair keeps the mirror in `collapsing` for the whole beat, so a redeploy anywhere in the beat
   routes through `_retireLiveSeed`, which pushes `{ id: oldId, despawnAt, reason }` into `ms.dying`
   **for the already-dead seed**; `_handleDeploy` then calls `spawnEntity`, which pops the just-freed id
   (LIFO) for the replacement. The replacement now **aliases** the retired seed's dying entry.
4. ~0.45 s later `_finishDying` does `entity.alive = false` on `get(entry.id)` with **no
   identity/type/generation guard**, killing the live replacement; the replacement then routes through
   `_onSeedEntityLost` and is reported `destroyed`.

Realistic repro (hostile `projectile:hit`, deploy 8 ticks into the beat): seed A id 3 -> killed -> swept
-> redeploy B recycles id 3 -> at the dying despawn tick A's entry kills B -> `destroyed` fired; a
freshly-deployed anchor dies ~0.47 s into its travel.

**Attribution - repair-WIDENED, not repair-introduced.** Root cause is pre-existing (un-generationed id
tracking in `_finishDying`/`_retireLiveSeed` + sim id-recycling). The **widened** (repaired-tree) case
is what I EXECUTED (the expected-RED pin + realistic projectile repro). The claim that **pre-repair** the
self-replacement path is reachable only via a 1-tick race (deploy the step right after the kill, before
`_tickSeed` processes the dead seed) is **by code-inspection only, NOT executed here** — offered as
attribution context, not as a run result. On the repaired tree it widens to the full ~27-tick beat and
is **deterministic in a quiet/low-entity scene**. **In active combat the exact-id recycle is diluted**
by other entity churn (a real projectile entity may pop the freed id first), so real-play reachability
is **probabilistic**, not guaranteed.

**Suspected broader hazard (code-read, not repro'd):** because `_finishDying` has no type check, *any*
entity that recycles the freed id during the beat could be zapped - reachable pre-repair via the
ADV-D3-style "kill a dying seed mid-beat" path under combat churn. Noted for the owner; the proven
finding is the self-replacement case.

**Severity P2/P3** - no NaN, no constraint leak, no orphaned tether, determinism intact. Not a Gate-0
blocker.

**Suggested repair (owner: `massSeed.js`), NOT implemented (reviewer leaves code untouched):**
- In `_retireLiveSeed`, if the entity is already dead/gone (`!entity || alive===false`), do NOT create a
  dying entry tracking its recyclable id - finish it immediately (no live body to collapse over a beat).
- Defense-in-depth: `_finishDying` should verify the looked-up entity is still the retired massSeed
  (type + a stored uid/generation) before setting `alive=false`.

### A4 - Mutant matrix (independently re-run against the 41-test gate)

Applied one at a time via CRLF-safe Python (uniqueness-asserted, anchored by code content since the
report's line numbers predate this tree), gate = `npm run check:mass-seed` (41 tests), restored
byte-exact via `cp` after each, `git diff --stat` clean between every mutant.

| # | Mutation | Split (pass/fail) | Documented | Result |
|---|---|---|---|---|
| M1 | skip `_cutSeedTethers` in `_beginCollapse` | 39 / 2 | 39/2 | caught |
| M2 | `tetherEligible:true` at spawn | 40 / 1 | 40/1 | caught |
| M3 | delete `physicsStaticVersion++` invalidation | 36 / 5 | 36/5 | caught |
| M4 | `_finishCollapse` always skips the cooldown | 34 / 7 | 34/7 | caught |
| M5 | skip `_flushDying` in `_clearSeed` | 39 / 2 | 39/2 | caught |
| M6 | remove the `DYING_CAP` trim loop | 40 / 1 | 40/1 | caught |
| M7 | `_onSeedEntityLost` uses `cleared` not `destroyed` | 36 / 5 | 36/5 | caught |

**7/7 caught; every split byte-identical to the commit message's documented post-repair splits.** M6's
sole killer is confirmed to be **ADV-D5** (the exact test the physics lane added to close FINDING-02).

---

## B. Flight-probe repair (commit `2d616dfa`) - code-level + artifact audit

### B1 - The diff is probe-only; thresholds/ticks byte-identical

Authoritative git blob diff (`git diff 2d616dfa~1 2d616dfa -- scripts/probe-flight-visual.mjs`,
EOL-normalized) contains ONLY: the reset comment block + `resetPlayerForProbe(... rot:0, vel:0 ...)`
call, the `assertBoostSampleNotPerturbed(throttle, boost)` call, the pin function + comment, and a
single modified line - the retry regex gaining `|MEASUREMENT_INVALID`.

Byte-wise comparison of the gate check expressions and run shape across the two versions shows **only
line-number shifts** (the reset block was inserted above), text byte-identical:
- `boostAccelerates: boost.speed > throttle.speed + 8 && boost.boosting === true` - unchanged
- `reverseBrakes: reverse.speed < boost.speed * 0.78` - unchanged
- `throttleMovesShip: throttle.forwardSpeed > 18 && throttle.speed > strafe.speed` - unchanged
- `waitForSimTicks(39)` tick counts, viewport dims (`1280x720`, `390x844`), `MAX_VISUAL_PROBE_ATTEMPTS`,
  `--clean-runs` - all absent from the diff -> unchanged.

**CONFIRMED: no threshold, tick-count, viewport, or run-shape change.**

### B2 - The pin is fail-safe by construction (logic table, pin body copied byte-for-byte into a node harness)

| Input `(throttle.speed, boost.speed)` | Pin | Normal check |
|---|---|---|
| weak boost mid-band `(32, 35)` | no-throw | `boostAccelerates` **RED** |
| weak boost near +8 `(32, 39)` | no-throw | `boostAccelerates` **RED** |
| boost == throttle `(32, 32)` | no-throw | `boostAccelerates` **RED** |
| boost at +8 boundary `(32, 40)` | no-throw | `boostAccelerates` **RED** |
| boost just past +8 `(32, 41)` | no-throw | `boostAccelerates` PASS |
| healthy boost `(32, 98)` | no-throw | `boostAccelerates` PASS |
| collapse below baseline `(32, 15)` | **THROW** (retriable MEASUREMENT_INVALID) | - |
| slight collapse `(32, 31.99)` | **THROW** | - |
| NaN `boost.speed` `(32, NaN)` | no-throw | `boostAccelerates` **RED** |
| NaN `throttle.speed` `(NaN, 98)` | no-throw | `boostAccelerates` **RED** |
| null boost sample | no-throw | - |
| fast but `boosting:false` | no-throw | `boostAccelerates` **RED** |

Charter B2 answers:
- **(i)** a genuinely weak boost (`throttle <= boost < throttle+8`) does **not** trip the pin - it still
  reds `boostAccelerates`. Confirmed.
- **(ii)** `boost.speed == throttle.speed` - the strict `<` lets it pass to the normal check, which reds
  `boostAccelerates`. **Correct** per their reasoning: only an outright collapse *below* baseline is
  treated as invalid; an exactly-flat boost is a legitimate weak-boost red, and the strict `<` errs
  toward NOT masking a real red (fail-safe direction).
- **(iii)** NaN / null speeds do **not** trip the pin (finite-guards) and do **not** mask the normal
  checks (they fall through and red). Confirmed.

The pin can only convert a would-be `boostAccelerates` RED (`boost < throttle`) into a retriable
MEASUREMENT_INVALID - **never a RED into a PASS**. The report's own S6 residual risk (a *severe
deterministic* boost regression would mislabel as MEASUREMENT_INVALID on all 3 retries) is real but
still fails-safe (exit 1, both speeds printed). **Pin verdict: cannot mask a genuinely weak boost.**

### B3 - Audit of the flight lane's REPORT

- **"viewport-agnostic" is an INFERENCE, not a direct repro** (the load-bearing caveat). Every *outright
  failure* the reviewer reproduced was on **desktop** (concurrent pairs + concurrent-x5 d1); the
  **mobile** arm never produced a failure in their repros (mobile-solo x5 = 5/5 pass). The recorded red
  was mobile, but a mobile failure was never reproduced. The conclusion rests on: the timing race is
  intrinsic (mobile-solo `rot` varied 0.06-0.25 with zero concurrency) + the perturbation is
  non-entity/non-viewport-specific + desktop repros hit the same signature. Well-reasoned, but the
  report's word "confirming" slightly overstates - "strongly implies" is the honest strength. Gate
  robustness does not depend on it (the reset pins `rot=0` on both viewports regardless).
- **Mobile-solo isolates the RACE, not the FAILURE** - supported. It shows heading non-determinism is
  intrinsic (rot varies without concurrency) but produces no failure (5/5); the concurrent arm shows the
  amplification (rot spread 0.19-0.93 + the failures). Decomposition internally consistent.
- **Falsification of the early-sampling hypothesis** - logically sound and specifically evidenced
  (throttle->boost delta measured 41-44 ticks >= 39; no `waitForSimTicks` timeout-swallow in any run), so
  "early sampling via a swallowed tick-wait" is ruled out. Rests on the reviewer's own instrumentation,
  which I could not independently re-run (browser owned by another lane) - not refuted, not
  code-level-re-verifiable here.
- **Apparent "not an entity hit" (S1/S2) vs "stranded freighter body" (S7) RESOLVES, not contradicts.**
  The collision-locator scanned entity *positions* (nearest ~490 WU away); the culprit is a *body*
  stranded ~25 WU away, decoupled from its entity at (2487,1658). The stranding is precisely why an
  entity-position scan missed it - S7 explains S1. Minor terminology wrinkle: S2 calls the nearest
  *entity* an "asteroid" while S7 discusses the *freighter body* - not contradictory, but worth stating.
- **Counting imprecision in the "60/60 viewport-runs" headline.** S5's table is 3 gate runs x 10
  viewport-runs (5 desktop + 5 mobile) = **30** for the accepted collapse-detector pin. "60/60 (30
  mobile + 30 desktop)" only reconciles if the earlier *entity-clearance* pin's 3 runs are also counted
  (6 x 10 = 60), i.e. the headline conflates two pin versions. The accepted pin has **30/30** directly
  attested; the substance (0 failures, 0 MEASUREMENT_INVALID trips, 0 retries) holds either way.

### B4 - Stranded-freighter mechanism verified at all three source sites

| Cited site | Finding | Verdict |
|---|---|---|
| `travelLanes.js` | `:461` spawns `type:'freighter'` (`radius:12`, `mass:1e5`, `data.parentType:'lane_traffic'`); `:448-450` reposition via direct `existing.pos.x/z =` writes ("Entities are never destroyed") | **CONFIRMED** |
| `physicsAuthority.js` | `:272 defaultDynamic` lists ship/drone/payload/projectile/pickup/wreck/chunk/debris - **`'freighter'` absent** -> static body | **CONFIRMED** |
| `sg02DynamicBodyOwner.js` | `:204` gates the ENTIRE static re-sync block on `staticChanged` (a `staticVersion` bump); dynamics always sync (`:236`). A direct `entity.pos` write doesn't bump the version -> the freighter's static collider is never repositioned -> stranded | **CONFIRMED** |

So a lane freighter gets a solid **static** body that stays at its spawn pose while the entity slides -
a stranded invisible collider. The diagnosis is accurate; it is correctly filed as a separate runtime
ticket and NOT fixed in this probe-only commit (diff is probe-only, verified in B1).

**Informational (ledger cross-check):** `design/program/NOW.md:26-27` and
`03_LIVE_ACCEPTANCE_MATRIX.md:123-124` record the exact mobile `boostAccelerates`/`reverseBrakes` red
this commit fixed. The separate **`NOW.md:122` "probe-margin debt"** is a `probe-ship-visual-stability`
*readiness-deadline-under-load* flake - a DISTINCT mechanism the stranded freighter does **not** explain.
The freighter defect is scoped to the boost-measurement red only.

---

## C. Verdict

### Per-claim table

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| massSeed-1 | FINDING-01 repaired by the `phase==='collapsing'` branch | **CONFIRMED** | revert->red (double-emit signature), repaired->green; A3 attacks all pass |
| massSeed-2 | new suites (adversarial 20 + findings 1); `check:mass-seed` = 41 tests | **CONFIRMED** | 41/41 exit 0; package.json diff extends the glob |
| massSeed-3 | findings test red-before / green-after | **CONFIRMED** | A2: exit 1 pre-repair w/ exact signature; exit 0 repaired |
| massSeed-4 | mutant matrix 7/7 caught post-repair, documented splits | **CONFIRMED** | A4: 7/7, splits byte-identical (39/2,40/1,36/5,34/7,39/2,40/1,36/5) |
| massSeed-5 | gates green (physics-authority, sim:compare, massline) | **CONFIRMED** | A1: all exit 0 |
| flight-1 | reset removes a heading non-determinism (confound, not a bar) | **CONFIRMED (code-level)** | reset call present, pins `rot=0`/`vel=0`; thresholds unchanged (B1) |
| flight-2 | pin is fail-safe; cannot mask a genuinely weak boost | **CONFIRMED** | B2 logic table: only `boost<throttle` throws (retriable), never RED->PASS |
| flight-3 | thresholds / tick counts byte-identical (probe-only) | **CONFIRMED** | B1 byte-diff |
| flight-4 | perturbation = stranded static freighter (3 code sites) | **CONFIRMED** | B4: all three sites verified at source |
| flight-5 | freighter NOT fixed here (filed separately) | **CONFIRMED** | diff is probe-only (B1) |
| flight-6 | 3x `check:flight:clean` green, 60/60 viewport-runs, sim:compare 0 | **PARTIAL / UNVERIFIABLE-AT-THIS-LEVEL** | sim:compare re-run exit 0 (CONFIRMED); the browser gate runs could not be re-executed (browser owned by another lane) and the "60/60" headline conflates two pin versions (accepted pin = 30/30 attested) |

### New findings

- **FORENSIC-FINDING-02 (P2/P3, repair-widened):** a replacement deployed during the dead-collapsing
  window can be killed by the retired seed's dying-beat via entity-id aliasing (owner: `massSeed.js`).
  Pinned expected-RED in `test/mass-seed-forensic-findings.test.mjs`. Deterministic in a quiet scene,
  probabilistic in combat. Does not breach the acceptance bar. Suggested fix sketched (A3-finding); not
  implemented.

### Final judgment

**Gate-0's repair set MEETS the bar "repair accepted findings, mutants rerun, claims reproducible."**
- massSeed FINDING-01: accepted finding repaired, red-before/green-after reproduced, 7/7 mutants
  re-caught with byte-identical splits, all gates green, every repaired-behavior claim reproducible.
- flight-probe: probe-only change proven byte-exact, pin proven fail-safe, freighter diagnosis proven
  accurate at source; the browser gate-run count is the only claim not independently re-verifiable at
  this level (and its "60/60" headline is imprecise, though the substance holds).

The one new finding (FORENSIC-FINDING-02) is a **non-bar-breaching, repair-widened latent bug filed for
the owner** - it is a product of the review working as intended and does not invalidate either repair.

---

## End state

git status --short:
  ?? REPORT.md
  ?? test/mass-seed-forensic-findings.test.mjs
  ?? test/mass-seed-forensic.test.mjs

`git diff --stat` (tracked files): empty. `src/systems/massSeed.js` and
`scripts/probe-flight-visual.mjs` are byte-identical to HEAD (all mutant/revert edits restored via
byte-exact `cp` from pristine backups; verified clean after each). No git write commands were run; the
browser was not launched.

FORENSIC_REVIEW_DONE
