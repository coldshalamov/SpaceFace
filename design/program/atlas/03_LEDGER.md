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

| Check | Status | Cause | Ours? |
|---|---|---|---|
| `check:m2:map-cutover` | FAIL 1 of 14 | Sub-check `check-m2b-region-data` fails "original story anchor XZ drift" (actual `68fcd1e1…`, expected `70195878…`). The concurrent visual-asset agent added `chartNote` fields to station records in the dirty `src/data/sectors.js`; `storyAnchorFingerprint()` hashes whole station records, so a benign content addition moves the hash. | **No** |
| `check:map-authority` | PASS | — | — |
| `check:starmap-objective` | PASS | — | — |
| `check:mission-log-map` | PASS | — | — |
| `check:localmap-routes` | PASS | — | — |
| `check:galaxy-map-inspector` | PASS | — | — |

**Noted test-design weakness (not fixed here, not ours):** `check-m2b-region-data`'s assertion message
says "XZ drift" but the hash it guards covers entire station records including non-spatial fields. It
therefore reports a coordinate regression when a writer adds flavour text. Worth narrowing the
fingerprint to spatial fields, or renaming the assertion. Filed as a finding, not a fix — it is the
foreign agent's lane right now.

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
| S0-1 | System map plots every mark in one declared frame; `x/z` global, `drawPos` sector-local (D2.1) | P1 | — | `check:map-frames` (new, bidirectional guard) + `test/claim-specializations.test.mjs` + map check suite unmoved | unverified |
| S0-2 | Persistent "you are here" in the system model, with inside/outside + bearing/distance when surveying a remote sector | P1 | S0-1 | `check:map-frames` | unverified |
| S0-3 | Static fallback anchors converted up to global so course payloads are correct in nonzero-origin sectors | P1 | S0-1 | own assertion in `check:map-frames` | unverified |
| S0-4 | Armed waypoint no longer blows out the system span | P1 | S0-1 | own assertion in `check:map-frames` | unverified |
| S0-5 | Speed-line intensity, count, alpha and length bounded; centre kept legible; distribution fixed | P2 | — | `check:speed-lines` (new) with before/after table + unchanged-at-ordinary-speed pins | unverified |
| S0-6 | Signed actuator demand forwarded through the telemetry seam, drive-family-agnostic | P3 | — | `test/flight-actuator-telemetry.test.mjs` + `check:sim:compare` unmoved | unverified |
| S0-7 | Minimum Atlas: derived node/edge index + integrity validator | P4 | — | `test/atlas-index.test.mjs` + `check:atlas-integrity` | unverified |

---

## Wave 1 — the missing spine (gates Wave 2)

| ID | Feature | Depends on | Status |
|---|---|---|---|
| W1-1 | Travel drive axis: Off / Spooling / Engaged / Cooldown, orthogonal to assist regime and control owner (D5) | S0-6 | blocked |
| W1-2 | Governor ramps the cap while Engaged; `physicsEarnedMomentum` decay on disengage — no confiscation | W1-1 | blocked |
| W1-3 | Boost never commands reverse thrust above cap (clamp commanded forward ≥ 0) | W1-1 | blocked |
| W1-4 | Dash sets `physicsEarnedMomentum`; dash / boost / burn share one energy pool and one gauge | W1-1 | blocked |
| W1-5 | Rebindable Travel Burn latch (Num Lock default + laptop + controller); braking breaks it, steering does not | W1-1 | blocked |
| W1-6 | Per-family speed ceiling, shown on the velocity tape, approached asymptotically | W1-1 | blocked |
| W1-7 | Route follower **sequences** existing controllers; owns `nav.route`; `nav.autoTravel` finally has a reader (D6) | S0-7, W1-1 | blocked |
| W1-8 | Plot and engage are separate actions, reachable on the default route (wired-features contract) | W1-7 | blocked |
| W1-9 | Manual burn shows stopping arc + BRAKE NOW; overshoot remains possible. Route follower auto-brakes and flip-and-burns when `bestMode` says so | W1-7 | blocked |
| W1-10 | Route survives save/load in every executor state | W1-7 | blocked |

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
