# SPACEFACE 2.0 — Build Plan & Agent Orchestration

**Companion to `design/GDD_2_0.md` (authoritative design).** This file is the execution contract:
if the current session dies, a fresh agent reads GDD → this file → picks the next unclaimed item.

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
- **Claude:** `src/systems/input.js`, `src/systems/flight.js`, `src/core/flightDynamics.js` (tuning
  constants only), `src/ui/hud.js`, `src/ui/uiRoot.js`, `styles/ui.css`, `src/ui/comms.js`, `src/ui/alerts.js`
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
| A1 | Helm Assist scheme: mouse-nose steering, WASD thrust/strafe, Space brake, V cruise, scheme picker (Classic preserved) | **Claude** | **DONE** (2026-07-03: nose-chase verified err 3.07→0.013 rad; brake 108→6.6 wu/s; classic regression-tested; scheme-aware prompts live) | Feel targets GDD §4.1; `check:flight` green; both schemes switchable in Settings |
| A2 | Hitch elimination: shader precompile, spawn amortization (≤2 mesh builds/frame), GC audit of 10-min play, hitch CI guard | **CODEX-2** | **LANDED, GATE OPEN** — structural fixes in (precompile.js, VFX warm salvo, mesh FIFO cap 2, event-record pooling, scratch reuse). Headless gate numbers are driver-stall-polluted (app phases ~15 ms of a 512 ms worst); steady-state preview improved (worst 54→42 ms under load). NEXT: run `check:hitch-budget` on real hardware via Electron; consider renderScale auto-tune | New `check:hitch-budget` passes: no frame >32 ms in scripted 60 s run; boot precompile behind loading veil |
| A3 | Cruise tier: 3 s charge, 4× speed, agility crush, drop on damage/mass-lock; interdiction hook event `cruise:dropped` | CODEX (wave 2) | QUEUED | Sim-harness scenario: engage, mass-lock near station drops it; no weapons while cruising |

### WS-B — Information layer (GDD §7)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| B1 | M=local map, N=nav chart swap; charted-by-default discovery (core+mid sectors); ??? only frontier/anomaly; survey-data purchase at bars | **CODEX-3** | **DONE** (all named checks green; Claude moved claimBase C→U for scanner key + made check-claim-base registry-driven) | Fresh save: M shows populated local map; nav chart shows all core sectors named; `check:controls-discoverability`, `check:starmap-objective`, `check:localmap-routes` green |
| B2 | Scanner pulse (C): 8 s cd, seam highlight 20 s, wreck/anomaly ping, "?" bait markers on local map | **CODEX-3** | **DONE** (scanner.js registered; pings persist in world.scanPings; harness green) | Pulse event visible in sim telemetry; localmap renders pings; feeds `recon_scan` missions |
| B3 | Overview strip (right edge, 8 rows, IFF chips, click-to-target) + radar glyph/IFF pass | Claude (wave 2) | QUEUED | Five-second test: stranger IDs every contact class |
| B4 | Target panel: shield/armor/hull segmented bars + in-world target arcs | Claude (wave 2) | QUEUED | Damage triangle legible without numbers |

### WS-C — Mining 2.0 (GDD §5)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| C1 | Seams (deterministic, 1–4/asteroid, 100%/35% yield split), vent-bonus rhythm band, fracture-into-chunks, vacuum buff (420 wu/520 accel/beam-line direct-to-cargo) | CODEX (wave 2) | QUEUED | `check:sim` deterministic; play: zero manual ball-chasing; mining a field feels pulse-timed |
| C2 | Rich cores + charged drill timing ring (3–8× rare) | Claude tune after C1 | QUEUED | Timing window hit-rate ~60% for a mid player |
| C3 | Tether-haul chunks >20 u to refinery; bulk payout; refinery fee sink | CODEX (after CODEX-1) | QUEUED | Contract type ships; hauling a chunk with tether physics feels weighty |

### WS-D — Combat 2.0 (GDD §6) + physics verbs (GDD §4.3–4.5)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| D1 | **Tether gameplay integration** (flagship): fire/latch/reel/cut on input contract, slingshot physics, tension telegraphy events, mass-ratio yank rules, break thresholds | **CODEX-1** | **DONE** (sim-side; check-tether-gameplay + sg02 tether suites green. NOTE: tether has NO in-world visual yet — cable line + strain color is a D3/wave-2 VFX item) | `check:sg02:tether*` green + new scenario: latch asteroid at speed, cut at tangent, exit velocity ≥ 1.4× entry; events `tether:latched/strain/broke/released` emitted |
| D2 | Impulse charges: sticky lob (Q/helm, Y/classic), R-detonate radial impulse, self-plate trick, 6 s throw cd, friendly fire | **GROK-1** | **DONE** (system + data + registry wired; cmdty_impulse_charge added; sanity sim passes. No in-world visual yet — same wave-2 VFX item) | Standalone system + data file; sim scenario knocks a drone into an asteroid; lead wires registry |
| D3 | Juice contract: shield ripple/break stack, hit-stop, kill sequence, flee smoke, damage-direction contrast | Claude (wave 2) | QUEUED | GDD §6.3 checklist; motionReduce respected |
| D4 | AI telegraphs + wedge formations-lite + comms barks (1/4 s cap) | CODEX (wave 2) | QUEUED | `check:sg06:ai` green; attack runs visibly telegraphed 0.5 s |
| D5 | Encounter shapes: interdiction snare + toll choice card; patrol-scan chase; named bounty gimmicks | CODEX (wave 3) | QUEUED | Scenario scripts pass; toll feeds faction/econ |

### WS-E — Visual depth & HUD (GDD §9)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| E1 | Parallax stack: far dust sheets, mid instanced debris, near speed-motes w/ boost streaks; motion-reduce halves | **DONE** (CODEX-8 built `src/render/parallaxLayers.js`; Claude fixed a uStretch precision mismatch in the mote shader — fragment must declare `precision highp float` to match the vertex default; verified 141/141 programs valid + boost streaks visible) | Boost visibly *reads* fast; no added hitches (check:hitch-budget) |
| E2 | Data-driven sector palettes in `sectors.js` (lights/fog/nebula/dust); 4 palette classes authored | CODEX (wave 2) | QUEUED | Jumping sectors visibly changes identity in 1 s |
| E3 | HUD 2.0: three-anchor layout, retire bottom text strip, priority channel top-center, contextual chips | **Claude** | ACTIVE (after A1) | GDD §9.4; `check:ui-a11y`, `check:wcag-contrast` green |
| E4 | Readability: faction rim-light, planet-sphere labeling, emissive audit for selective bloom | Claude + CODEX (wave 3) — **PARTIAL**: the "giant ambiguous blob" bugs are dead (station/gate chrome shells 0.655→≤0.07 opacity + env intensity halved in visualFactory `applyStructureProfile`; nebula canvas repainted in starfield.js — filament clouds instead of giant lobes, compact bright cores, planets sized for the 60° camera magnification). Mining seams now render as ember markers, scanner-lit after C-pulse (vfx `_initSeamMarkers`) | Five-second test passes |

### WS-F — Onboarding & shell (GDD §8)
| # | Item | Owner | Status | Accept when |
|---|---|---|---|---|
| F1 | Attention arbiter: single priority text channel, queue/drop rules | Claude (wave 2) | QUEUED | 10-min recording: zero overlapping text events |
| F2 | First-15 re-pace to GDD §8.2 (wake→derelict tether→seam→snare→dock→choice) | Claude + CODEX script (wave 3) | QUEUED | `check:onboarding`, `check:first-15-runtime` updated + green; each beat teaches one verb |
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

**Wave-2 status (2026-07-04):** C1 mining seams/vent/fracture/vacuum/noise **DONE** (CODEX-4,
`check:mining:2` green). D4 AI telegraphs/flee-jettison/wedges/barks **DONE** (CODEX-5,
`check-ai-telegraphs` green). E2 sector palettes **DONE** (CODEX-7B, `check:sector-palettes` green;
palette lerp 1.5 s on jump). Tether feel pass **DONE** (Claude): ghost-anchor bug fixed at service
level (breakOrphans + unconditional break-on-cut-failure), G toggle + 0.25 s re-latch cooldown,
pickups no longer attachable, reload-safe adoption (`_adoptExisting`), `state.player.tether` mirror,
segmented cable visual with slack bow/whip/strain colors + snap burst (vfx.js, supersedes the stiff
HDR ribbon for player-owned tethers), HUD TETHER readout with [G] RELEASE, all verbs in Settings
Controls, physics socket tuned [0.3, 0.15] with all three tether contracts green. A3 cruise brief
still staged (brief-codex-6-cruise.md). Remaining: E1 parallax depth, D3 juice stack, B3 overview
strip, B4 target panel, F1 full arbiter, F2 first-15 re-pace, golden re-record above.

### Wave plan
- **Wave 1 (now, parallel):** A1+E3 (Claude) ∥ A2 (CODEX-2) ∥ D1 (CODEX-1) ∥ B1+B2 (CODEX-3) ∥ F3 (AGY-1) ∥ D2 (GROK-1)
- **Wave 2:** C1, D3, D4, A3, E1, E2, F1, B3, B4 — after wave-1 review; reuse ownership map, updated per collision
- **Wave 3:** C2, C3, D5, E4, F2, balance pass on CONTENT_BIBLE prices for new sinks
- **Wave 4:** integration playtest, telemetry-informed tuning, `npm run check:ci`, release notes

## 2. Review gate (lead runs after every agent)
1. `git status` — only owned files touched. 2. Grep the promised symbols exist. 3. Run the item's
verify commands. 4. Preview-server play check for anything player-facing. 5. Patch small, re-brief
structural. Never accept transcript claims without file evidence.

## 3. Standing constraints
- ARCHITECTURE.md contracts hold: sim never touches Three.js; UI emits intents only; XZ plane; y=0.
- Determinism: any RNG in sim paths uses `state.rng`/sector-seeded hash; check:sim must stay green.
- No new deps without lead sign-off. No `backdrop-filter`. Respect `motionReduce`/`flashReduce`.
- Do not edit `test/*.expected.json` goldens to make checks pass — fix the code or flag the lead.
