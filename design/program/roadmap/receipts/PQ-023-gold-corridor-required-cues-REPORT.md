<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-023
leafId: PQ-023.gold-corridor-required-cues
acceptance: milestone_accepted
disposition: PASS
candidateCommit: 93c76f6529e709ac6dc552b4611571dee590ca72
-->

# PQ-023 — `gold-corridor-required-cues` leaf receipt

## Milestone upgrade — 2026-08-02

```yaml
packet: PQ-023
leafId: PQ-023.gold-corridor-required-cues
promotionUnit: PQ-023.promote-corridor-cues
promotionBase: f720eb186cc9290ababcb28b3dca05166c222010
candidateCommit: 93c76f6529e709ac6dc552b4611571dee590ca72
lifecycleClaim: integrated
acceptanceClaim: milestone_accepted
disposition: PASS
browserElectronFunctionalRoute: PASS
integratorMotionAccessibilityReview: PASS
matchedPerformanceCleanup: PASS
physicalControllerClaimed: false
newHeadedEvidenceSpent: false
```

**PROMOTE this exact leaf to `milestone_accepted`.** The original implementation evidence below is
unchanged. Its formerly open route, review, repair, accessibility, dense-composition, performance,
and cleanup rows now have committed exact-candidate receipts. The primary integrator reviewed those
receipts against live ancestry and found no unresolved cue-family gate. This is evidence
reconciliation only; it reruns no accepted Browser/Electron cell and changes no runtime, visual,
asset, default-quality, or pool-capacity path.

| Accepted layer | Exact evidence | Git blob |
|---|---|---|
| Cathedral cue Browser/source-Electron H1 | `PQ-023-cues-h1-capture-REPORT.md` | `0d81ba727568808e09d6aaed1a32ebfc001ba09a` |
| Initial cue-motion/accessibility disposition | `PQ-023-h2-cue-motion-accessibility-REPORT.md` | `7be55feba58b459b133b07bf79fc85b1c6d56d08` |
| Targeted flak/small Browser/source-Electron H1 | `PQ-023-combat-readability-h1-REPORT.md` | `1137b30aed42f52fc71682df50d585b635add55b` |
| Flak KEEP / small REVISE causal review | `PQ-023-combat-readability-review-REPORT.md` | `72716d81455e2c23c38f939422bc2d21975f9bea` |
| Localized small-destruction repair | `PQ-023-small-destruction-salience-repair-REPORT.md` | `d17ff9f0c26c4e47a14bad41c51c1a4b575bfda2` |
| Final small-only Browser/source-Electron H1 | `PQ-023-small-destruction-salience-h1-REPORT.md` | `6c94d2b6c5e999924745daf2670aa21cb361a768` |
| Final small-destruction KEEP review | `PQ-023-small-destruction-salience-review-REPORT.md` | `51353847571d48e81f9fa572923854615d42eef1` |
| Three-pair headed Browser H3 | `PQ-023-h3-performance-REPORT.md` | `0eef5830fc4a75ac9ff0e32f8a098319efc8718e` |

The final route state keeps Cathedral damage/recovery semantics, reduced motion/flash and noncolor
text/shape equivalents, ordinary/capital hierarchy, dense critical-cue survival, repaired flak
identity, and repaired full-motion small destruction. Browser/source-Electron functional semantics
are accepted; H3 passes at target median p50/p95/p99 `16.7/16.8/17.3 ms`, zero target
`>32/>50 ms`, zero target backlog/product hitches, correlated GPU median p95 `10.403488 ms`, bounded
default pools, restored benchmark state, and clean Browser/server teardown on real Intel D3D11.

- **Branch:** `claude/pq023-corridor-cues-20260728` (base `b6b6422d`)
- **Scope:** the six cue families the Gold Corridor (PQ-025) requires. Propulsion, camera language,
  HUD telemetry hierarchy, localized environment and generic aesthetic work are out of scope and
  untouched.
- **Method:** gap-driven. Every "existed" and every "added" row below is backed by a probe that ran
  at `b6b6422d` before any edit. Where a probe contradicted the leaf brief, the measurement wins and
  the row says so.

## 1. Commits

| SHA | Subject |
|---|---|
| `3e48a94c` | docs(pq023): Phase-0 corridor-cue audit with measured gap table |
| `fabe4038` | feat(pq023): reserve cue lane budget for critical state in dense ticks |
| `341746d6` | feat(pq023): bind World Site damage/recovery to noncolor cues and accessible text |
| `0e36c554` | feat(pq023): flak impact identity, corridor cue tests, and the dense-scene gate |
| `d9129c22` | docs(pq023): leaf receipt for gold-corridor-required-cues |
| `acddb2de` | fix(pq023): keep a restoration below the assertive screen-reader tier — **candidateCommit** |

## 2. Per-family gap table

| Family | Existed at `b6b6422d` | Added by this leaf | Evidence |
|---|---|---|---|
| **(a)** combat/weapon readability | PQ-010 delivered 10 weapon families, 8 impact profiles, 9 trail classes, guarded by `assertProjectileTrailProfileContracts`. | Flak had `family: 'kinetic'`, and impact profiles are keyed by **family**, so flak shared the autocannon impact byte-for-byte — a recolor at the exact moment the leaf requires distinctness. Added a variant-keyed override: proximity-burst / fragment-cloud / 24 fragments, with `lightPeak` **below** the autocannon's because flak fires in dense volleys. Flak stays mechanically kinetic. | `test/pq023-corridor-cues.test.mjs` — flak vs autocannon distinctness; all impact modes mutually unique |
| **(b)** impacts and destruction phases | `EXPLOSION_SCHEDULES` small/ordinary/capital, 5–8 ordered phases, deterministic allocation-free pattern mixer that does not consume sim RNG. | Nothing. Audited as sound and deliberately **not** rebuilt. | audit §3(b) |
| **(c)** damage and recovery | Ship damage states exist. For the Cathedral the brief's strong claim ("no damage/recovery visual") was **DISPROVED**: damage regresses the stage and recolours fixtures `#72c9d4 → #6594a6`. | Three real gaps closed. (1) The signal was **colour-only** — opacity/scale/visibility byte-identical. (2) **Per-component status was ignored**: the fixture guard tested key existence against a map `projectWorldSitePresentation` always fills for every component, so it was vacuous. (3) **No cue existed** — the orchestrator had zero `worldSite` subscriptions. Added `worldSiteDamageStates.js`, per-component fixture binding, and orchestrator subscriptions to both receipts. | `.devshots/pq023-cues/audit-probe-cathedral.mjs`; condition matrix in the committed evidence JSON |
| **(d)** reduced motion / reduced flash | `vfxAccessibility.js` (4 frozen policies), camera trauma damped to 0.25 under `motionReduce`, `worldSitePresentation` honoured both flags. | Policy only ever **scaled** effects; a cue could not state what its reduced form *is*. Added optional `reducedMotionMode` / `reducedFlashMode` on the recipe from a named vocabulary, validator-checked. The impaired stutter collapses to a steady dim, so the state stays legible with zero motion. | focused tests; `REDUCED_CUE_MODES` |
| **(e)** noncolor / no-audio equivalents | `_applyAccessibility` supplies caption text, a non-colour `shape` token, and an `assertive` flag — a real channel. | Driven by a hardcoded 16-entry `CAPTIONS` table; `grep accessibilityText src/` returned **zero** hits, so text could not vary with the mechanical fact. Added optional owner-supplied `accessibilityText` that outranks the table, plus distinct glyphs (`bracket` failure / `ring` restoration). The caption now names *which* component failed. | `"Cathedral hull failed." / "Cathedral hull restored."` in evidence JSON |
| **(f)** dense-scene prioritization | Nothing. Suppression was strictly first-come-first-served. | Two compounding defects fixed. (1) `.none` lane placeholders were **charged real budget**, so 3 cues of any kind exhausted the camera lane and every later cue in that tick died. (2) No priority reservation. Replaced with reservation: critical draws the full cap, flavor only the general pool, **totals unchanged**. | `scripts/check-pq023-corridor-cues.mjs` trace |

### The reproduced failures (measured, not inferred)

**(f)** one tick, 8 flavor cues then one critical `tether.break`:

```
BEFORE  flavor emitted 3/8   critical emitted FALSE
        suppressed: mining.drill.contact(lane_budget:camera) x5,
                    tether.break(lane_budget:camera)
AFTER   flavor emitted 4/8   critical emitted TRUE
        suppressed: mining.drill.contact(lane_budget:audio) x4
```

**(c)** stage held constant, every fixture component set to `failed`:

```
BEFORE  byte-identical to healthy (opacity .92/.50/.64, scale 1.0)
AFTER   opacity .156/.085/.109, scale 0.72
```

## 3. Budget declaration

Declared as data in `src/presentation/cueArbitration.js` (`CUE_BUDGET_DECLARATION`) and asserted by
tests, so the declared budget and the enforced budget cannot drift.

| Lane | Cap (unchanged) | Critical reserve | General pool |
|---|---|---|---|
| camera | 3 | 1 | 2 |
| vfx | 8 | 3 | 5 |
| audio | 6 | 3 | 3 |
| ui | 6 | 3 | 3 |
| accessibility | 6 | 3 | 3 |

- **Exhaustion behavior:** reservation. Flavor is suppressed with `lane_budget:<lane>`; critical
  cues may claim the full cap. Arrival order never promotes flavor over critical.
- **Reserve sizing:** `CRITICAL_COOCCURRENCE = 3`. This was **found by the gate, not guessed**: at a
  reserve of 2 the dense scenario still dropped exactly one critical cue per saturated tick (6 of
  18), because ten flavor cues consumed the general audio pool. Camera is deliberately held at 1 —
  the packet forbids camera motion that steals control, so one critical kick may land but three must
  not stack on a frame.
- **Cadence/culling:** lane counts reset per tick; dedupe windows owned per recipe; dedupe sweep
  every 60 ticks.
- **Instancing:** unchanged — `instancedSpritePool`, `persistentBeams`, `phasedExplosions`,
  and ≤12 fixtures/animations per World Site stage.
- **Lights/post:** per-cue `budgets.lights`, zeroed under reduced-flash. **No post-processing pass
  added, no default quality lowered, no authored effect removed.**
- **Allocation:** no hot-path allocation; the decision path allocates only the sorted lane-name array.

## 4. Gates

| Gate | Result |
|---|---|
| `npm run check:pq023:corridor-cues` | **PASS** — 20/20 focused tests; 18/18 critical cues survive, 42/60 flavor degrade |
| `node --test test/pq023-corridor-cues.test.mjs` | **PASS** — 20 pass / 0 fail |
| `npm run check:presentation` | **PASS** — 65 pass / 0 fail (baseline was also 65/0) |
| `npm run check:combat` | **PASS** (baseline PASS) |
| `npm run check:sim:compare` | **`hashEqual: true`** — golden unchanged |
| `npm run check:visual-stability` | **PASS** (baseline PASS) |
| `npm run check:baseline` | **PASS** |

### Gates exposed by this leaf's specific edits, run beyond the mission list

Changing `_applyAccessibility`'s text resolution, adding two `PRESENTATION_AUDIO_CUE_BY_ID` entries
and adding two keys to `PRESENTATION_RECIPES` exposes every consumer that enumerates the registry or
asserts on `metrics.presentationCue`. `check-sg08-mix-profile` already caught this leaf once on that
class of global invariant, so the enumerating consumers were run explicitly:

| Gate | Result |
|---|---|
| `check-critical-signature-captions` | **PASS** |
| `check-47a-recovery-contested` (asserts `presentationCue >= 6`) | **PASS** |
| `check-sg05-runtime` (asserts on `presentationCue`) | **PASS** |
| `check-47a-civilian-priority` | **PASS** |
| `check-first-hour-audio-identity` | **PASS** |
| `check-audio-identity` | **FAIL — pre-existing, A/B proven** |

`check:audio-identity` fails **identically at `b6b6422d`** with the same three uncovered ids
(`sfx_mining_seam_reward`, `sfx_vector_mine`, `sfx_rcs_disrupt`), none of which is reachable from
this leaf's diff. Verified by checking out the base sources, running the check, and restoring.

### Golden safety

47a emits **15 presentation cues and suppresses 0**, with a maximum of **2 cues in any single tick**
— below even the tightest general pool (camera, 2). The arbitration change is therefore a provable
no-op in the golden scenario, which `hashEqual: true` confirms. `metrics` is not part of the hashed
snapshot (`sf-sim.mjs:553`), and the two floor assertions on `presentationCue` in
`check-sg05-runtime.mjs` and `check-47a-recovery-contested.mjs` are `>=`, which reservation can only
help. `presentationAdapters` performs no writes to hashed simulation state.

### Regression caught and fixed during the leaf

`check-sg08-mix-profile.mjs` enforces that **every** presentation recipe maps to a concrete authored
audio recipe. The first draft used `audio.none` for the World Site cues and broke that green gate.
Fixed by mapping both cues to existing authored signatures rather than inventing assets —
deliberately **not** `presentation.subsystem.disabled`, which means the *player's own* subsystem
died and would blur two different mechanical facts. Dedicated site audio is a follow-up.

### Assertive-tier correction

`_applyAccessibility` promotes `playerRelevance >= 0.9` to an **assertive** screen-reader interrupt.
`world_site.recovery` initially declared a 0.9 floor, which would have let a routine
"Cathedral hull restored." interrupt a live combat warning mid-sentence — inverting the very
priority this leaf exists to protect. Lowered to **0.88**, the codebase's documented "player is the
source" tier (see `MASSLINE_OBSERVER_PLAYER_RELEVANCE_FLOOR`). `world_site.damage` keeps 0.9 because
it *is* addressed to the player: it undid their work. Pinned by a focused test asserting the
recovery cue stays below the assertive tier by both relevance and importance.

### Removed visibility guard loses no behaviour

`validateStagePresentation` (`worldSiteKernel.js:944`) rejects any stage whose fixture `componentId`
is not in `manifest.components`, and `createWorldSiteRecord` derives `record.components` from that
same list. The case the vacuous guard covered — a fixture whose component has no status — is
therefore unreachable for a valid manifest, and when `componentStatuses` is absent entirely both the
old guard and the new binding leave the fixture visible.

## 5. Evidence paths

| Artifact | Path |
|---|---|
| Phase-0 audit | `design/graphics-sprints/handoffs/2026-07-28-pq023-corridor-cues-audit.md` |
| Durable route evidence | `design/graphics-sprints/evidence/pq023-corridor-cues/dense-scene-suppression-trace.json` |
| H1 headed motion attempt | `design/program/roadmap/evidence/h1/row6-pq023-cues/EVIDENCE.md` |
| Working evidence + baselines | `.devshots/pq023-cues/` (untracked) |
| Gate | `scripts/check-pq023-corridor-cues.mjs` |
| Focused tests | `test/pq023-corridor-cues.test.mjs` |

## 6. Write set

`src/presentation/cueArbitration.js` (new), `src/presentation/worldSiteDamageStates.js` (new),
`src/presentation/cueRecipes.js`, `src/systems/presentationOrchestrator.js`,
`src/systems/presentationAdapters.js`, `src/render/worldSitePresentation.js`,
`src/render/vfxProfiles.js`, `test/pq023-corridor-cues.test.mjs` (new),
`scripts/check-pq023-corridor-cues.mjs` (new), one `package.json` line, audit doc, evidence dir.

The shared-abstraction rule is satisfied: `cueArbitration` is characterized by focused tests and has
two representative consumers exercised end to end — combat impact/damage cues and World Site
damage/recovery cues. `worldSiteDamageStates` likewise has two: the fixture renderer and the cue
path. No propulsion, no `check-vfx-frame-sleep.mjs`, no HUD anchor layout, no voice-arbiter rules,
no protected asset families were touched.

## 7. Accepted route, review, and performance closure

The original fixed-seed H1 attempt produced a reviewable WebM plus impact, destruction,
reduced-profile, and dense-scene frame sequences, then stopped before the first Cathedral frame on
an unsatisfiable harness ordering. That failure remains retained and classified in row 6. Exact unit
`PQ-023.cues-h1-capture` later accepted candidate `f373e8a7`, Browser claim
`40008-bf8ebe348500b65aa41197e6`, and the distinct Electron parity continuation after the causal
one-load repair at `e2bb0165`. Full historical classification and accepted continuation receipts are
in `design/program/roadmap/evidence/h1/row6-pq023-cues/EVIDENCE.md`.

| Row | Status |
|---|---|
| Normal-route Browser evidence with source fingerprint and exact cue IDs | **PASS** — retained combat motion plus candidate `f373e8a7`, claim `40008-bf8ebe348500b65aa41197e6`, digest `3b31ee47…`; complete Browser report and World Site semantic projection committed in row 6. |
| Independent motion / normal-camera review (impacts, destruction, reduced variants, dense overlap) | **PASS** — the solo integrator review kept Cathedral/accessibility, ordinary/capital, reduced, and dense composition; targeted causal reviews then kept repaired flak and final small destruction. |
| Pixel stills and motion of Cathedral damage/recovery at the normal camera | **PASS** — motion reel plus 12 Browser and four Electron frames cover normal/reduced recovery and damage; H2 keeps the caption, noncolor-shape, urgency, and static-dim semantics. |
| Electron semantic parity | **PASS** — exact four-transition/caption/accessibility projection matches Browser on real Intel ANGLE/D3D11 with zero issues and clean teardown. |
| Matched target/floor performance: frame phases, particles/sprites/lights, draw calls, hitches, cleanup | **PASS** — claim `25092-dc1e123131f87f9b970e8185`, candidate `93c76f65`, six matched windows, absolute cell budget green, exact cue/pool topology, and clean teardown. |
| `milestone_accepted` upgrade | **PASS** — all required receipts above are committed and ancestry-valid; this receipt now exposes the exact milestone evidence contract consumed by PQ-025. |

## 8. Residuals

None for this leaf. Every owner event this leaf needed already existed and was unambiguous
(`worldSite:failureReceipt`, `worldSite:operationReceipt`, `combat:damage`, `entity:killed`), so no
family had to be stopped under the packet's ambiguous-owner stop condition. The integrator-owned H2
review, both targeted repair/re-review chains, and H3 matched performance are complete. Physical
controller behavior is neither required by nor claimed for this cue-family milestone.

The receipt's committed blob is bound into PQ-025 only after this upgraded revision lands in Git.
