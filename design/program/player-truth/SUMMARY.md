# Player-truth: what is broken where (first verdicts, 2026-10-12)

The fleet's work list. Each row comes from `npm run player-truth` playing the public route in a rendered
Chromium with trusted keyboard/mouse input. Re-run the row's command to reproduce it; a row closes when
its check reads PASS. Renderer for every run below:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` (no GPU on this VM),
960x540, headless, so frame-time is UNKNOWN (graded only on a GPU, `--headed`).

## Owner's 2026-10-11 Swarm report — what reproduced

| Owner saw | Check | Result on master `6dc08f08e` (Ricochet Foundry, 960x540 SwiftShader) |
|---|---|---|
| Enemies killed by asteroids / a force at start | `kills_before_input` | **REPRODUCED** — 12 hostile deaths in the first 30 s with zero input (ship-on-ship ×7, asteroid ×2, wreck ×1, unattributed ×2); idle-70 run: 7 by 23 s |
| "Told I WON" having done nothing | `reward_before_input`, `round_resolution` | **PARTLY** — +3324 HUD score credited in the first 30 s with zero input (first credit at 1.6 s, PILE-UP ×42 / COLLATERAL banners). No round *win* under 20 s: round 1 cleared at 73.5 s (30 s idle then scripted fight); idle-only runs lose round 1 at 23–25 s instead |
| Things fly everywhere at start | `spawn_motion` | **REPRODUCED** — 65 passive bodies >8 u/s before input; worst asteroid 210 u/s 234 u from the player at round 2 start |
| Objects pop in and out | `popping` | **REPRODUCED** — 203 on-screen pops/min, asteroids toggling up to 7× |
| Models swap LODs constantly; ship replaced a second later | `lod_churn` | **REPRODUCED** — 3.5 on-screen swaps/s total, 7 per 10 s per body (off-screen re-keys not graded); enemy wasp `DIRECT_AUTHORED_ADMISSION/compiling-pipelines → ship_wasp@lod1` (placeholder → authored), asteroids lod0↔lod1↔lod2 |
| Own ship disappears / is a rectangle | `player_ship` | **NOT REPRODUCED** — 0 of 2184 frames missing/placeholder/non-hero (Ricochet Runner hull, seed as below, both rounds) |
| Cannot tell enemies from asteroids | `readability` | **REPRODUCED** — enemy-vs-asteroid separation 0.41 (threshold 1.0, colour ΔE 9.4, size ratio 1.05); 66% of enemy and 88% of projectile samples barely differ from the background |
| Huge VFX over the ship, cheap VFX everywhere | `vfx_coverage` | **REPRODUCED** — additive layers cover up to 100% of the screen (p95 29%), threats ≥50% occluded p95 100%; the player's own `sf-selection-sigil` sits over the ship in 6% of scans; `sf-fracture-veins` up to 240% screen footprint |
| Could not move next round | `player_control` | **NOT REPRODUCED** — 0/4 thrust/yaw probes dead across both rounds |
| Ship tumbling | `tumble` | **NOT REPRODUCED** — no uncommanded pitch/bank/spin beyond 0.5 s |
| Cargo scanner in Swarm; items replace others unexplained | `loadout` | **REPRODUCED (relevance)** — 5 irrelevant offers: Cargo Scanner S, Market Data Uplink S, Bio-Spectral Pass Head, …; descriptions present on all 79; swap probe saw 2 announced swaps, 0 silent |

Settings tried: `--mode=swarm --arena=all --rounds=2 --idle=30 --duration=90` and `--idle=70`, fresh profile
(`SPACEFACE_PLAYER_STORE_DIR=''`), default hull Ricochet Runner. Seed: the first runs played the door's default seed 73311 (the seed field sits in the closed *Seed, perks, hangar &
records* disclosure; the harness now opens it). The house-seed rerun `swarm-ricochet-foundry-seed4242/` (seed 4242
confirmed in the verdict) reproduces the same picture: 4 hostile deaths and +3849 score before input (first credit
1.7 s, PILE-UP ×37), asteroids at 45–48 u/s at spawn, 2.8 on-screen LOD swaps/s, 109 pops/min, readability 0.48,
threats under VFX p95 100%, 5 irrelevant offers — and the idle player is killed at 24.7 s of round 1, so control
and round resolution are measured on the 73311 run. Only Ricochet Foundry is open to a fresh profile for Swarm.

## Work list

| # | Broken | Where | Number (threshold) | Evidence | Owner |
|---|---|---|---|---|---|
| 1 | Hostiles die and score accrues before the player acts | Swarm R1 | 12 kills, +3324 score in 30 s idle (0) | `swarm-ricochet-foundry/` | Lane 6 (swarm-crucible-overhaul) |
| 2 | Asteroids launched at up to 210 u/s at round start | Swarm R1/R2 | 65 bodies >8 u/s (0) | `swarm-ricochet-foundry/` | Lane 6 (arena spawn); integration if physics |
| 3 | On-screen LOD/model churn; enemies appear as admission placeholder then swap | Swarm | 3.5/s, 7/10 s per body on screen (≤1/s, ≤3/10 s) | `swarm-ricochet-foundry/` | Lane 6 (lod.js, hlod.js, assetResidency.js) |
| 4 | On-screen popping of asteroids/pickups | Swarm | 203/min, 7 toggles (≤6/min, ≤2) | `swarm-ricochet-foundry/` | Lane 6 (residency/streaming) |
| 5 | Enemies indistinguishable from asteroids; dark enemies/projectiles | Swarm, Gauntlet | separation 0.41 (≥1.0) | `swarm-ricochet-foundry/`, `gauntlet-lagrange-crucible/` | Lane 6 (enemy/arena look) |
| 6 | Additive VFX blanket the screen and threats | Swarm, Gauntlet | 100% peak, threats hidden p95 100% (≤25%, ≤30%) | `swarm-ricochet-foundry/` | Agent 3 (presentation/cue arbitration) + Lane 6 (Swarm VFX) |
| 7 | Mode-irrelevant Armory offers | Swarm Armory | 5 (0) | `swarm-ricochet-foundry/` | Lane 6 (crucible/loadout UI) |
| 8 | Combat banners (PILE-UP ×42, COLLATERAL, SLAMMED) fire with no player action | Swarm HUD | see #1 | contact sheet | Lane 6 + Agent 3 |
| 9 | Racing: bodies stream in on screen after spawn | Circuits, Textile Belt | 7.9 pops/min (≤6) | `racing/` | Lane 6 (residency/streaming) |
| 10 | Encounter modal and campaign radio inside a temporary circuit | Circuits | modal up ≥45 s of a 75 s run (observed) | `racing/contact-sheet.jpg` | Agent 2 (opening encounter) + Agent 3 (presentation) |
| 11 | Gauntlet: hostiles die before the player acts | Gauntlet, 4 of 7 arenas | 1–5 kills (0) | `gauntlet-*` | Lane 6 |

## Gauntlet (Crucible door "scored" ruleset) — every arena

`npm run player-truth -- --mode=gauntlet --arena=all --rounds=2 --idle=30 --duration=75`. The scored door
opens all seven arenas to a fresh profile (Swarm opens only Ricochet Foundry).

| Arena | Verdict | Failing checks (number) | Notes |
|---|---|---|---|
| Lagrange Crucible | FAIL | readability 0.43 (≥1.0); threats hidden by VFX p95 60% (≤30%) | ran 75 s |
| Ricochet Foundry | INCOMPLETE | — | idle player killed at 24.8 s; control/readability unmeasured |
| Cinder Sluice | FAIL | 3 hostile kills before input (0) | ran 75 s |
| Cryo Drift | FAIL | 1 hostile kill before input (0) | player died |
| Storm Lattice | FAIL | 3 hostile kills before input (0) | ran 75 s |
| Asteroid Mill | FAIL | 5 hostile kills before input (0) | ran 75 s |
| The Hive | INCOMPLETE | — | idle player killed before the scripted fight; control unmeasured |

Round resolution is UNKNOWN for Gauntlet: the scored ruleset ends a run on a cut, not a won round, so there is
no "won after N s" to measure. Gauntlet LOD re-keying (1.3–4.2/s raw) happens off screen and is not graded. Gauntlet runs played the door default seed 73311 (before the seed fix). Readability is UNKNOWN where fewer than 5 enemy/asteroid samples were on screen.

## Adventure (New Game → default Hitch start, Helios, tutorial hints on)

`npm run player-truth -- --mode=adventure --duration=150` — **INCOMPLETE** (no FAIL). 150 s cruise, seed 4242
(no seed field on this route; the default start is deterministic). Ship, control, tumble, popping and VFX PASS;
on-screen LOD churn 0.03/s PASS. Readability UNKNOWN: only 1 hostile and 0 asteroids on screen in the first
150 s, so there is nothing to separate. Tutorial strip read `TUTORIAL 1 / 12` for 135 s of
free flight. Contact sheet: `adventure/contact-sheet.jpg`.

## Racing (main menu → Circuits → first course Textile Belt → Race → confirm "Launch circuit")

`npm run player-truth -- --mode=racing --duration=75` — **FAIL**, seed 4242. `popping` 7.9/min (≤6): 10 bodies
appear from hidden to on screen in the inner view between sim 1.0 and 1.9 s, after the loading veil has lifted
(streaming finishing in front of the player). Ship, control, tumble, LOD (0.08/s) and VFX PASS. Observed in the
frames (not graded): the Adventure encounter modal *KETTLE HOLD — choose a response* covers the lower-left
quarter from sim ~30 s to the end of the run, and campaign radio (*RADIO TRAGEDY AT HELIOS*) plays inside the
temporary circuit. Contact sheet: `racing/contact-sheet.jpg`.

## Other main-menu doors

- **Sandbox** — not a public mode: `src/ui/screens/sandbox.js` is dev-only (`IS_DEV`, dead-code-eliminated from
  `build/web`), so it is not graded. **Archive** / **Load** / **Settings** are not play modes.
- **Swarm arenas** other than Ricochet Foundry are locked for a fresh profile (Lagrange Crucible, Cinder Sluice,
  Cryo Drift, Storm Lattice, Asteroid Mill, The Hive); they are covered through Gauntlet, which opens all seven.

<!-- MODES -->
