# Universe Atlas & Physical Travel — Feature Ledger

One authoritative ledger. Do not create a second one. Do not delete or weaken a requirement to make
progress look better — a requirement that turns out to be wrong gets a dated ruling, not a deletion.

**Status vocabulary:** `unverified` (claimed, not proven) · `failing` (proven not to work) ·
`passing` (proven end-to-end through the default player route) · `blocked` (waiting on a dependency).

A feature is **not** `passing` because a flag exists, a reducer transitioned, or a unit test mocked the
result. Player-visible behaviour requires player-visible evidence.

The **release gate** — what each program-level capability means when truly done, in outcome terms —
is `04_RELEASE_GATE.md`. This ledger records *where each feature stands*; that file records *what
done means*.

---

## Verification pass E-5 — 2026-07-19, re-graded against HEAD `92a21766`

> **Provenance caveat — HEAD moved during this pass.** Every measurement below was taken at
> `92a21766`. A concurrent graphics lane then merged `cbdf1589` ("promote graphics closeout
> checkpoint"). Diff `92a21766..cbdf1589 -- src/` touches **only** `render/assetLoader.js`,
> `render/partsLibrary.js`, `render/renderer.js`, `render/rockSurfaceLibrary.js`,
> `render/shipPreview.js`, `render/visualFactory.js` and `systems/impulseCharges.js`. **None of the
> modules any finding here depends on** — `galaxyMap.js`, `routeFollower.js`, `missions.js`,
> `input.js`, `hud.js`, `flightV3.js`, `propulsionKernel.js` — was touched, so the navigation, map,
> propulsion and journey findings carry forward unchanged. The two render-lane gates were
> **re-run after the merge** as a control: `check:shader-compile` exit 0, `check:visual-stability`
> exit 0. Stated rather than assumed, because "measured at a HEAD that no longer exists" is exactly
> the kind of quiet staleness that produced corrections C-1 and C-3 below.
>
> Also dirty and **not this pass's work**: `src/render/camera.js` and
> `scripts/check-camera-velocity-language.mjs` (a concurrent writer's D7 band-3 camera-lead packet).
> Left untouched per D10.

Every status below was re-measured on the current tree by the independent verifier. **Three of the
statuses this pass changed were changed because an earlier report was wrong, not because the code
moved** — those corrections are recorded in full at "Corrections" below rather than silently applied.

> **SUPERSEDED 2026-07-19 (later same day) — the finish line now scores 10 of 11.** The pass below
> was accurate when taken. Five product defects and four grader defects were fixed afterwards; the
> current state is recorded in "Verification pass E-6" immediately below. The E-5 text is kept intact
> because its *method* (pristine-tree controls, corrections C-1..C-3) is what found them.

---

## Verification pass E-6 — 2026-07-19, after the journey remediation

**`check:journey:textile` scores 10 of 11 on the pinned universe.** Still `failing` as a gate — one
step is red and stays red deliberately — but every step of the journey except instrument agreement
now completes through the public player route.

| Step | Result |
|---|---|
| accept-mission | **PASS** — contract `m_2`, 8u `cmdty_fuel_cells` → `station_ceres`, hold loaded, undocked |
| open-map · identify-position · inspect-destination | **PASS** — all four nav questions answered and cross-checked against the sim |
| compare-and-plot | **PASS** — 2 options compared on fuel/hops/risk/time, then plotted |
| engage-separately | **PASS** — *"SEPARATION HELD: after plot the ship drifted 4.2 WU with no engaged executor; after Engage the executor is transiting and the ship travelled 566.5 WU"* |
| truthful-instruments | **FAIL** — see below. Left red on purpose. |
| interrupt-route · recover-itinerary | **PASS** — DISENGAGE, then resumed on the same leg |
| arrive-and-deliver | **PASS** — *"arrived in sector_ceres_belt **under route control** and settled the contract at station_ceres: 8u left the hold, mission m_2 completed"* |
| save-load-states | **PASS** — docked-with-contract survives cold reload → Continue |

**Determinism was the precondition for all of it.** The board is `hash32(state.meta.seed, …)` but the
seed came from wall-clock, so consecutive runs of the *identical tree* scored 5/11 then 3/11 — one
drew a haul that loaded, the next one that did not. That made debugging dishonest: a step that moved
between runs could not be attributed to a fix rather than to the dice. A **universe seed field** now
exists on New Game (`parseUniverseSeed`, `#sf-ng-seed`) and the check pins it, typed through the
public field at the pre-Launch milestone. The anti-injection contract still passes 16/16 — typing
into a player-facing field is the public input surface it permits.

**The product defects found and fixed** (each was invisible to the unit suites that covered it):

1. **The route follower declared arrival without ever leaving the sector.** `resolveLegTarget` aims
   the autopilot at the *gate*, so "autopilot arrived" means *reached the doorway*; the follower
   treated that as leg completion, and on a one-leg route that completed the itinerary. Measured:
   `status='arrived'`, `executorClaimedArrived=true`, ship in `sector_helios_prime`, jump receipts
   all zero. Worse, it **never emitted `world:requestJump` at all**, so the transition its own header
   promised could not happen. Now requests the handoff through the shipped public seam and advances
   only on a real `sector:enter`. *The unit test asserted the defective behaviour and was rewritten
   stricter* — see below.
2. **A button labelled "Plot course" emitted `world:requestJump`** on an adjacent sector — committing
   the transition while promising a plot. Reachable in ordinary play.
3. **The route follower was unreachable for every adjacent sector**, because `Set Course & Jump` was
   the only action offered. Wave 1's centrepiece could not be handed a route to the canonical
   Helios→Ceres contract. Fixed additively; the pinned one-hop jump seam still passes 7/7.
4. **Plotting dismissed the chart**, so plot and engage could not happen in one sitting.
5. **DESTINATION / NEXT LEG were blank** until a route was plotted, even with an accepted contract.

**The grader defects found and fixed** — all four measured the wrong thing rather than measuring
wrongly, which is worse, because a grader that cannot see what it grades reports *absence*:

- ETA compared `distance / |velocity|` against a HUD computing `dist / closingSpeed`, **and** against
  a different target than the one displayed. Two separate identity errors in one number.
- `.gm-inspector`, `.gm-route-ribbon` and the Resume lookup were selectors that match nothing. A
  wrong selector does not error; it silently measures something else. Three instances.
- A click staleness race (`items.nth(i)` read then clicked across a re-render) made step 1 fail
  intermittently, taking seven downstream steps with it.

**`truthful-instruments` is left FAILING deliberately.** The two sides now agree to within ~20%
(displayed 17.00 vs 22.12; 15.00 vs 18.81; tolerance 3.00). The likeliest cause is *sampling skew*,
not a lying instrument: headless rAF is throttled to a few frames per second, so the painted HUD lags
the sim while the ship accelerates 0 → 151 WU/s during acquisition. **Widening the tolerance would
turn this green and would be exactly the move this program has refused throughout.** It stays red
until someone samples both sides at one instant or restricts the comparison to steady state.

**Known limit, stated rather than buried:** the seed pins *content*, not *timing*. The click race is
fixed, but any single run should be read as indicative rather than authoritative until the journey
has been run several times consecutively without flake.

---

**Headline at pass E-5: the program finish line is `failing`.** `check:journey:textile` scored
**3 of 11 steps** at HEAD, reproduced across runs. Phase 1 is met; nothing else is.

Measured this pass, unpiped, on HEAD:

| Gate | Result |
|---|---|
| `check:professional-travel:public-route:browser` (D11 ancestor) | **PASS**, exit 0, all 17 marks, destination `sector_vesta_forge`. The boot blocker really is fixed. No EPERM on this run. |
| `check:journey:textile` (D11 finish line) | **FAIL**, exit 1, 3 pass / 4 fail / 3 blocked / 1 ungraded |
| `check:sim:compare` | actual `809df0f6…` — byte-identical to the recorded Wave-1 baseline; **graded on the hash string, never the exit code** (G-1) |
| `check:sim:v3:compare` | actual `7e3e114e…` — unmoved |
| `check:visual-stability` | **exit 0, GREEN** — and reachable. See correction C-3. |
| `check:gate-reachability` | exit 0 — 411 declared, 173 reachable, 27 pinned must-gate, 238 repo-wide orphans |
| `check:atlas` (14 gates + propulsion + perf) | exit 0 |

---

## Corrections — claims that did not survive contact with the repo

Recorded in full, because each one would have sent someone to fix the wrong thing.

> **C-1 (2026-07-19) — Travel Burn is NOT player-unreachable. The claim was false.**
> A verification packet reported as **P0** that "no production input owner writes `input.travelDrive`,
> so no player can engage it", and concluded W1-1/W1-2/W1-5 were built-not-wired. **Falsified by
> grep on HEAD.** `src/systems/input.js:219` publishes `inp.travelDrive = drive` from a complete
> latch state machine (`stepTravelLatch`, `:132-219`); `VERB_BINDINGS.travelBurn = ['NumLock','KeyH']`
> (`:243`); `gamepad.js:64` binds `l3`; `settings.js:80` lists `travelBurn` in `REBINDABLE` with the
> label "Travel drive (burn latch)"; `hud.js:3275` and `:3411` consume it. The flag
> `TRAVEL_FLAGS.travelBurn = IS_BROWSER` is **true in the browser**.
> **W1-5 is built, wired and reachable.** The original packet's grep appears to have predated the
> W3 commit `620917ab`. Lesson, and it is the same one as the region-data correction: re-grep at
> HEAD before reporting an absence — an absence is the easiest thing in the world to prove stale.

> **C-2 (2026-07-19) — the station-approach failure was MISATTRIBUTED to navigation. The autopilot works.**
> A packet filed **P1 against `navigation`**: "ship does not close on a station under the public
> autopilot — closest approach 1347 → 1344 WU in 300 s", reproduced 3/3, with the hypothesis that
> onboarding was stealing the waypoint. Three hypotheses were consistent with those numbers
> (onboarding steals nav / sim not integrating / avoidance orbit-lock), so the verifier built
> `scripts/repro-station-approach.mjs` to separate them by sampling tick, position, path-vs-net
> displacement, autopilot target and obstacles.
> **Result: all three hypotheses are dead, and the autopilot reaches the station.** Measured on a
> clean run: ticks 142 → 1764 (sim integrating), distance **1333 → 90 WU — exactly the dock radius**,
> path 2253 WU vs net displacement 1311 WU (ratio 1.7, not an orbit), autopilot target never null and
> never changed. The public autopilot closes on the station and the loop terminated on arrival.
> **The frozen readings were a paused game.** `src/ui/screens/pause.js:421` sets `mode = 'paused'` on
> the pause screen's `onShow`; a paused sim reports a *frozen but entirely plausible* velocity and
> autopilot status — the verifier reproduced exactly that signature accidentally (94 consecutive
> samples at `mode='paused'`, tick frozen at 155, path length 0 WU, speed frozen at 16.5, status
> frozen at `avoiding`) and it is indistinguishable from a navigation defect from outside.
> **Instrumentation added rather than a threshold moved:** the journey's approach probe now records
> `mode` and `tick`, counts and recovers paused frames, and reports the count **on the success path
> too** so a step that only passed after N focus-recoveries can never read as clean. It also records
> `reachedDockRadius` separately from the `dock:range` receipt, so "arrived but no receipt" can never
> again be mistaken for "never arrived".
> **After that instrumentation, journey step 1 PASSES**: dock → contract accepted → 8u loaded →
> undocked. The owner of this defect is **harness**, not navigation. Nobody should "fix" the autopilot.

> **C-3 (2026-07-19) — G-3 is misdiagnosed and its stated consequence is false.**
> G-3 says "`check:ci` no longer reaches `check:art`, so `check:visual-stability` runs in no gate at
> all", citing `test/visual-probe-server.test.mjs:36`. **That test now passes (exit 0), and
> `check:visual-stability` itself is green (exit 0, 16 ships, 360 frames, 0 failures).** `check:ci`
> → `check:ci:report` expands `[precheck, check]` transitively, and `check` contains `npm run
> check:art`, so both visual-stability leaves are in the CI matrix.
> **The real red is a different, narrower thing:** four tests assert *literal* containment of
> `npm run check:art` inside `check:ci`, which is a single delegating segment (`npm run
> check:ci:report`) and can never literally contain it. Red at HEAD, pristine-controlled: `check:ci`
> is byte-identical at HEAD and in the working tree. See defect **D-6**. G-3 as written should be
> retired and replaced by D-6.

---

## Baseline redness — pre-existing, NOT caused by this program

Recorded 2026-07-19 before any edit, so later attribution is not a matter of opinion.

### Committed reds — red at `HEAD` with a pristine tree; no dirty file involved

Proven by `git archive HEAD src scripts package.json` into a clean directory and running there, so
neither the concurrent agent's edits nor ours are in play.

| Check | Evidence | Real cause |
|---|---|---|
| `check:m2b:region-data` (and therefore `check:m2:map-cutover`, 13 PASS / 1 FAIL) | `AssertionError: original story anchor XZ drift`, actual `68fcd1e1…`, expected `70195878…`, at `scripts/check-m2b-region-data.mjs:45` | Bisected: PASSES at `f4ba6a91` (which froze the hash), FAILS at `f277c5e7` "Build Sprint 1 7/16/2026". `src/data/sectorAnchors.js` drifted after the golden was frozen and the golden was never refreshed. |
| `check:market-nav` | `market row background click should select the inline trade-intelligence stage, not cover it with a modal`, `scripts/check-market-navigation.mjs:226` | A source-regex gate outlived a refactor of `src/ui/screens/market.js` (clean). Orthogonal to navigation. |
| `check:m4:regional-ecology` | 8 pass / 1 fail on `assert.match(mainSource, /\['world', 'regionalEcology', 'factions'/)`, `test/m4-regional-ecology.test.mjs:305` | Stale source-text assertion; the behavioural half is intact at `src/core/registry.js:142` and `:201`. |
| `check:visual-stability` | `check:ci reaches visual stability through check:art exactly once`, `0 !== 1`, `test/visual-probe-server.test.mjs:36` | `check:ci` no longer reaches `check:art`. **Consequence worth escalating: the browser visual probe never runs in that gate**, so there is currently no automated visual-stability evidence for any lane. |

> **CORRECTION (2026-07-19).** An earlier revision of this ledger, and the commit message of
> `6652f646`, attributed the `check-m2b-region-data` red to the concurrent agent's `chartNote`
> additions in the dirty `src/data/sectors.js`. **That attribution was wrong.** The fingerprint hashes
> `SECTOR_ANCHORS` from `src/data/sectorAnchors.js`, not `SECTORS` from `sectors.js`; zero hashed
> stations carry `chartNote`; and a pristine HEAD-only tree fails with the identical hash. The red is
> committed and predates all current work. The claim was stated with more confidence than the evidence
> supported — the lesson is to run the pristine-tree control *before* asserting dirty-tree causation,
> not after.

### Dirty-tree red — belongs to the concurrent lighting lane, not to this program and not to HEAD

| Check | Evidence | Attribution |
|---|---|---|
| `check:sector-palettes` | `Sector palette check failed (23 issues)` — 22× `ambient+fill luminance outside 0.3342-0.5013`, plus `sector_dione_lane: palette does not match an authored class` | The window is *derived from the core class*: `scripts/check-sector-palettes.mjs:6-8`. The uncommitted `sectors.js` edit moved core `fill 0x4ad8ff→0x6fb0d8` and `ambient 0x384868→0x252b36`, dropping core luminance 0.6426 → 0.4178 and sliding the window under every other class. Every failing value sits *inside* the HEAD window. The 23rd issue shares the root: `src/data/frontierRegions/south.js:53-62` hand-mirrors the old core. |

### Sim golden — red in this tree, NOT attributable to Slice 0

`check:sim:compare` fails on `$.acceptanceCriteria.authoritativeHash` plus +1 on each of
`camera:shake`, `presentation:cameraCue`, `presentation:vfxCue`, `presentation:audioCue`,
`presentation:uiCue`, `presentation:caption`, `presentation:cueApplied`.

**A/B control run:** reverting Slice 0's two uncommitted sim-adjacent files (`src/render/feel.js`,
`src/core/flight/flightTelemetry.js`) to their HEAD contents reproduces the identical failure. The
deltas are presentation-cue counts and originate in concurrent content work
(`barks.js`, `narrative.js`, `world.js`, `gameState.js` are all dirty), not in map, VFX or flight
code. Exact attribution belongs to that lane. **No `expected.json` was touched.**

### Environment / boot-budget reds — **CLOSED 2026-07-19, see the ruling at the end of this subsection**

> **DATED RULING (2026-07-19, verification pass E-5): this entire subsection is superseded and its
> conclusion was wrong.** It is preserved verbatim below rather than deleted, because the reasoning
> error in it is instructive and because deleting a wrong requirement is exactly what this ledger
> forbids.
>
> The subsection concludes "boot-to-flight now exceeds even the most generous budget in the suite"
> and calls it "the program's finish line, failing". **It was never a slow boot.** `flightReadyInPage`
> demanded `ships.every(authoredAssetState === 'authored')`, a condition the engine deliberately
> never satisfies (off-camera NPCs stay dormant since `f277c5e7`, pinned by a *passing* test at
> `test/asset-npc-authored-binding.test.mjs:126`). It held in 0 of ~35,000 rAF frames across six
> runs. **No timeout could ever have satisfied it**, so every measured "boot time" in this subsection
> is measuring an unsatisfiable predicate, not boot cost. Fixed at `f1539d54` by asking the engine
> its own question — `window.SF.authoredVisualReadiness()`.
>
> **Verified at HEAD this pass:** `check:professional-travel:public-route:browser` exits **0** with
> all 17 marks reached. The four harnesses named below should be re-measured against the same
> readiness seam before any of them is treated as a real budget failure.
>
> The lesson the subsection itself was reaching for still stands and is now program doctrine:
> **when a gate needs "is the scene presentable", ask the engine — never re-derive readiness from
> entity internals**, and never conflate a pipeline-integrity question with an asset-readiness one.



Four browser harnesses fail on the same `state.mode === 'flight'` predicate. Boot-to-flight measured
91.4 s idle, 121.0 s under load, 134.5 s independently, against budgets of 45 s / 90 s / 120 s / 150 s:
`check:mission-log-map:runtime` (45 s), `check:wave15-flight-boot` (90 s),
`check:galaxy-map-search-pointer` (120 s), `check:m2:galaxy-live` (150 s, boots via Continue so its
attribution is inferred).

**The lead re-ran the finish-line ancestor directly and it fails.** `npm run
check:professional-travel:public-route:browser` at `c6cee0cf`: all 16 contract tests pass, the boot
sequence reaches `observers-armed` → `intro-dismissed` → `main-menu-visible` → `new-game-visible`,
then `page.waitForFunction: Timeout 150000ms exceeded` at
`scripts/lib/professionalTravelPublicRoute.mjs:283` (`flightReadyInPage`, `flightTimeoutMs = 150_000`
at `:206`). So boot-to-flight now exceeds even the most generous budget in the suite.

**This is the program's finish line, failing.** `check:journey:textile` (D11) extends this exact
harness. Three perfect waves would still not turn it green.

> **Measurement note.** The first run appeared to exit 0. That was an artifact of piping the command
> through `tail` — the pipeline reports `tail`'s status, not npm's. The script does call
> `process.exit(1)` (`scripts/check-professional-travel-public-route-browser.mjs:168`). The gate is
> sound; the reading was not. Same lesson as the region-data correction above: verify the control
> before asserting the conclusion.

A dedicated investigation is open on the fork — **reduce boot cost** vs **re-derive the budgets**.
Re-deriving an acceptance threshold so a check passes brushes directly against this program's own
rule ("do not edit or weaken tests merely to make a feature pass"), so that branch requires an
explicit, justified ruling and does not get taken silently.

### Green at baseline

`check:map-authority`, `check:starmap-objective`, `check:mission-log-map`, `check:localmap-routes`,
`check:galaxy-map-inspector`, `check:map-confidence`, `check:m2b:sector-graph`.

**Noted test-design weakness (filed, not fixed):** `check-m2b-region-data`'s assertion message says
"XZ drift" but the hash covers entire station records including non-spatial fields, so it reports a
coordinate regression when a writer adds flavour text. Worse, the throw at `:45` aborts before the
lattice/origin assertions at `:47-63` — so this check is **not** evidence of lattice correctness. Cite
`check:m2b:sector-graph` (PASS) for that instead.

---

## Verified root causes (Wave 0)

Each traced firsthand by the lead with file:line and, where numeric, a reproduction.

| # | Player symptom | Root cause | Evidence | Status |
|---|---|---|---|---|
| RC-1 | Nonzero-origin systems collapse to a dot; no "you are here" at system scale | `buildSystemModel` (`src/ui/galaxyMap.js:1102`) plots sector-local zones alongside unconverted global entity positions; the model has no `player` field at all | Authored frames dumped: `sector_tethys_junction` origin `(12288,8192)`, `station_tethys` authored sector-local `(1050,380)` co-located with `zone_tethys_hub` `(1050,380)`; live entity sits at global `(13338,8572)` — 12,288 WU from its own zone. Helios origin `(0,0)` is the only sector where this is invisible, and it is the starting sector. | root cause confirmed |
| RC-2 | Speed lines become an opaque additive curtain; cluster at top of screen at extreme speed | `intensity` (`src/render/feel.js:160`) is documented `0..1` and never clamped. At `speedRatio` 10 it reaches 15.5 → `targetOpacity` 4.65, `want` 231 streaks (380 boosting), composed alpha > 1 under `globalCompositeOperation='lighter'`. Recycled streaks respawn in a narrow band ahead of centre (`uv: -(0.08 + rand*0.35)*span`); at high flow speed every streak recycles per frame and lives in that band. | Formulas read and evaluated across the speed range | root cause confirmed |
| RC-3 | Turning fires both front jets instead of the opposite-side RCS jet | Physics computes signed demand (`manualLocal`, `assistLocal`, `targetYawRate`, `angularAcceleration`); `computeFlightTelemetry` forwards only `acceleration`, so presentation guesses from input keys | `src/core/flight/propulsionKernel.js` `makeResult()` vs `src/core/flight/flightTelemetry.js` | prior claim **partially** confirmed — a forwarding seam, not missing physics |
| RC-4 | Held boost slows the ship at high speed; long travel feels artificially slow | `applySpeedGovernor` (`propulsionKernel.js:141`) makes assisted throttle a **speed command**; above `throttle × combatSpeed × boostSpeedMult(1.55)` the commanded forward goes negative down to `-limits.reverse × 0.25` — real reverse thrust while boost energy drains | Code read; `governed = clamp(err/responseS, -overspeedBrake, manualLocal.forward)` | confirmed |
| RC-5 | Plotting a cross-sector route does nothing | `nav.autoTravel` is written (`world.js:2072/2096/2485`, `missions.js:1960`), persisted, and asserted in tests, but no system in the update order reads it to drive the ship | grep of all readers | confirmed pending Wave 0 exhaustive re-verification |
| RC-6 | Autopilot would fly to the wrong sector from a static map target | Static station/gate/poi fallbacks put **authored sector-local** anchors into `points.x/z`, which three consumers feed to `state.nav.autopilot.target` as a **global** coordinate | Found by the P1 implementer; contract pinned at `test/claim-specializations.test.mjs:958-973` | confirmed — latent, nothing pinned it |
| RC-7 | Span blowout reproduces whenever a waypoint is armed | `_drawSystem` (`galaxyMap.js:5296`) pushes global `nav.waypoint.pos` into the sector-local draw span, independently of the model | Found by the P1 implementer | confirmed |

**Sound foundations — build on these, do not replace:** `src/core/coordinates.js` (`global_v1` +
frame rebasing), `src/data/sectorCoordinates.js` (frozen origins, Voronoi membership, residency
planning), `src/core/flight/propulsionKernel.js` (pure force/torque kernel), `src/core/flight/
flightTelemetry.js` (`estimateBrakingSolution` already yields stopping distance, time, flip-vs-direct
best mode, and a world-space `projectedStop`), the local autopilot, and `layoutMapLabels` (label
decluttering already exists).

---

## Slice 0 — The Map Stops Lying

| ID | Feature | Owner | Depends on | Verification | Status |
|---|---|---|---|---|---|
| S0-1 | System map plots every mark in one declared frame; `x/z` global, `drawPos` sector-local (D2.1) | P1 | — | `check:map-frames` + `claim-specializations` 26/26 + map suite unmoved. **Mutation-proven both directions** by the lead: raw global into the draw frame fails at actual `(13338,8572)` vs expected `(1050,380)`; sector-local left in the nav frame fails at actual `(-640,-1180)` vs expected `(11648,7012)`. | **passing** `6652f646` |
| S0-2 | Persistent "you are here" in the system model, with inside/outside + bearing/distance when surveying a remote sector | P1 | S0-1 | `check:map-frames` | **passing** `6652f646` |
| S0-3 | Static fallback anchors lifted to global so course payloads are correct in nonzero-origin sectors (latent bug, RC-6) | P1 | S0-1 | own assertion in `check:map-frames` | **passing** `6652f646` |
| S0-4 | Armed waypoint, route tether, mission points and zone click targets no longer mix frames (RC-7) | P1 | S0-1 | own assertions in `check:map-frames` | **passing** `6652f646` |
| S0-5 | Speed-line intensity, count, alpha, length and flow bounded; centre kept legible; respawn distributed | P2 | — | `check:speed-lines` + presentation, visual-stability, vfx-sleep, ui-a11y | **passing** `f2985ee8` |
| S0-6 | Signed actuator demand forwarded through the telemetry seam, drive-family-agnostic | P3 | — | `check:actuator-telemetry` (drives real `stepPropulsion` per family; pins opposite yaw channels) + flight suite | **passing** `9eefa0ff` |
| S0-7 | Minimum Atlas: derived node/edge index + integrity validator | P4 | — | `test/atlas-index.test.mjs` + `check:atlas-integrity` | **passing** `7eb99596` — re-graded E-5 |

**S0-7 moved from `built, NOT wired` to `passing` (2026-07-19, E-5).** The condition this ledger set
for the move has been met: `src/systems/routeFollower.js` imports and uses `buildAtlasIndex` as a
real production consumer, and `check:atlas-spatial-truth` now additionally proves the index's
positions are correct across all six authored origin sign classes (not merely self-consistent).
Recorded with its original reasoning intact above, because the honest `built, NOT wired` entry is
what made the promotion criterion checkable in the first place.

**Slice 0 re-verified at HEAD (E-5).** `check:map-frames`, `check:speed-lines`,
`check:actuator-telemetry`, `check:atlas-integrity`, `check:atlas-spatial-truth` all exit 0.
S0-1..S0-4 additionally gain a new, stronger guard this pass: `check:map-frames` was parameterised
over exactly two sectors, **both non-negative** (Helios `(0,0)`, Tethys `(+12288,+8192)`), which
cannot distinguish `local+origin` from `local+abs(origin)`. `check:atlas-spatial-truth` closes that
with all six sign classes and a mutation control proving both wrong conversions slip past the old
two-sector coverage. The rows were `passing` on adequate evidence; they are now `passing` on good
evidence.

**Not yet done in Slice 0, carried forward:** the RCS *renderer* still infers jets from input keys.
S0-6 unblocked it by publishing per-nozzle demand; consuming that is a Wave 1/2 packet. The producer
landed, the consumer did not — which is the recurring seam in this codebase and worth watching for.

---

## Wave 1 — the missing spine (gates Wave 2)

| ID | Feature | Depends on | Status |
|---|---|---|---|
| W1-1 | Travel drive axis: Off / Spooling / Engaged / Cooldown, orthogonal to assist regime and control owner (D5) | S0-6 | **unverified** — built, wired and player-reachable (correction C-1); never exercised in a live journey |
| W1-2 | Governor ramps the cap while Engaged; `physicsEarnedMomentum` decay on disengage — no confiscation | W1-1 | **unverified** — kernel-proven by `check:travel-drive` + `check:propulsion:authority`; no player-visible evidence |
| W1-3 | Boost never commands reverse thrust above cap (clamp commanded forward ≥ 0) | W1-1 | **passing** `6ec8fa6d` — RC-4 reproduced numerically before (`forward = -6.24`) and after (`0`) |
| W1-4 | Dash sets `physicsEarnedMomentum`; dash / boost / burn share one energy pool and one gauge | W1-1 | **failing** — decay half wired at `flightV3.js`; the shared pool + single gauge is still not built |
| W1-5 | Rebindable Travel Burn latch (Num Lock default + laptop + controller); braking breaks it, steering does not | W1-1 | **unverified** — **was wrongly recorded `not started`; see C-1.** Latch, default binds (`NumLock`/`KeyH`), gamepad `l3` and the Settings rebind row all exist and are gated by `check:travel-latch`. Not `passing`: no live-journey or controller evidence |
| W1-6 | Per-family speed ceiling, shown on the velocity tape, approached asymptotically | W1-1 | **unverified** — **the tape now exists** (`.sf-vtape__vmax`, `V-MAX <n>`, forced-colors block, contextual reveal per D5 Amendment 2). No automated evidence that it reveals and fades during a real burn |
| W1-7 | Route follower **sequences** existing controllers; owns `nav.route`; `nav.autoTravel` finally has a reader (D6) | S0-7, W1-1 | **unverified** — module-green (`check:route-follower` 18/18); **has still never executed a route end-to-end through the player route**, because W1-8 blocks reaching it |
| W1-8 | Plot and engage are separate actions, reachable on the default route (wired-features contract) | W1-7 | **unverified** — **downgraded from `passing` (E-5), but NOT `failing`.** Directly measured: for a **multi-hop** destination the two really are separate and both work — "Plot Course" plots without moving the ship, and Engage is enabled and clickable reading "2 legs plotted — ready to fly". Two gaps stop it being `passing`: plotting **dismisses the chart**, so engaging needs a reopen (**D-1**), and the **default route's own destination is one hop**, where the only action offered is "Set Course & Jump" — a commit, with no separate plot step. Never yet exercised in a live journey because the harness does not reopen the chart (**D-17**) |
| W1-9 | Manual burn shows stopping arc + BRAKE NOW; overshoot remains possible. Route follower auto-brakes and flip-and-burns when `bestMode` says so | W1-7 | **unverified** — **the HUD half now exists** (`BRAKE NOW` + stopping arc in `hud.js`, forced-colors restated). Overshoot is kernel-proven possible. No live evidence; and see **D-2**, the arc's manual-only guard is a dead read |
| W1-10 | Route survives save/load in every executor state | W1-7 | **unverified** — **downgraded from `passing` (E-5).** `check:route-follower` proves the serialisation; the journey proves only *in-flight* and *docked-with-contract*. **Mid-route, post-interrupt and post-arrival are unproven** — exactly the states most likely to break, and unreachable while W1-8 fails |

> **E-5 re-grading note (2026-07-19).** The commentary immediately below was written before Waves 2
> and 3 landed and before correction C-1. Two of its factual claims are now stale: W1-5 and the HUD
> halves of W1-6/W1-9 **were** built (in `620917ab`), and the travel-drive axis **does** have a
> consumer. It is kept because its *reasoning* — producers landing without consumers, and refusing to
> call a thing `passing` on unit tests alone — is exactly right and is the reason this pass could
> re-grade honestly. Read the row statuses above, not the prose below, for current state.
>
> **Net effect of this pass on Wave 1: no row moved up to `passing`; two moved down.** Much more is
> *built* than the ledger recorded, and nothing more is *proven*. Those are different axes and this
> ledger tracks the second one.

**Why W1-1, W1-2 and W1-7 were recorded `built, NOT wired` rather than `passing`.** They are producers whose
consumers are only partly built.

- **W1-7 (route follower) now has a production trigger.** `c2437201` added the engage control to the
  map inspector, so `nav:engageRoute` is emitted by a real default-route player action for the first
  time. Its availability matrix, its plot/engage separation and its two-sided event contract are
  pinned by `check:route-engage` (14/14). What is *not* yet proven is the end-to-end flight itself —
  Helios → Tethys under executor control — because the browser harness that would demonstrate it
  times out at boot (see the boot-budget entry above). So the wiring is proven and the *journey* is
  not. Under this ledger's own definition (`passing` = proven end-to-end through the default player
  route) that is short of `passing`, and it stays short until the boot blocker clears. Calling it
  passing on the strength of unit tests is exactly the move this column exists to prevent.
- **W1-1/W1-2 (travel-drive axis) still have no consumer at all.** The axis is reachable only by a
  caller passing `input.travelDrive`, and nothing does: W1-5 (the latch) and the HUD half of W1-6 and
  W1-9 were not built — their packets died when the session limit terminated the agents mid-wave.
  The `dashMomentum` half of W1-4 *is* wired at `flightV3.js`.

This is the same posture as S0-7 and the RCS renderer. **W1-5 plus the HUD work is what remains
before the travel-drive rows can move.**

**Evidence for the rows that are marked passing.** RC-4 was reproduced numerically *before* the fix
(`drive_reaction_m`, throttle 1, boost held, 400 WU/s against cap 302.25 → `manualLocal.forward =
-6.24` = `-(reverseAccel 26 × overspeedBrakeFraction 0.24)`, i.e. real reverse thrust identical to
the unboosted brake) and after it commands `0` (coast), while the unboosted overspeed brake still
commands `-6.24`. `check:travel-drive` 11/11, `check:route-follower` 18/18, `check:flight:v3` PASS,
`check:actuator-telemetry` 11/11, `check:map-frames` PASS.

**Determinism evidence, and the caveat that matters.** Both goldens are byte-identical to baselines
captured *before* any edit — `check:sim:compare` actual `809df0f6…`, `check:sim:v3:compare` actual
`7e3e114e…`. A frozen 23-case pre-change kernel sweep
(`test/fixtures/travel-drive-kernel-baseline.json`) proves the flags-off path reproduces byte for
byte, and the publication is *shape*-gated so a drive parked at Off attaches zero new telemetry keys.

---

## Gate defects found while verifying Wave 1 — these weaken evidence repo-wide

| # | Defect | Evidence | Why it matters |
|---|---|---|---|
| G-1 | **`check:sim:compare` exits 0 while reporting an `authoritativeHash` mismatch.** | `scripts/sf-sim.mjs:684`: `ok: diffs.length === 0 \|\| expectedEnvelopeStaleOnly`, where `expectedEnvelopeStaleOnly = hashEqual && diffs.every(isPending47aEnvelopeDiff)` and that predicate accepts `expectedHash` *and* `expectedTraceCount`. `hashEqual` is uninterrupted-vs-reload equality, **not** agreement with the frozen golden. Confirmed empirically: `npm run check:sim:compare >/dev/null; echo $?` → **0**, while the run prints a hash mismatch. | The script enforces only *reload determinism*. **Any sim-affecting change that is internally deterministic passes.** Anyone gating on the exit code believes the golden is clean when it has drifted. All determinism claims in this program are therefore made against the **hash string**, never the exit code — and that is the only sound way to read it. |
| G-2 | **Import-resolves is not a health signal.** | During Wave 1 the kernel briefly called a deleted helper. `import('./src/core/flight/propulsionKernel.js')` **still resolved successfully** while `stepPropulsion` threw `ReferenceError` on every tick — the ship would not fly. Only *invoking* the function exposed it. | Any import-only or syntax-only smoke test would have declared an unplayable game healthy. A cheap `stepPropulsion` invocation smoke test would close this class. |
| G-3 | ~~`check:ci` no longer reaches `check:art`, so `check:visual-stability` runs in **no gate at all**.~~ **RETIRED 2026-07-19 (E-5) — misdiagnosed.** `check:visual-stability` is green and reachable; the cited test passes. Superseded by **D-6**. | ~~`test/visual-probe-server.test.mjs:36`, `0 !== 1`~~ — that test now exits 0 | See correction **C-3**. The real red is four *different* tests asserting literal containment against a delegating segment. |
| G-5 | **A missing control and a closed screen are indistinguishable from outside — and the verifier nearly filed the wrong P0 because of it.** An intermediate reading of `repro-engage-control-reachability.mjs` showed `nav.route` set while `#gm-engage-route-btn` was `disabled`, `0×0`, reading "No route plotted", and that was very nearly written up as a confirmed P0 "the control does not refresh". **It was wrong.** `getBoundingClientRect` returns 0×0 when any *ancestor* is `display:none`, while `getComputedStyle` still reports the element's own `display:block` — the exact signature of *the chart had closed*. Reopening the chart showed the control enabled at 287×37 reading "2 legs plotted — ready to fly". | Compare the `afterPlot` and `afterReopen` stages of the same probe run. | **`check:route-engage` was right and the control is fine.** The lesson is about the *probe*, not the product: a zero-size element is a statement about its ancestors, and any DOM assertion must confirm the containing screen is open before concluding anything about a control inside it. Third time this program has been bitten by asserting causation before running the control — see the region-data correction and C-2. |
| G-6 | **A paused game grades as a moving one.** Headed browser gates report frozen-but-plausible telemetry when `mode === 'paused'`, indistinguishable from a real navigation defect. | See **D-7** and correction **C-2**. | Cost this program one entirely misattributed P1 across 3 "reproduced" runs. Any journey grader must record `mode` and never grade a paused frame. |
| G-4 | **More source-text adjacency pins exist on `UPDATE_ORDER` than are documented.** | Registering `routeFollower` between `world` and `regionalEcology` broke a literal adjacency assertion at `scripts/check-m4-regional-ecology.mjs:211`. | Reordering `UPDATE_ORDER` can fail checks that assert on *source text* rather than behaviour. Grep for adjacency pins before reordering. |

**Boot-budget investigation (incomplete — the agent was terminated by a session limit).** One
confirmed finding before it stopped: `src/main.js:86` seeds the world from wall-clock time
(`const seed = (Date.now() & 0x7fffffff) >>> 0`), so **every boot generates a different world**.
That is correct for a game but means boot-to-flight timings are not comparable run to run without
pinning the seed, which plausibly explains part of the 91 s / 121 s / 134 s spread. The
regression-vs-environment question remains **open**; do not re-derive any budget until it is answered.

> **CORRECTION (2026-07-19) — W1-7 was never blocked.** An earlier revision recorded the route
> follower as blocked because "its `UPDATE_ORDER` registration requires `src/systems/world.js`, which
> is foreign-dirty." **That was wrong.** `UPDATE_ORDER` is declared in `src/core/registry.js:199-202`,
> not in `world.js`, and `registry.js` is **clean**. `world.js` only *writes* `nav.autoTravel`
> (`:2072`, `:2096`, `:2485`); it neither owns the update order nor needs editing to gain a reader.
> `nav.route` / `nav.autoTravel` / `nav.autopilot` already exist in the (quarantined) `gameState.js`
> initial state at `:128`, so no field additions are needed there either. Wave 1 could have started
> immediately. Logged rather than quietly deleted, because a phantom blocker that stalls a wave is
> exactly the kind of error this ledger exists to catch.

**Golden safety for W1-7 is structural, not disciplinary.** `scripts/sf-sim.mjs` — which runs the
deterministic 47a golden — never imports `registry.js`. It hardcodes its own curated systems array
(`sf-sim.mjs:279-297`: 13 systems, or 16 under `--tactical-ai`) and passes it explicitly to
`createSimulation`. **Registering a new system in `registry.js` therefore cannot move the 47a golden
at all.** What *is* on the golden path is `propulsionKernel.js` (reached via `flight`, and via
`flightV3` under `check:sim:v3`), so Travel Burn's kernel changes still require the Tier-B
`IS_BROWSER` flag gate. Verified by reading `sf-sim.mjs`, not inferred.

**Wave 2 entry gate:** W1-7 drives Helios → Tethys end-to-end through
`professionalTravelPublicRoute`, engaged from a default-route UI action, goldens unmoved, Slice 0 landed.

---

## Wave 2 — semantics

> **The Wave 2 entry gate was never met, and Wave 2 shipped anyway (E-5 finding).** D1 and this
> ledger both required W1-7 to drive Helios → Tethys end-to-end through
> `professionalTravelPublicRoute`, engaged from a default-route UI action, *before* Wave 2 began.
> That has still not happened — W1-8 blocks it (defect D-1). Commits `6aacba9f` and `92a21766`
> landed regardless. This is recorded as a **process finding requiring a ruling (R-4 in
> `04_RELEASE_GATE.md`)**, not quietly normalised: the gate existed precisely so that Wave 2's
> ribbon and inspector would not be "presenting vapor", and the risk it guarded against is live.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| W2-1 | `mapCamera = {focusGlobal, spanWU}`; `levelForZoom` a function of span with identical thresholds | S0-1 | **passing** `6aacba9f` — `check:map-camera`: cursor-anchored zoom holds across 4+ decades at origin **and** at Tethys; `globalToScreen → screenToGlobal` round-trips to identity |
| W2-2 | Crossing a span threshold preserves `focusGlobal`, so scale change reads as zooming (D3 continuity) | W2-1 | **passing** `6aacba9f` — pinned as its own assertion ("a span change alone preserves focusGlobal") |
| W2-3 | Selection persists across a semantic-zoom threshold crossing | W2-1 | **unverified** — declared coverage gap; nothing asserts a selected mark stays selected across a level boundary |
| W2-4 | Deep-space addressing: chord projection readout, never "spatially undefined" (D4) | — | **passing** `6aacba9f` — `check:deep-space-address` + `check:map-never-lost` (player marker never disappears at any scale) |
| W2-5 | Rails / inspector / route ribbon driven by real state (map information architecture) | W2-1 | **failing** `92a21766` — `check:map-information-depth` is green, but the live journey contradicts it: step 3 the chart answers POSITION and TRACKING but **not destination or next leg**; step 4 no inspector opens for the selection. See **D-3** for the harness caveat on step 4 |
| W2-6 | Route comparison — the player can weigh alternatives before committing | W2-5 | **failing** — no affordance exists. `world.computeRoute` returns a single Dijkstra path; the chart renders no alternative controls. Needs ruling **R-2** |
| W2-7 | Recovery verbs (continue / divert / return) as one-press actions (D4) | W2-4 | **unverified** — not exercised by any live-journey evidence |

---

## Wave 3 — texture

| ID | Feature | Depends on | Status |
|---|---|---|---|
| W3-1 | Velocity language redesign: band-appropriate vocabulary, streaks *fade out* at extreme speed (D7 inversion) | S0-5 | **passing** `620917ab` — `check:speed-lines` pins the band-3 inversion, hard ceilings across ratios to Infinity/NaN, normal compositing in every band, centre exclusion fail-dark |
| W3-2 | Region-volume crossfade begins ~1500 WU before the Voronoi boundary and completes at it | W3-1 | **passing** `620917ab` — crossfade window opens at `REGION_CROSSFADE_WU`, 50/50 on the boundary, blend continuous through the crossing, degenerate inputs finite |
| W3-3 | `motionReduce` respected in every band, suppressing animation without suppressing information | W3-1 | **passing** `620917ab` — `feel.js:320` → `speedLineDrive(..., mr)`; "motionReduce stays strictly quieter than full motion at every speed" |
| W3-4 | RCS renderer consumes signed per-nozzle demand instead of inferring jets from input keys | S0-6 | **passing** `620917ab` — `check:rcs-sign-truth` anchors on integrated torque and geometric bow displacement, holds across 7 headings and every purchasable hull; mutation-proven (inverting the published yaw sign fires 6 of 8) |
| W3-5 | One physical lane on the Helios ↔ Tethys chord: beacon chain on the lattice quantum, drive-multiplier volume, never a teleport | W1-1 | **unverified** `620917ab` — `check:travel-lanes` green and the lane writes only `input.travelDrive.{ceiling,rampMult}`. No evidence a player on the default route ever encounters or benefits from it |
| W3-6 | Lane disruption: segment state, ceiling collapse, momentum-decay dropout, ambush at the dead beacon, hazard grammar on the chart | W3-5 | **failing** — the seam is wired (`player.travelDrive.disrupted`, honoured by `input.js`) and **nothing triggers it**. No scripted disruption, no ambush, no chart hazard state. This is the whole point of D8 |
| W3-7 | Content seeded along transit chords | W2-4 | **unverified** — not graded |

---

## Wave 4 / E-5 — cross-workstream defect list

Severity, owner, reproduction, blocking dependency. Every one reproduced by the verifier at HEAD.

| # | Sev | Owner | Defect | Reproduction | Blocks |
|---|---|---|---|---|---|
| **D-1** | **P2** | map | **Plotting a course dismisses the chart, so plot and engage cannot happen in one chart session** — the player must reopen the chart to engage. Compounded for one-hop destinations, where the chart's only primary action is **"Set Course & Jump"**, which commits immediately: for a neighbour there is no plot-only step at all. | `node scripts/repro-engage-control-reachability.mjs`. Multi-hop (Dione, 2 legs): "Plot Course" is offered, plots `nav.route = {legs:2, totalFuel:63}`, **and the chart closes** (`chartStillOpen:false`). Neighbour (Tethys, 1 leg): only "Set Course & Jump" is offered. | W1-8's "reachable on the default route" clause — the canonical Helios→Tethys destination is one hop, and that is exactly the case with no separate plot step |
| **D-17** | P1 | harness | **The journey's step 6 looks for the Engage control in a chart that plotting has just closed**, and never reopens it — so it reports "no Engage control is reachable" for a control that is present and enabled one keypress away. | Same probe, reopen stage: after `KeyN`, `#gm-engage-route-btn` is `disabled:false`, `aria-disabled:"false"`, rect **287×37**, `playwrightWouldSee:true`, and `#gm-engage-reason` reads **"2 legs plotted — ready to fly"** with `nav.route.legs = 2`. | Journey steps 6–10 and therefore W1-7, W1-10 and D11. **This is the top-priority harness fix: it is the single blocker standing between the journey and exercising route execution at all.** |
| **D-2** | P1 | presentation | `src/ui/hud.js:3325` reads `nav.executor.active`, a field the route executor **never sets** — the real field is `engaged`. The manual-only guard on the stopping arc is a dead read that works by accident via the adjacent autopilot flag. Compounded by `_disarmAutopilot` (`routeFollower.js:443`) leaving `nav.autopilot.target` set, so after abort/replan the BRAKE cue points at the abandoned destination. | `node scripts/repro-abandoned-route-hud.mjs` — 4 defect assertions, with a passing control proving the grader is not always-fail. Cues `(2388,1592)` for an abandoned destination. `executor.active` is read in exactly one place in `src/` and assigned in none. | W1-9 correctness |
| **D-3** | P1 | harness | The journey's inspector locator matches nothing the chart renders: it probes `.gm-inspector, [data-map-inspector], .gm-detail, .gm-selection`; the chart renders `.gm-inspector-content` / `.gm-inspector-details` / `#gm-tabpanel`. Step 4 therefore reports "no inspector panel rendered" **without having looked at the right element**. | `node scripts/repro-engage-control-reachability.mjs` — `journeySelectorsMatch` all `false`, `actualSelectorsMatch` all `true`, on the same page. | Makes journey step 4 **ungraded**, not failed. Must be fixed before W2-5's inspector half can be judged either way |
| **D-4** | P1 | content | **D11's finish line is unreachable as written: there is no authored textile mission.** `cmdty_textiles` is a commodity; "textile" otherwise appears only as a lane *name*, an `authoredPlaces.js` comment and a test fixture. The only path to a textile cargo contract is the procedural board, seeded from `state.meta.seed = Date.now()` (`main.js:86`), so commodity and destination re-roll every boot. | `grep -rin textile src/` → 5 hits, none a mission. `missions.js:1044` `pick(LEGAL_TRADE_CMDTYS)` selects 1 of 40. Observed live: the board offered `cmdty_fuel_cells` to `station_ceres`. | D11 being reproducibly green on a clean checkout. Needs ruling **R-1** |
| **D-5** | P1 | **UNATTRIBUTED — harness or content** | **A delivered contract does not complete.** The ship reaches the destination sector and docks, and no `cargo:delivered` / `mission:completed` receipt is produced. **Attribution deliberately NOT closed.** | `check:journey:textile` step 10: "arrived in `sector_ceres_belt` but the cargo action did not complete". **The confound, found by reading the harness:** `deliverCargoAtDestination` calls `dockAtNearestStation`, which docks at the **nearest** station in the sector — *not* at the contract's `destination.stationId`. If the nearest station is not `station_ceres`, the contract correctly does not complete and the product is behaving properly. **Next experiment (one run):** make the delivery step dock at the contract's own station id and re-run; only if it still fails is this a product defect. | The final step of D11. Filed unattributed on purpose — the same product-vs-harness ambiguity that produced C-2 and G-5, and it is cheaper to say "unknown" than to send someone to fix a working economy |
| **D-6** | P1 | harness | **Four stale literal-containment assertions are red at HEAD and can never pass**, asserting that `check:ci` literally contains `npm run check:art` when `check:ci` is the single segment `npm run check:ci:report`. | `node --test test/asset-pipeline-gate-wiring.test.mjs` → `AssertionError: check:ci reaches the asset-pipeline contract through check:art exactly once, actual: 0, expected: 1`. Same in `alpha-evidence-checker`, `alpha-live-baseline-route-contract`, `time-effects`. Pristine control: `check:ci` byte-identical at HEAD and worktree → **pre-existing, not this program's**. | Trust in those four gates. **Do not fix by adding a literal `check:art` to `check:ci`** — `check:art` would then run twice. Replaces ledger **G-3** |
| **D-7** | P2 | harness | **A headed browser gate silently grades a paused game.** A paused sim reports frozen-but-plausible speed and autopilot status; from outside it is indistinguishable from a navigation defect. This produced one entirely misattributed P1 (see C-2). | Reproduced: 94 consecutive samples at `mode='paused'`, tick frozen at 155, path 0 WU, speed frozen 16.5, status frozen `avoiding`. | Reliability of every headed journey gate, especially on an unfocused CI runner. Mitigated in `journeyTextileSteps.mjs` (records `mode`/`tick`, counts and recovers paused frames, reports the count on success too) — **not** mitigated in other headed harnesses |
| **D-8** | P2 | navigation | The route follower can report **ARRIVED without the ship entering the destination sector**: nothing in it commits a jump, and `_complete()` is not conditioned on `world.currentSectorId`. `resolveLegTarget` prefers the gate node in the `from` sector even on the final leg. | Static at `routeFollower.js:118` / `:561-563`; the only `world:requestJump` emitters are `galaxyMap.js:1743` and `starmap.js:1238`, both manual player actions. Not yet reachable at runtime because step 10 is blocked by D-1. | Correctness of R.3 in the release gate. The step-10 grader is already built to catch it (keys arrival on real sector, counts jump receipts separately) |
| **D-9** | P2 | propulsion | **Drive-tier upgrades do not move the travel ceiling.** `mod_engine_ion_m` / `fusion_m` / `warp_l` all resolve to `drive_reaction_s`, ceiling **472.5 WU/s**, unchanged. Derived `flightModel.maxSpeed` *does* rise (145 → 185.7 → 217.4), so the player sees a normal-flight gain and zero travel-burn gain. | `resolvePropulsionProfile` falls through to `inferProfile` keyed on `flightClass`; `derived.driveId`/`derived.propulsion` are `undefined` for player ships, so the authored-override precedence is never populated. Seam verified working in `check:propulsion:authority`. | D5's stated upgrade path. Needs ruling **R-5** |
| **D-10** | P2 | harness | **No automated platform-parity, save-migration or corrupt-save evidence reaches CI.** `check:professional-travel:public-route:electron`, `check:m6:platform`, `check:m6:packaging`, `check:m6:corrupt-save-recovery`, `check:save-resume-confidence`, `check:save-load-slot-trust`, `check:save-schema` are all in the 238-orphan set. | `npm run check:gate-reachability` → 411 declared, 173 reachable, 238 orphaned. | Any claim of Electron parity or save-migration safety. Note `check:save-schema` is additionally **red at HEAD** (`SAVE_SCHEMA.md` stale: `bloomThreshold` documented 0.72, actual 1.0) |
| **D-11** | P2 | map | **No performance budget exists for map render, marker layout, route calculation or lane streaming**, and declutter cost grows superlinearly: `layoutMapLabels` 0.093 ms @20 candidates → 2.126 ms @400 (~13% of a 16.7 ms frame before anything is drawn). | `node --expose-gc scripts/probe-atlas-perf-baseline.mjs`; `grep -n 'map\|route\|marker\|lane' design/PERF_BUDGET.md` returns only generic doctrine. | A confident answer to "is the map fast enough at 400+ markers". Baselines now recorded so a budget can be measured rather than guessed |
| **D-12** | P3 | presentation | **No accessibility evidence covers any atlas surface.** The forced-colors receipt validator structurally requires `mainMenuVisible`/`settingsVisible`, so it cannot describe the map, route ribbon, inspector or travel HUD. `semanticShape`/`semanticColor` are exported but referenced nowhere in `galaxyMap.js` or `src/ui/map/*` — **map state appears to be carried by colour alone**. | `scripts/lib/m6ForcedColorsContracts.mjs` `validateM6ForcedColorsReceipt`; grep for the semantic helpers returns no map matches. Reduced motion is **not** part of this defect — that path is correctly wired and gated. | Any a11y sign-off for the program's primary new surface |
| **D-13** | P3 | navigation | A persisted route is never revalidated against current content on `save:loaded`, so a partially-stale route engages and flies with no signal, a discontinuous leg chain is accepted, and an unknown leg origin still arms the autopilot. | Probed against the real `routeFollower` + `buildAtlasIndex`: legs `[helios→tethys, tethys→GHOST]` → `status=transiting`, autopilot armed at `(2388,1592)`, zero denial events. Contrast: a wholly-unresolvable route correctly interrupts with `lost-leg`. | Nothing today — arises only from a corrupted or content-outdated save. Recorded so the absence of revalidation is declared, not assumed |
| **D-14** | P3 | propulsion | `ship_bastion` spends **85% of its own hull radius per tick** at its sanctioned ceiling (1120 WU/s → 18.67 WU/tick vs radius 22.0), against D5's justification that the ceiling stays "well under hull-radius scale". Collision is not a swept test, so the margin before tunnelling is 15%. | `check:propulsion:extreme` evidence table. Emitted as a WARN, not a failure: the hard bound is physical fact but the acceptable margin is a design call belonging to D5's owner. | Nothing. Advisory — but note the absolute bound `TRAVEL_CEILING_ABSOLUTE_WU_S = 1200` is currently dormant, since the family multiplier binds first for every ship |
| **D-15** | P3 | propulsion | Per-tick heap allocation on the engaged travel-lane path: `resolveLaneSegment` 120 B/op, `projectOntoLane` 72 B/op (~7 KB/s at 60 fps), against `design/PERF_BUDGET.md:95` "no per-frame allocation in sim, render, VFX, or UI reconcile hot paths". | Measured stable to the byte across 3 runs by `probe-atlas-perf-baseline.mjs`. | Nothing. The correct resolution may be to amend the doctrine for small returns rather than change the code — filed so the two stop disagreeing silently |
| **D-16** | P3 | content | Three of five drive families (`PULSE_PLATE`, `GRAVIMETRIC`, `SAIL`) are unreachable by any player-flyable hull, so their ceiling multipliers are never exercised in play; `TORCH` appears only on capital hulls. | Resolving all 13 entries of `SHIPS` yields only `drive_reaction_s/m/l` and `drive_torch_l`. | Nothing. D5's ship-identity intent is satisfied in the catalogue but only partly in play |

---

## Program finish line

`check:journey:textile` — the full acceptance journey extended from
`scripts/lib/professionalTravelPublicRoute.mjs` — **green on a clean checkout** (D11).

**Status: `failing`.** Measured at HEAD `92a21766` on 2026-07-19, unpiped, reproduced across runs.

| Step | Outcome | Evidence |
|---|---|---|
| 1 · Accept mission | **pass** | Docked at Helios Station, contract `m_2` active+tracked (haul 8u to `station_ceres` in `sector_ceres_belt`), hold loaded 8u, undocked. **No textile contract was available** — graded on the equivalent cargo haul and the substitution is stated out loud in the evidence (D-4) |
| 2 · Open map | **pass** | Galaxy map visible via the public key; screen stack top `galaxyMap` |
| 3 · Identify position / mission / destination / next leg | **fail** | The chart answers `POSITION` (HELIOS PRIME, 1320 WU from origin) and `TRACKING` (Beacon, 985 WU) but **does not answer destination or next leg** |
| 4 · Inspect destination + arrival reason | **ungraded** | Reported "no inspector panel rendered", but the locator matches nothing the chart renders — **harness defect D-3**. Neither pass nor fail until fixed |
| 5 · Compare and plot | **fail** | Route **plotted** (1 leg, fuel 27) — the plot half works. The **compare** half has nothing to grade: the chart offers no route alternatives (D-2 / ruling R-2) |
| 6 · Engage separately from plotting | **fail (harness)** | Plot correctly did **not** move the ship (drift 30.7 WU, `executor=null`). The Engage control was then reported unreachable — but **direct DOM probing shows it is present and enabled once the chart is reopened** ("2 legs plotted — ready to fly"). Root cause is **D-17** (harness does not reopen the chart) plus **D-1** (plotting dismisses it). Not a missing feature |
| 7 · Truthful instruments | **blocked** | Not under route control (step 6) |
| 8 · Interrupt or leave route | **blocked** | No engaged route (step 6) |
| 9 · Recover itinerary | **blocked** | Never interrupted (step 8) |
| 10 · Arrive and complete cargo action | **fail (unattributed)** | **Arrived in `sector_ceres_belt` and docked** — physical travel works — and no `cargo:delivered` / `mission:completed` receipt followed. **May be a harness artifact:** the step docks at the *nearest* station, not the contract's station (D-5) |
| 11 · Save/load at representative states | **pass** | `docked-with-contract` survived quick-save → cold reload → Continue, no diffs. Narrow: mid-route / post-interrupt / post-arrival remain unreachable |

**3 / 11 pass · 4 fail · 3 blocked · 1 ungraded.** Step outcomes characterised from one fully-instrumented run;
the headline (finish line failing) reproduced across runs, but **the precise failing-step set has not
been confirmed stable across seeds** and the world is `Date.now()`-seeded, so expect it to move.

**What this means plainly.** A player can now boot, fly to a station on the public autopilot, dock,
take a cargo contract, load it, undock, cross a sector boundary, arrive at the destination and dock
again. That is real progress and most of it was not demonstrable a week ago. **They are not told
their destination or next leg, they cannot compare routes, and — on the canonical one-hop
destination — they get no separate plot step at all.** The journey does not succeed.

**Two of the five failures are the instrument, not the game** (steps 6 and, possibly, 10). That
matters for what to do next: **fixing D-17 is the highest-leverage move available**, because steps
7, 8 and 9 have *never once been exercised* and are blocked behind step 6 alone. Their true state is
**unknown**, not nearly-working — and route execution, the spine this whole program was built to
deliver, has still never run end-to-end through a player route.

**The finish line cannot become green by harness work alone.** D-4 (no authored textile mission on a
wall-clock-seeded board) means "green on a clean checkout" is not achievable as D11 is written, no
matter how correct the harness is. That needs ruling **R-1** in `04_RELEASE_GATE.md` — author a
deterministic contract, or re-anchor D11 on an authored mission. It is content work and the verifier
deliberately did not absorb it.

**Registration.** `check:journey:textile` is registered standalone and deliberately **not** in
`check` / the CI matrix: wiring a multi-minute failing headed gate into the aggregate would turn the
whole suite red. That is a sequencing decision for the lead (ruling **R-7**), not a silent omission.
