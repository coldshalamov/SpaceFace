# SPACEFACE 2.0 — Build Plan & Agent Orchestration

> **Historical ownership/reference only.** Current cross-program status and pickup live in
> `design/program/README.md`; current Alpha scope lives in `design/vision/ALPHA_PROGRAM.md`.
> Do not dispatch from the dated status tables in this file.

**Companion to `design/GDD_2_0.md` (authoritative design).** This file was the execution contract:
if the current session dies, a fresh agent reads GDD → this file → picks the next unclaimed item.
**Prefer vision pack over this for “what to build next.”**

**Dated snapshot:** the status sections below describe a 2026-07-04 tree. Use
`design/program/01_VERIFIED_DONE.md`, `02_REMAINING_WORK.md`, and `03_LIVE_ACCEPTANCE_MATRIX.md`
instead. Live checks and player-route evidence outrank every prose status.

**Target platform:** PC/browser. Electron/packaged desktop is an optional distribution shell for the
same player route. Handheld-specific readiness is not a target or release blocker.

**Working-tree note (2026-07-03):** uncommitted edits removing `backdrop-filter: blur()` across UI
files are an intentional perf pass — KEEP them. `advisor-artifacts/` is archived profiling history.

---

## 0. Orchestration model

| Agent | Use for | Invocation |
|---|---|---|
| **Claude (lead)** | Design, briefs, HUD/frontend taste, flight feel, tuning, review, integration | (this session) |
| **Codex CLI** | Well-specified systems/backend work, multi-file refactors | `codex exec -c approval_policy=never "$(cat brief.md)" > out.md 2>&1` |
| **agy CLI** | Well-defined wiring/frontend tasks | `agy -p "$(cat brief.md)" --dangerously-skip-permissions > out.md 2>&1` |
| **grok CLI** | Contained new modules; can self-verify | `grok --always-approve -p "$(cat brief.md)"` (headless) |
| **gemini CLI** | Design critique only — never code | `gemini --approval-mode plan -p "..."` (no --model flag; don't run two at once) |

Rules that prevent drift (learned): one brief = one bounded scope; briefs name exact files the agent
MAY edit and files it MUST NOT touch; every brief ends with the verification command(s) to run;
transcripts are not proof — lead greps the files after every agent completes. Briefs live in
`.tmp/multi-loop/<date>/brief-*.md`, outputs beside them.

### Input contract (LOCKED — no agent edits `src/systems/input.js` except Claude)
Claude is implementing GDD §4.1/§7.1. Agents may **consume** these guaranteed fields on
`state.input`: `actions.brake`, `actions.cruise`, `actions.tetherFire`, `actions.tetherCut`,
`actions.reelDelta` (float, scroll), `actions.chargeThrow`, `actions.chargeDetonate`,
plus existing `aimWorld`, `moveX/moveZ`, `boost`, `fire`, `fireGroup`. Test via scripted inputs in
the sim harness (`scripts/sf-sim.mjs --inputs`), not via keyboard.

### File ownership map (wave 1 — do not cross)
> **⚠ UPDATED 2026-07-06 (V3 migration).** The line below originally named `src/systems/flight.js` +
> `src/core/flightDynamics.js` as Claude-owned flight files. Those are now **legacy** (V3 is the live
> controller; see `AGENTS.md §5`). The live V3 flight lane is `src/systems/flightV3.js` +
> `src/core/flight/*` (`propulsionCatalog.js`, `propulsionKernel.js`, `flightTelemetry.js`, tuning constants).
> The legacy files are retained because CI runs `check:sim` against them — do not delete without also
> removing the legacy check scripts.

- **Claude:** `src/systems/input.js`, `src/systems/flightV3.js`, `src/core/flight/*` (propulsion catalog,
  kernel, telemetry — tuning constants only), `src/ui/hud.js`, `src/ui/uiRoot.js`, `styles/ui.css`,
  `src/ui/comms.js`, `src/ui/alerts.js`. *(Legacy `src/systems/flight.js` + `src/core/flightDynamics.js`
  are CI-pinned, not actively edited.)*
- **CODEX-1 (tether):** `src/combat/attachments.js`, `src/combat/combatDefs.js`, `src/systems/weapons.js`,
  new `src/systems/tetherGameplay.js`
- **CODEX-2 (perf):** `src/render/renderer.js`, `src/render/vfx.js`, `src/core/loop.js`, new
  `src/render/precompile.js`, `scripts/check-hitch-budget.mjs`
- **CODEX-3 (maps):** `src/ui/bindings.js`, `src/ui/screens/starmap.js`, `src/ui/screens/localmap.js`,
  `src/systems/world.js` (discovery init only), new `src/systems/scanner.js`
- **AGY-1 (wiring):** `index.html`, `src/main.js` (telemetry call only), `src/ui/screens/settings.js`,
  `src/ui/radar.js` (a11y palette only)
- **GROK-1 (charges):** new files only: `src/systems/impulseCharges.js`, `src/data/impulseCharges.js`,
  integration notes in output (lead wires registry)

---

## 1. Workstreams

### WS-A — Game feel (GDD §4, §10) — *the make-or-break workstream*
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| A1 | Helm Assist scheme: mouse-nose steering, WASD thrust/strafe, Space brake, V cruise, scheme picker (Classic preserved) | **Claude** | **DONE** (2026-07-04: `check:flight:clean` passed 5 desktop/mobile browser visual runs; nose-chase/brake/classic checks remain covered by `check:flight:v3`) | Feel targets GDD §4.1; keep `check:flight:clean` green; both schemes switchable in Settings |
| A2 | Hitch elimination: shader precompile, spawn amortization (≤2 mesh builds/frame), GC audit of 10-min play, hitch CI guard | **CODEX-2** | **BUILT, STRICT PERF PROOF RED** — structural fixes in (precompile.js, VFX warm salvo, mesh FIFO cap 2, event-record pooling, scratch reuse). `check:bundle` passes. `check:perf` now runs to completion on the release route, but strict 60fps p95 is 16.9 ms vs the 16.7 ms target; 30fps floor, authored fallback, draw-call, render/sim/UI, and heap budgets pass. | Preserve authored visuals, then reduce occasional present/compositor/post spikes until `check:perf` is comfortably green; boot precompile behind loading veil |
| A3 | Cruise tier: 3 s charge, 4× speed, agility crush, drop on damage/mass-lock; interdiction hook event `cruise:dropped` | CODEX (wave 2) | **BUILT, CHECK GAP** (`src/systems/cruise.js` wired; `check-juice-contract` covers charge/drop; `check:cruise` is stale because `scripts/check-cruise.mjs` is missing) | Add/fix dedicated `check:cruise`; sim-harness scenario: engage, mass-lock near station drops it; no weapons while cruising |

### WS-B — Information layer (GDD §7)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| B1 | M=local map, N=nav chart swap; charted-by-default discovery (core+mid sectors); ??? only frontier/anomaly; survey-data purchase at bars | **CODEX-3** | **BUILT, CLAIM-BASE CHECK RED** (`check:controls-discoverability`, `check:starmap-objective`, `check:localmap-routes` pass; `check:claim-base` currently fails around C-key fallthrough) | Fresh save: M shows populated local map; nav chart shows all core sectors named; `check:claim-base` green without scanner/control collisions |
| B2 | Scanner pulse (C): 8 s cd, seam highlight 20 s, wreck/anomaly ping, "?" bait markers on local map | **CODEX-3** | **BUILT, CLAIM-BASE CHECK RED** (scanner.js registered; pings persist in world.scanPings; local-map checks green; shared input proof blocked by `check:claim-base`) | Pulse event visible in sim telemetry; localmap renders pings; feeds `recon_scan` missions; `check:claim-base` green |
| B3 | Overview strip (right edge, 8 rows, IFF chips, click-to-target) + radar glyph/IFF pass | Claude (wave 2) | **DONE** (`check-ui-identity` green: overview strip, IFF, cadence, click-to-target) | Five-second test: stranger IDs every contact class |
| B4 | Target panel: shield/armor/hull segmented bars + in-world target arcs | Claude (wave 2) | **DONE** (`check-ui-identity` green: segmented bars + in-world arcs) | Damage triangle legible without numbers |

### WS-C — Mining 2.0 (GDD §5)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| C1 | Seams (deterministic, 1–4/asteroid, 100%/35% yield split), vent-bonus rhythm band, fracture-into-chunks, vacuum buff (420 wu range/100–280 wu/s relative approach/900 wu/s² convergence authority/beam-line direct-to-cargo) | CODEX (wave 2) | **DONE** (`check:mining:2` green) | `check:sim` deterministic after 47-A re-record; play: zero manual ball-chasing; mining a field feels pulse-timed |
| C2 | Rich cores + charged drill timing ring (3–8× rare) | Claude tune after C1 | **DONE** (`check-price-memory` covers rich-core payout/fizzle path) | Timing window hit-rate ~60% for a mid player |
| C3 | Tether-haul chunks >20 u to refinery; bulk payout; refinery fee sink | CODEX (after CODEX-1) | **DONE** (`check-price-memory` covers bulk_haul formula + mission completion) | Contract type ships; hauling a chunk with tether physics feels weighty |

### WS-D — Combat 2.0 (GDD §6) + physics verbs (GDD §4.3–4.5)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| D1 | **Tether gameplay integration** (flagship): fire/latch/reel/cut on input contract, slingshot physics, tension telegraphy events, mass-ratio yank rules, break thresholds | **CODEX-1** | **DONE** (sim + in-world segmented cable/HUD readout covered by later tether feel pass) | `check:sg02:tether*` green + new scenario: latch asteroid at speed, cut at tangent, exit velocity ≥ 1.4× entry; events `tether:latched/strain/broke/released` emitted |
| D2 | Impulse charges: sticky lob (Q/helm, Y/classic), R-detonate radial impulse, self-plate trick, 6 s throw cd, friendly fire | **GROK-1** | **DONE** (system + data + registry wired; juice contract covers charge detonation cue path) | Standalone system + data file; sim scenario knocks a drone into an asteroid; lead wires registry |
| D3 | Juice contract: shield ripple/break stack, hit-stop, kill sequence, flee smoke, damage-direction contrast | Claude (wave 2) | **DONE** (`check-juice-contract` green) | GDD §6.3 checklist; motionReduce respected |
| D4 | AI telegraphs + wedge formations-lite + comms barks (1/4 s cap) | CODEX (wave 2) | **DONE** (`check-ai-telegraphs` green) | `check:sg06:ai` green; attack runs visibly telegraphed 0.5 s |
| D5 | Encounter shapes: interdiction snare + toll choice card; patrol-scan chase; named bounty gimmicks | CODEX (wave 3) | **NOT BUILT** (`src/systems/encounterDirector.js` and `scripts/check-encounter-director.mjs` missing; existing interdiction/bulk-haul pieces are partial plumbing) | Scenario scripts pass; toll feeds faction/econ |

### WS-E — Visual depth & HUD (GDD §9)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| E1 | Parallax stack: far dust sheets, mid instanced debris, near speed-motes w/ boost streaks; motion-reduce halves | **DONE** (CODEX-8 built `src/render/parallaxLayers.js`; Claude fixed a uStretch precision mismatch in the mote shader — fragment must declare `precision highp float` to match the vertex default; verified 141/141 programs valid + boost streaks visible) | Boost visibly *reads* fast; no added hitches (check:hitch-budget) |
| E2 | Data-driven sector palettes in `sectors.js` (lights/fog/nebula/dust); 4 palette classes authored | CODEX (wave 2) | **DONE** (`check:sector-palettes` green; 10 sectors across anomaly/belt/core/fringe) | Jumping sectors visibly changes identity in 1 s |
| E3 | HUD 2.0: three-anchor layout, retire bottom text strip, priority channel top-center, contextual chips | **Claude** | **DONE, BROADER UI GATE RED** (`check-ui-identity` green; `check-ui-screen-imports` currently has unrelated dirty-tree failures) | GDD §9.4; `check:ui-a11y`, `check:wcag-contrast` green |
| E4 | Readability: faction rim-light, planet-sphere labeling, emissive audit for selective bloom | Claude + CODEX (wave 3) — **PARTIAL, NEEDS LIVE FIVE-SECOND PROOF**: the "giant ambiguous blob" bugs are dead (station/gate chrome shells 0.655→≤0.07 opacity + env intensity halved in visualFactory `applyStructureProfile`; nebula canvas repainted in starfield.js — filament clouds instead of giant lobes, compact bright cores, planets sized for the 60° camera magnification). Mining seams now render as ember markers, scanner-lit after C-pulse (vfx `_initSeamMarkers`). Browser route proof is available through green `check:flight:clean`, `check:assets:live`, and `check:visual-stability`, but the curated five-second readability capture still needs to be produced. | Five-second test/capture passes on the browser route with no asset fallback or ship flicker |

### WS-F — Onboarding & shell (GDD §8)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| F1 | Attention arbiter: single priority text channel, queue/drop rules | Claude (wave 2) | **PARTIAL** (minimal one-voice gate + first-hour static audit pass; broader 10-min runtime proof still pending) | 10-min recording: zero overlapping text events |
| F2 | First-15 re-pace to GDD §8.2 (wake→derelict tether→seam→snare→dock→choice) | Claude + CODEX script (wave 3) | **BUILT, RUNTIME PROOF RED** (`check-first-hour` + `check:onboarding` pass; `check:first-15-runtime` timed out in current tree) | `check:onboarding`, `check:first-15-runtime` updated + green; each beat teaches one verb |
| F3 | Wiring pass: telemetry activate, accessibility.css link + applyAccessibility(), radar a11y palette, settings additions (scheme picker slot, damage numbers, shake slider) | **AGY-1** | **DONE** (all verified by file evidence + checks) | `window.__SF_TELEMETRY__` live; `check:ui-a11y` green; settings render |
| F1a | One-voice comms gate (minimal arbiter): chatter queues behind intro modal, drips 3.5 s apart, stale ambient drops | **Claude** | **DONE** (verified: 1 comms line during intro vs prior wall) | 10-min recording: zero overlapping text events (full F1 arbiter still wave-2) |
| E3a | HUD strip→chips: SPD+WPN live; CARGO/CR/CLASS contextual chips; THR/STOP retired into SPD tip | **Claude** | **DONE** | GDD §9.4 three-anchor layout (full pass incl. priority channel still wave-2) |

**Golden/tape note (updated 2026-07-04):** `check:sim` 47a goldens are STALE by design — state shape
grew (scanner, discovery, tether runtime, mining seams) and Mining 2.0's fracture changed how the
recorded 47a input tape plays out, tripping the tape's "should exercise projectile collision"
coverage precondition. Determinism itself held at every same-shape comparison (hashEqual:true,
firstDivergentTick:null). NEXT ACTION (one batch, after any further sim-shape work): re-record/
re-derive the 47a expectations — run the sf-sim record path for `test/47a.telemetry.expected.json`
(+ v3 variant), confirm the tape still covers projectile collision (adjust the scripted shots in
test/47a.inputs.json if the tutorial rock now fractures first), then freeze with
`npm run check:sim` (--repeat 20 --reload-at 600) and `check:sim:compare` green.

**Historical status snapshot (2026-07-04; do not dispatch from this list):** C1/C2/C3, D3/D4, E1/E2/E3, B3/B4, SPEC2/01, SPEC2/03 static,
SPEC2/05 mining/economy slices, SPEC2/06, and SPEC2/07 all have passing targeted checks as listed in
`design/CURRENT_BUILD_STATUS.md`. Do not re-brief those as unstarted work. Current red/missing gates
are: `check:cruise` (missing script), `check:first-15-runtime` (timeout),
`check:market-first-loop` (timeout), `check:claim-base` (C-key fallthrough), `check-ui-screen-imports`
(4 failures in the dirty tree), `check:perf` (strict 60fps p95 16.9 ms vs 16.7 ms target),
`check:sim:compare`/`check:replay` (stale 47-A tape), SPEC2/04 encounter director (missing
source/check), and SPEC2/08 PC/browser release readiness (missing soak/capture/perf proof).
Green proof to preserve: `check:flight:clean`, `check:assets:live`, and `check:visual-stability`.

### Wave plan
- **Stabilization wave:** fix the current proof surface first: keep `check:bundle`,
  `check:flight:clean`, `check:assets:live`, and `check:visual-stability` green, then repair
  `check-ui-screen-imports`, `check:first-15-runtime`, `check:market-first-loop`, `check:claim-base`,
  `check:cruise`, `check:perf`, and the 47-A re-record batch.
- **World Alive wave:** implement D5 / SPEC2/04 (`encounterDirector`, encounter shapes, one-voice
  trace check, toll/faction/econ hooks).
- **Asset/media reachability wave:** preserve the repaired whole-ship GLB runtime contract for
  Kestrel/Pelican/Wasp and the green `check:assets:live` / `check:visual-stability` gates, plus
  tasteful default UI wiring/classification for existing cinematics/ore/pilot/UI media.
- **PC/browser release wave:** SPEC2/08 revised for PC/browser readiness:
  release soak, PC browser perf evidence, optional desktop-shell parity evidence, capture scripts,
  zero-console loop, `check:ci`.
- **Optional expansion wave:** sector-count/content expansion and longform Blender asset production
  after the proof surface is green.

## 2. Review gate (lead runs after every agent)
1. `git status` — only owned files touched. 2. Grep the promised symbols exist. 3. Run the item's
verify commands. 4. Preview-server play check for anything player-facing. 5. Patch small, re-brief
structural. Never accept transcript claims without file evidence.

## 3. Standing constraints
- ARCHITECTURE.md contracts hold: sim never touches Three.js; UI emits intents only; XZ plane; y=0.
- Determinism: any RNG in sim paths uses `state.rng`/sector-seeded hash; check:sim must stay green.
- Dependencies and visual techniques are allowed when they improve the result and carry documented
  license, bundle/performance, determinism/save, accessibility, and maintenance evidence. Respect
  `motionReduce`/`flashReduce`; measure CSS/render cost instead of banning properties by name.
- Do not edit `test/*.expected.json` goldens to make checks pass — fix the code or flag the lead.
