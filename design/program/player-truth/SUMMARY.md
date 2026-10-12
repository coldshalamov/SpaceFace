# Player-truth: what is broken where (v2 gate verdicts, 2026-10-12)

The fleet's work list. Each row comes from `npm run player-truth` playing the public route in a rendered
Chromium with trusted keyboard/mouse input. Re-run the row's command to reproduce it; a row closes when
its check reads PASS. Renderer for every run below:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` (no GPU on this VM),
960x540, headless, so frame-time is UNKNOWN (graded only on a GPU, `--headed`).

## Scoreboard (seed 4242) — measured on `9e647c306`, branch now on `debe715c8a`

Rebased onto `origin/master` `debe715c8a` (2026-10-12, clean, no content conflicts, `mergeable` MERGEABLE). The rows below were measured on `9e647c306`, which already contains Lane 6's room-solid clearance `6b67d1fb1`. They are not a fresh measurement of `debe715c8a`: master moved 328 commits after that run, including the popin/residency waves and UI polish #301. The harness commits do not change combat. Renderer: SwiftShader, 960x540. Command that produced the rows: `npm run player-truth -- --mode=swarm --arena="Ricochet Foundry" --gate --evidence --tag=seed4242`. Evidence: `swarm-ricochet-foundry-idle-seed4242/`, `swarm-ricochet-foundry-active-seed4242/`. A fresh `--gate=active` on this tip is the open run.

A status of UNKNOWN is not a pass. Round 2 after the clearance is UNKNOWN: the active pass died in round 1 when the browser closed. The exit code of a FAIL is 1 (`gateExitCode`); INCOMPLETE is 2; only an all-PASS run exits 0.

| check | status | measured on this master | owner |
|---|---|---|---|
| route | FAIL | Idle reached play. Active closed: `Target page, context or browser has been closed` at 11.2 sim s. | This harness (the close). Not a missed door button. |
| round_resolution | FAIL | Idle PASS, shortest 41.1 s. Active FAIL because no round was won before the browser died. | Lane 6 owns a short win. This active FAIL is the close. |
| kills_before_input | PASS | 0 kills on both seed-4242 passes. Pre-clearance idle on this seed was FAIL 9. | Lane 6 |
| reward_before_input | PASS | +0 on both passes. Pre-clearance idle was FAIL +4041. | Lane 6 |
| spawn_motion | PASS | 0 passive bodies over 8 u/s on both passes. | Lane 6 |
| player_control | UNKNOWN | Round 1 probes PASS, 0 pinned spans, both passes. Round 2 was not played, so the pin is not cleared. | Lane 6 (`survivalArena`) + local integration if a later span names a solid |
| tumble | PASS | Longest 0 s on both passes. | — |
| player_ship | FAIL | Idle: 8.2% of frames (105/1278) are a resolving marker from sim 1.5 s (`loading`, then `compiling-pipelines`). Active round 1 was 0/381 before the close. | Lane 6 (`assetResidency.js`, `crucibleWarmPackageResidency.js`) |
| lod_churn | FAIL | Idle 2.61/s (cap ≤1/s). Active round 1 was 0.7/s. | Lane 6 (`src/render/lod.js`) |
| popping | FAIL | Idle 275/min. Active 31.7/min. | Lane 6 (residency / streaming) |
| readability | FAIL | Idle separation 0.26. Active separation 2.1 still FAILs: enemy 67% of samples have ΔL < 8, and `station:plate` sits over the ship. | Lane 6 (enemy and room look) |
| vfx_coverage | FAIL | Threats hidden p95 100% on both passes. Idle combat p95 34%. Active combat p95 11%. | Agent 3 (presentation) + Lane 6 (Swarm VFX) |
| backdrop_coverage | FAIL | Idle: threats on a bright backdrop p95 40%. Active round 1 PASS at 25%. | Lane 6 (arena look) |
| loadout | PASS | 0 irrelevant offers on both passes. | Lane 6 (crucible / loadout UI) |
| frame_time | UNKNOWN | Software GL. Graded only with `--headed` on a GPU. | — |
| round_transitions | UNKNOWN | Round 2 was not played. The active verdict prints FAIL because an unmeasured gate check is FAIL. That line is the browser close, not a pin. | Lane 6 + local integration, once a round-2 start is on disk |
| rounds_reached | FAIL | Active stopped at round 1. The gate requires round 3. Cause: browser closed. | This harness for the close. Lane 6 if a later run dies in-game before round 3. |

## Not a `--gate` pass (UNKNOWN, not PASS)

These are not measured. Do not read an older first-generation verdict below as this gate.

| run | status | reason |
|---|---|---|
| Swarm round 2 after `6b67d1fb1` | UNKNOWN | Active seed 4242 closed in round 1 on `9e647c306`. The 07:24 queue acquired the lock and died before Chromium (`uv_cwd`: the process directory was replaced while it waited). The replacement queue on `debe715c8a` waits on `player-truth.lock` (one Chromium): `--gate=active --wall=50 --evidence --tag=seed4242-r2`. |
| Hull × viewport matrix (960 / 1280 / 1920 × unlocked hulls) | UNKNOWN | Not run. Same queue, after the round-2 re-run. `player_ship` names a rectangle or an invisible ship. |
| Gauntlet `--gate` | UNKNOWN | Not run. Same queue, after the matrix. The first-generation arena rows below are not a `--gate` pass. |
| Adventure `--gate` | UNKNOWN | Not run. Same queue. The 150 s cruise below is not a `--gate` pass. |
| Racing `--gate` | UNKNOWN | Not run. Same queue. The 75 s Textile Belt row below is not a `--gate` pass. |

## Owning lanes (rebased onto `debe715c8a`, 2026-10-12)

Room pin, the station toy, and LOD/residency: **Lane 6** (`codex/swarm-crucible-overhaul` — `survivalArena`, `src/render/lod.js`, `assetResidency.js`, `crucibleWarmPackageResidency.js`). Collision resolve if a ship is still held inside a solid: **local integration** (`codex/starter-integration`, flight/physics under `src/runtime/**`). Master already shipped Lane 6's clearance (`6b67d1fb1`, a room solid is pushed until it clears the hull by 24 u) and a presented-LOD swap cap (`68da0fae3`, `d3e7d8dcc`). The v2 rows below were measured **before** that clearance (harness commits `a0b854c91`, `07e4eda14`). They stay as the reproduction that made the pin a number. Post-clearance round 2 is still unmeasured, including on `debe715c8a`. UI polish #301 does not move this split.

### Remount after the clearance (`5e1f24156`, 2026-10-12)

`npm run player-truth -- --mode=swarm --arena="Ricochet Foundry" --gate --evidence --tag=master`. SwiftShader, 960x540. The door's seed field was not fillable, so both passes played the door seed **73311**, not the requested 4242. Evidence: `swarm-ricochet-foundry-idle-master/`, `swarm-ricochet-foundry-active-master/`.

Idle pass finished (363 s wall, 46 sim s, round still active at the duration cap). Pre-clearance idle on seed 4242 died at 13.2 s.

| check | pre-clearance idle (4242) | this idle (73311) |
|---|---|---|
| kills_before_input | FAIL 9 | FAIL 12 |
| reward_before_input | FAIL +4041 | FAIL +2839 |
| spawn_motion | FAIL 13 bodies | PASS 0 |
| player_ship | PASS | PASS |
| loadout | FAIL 5 irrelevant | PASS 0 |
| lod_churn | FAIL 5.34/s | FAIL 1.8/s |
| popping | FAIL 307/min | FAIL 116/min |
| readability | FAIL 0.69 | FAIL 0.93 |
| vfx_coverage | FAIL threats p95 100% | FAIL threats p95 100% |
| backdrop_coverage | PASS | FAIL threats p95 100% |
| player_control | UNKNOWN (dead before probes) | PASS 0 pinned |

Active pass on seed 73311 is **not a round-2 measurement**. The page closed at 25.6 sim s of round 1 (1616 s wall) after a SwiftShader stall (sim 6.4 → 10.5 across ~22 min, 0.1 fps). `rounds_reached` and `round_transitions` FAIL because the browser died, not because the ship was pinned. Before the close: `player_control` PASS (0 pinned), `spawn_motion` PASS, `reward_before_input` PASS, `readability` PASS 3.24, `loadout` PASS, `player_ship` FAIL 0.6% (5 frames, resolving marker / `compiling-pipelines` at 1.5 s), `popping` FAIL 30/min, `vfx_coverage` FAIL (threats hidden p95 100%), `backdrop_coverage` PASS (threats p95 20%).

### Remount on the requested seed (`9e647c306`, 2026-10-12)

The seed row sits below the fold at 960x540. `9e647c306` scrolls it into view and checks the field value, so both passes below record seed **4242** (the 73311 remount did not). Command: `npm run player-truth -- --mode=swarm --arena="Ricochet Foundry" --gate --evidence --tag=seed4242`. SwiftShader, 960x540. Evidence: `swarm-ricochet-foundry-idle-seed4242/`, `swarm-ricochet-foundry-active-seed4242/`.

**Idle 4242: overall FAIL.** 2059 s wall, 41.5 sim s, stopped after 1 round. `round_resolution` PASS (shortest 41.1 s); the pre-clearance idle on this seed died at 13.2 s. `player_ship` / `lod_churn` / `popping` / `readability` / `vfx_coverage` / `backdrop_coverage` FAIL. `kills_before_input` and `reward_before_input` now PASS (0 kills, +0), improved vs pre-clearance (FAIL 9 / +4041) and vs the 73311 remount (FAIL 12 / +2839). Also PASS: `spawn_motion` 0, `player_control` 0 pinned, `loadout` 0. `player_ship` regressed vs both earlier idles: 8.2% of frames (105/1278) are a resolving marker (`loading` from sim 1.5 s, `compiling-pipelines` from 2.7 s). `lod_churn` 2.61/s (per-entity max 3/10 s, on the cap). `popping` 275/min. `readability` min separation 0.26; enemy 76% of samples have ΔL < 8; `station:plate` sits over the ship in 21% of 34 samples. `vfx_coverage` threats hidden p95 100% (combat p95 34%). `backdrop_coverage` threats on a bright backdrop p95 40%.

| check | pre-clearance idle (4242) | remount idle (73311) | this idle (4242) |
|---|---|---|---|
| kills_before_input | FAIL 9 | FAIL 12 | PASS 0 |
| reward_before_input | FAIL +4041 | FAIL +2839 | PASS +0 |
| spawn_motion | FAIL 13 bodies | PASS 0 | PASS 0 |
| player_ship | PASS | PASS | FAIL 8.2% resolving marker |
| loadout | FAIL 5 irrelevant | PASS 0 | PASS 0 |
| lod_churn | FAIL 5.34/s | FAIL 1.8/s | FAIL 2.61/s |
| popping | FAIL 307/min | FAIL 116/min | FAIL 275/min |
| readability | FAIL 0.69 | FAIL 0.93 | FAIL 0.26 |
| vfx_coverage | FAIL threats p95 100% | FAIL threats p95 100% | FAIL threats p95 100% (combat p95 34%) |
| backdrop_coverage | PASS | FAIL threats p95 100% | FAIL threats p95 40% |
| player_control | UNKNOWN (dead before probes) | PASS 0 pinned | PASS 0 pinned |

**Active 4242: overall FAIL.** Not a round-2 measurement. The browser closed mid-run at 11.2 sim s of round 1 (1370 s wall). `route` / `rounds_reached` / `round_transitions` FAIL as a harness crash (`page.evaluate: Target page, context or browser has been closed`); `round_resolution` FAIL because the gate counts that unmeasured win as FAIL. Round 2 is still unmeasured. Before the close: `popping` / `readability` / `vfx_coverage` still FAIL; `player_ship` / `lod_churn` / `kills_before_input` / `reward_before_input` / `spawn_motion` / `player_control` PASS. `backdrop_coverage` PASS (threats p95 25%). Readability's min separation is 2.1 (clears ≥ 1); the FAIL is low contrast (enemy 67% of samples ΔL < 8) plus `station:plate` over the ship in 27% of 11 samples. `popping` 31.7/min. `vfx_coverage` threats hidden p95 100% (combat p95 11%). `player_ship` 0/381 bad frames. `lod_churn` 0.7/s. 0 pinned spans. The pin-after-clearance question stays open.

## v2 gate (2026-10-12) — round 2 and beyond

The table below is the **pre-clearance** reproduction (harness commits `a0b854c91`, `07e4eda14`, seed 4242). Lane 6 then shipped `6b67d1fb1`. Post-clearance numbers are the remounts above. Round 2 after that clearance is **still unmeasured**: the seed-4242 active pass died in round 1 when the browser closed. Do not read a pre-clearance REPRODUCED row as a result after `6b67d1fb1`.

`npm run player-truth -- --mode=<mode> --gate` runs an **idle pass** (no input for 40 s: passive kills, reward,
spawn motion) and an **active pass** (the scripted fighter plays from 3 s with public mouse aim/fire and W/S/A/D, and
must reach round 3). Round starts are sampled densely: control probes, ship model/LOD, tumble and hull in the first
8 s of every round (`round_transitions`). In gate mode UNKNOWN on `player_control`, `tumble`, `player_ship`,
`round_resolution` or `round_transitions` is a FAIL ("not measured"). `frame_time` stays UNKNOWN on software GL. No
invulnerability: the only toggle is the physics-lab practice rack, which Swarm and Gauntlet do not offer.
`vfx_coverage` now grades combat VFX only (a per-pixel diff with backdrop layers hidden). Starfield, nebula and
planet layers are graded separately as `backdrop_coverage`.

| Owner saw (round 2) | v2 result on master (Crucible · Ricochet Foundry · seed 4242 · 960x540 SwiftShader) | Evidence | Owner |
|---|---|---|---|
| Could not move next round | **REPRODUCED (pre-clearance)** — every round-2 start the fighter reached is pinned. At 66 % hull: W held 1.7 s reads 47 u/s, ship moves 1.5 u of 93 u; pinned 62.5–64.5 s (175 u implied, 21 u moved). At 97 % hull (another run): 168 u/s read, 1 u of 180 u moved, pinned 22.2–24.7 s. Not damage-dependent: it follows the round start. **Cause seen in the trace:** in every pinned span the ship sits 0–2 u from a solid room toy (`station:furnace`, `survivalArena._materializeRoom`) or an asteroid, i.e. the round-2 room solids materialize on top of the player (`player_control` / `round_transitions` now name the body). Gate active pass, 100 % hull: W held 1.4 s reads 141 u/s, ship moves 1.2 u of 179 u; pinned 45.5–47.6 s 1 u from `station:furnace` | `swarm-ricochet-foundry-round2-damaged/`, `swarm-ricochet-foundry-gate-active/` | Lane 6 (arena room placement, `survivalArena`) + Local integration (collision resolve) |
| Things shot at him, he died | **REPRODUCED** — killed 7.3 s into round 2 while pinned ("Wasp Swarmer killed you on wave 2") | same | Lane 6 |
| "Told I WON" fast | **REPRODUCED (active)** — round 1 won in 18.4 s (< 20 s) with the fighter playing (Ricochet Runner, 960x540) | matrix run | Lane 6 |
| Round-2 passive kills | **REPRODUCED** — 2 hostiles killed by asteroids in the first 0.3 s of round 2 before input | matrix run | Lane 6 |
| Own ship disappears, LOD replaces it | **REPRODUCED (round start)** — the player ship is a "resolving marker" (asset `compiling-pipelines`, `DIRECT_AUTHORED_ADMISSION`) for its first frames, then swaps to `GLTFKIT_ship_hornet@lod0`; in the gate's active pass the world and ship were unrendered for ~13 s of round 1 (7 % of frames bad) | `swarm-ricochet-foundry-gate-active/` | Lane 6 (assetResidency / crucibleWarmPackageResidency) |
| White geodesic sphere | **CLASSIFIED** — a `station`-type entity (`station:furnace` in the gate run): one of the arena room's solid toys (`survivalArena._materializeRoom`), lit Lab ≈ [46, −4, −9] (grey-white), r ≈ 40 px, **over the player ship in 28–39 % of samples**. Play-space geometry, not backdrop; reads as neither enemy nor asteroid. `readability` lists it as an offender | `verdict.json` → `readability.census` | Lane 6 (arena room look) |
| Orange blobs | **CLASSIFIED** — enemy `ship:` entities (lit Lab ≈ [39, 8, 9], "orange") and `wreck` bodies; enemy-vs-asteroid separation 0.66–0.75 (≥ 1.0) | same | Lane 6 (enemy look) |
| Tumbling | **NOT REPRODUCED** — longest out-of-plane/uncommanded spin 0.1 s across all round starts measured | — | — |
| Rectangle ship | **UNKNOWN** — the hull × viewport matrix has not been run. A spawn-only pass can miss a round-2 rectangle, so this is not a PASS. | — | Lane 6 once a combo is measured |

Round 3: **not reached in the pre-clearance runs.** The fighter cleared round 1, and the round-2 pin killed it. `rounds_reached` FAILs
honestly (round 2); no round-3 coverage is claimed. After `6b67d1fb1`, round 2 itself is still unmeasured.

<!-- V2-GATE-RESULTS -->

<!-- V2-MATRIX -->

## Hull × viewport matrix (UNKNOWN, not run)

The rectangle / invisible ship was reported as hull- and viewport-dependent. No combo has a verdict, so the result is UNKNOWN, not PASS. It stays behind the seed-4242 round-2 active gate. The CLI already repeats one combo at a time. This command is **not** `--gate`: a gate active pass forces rounds ≥ 3 and duration ≥ 300 sim s, which would throw away the 12 min wall. `player_ship` grades the rectangle, the invisible ship, and the resolving marker. Four unlocked fresh-profile hulls × three viewports = 12 combos. Evidence lands per finished combo (a killed run still keeps the combos that finished) at `design/program/player-truth/swarm-ricochet-foundry-<hull>-<viewport>-matrix/`.

```
npm run player-truth -- --mode=swarm --arena="Ricochet Foundry" --hull=all --viewports=960x540,1280x720,1920x1080 --rounds=2 --idle=3 --duration=70 --wall=12 --evidence --tag=matrix
```

Order: 960, then 1280, then 1920. `--rounds=2` is there because a spawn-only pass can miss a round-2 rectangle. Start it only when `/workspace/orchestra/state/locks/player-truth.lock` is empty and load1 is under ~8, with one headless Chromium. Gauntlet, Adventure and racing `--gate` wait on the same lock and load. The first-generation verdicts for those modes are not `--gate` passes. The acceptance command stays `npm run player-truth -- --mode=swarm --gate`.

## First-generation verdicts (PR #288)

### Owner's 2026-10-11 Swarm report — what reproduced

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

Gauntlet `--gate` is **UNKNOWN**. It has not been run. The rows below are an earlier non-gate pass, not a PASS of the gate.

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

Adventure `--gate` is **UNKNOWN**. It has not been run. The cruise below is not a `--gate` pass and is not a PASS.

`npm run player-truth -- --mode=adventure --duration=150` — **INCOMPLETE** (no FAIL). 150 s cruise, seed 4242
(no seed field on this route; the default start is deterministic). Ship, control, tumble, popping and VFX PASS;
on-screen LOD churn 0.03/s PASS. Readability UNKNOWN: only 1 hostile and 0 asteroids on screen in the first
150 s, so there is nothing to separate. Tutorial strip read `TUTORIAL 1 / 12` for 135 s of
free flight. Contact sheet: `adventure/contact-sheet.jpg`.

## Racing (main menu → Circuits → first course Textile Belt → Race → confirm "Launch circuit")

Racing `--gate` is **UNKNOWN**. It has not been run. The circuit below is not a `--gate` pass and is not a PASS.

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
