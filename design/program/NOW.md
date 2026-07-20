# NOW — Active Work and Path Leases

**Snapshot:** 2026-07-19 after combined merge `b235f062`, evidence hardening through `280cafb0`, and
the corrected Atlas journey decision `f3bf00f4`. Graphics, Atlas/map/travel, startup/loading, and the
reviewed performance synthesis are on `master`. This board does **not** claim final
browser/Electron/GPU frame-time acceptance: old matrices are diagnostic, and the first live
authored-instance-pool candidate failed closed during its narrow fleet rerun. The primary checkout is
clean; unread `design/program/_review/` residue was moved to
`SpaceFace-archives/primary-review-quarantine-20260719` without being opened or imported.

**Integrated checkpoint:** the earlier Atlas/map/travel, performance, and graphics synthesis remains
reachable through `ee9e0ab3` and its context-recovery hardening `f0b3b154`. The later closeout adds
golden asset receipts and common-rock maps (`bd79f2ba`), truthful authored admission, semantic PBR
routing, rock preload, runtime visual-family identities, and sticky impulse-charge orientation
(`5219491d`), the resumable long-term architecture (`98e1e429`, `1de8a861`), the Atlas/journey
verification transaction (`b05d2cf9` through `6a4bebd7`), and the checkpoint gate wiring
(`5863331c`). Merge `cbdf1589` promoted that graphics slice; `21d82428` repaired the current
journey/velocity evidence surface, and `b235f062` integrated the reviewed performance synthesis.

**Acceptance boundary:** `npm run check:graphics:asset-receipts` passes on the promoted tree and pins
the exact Helios, representative-rock, Wasp-candidate, and RCS artifacts. Focused runtime/admission,
material, visual-family, and interaction tests passed before promotion. On the final combined tree,
all 167 performance-modified tests and 49 graphics/PBR/VFX identity tests pass together with camera,
AI-telegraph, and exact asset-receipt checks. That is integrated and focused-green implementation,
not final visual acceptance: natural Helios/rock motion, hardware Electron parity, GPU-state capture,
and broader fleet/station/rock/wreck PBR remain open. See
[`08_GRAPHICS_OVERHAUL_CHECKPOINT.md`](./08_GRAPHICS_OVERHAUL_CHECKPOINT.md) and the long-term
architecture in
[`../graphics-sprints/LONG_TERM_GRAPHICS_OVERHAUL.md`](../graphics-sprints/LONG_TERM_GRAPHICS_OVERHAUL.md).

**Current isolated lanes:** only `SpaceFace-graphics-overhaul` and the active
`SpaceFace-performance-closure` repair remain registered beside `master`. The former retains the
uncommitted Blender/source inventory. The latter is validating live scene-level authored ship
instance pools after its first pipeline-admission attempt exposed and repaired a nested-subject bug.
Graphics-closeout, rejected Helios, Depth, Kimi, and orchestration satellite folders were removed only
after their value was merged, committed on a donor branch, tagged/archived, or explicitly rejected.
Decisions are recorded in [`09_DONOR_VALUE_LEDGER.md`](./09_DONOR_VALUE_LEDGER.md).

**Immediate safe work:** accept or reject the repaired live authored-instance-pool vertical from its
clean 10/25/50-ship rerun, synthesize it manually with the current semantic-PBR path, and rerun the
strict final performance contract on one clean exact commit. Then capture natural Helios/rock motion
and combat/destruction GPU evidence. The highest-return graphics continuation is natural-route Helios/rock
parity, combat/destruction visual acceptance, localized authored space structure without
screen-wide haze, and the next high-frequency PBR family. The Kimi/OpenCode Helios replacement is
rejected, and its useful batching source was already preserved on `master`.

## Wave-01 integration record (all on `master`)

| Commit | What it is |
|---|---|
| `fd47884e` | fix(A08) — order-independent duplicate-machine aggregation, typed telemetry gate (review round 1 P0) |
| `ae423dd7` | test(W02) — combat-trace contract suite (21 tests, hard-coded FNV vectors) |
| `4891099a` | fix(W01) — single-shot `offerConsumed` gate; the two OPEN encounterDirector defects from the previous board are CLOSED |
| `b29dd72c` `cdf2484b` `edca7c7e` | feat(A02) — discovered-formation persistence owner, registry + save-key wiring, SAVE_SCHEMA regenerated from a CLEAN worktree (adds `$.formations` **and** the missing `$.sites` row — the committed half of the save-schema red is closed) |
| `f1a210cf` | test(A05) — review-driven suite repair (production install-gate probes, independent literals, catalog decoupling) |
| `f7e8a4fd` | fix(T02) — pump/escape tolerances grounded in shipped constants (winch-efficiency ceiling law, debounce stacking law, masslineThreats contest copies); validator strictness; builder refactor |
| `6d411cf5` | feat(T03) — intent/obstruction/ownership axes on the rung-07 target scorer; legacy path byte-identical |
| `53452e84` `ce4dddee` | fix/test(A06) — total-order machine key, overflow-safe capacity/load, throw-free coercion, defs seam; suite self-contained (62 tests) |
| `61e84071` `c751b9a9` | feat/test(A10) — the four design rulings implemented and pinned (ownership-scoped construction, refuse-then-confirm lane spills with deterministic receipts, exact over-capacity diagnostics, characterization→normative conversion) |
| `fb9a0c82` | feat(G02,G03) — deep-state capture harness; `fresh-start` and `first-station` CAPTURED and RESTORE-PROVEN through the public route; ladder 2 captured / 11 planned |
| `9584053c` | test(A08,A05,W01,W02) — round-2 residual findings closed |

## Wave-01 packet status

Terminal classes per `roadmap/README.md`. "R1/R2/R3" = independent fresh-context adversarial
review rounds (gpt-5.6-sol, xhigh); every R1/R2 finding was reproduced by the lead before repair.
R3 verdicts land asynchronously; a packet listed `pending R3` is INTEGRATED with focused proof and
awaits that final verdict before its terminal stamp is unconditional.

| Packet | State | Commits | Proof |
|---|---|---|---|
| `T02` | `FOCUSED_GREEN`+`INTEGRATED` (R1 REJECT→repaired; pending R3) | `1a9f98e5`+`f7e8a4fd` | massline-invariants 47/47; orbit-telemetry 26/26 unchanged |
| `T03` | `FOCUSED_GREEN`+`INTEGRATED` (pending R3) | `6d411cf5` | contract suite 9/9; `check:massline:target-scoring` green (legacy byte-compat pinned) |
| `A02` | `FOCUSED_GREEN`+`INTEGRATED` (R2 full-packet REJECT→repaired; pending R3) | `b29dd72c`,`cdf2484b`,`edca7c7e`,`80a8e846` | persistence suite 17/17; save-family 71/71; goldens stable; clean-tree `check:save-schema` GREEN |
| `A05` | `FOCUSED_GREEN`+`INTEGRATED`, rerun at post-A02 HEAD (R1 REJECT→repaired; R2 residuals→closed `9584053c`) | `936be4f2`+`f1a210cf`+`9584053c` | contact-ring-law green in the 252-test family run at `c751b9a9` |
| `A06` | `FOCUSED_GREEN`+`INTEGRATED`, rerun post-A05 (R1 REJECT→kernel+suite repaired) | `4c367cd7`+`53452e84`+`ce4dddee` | site-thermal 62/62 |
| `A08` | `FOCUSED_GREEN`+`INTEGRATED`, rerun post-A05 (R1 P0→repaired; R2 residuals→closed) | `491b0726`+`fd47884e`+`9584053c` | site-signature green in family run |
| `A10` | `FOCUSED_GREEN`+`INTEGRATED`, rulings implemented (R1 P0 characterization-conflict→converted) | `7a250289`+`61e84071`+`c751b9a9` | lane-network 32/32 incl. §12–§16 ruling pins |
| `W01` repairs | CLOSED (both defects; R2 residuals→closed) | `4891099a`+`9584053c` | e1-dispatch suite green; goldens unmoved (47a excludes encounterDirector) |
| `W02` | `FOCUSED_GREEN`+`INTEGRATED` (R2 residuals→closed) | `ae423dd7`+`9584053c` | trace contract green incl. real persistence traversal |
| `G02` | captured+restored, `INTEGRATED` (pending R3) | `fb9a0c82` | ladder validator green; sha256-bound artifact + capture/restore receipts committed |
| `G03` | captured+restored, `INTEGRATED` (pending R3) | `fb9a0c82` | 11-milestone public route; restore + public re-dock proves all three claims literally |
| `G04` | `ROUTE_ACCEPTED` evidence complete | measurement, no code change | `check:autopilot` fully green; both sim compares ok; **five** public dock successes today incl. one on a **clean checkout** at `fb9a0c82` (dock 96s, `station_helios`, closest 154.166 WU, one KeyE hold, injectedState:false) |

The **clean-checkout attribution question is CLOSED**: the corridor dock route belongs to
committed code. The earlier hypothesis that dirty foreign map/nav files were carrying the
approach is falsified. Electron pilot support remains a recorded debt owned by `G18`/M1-ROUTE,
not by `G04`.

## Round-3 closure (final review round, recorded 2026-07-18 late)

All four round-3 reviews returned REJECT with narrow findings; dispositions:

- **Repaired** (`3cd5c5fc`, `1bb71349`, `541a6539`): T03 paint-beats-latch pin; the G-lane
  claim-evaluator/manifest-route/F13-validator hardening (internal checksum recompute, version
  bounds, commit-exists, required cross-checked restore receipts — the gate can now reject
  fabricated captures); A02 anchor-grid quantization (idempotent under the tenth-grid anchor
  map); A06 injective machine-content key + Infinity-capacity ceiling + boxed-Symbol coercion;
  A10 lane-on-cell ownership, reconcile-before-funding, and the machine-removal spill gate with
  its own preview/receipt + UI arming hygiene; W01 null-shape guard.
- **Reproduced and REJECTED with evidence**: the claim that the T02 hardenMax drift mutant stays
  green (mutating the tolerance value itself reds the suite 46/1 — the probe most plausibly
  missed the two-line literal); the massline write-set complaint (a lead briefing artifact — the
  T02/T03 commits touch exactly their declared files).
- **Named debt, outside the wave's dependency closure** (suite hygiene whose behavior surface is
  pinned elsewhere): A06 whole-site fixtures still name `sm_gas_tap` in three places and the
  catalog smoke asserts a live count; A10's `BOOK_RESIDUAL_BOUND` helper is never exercised at
  its boundary; T02's debounce stacking law is a documented copy of module-private telemetry
  constants (behavioral binding lands with T06's runtime wiring). No packet's terminal state
  depends on these; they are the first items of the next suite-hygiene pass.

Post-repair proof at `541a6539`: 314 tests green across the twelve wave suites; both sim
compares ok/hashEqual; ladder validator green (2 captured / 11 planned) with the hardened gate.

## Historical occupied lanes (closed by `ee9e0ab3`)

| Lease | State | Paths |
|---|---|---|
| `MAP-2026-07-18` (remnant) | `CLOSED / INTEGRATED` | Map/travel semantics retained; render overlaps synthesized in unified tree. |
| `CONTENT-2026-07-18` | `CLOSED / INTEGRATED` | Content and generated localization state captured from paused master. |
| `HUD-ASSETS-2026-07-18` | `CLOSED / INTEGRATED` | HUD/assets state captured and reconciled; no current shared-tree owner. |
| `SCREENS-2026-07-18` | `CLOSED / INTEGRATED` | Screen changes captured and promoted. |
| `WAVE01-2026-07-18` | `CLOSED / INTEGRATED` | every Wave-01 path above; write-sets verified disjoint from all occupied leases at each staging |

## Historical known reds — remeasure before acting

| Check | State | Attribution |
|---|---|---|
| `npm run check` (broad chain) | DEAD ON ARRIVAL in `precheck` | `check-m1-tether-mass-grounding.mjs:24` asserts `check:ci` inlines the tether-mass command; `check:ci` was refactored (foundation) to delegate to the complete runner. `package.json` is byte-identical since `4c367cd7`, so this predates the wave on every tree. Standalone fix task spawned. |
| `check:encounter-director` | RED, unchanged (`got 2` at `:171`) | Soak-harness sector-local coords vs global zone anchors + content-catalog selection (measured R1). The `W06` outcome; concurrent CONTENT lane. Not the phase bugs — those are fixed and the soak count did not move, as predicted. |
| `check:save-schema` (dirty tree) | RED, one cause left | Foreign uncommitted `bloomThreshold` 0.72→1 only. The committed `$.sites` half is CLOSED (`edca7c7e`). GREEN on any clean checkout. |
| `check:sim:v3` vs expected envelope | stale expected, actual stable | Unchanged; do not re-record from this lane. |

**Golden gate held through the entire wave:** `check:sim:compare` ok/deterministic and
`check:sim:v3:compare` ok/hashEqual verified after every runtime-touching integration (W01
repair, A02 wiring, A10 rulings). The gate remains the ACTUAL column.

These rows describe the recorded Wave-01 audit, not the current `cbdf1589` tree. Do not treat them as
live blockers until the named check is rerun.

## Historical Wave-02 queue (re-derive from current `master` before claim)

The earlier queue was `G05,G06,G07,G08,T04,A03,A04,W03,W04,W05,W06,W07,R01,R02`. Do not reuse its
old lease labels: the shared-tree leases are closed and later Wave-02 implementation/review commits
are already ancestors of the current checkpoint. Reconcile packet terminal truth against the
roadmap and live checks before dispatching the next program wave; visual continuation is ordered in
`08_GRAPHICS_OVERHAUL_CHECKPOINT.md`.

## Handoff rule

Only the lead/status integrator edits this board during concurrent execution. Receipts follow
`roadmap/00_EXECUTION_PROTOCOL.md`; the lead updates lease and program truth in one pass.
