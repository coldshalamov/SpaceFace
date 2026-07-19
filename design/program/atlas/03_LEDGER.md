# Universe Atlas & Physical Travel — Feature Ledger

One authoritative ledger. Do not create a second one. Do not delete or weaken a requirement to make
progress look better — a requirement that turns out to be wrong gets a dated ruling, not a deletion.

**Status vocabulary:** `unverified` (claimed, not proven) · `failing` (proven not to work) ·
`passing` (proven end-to-end through the default player route) · `blocked` (waiting on a dependency).

A feature is **not** `passing` because a flag exists, a reducer transitioned, or a unit test mocked the
result. Player-visible behaviour requires player-visible evidence.

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

### Environment / boot-budget reds — **re-run by the lead 2026-07-19; now the program's top blocker**

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
| S0-7 | Minimum Atlas: derived node/edge index + integrity validator | P4 | — | `test/atlas-index.test.mjs` + `check:atlas-integrity` | **built, NOT wired** `7eb99596` |

**S0-7 is deliberately not marked passing.** `grep -rn "atlasIndex" src/` returns zero production
importers — its only consumers are its own check and test. Under `AGENTS.md`'s wired-features
contract ("a local candidate, report, or hidden flag is not completion") that is not done. It ships
now because Wave 1's route follower is its first real consumer; it becomes `passing` when that lands.
Recording it honestly rather than counting it is the point of this ledger.

**Not yet done in Slice 0, carried forward:** the RCS *renderer* still infers jets from input keys.
S0-6 unblocked it by publishing per-nozzle demand; consuming that is a Wave 1/2 packet. The producer
landed, the consumer did not — which is the recurring seam in this codebase and worth watching for.

---

## Wave 1 — the missing spine (gates Wave 2)

| ID | Feature | Depends on | Status |
|---|---|---|---|
| W1-1 | Travel drive axis: Off / Spooling / Engaged / Cooldown, orthogonal to assist regime and control owner (D5) | S0-6 | **built, NOT wired** `6ec8fa6d` |
| W1-2 | Governor ramps the cap while Engaged; `physicsEarnedMomentum` decay on disengage — no confiscation | W1-1 | **built, NOT wired** `6ec8fa6d` |
| W1-3 | Boost never commands reverse thrust above cap (clamp commanded forward ≥ 0) | W1-1 | **passing** `6ec8fa6d` |
| W1-4 | Dash sets `physicsEarnedMomentum`; dash / boost / burn share one energy pool and one gauge | W1-1 | **partial** `6ec8fa6d` — decay half done at `flightV3.js` `applyMasslineFlightModifiers`; the shared pool + single gauge is UI work, not done |
| W1-5 | Rebindable Travel Burn latch (Num Lock default + laptop + controller); braking breaks it, steering does not | W1-1 | **not started** |
| W1-6 | Per-family speed ceiling, shown on the velocity tape, approached asymptotically | W1-1 | **partial** `6ec8fa6d` — ceiling derived and exported (`resolveTravelCeiling`); the velocity-tape V-MAX line is not drawn |
| W1-7 | Route follower **sequences** existing controllers; owns `nav.route`; `nav.autoTravel` finally has a reader (D6) | S0-7, W1-1 | **built, NOT wired** `2fe6d542` |
| W1-8 | Plot and engage are separate actions, reachable on the default route (wired-features contract) | W1-7 | **not started** — the gate for W1-1/W1-7 becoming `passing` |
| W1-9 | Manual burn shows stopping arc + BRAKE NOW; overshoot remains possible. Route follower auto-brakes and flip-and-burns when `bestMode` says so | W1-7 | **partial** `2fe6d542` — follower side chooses handoff from `estimateBrakingSolution.bestMode`; the manual-burn HUD half is not done |
| W1-10 | Route survives save/load in every executor state | W1-7 | **passing** `2fe6d542` — pinned in `check:route-follower`, and an idle nav serializes with no executor key so the default save shape is unchanged |

**Why W1-1, W1-2 and W1-7 are `built, NOT wired` rather than `passing`.** Nothing in production
emits `nav:engageRoute`, and no latch or HUD consumes the travel-drive axis. Both are producers
whose consumers were not built: the drive axis is reachable only by a caller passing
`input.travelDrive`, and the executor is never constructed on the default player route, so **RC-5's
player symptom — "plotting a cross-sector route does nothing" — is not yet fixed**. Every remaining
UI entry point (`uiRoot.js`, `src/ui/screens/*`) is held by the concurrent agent. This is the same
posture as S0-7 and the RCS renderer, and it is now the third instance of this codebase's recurring
seam. **W1-8 is the single item that converts three rows from `built` to `passing`.**

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
| G-3 | `check:ci` no longer reaches `check:art`, so `check:visual-stability` runs in **no gate at all**. | `test/visual-probe-server.test.mjs:36`, `0 !== 1` | Carried from the baseline section above; still open. |
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

## Wave 2 — semantics · Wave 3 — texture

Enumerated in `01_DECISIONS.md` (D3 camera migration, D4 deep-space addressing, D7 velocity language,
D8 lane prototype). Not expanded into ledger rows until their entry gate is met — writing acceptance
rows for work whose contracts do not exist yet is how a ledger becomes fiction.

---

## Program finish line

`check:journey:textile` — the full acceptance journey extended from
`scripts/lib/professionalTravelPublicRoute.mjs` — **green on a clean checkout** (D11).
