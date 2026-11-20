# 12 — The studio: who builds, how work lands, and the live board

**Director, 2026-11-20.** The owner put one session in charge of a multi-day, full-coverage facelift:
*"orchestrate agents broadly across the game to polish and improve it… you're in charge and
responsible for the overall quality of the output at the end."* This page is how that runs. The
board at the bottom is the live state.

## 1. Who does what

| Agent | Takes |
|---|---|
| **Director** (Claude Fable) | Sets direction, writes every brief, reads every change before it is pushed, looks at every visible change on screen, fixes the small things, keeps this board. |
| **Department leads** (Claude Opus subagents, about four at once) | One per area below. Each first diagnoses and plans, then builds its own plan in slices with its context intact. |
| **Sonnet subagents** | Breadth over depth: wide document or asset sweeps, batch reviews. |
| **Devin SWE-2 Max** (`scripts/fleet/run.mjs <ID> devin3`) | The workhorse for scoped engineering with a named seam and a measurable result. Never taste. |
| **GLM 5.3 max** (`run.mjs <ID> glm`; zcode for a second seat) | Fully specified packets, audits, scripts, mechanical fixes. No vision. |
| **Gemini Neon** (`run.mjs <ID> neon2`) | A different mind: second opinions, fresh-eyes critiques of frames, frontend proposals. |
| **deepseek v4.1 Flash** (`run.mjs <ID> deepseek`) | Reading frames aloud where GLM cannot see. |

Frontend is built by the director or Gemini Neon and judged by the director. Everything that lands
is reviewed by the director or an Opus lead.

## 2. How a change lands

The working copy and `master` are the same thing again (checkpoint 9b3b0f1930, 2026-11-20), so the
line is short.

1. **Brief.** The director writes it: the player-visible result, the files, how it is proven.
   Outside agents get theirs as `design/program/fleet/packets/<ID>.md`.
2. **Build.** The builder edits its files, runs its checks and commits its own files by exact path.
   It does not push.
3. **Review.** The director (or the area's lead) reads the commit, opens the frame if anything is
   visible, and fixes forward or reverts. A finding blocks only if the change breaks the game, a
   test of something still wanted, or its own claim.
4. **Publish.** The director pushes by merge. Never rebase, never force.
5. **Board.** The row below moves.

Two builders never share a file at the same time. If a build needs a prerequisite, the builder or
the director does it then and there.

## 3. Departments

| Lead | Owns | The owner's complaint it answers |
|---|---|---|
| `engine` | The clock between simulation and picture; the cost of a simulation step | "It freezes locations of all objects until a blip moves them" |
| `streaming` | Models arriving on screen: admission, stand-ins, levels of detail | "I crash into nothing and then a model appears" |
| `ai` | Enemy brains, senses, the enemy roster and composed encounters (R19) | "Tons of units with complex behaviour instead of something basic… each enemy should have its own character" |
| `combat` | What guns, powers and the Line do; the control scheme | "The weapons don't really work the way I'd think… my actions don't do what I'd expect" |
| `swarm` | The Swarm run loop: getting in, round size and pace, money, upgrades, the end of a run | "The addictive slam-bang… advance quickly and splay out into a branch of the tree" |
| `world` | What persists off screen, rock regrowth, who populates a sector, the first five minutes | "Not respawn instantly, not depopulate the galaxy… some places feel overcrowded" |
| `adventure` | Work, trade, mining, the rover, building inside rocks, drones, prices | "You'd progress naturally from labor to capital deployment" |
| `vfx` | Powers, weapons, impacts, explosions | "A blurry blanket, not a cool real VFX" |
| interface (director + Gemini Neon + GLM) | HUD, power bar, words, screens | "I can't tell what any of the powers do… gibberish language" |
| `plans` | The index of every unbuilt or unwired plan (`.devshots/director/fable/plans/INDEX.md`) | "Work that sat done for weeks and was never wired up" |

Added 2026-11-20 (later), from the owner's second brief (R19–R24):

| Lane | Owns | The owner's words |
|---|---|---|
| maps | The minimap and the big chart | "The minimap looks really cool, I wish we could make it even cooler… the big map might need an upgrade too" |
| cargo | The hold as a bag of stacking slots; drag out to jettison (R22) | "Packs of 20 items stack and then take a new slot… dragging it out of the bag drops it" |
| economy | Prices from stored curves and events, off the flight step (R20); trading as its own game (R21) | "Realistic price swings from events… a gold rush for a while until an event happens" |
| menus | Every menu and station screen; how the skill tree works | "There's probably a lot about the UI and the menus that we could upgrade, or the way the skill tree works" |
| harmony | Everything that moves the player's ship or the camera, and every trigger (R23) | "My ship would be swinging weird ways and the camera would move weird sometimes" |
| backlog | The rated plans in `plans/INDEX.md` and the build map, wired first, built second | "There's more plans in the build map I think to do" |

Still to open: the Foundry set's drawing cost, stations, the story's first hour, sound. Instanced
hulls for hundreds of ships is dropped (R19).

## 4. The measure

Taken on a quiet machine before any agent was running (2026-11-20, working copy = 9b3b0f1930):

| Measure | Now | Target |
|---|---|---|
| Adventure new game, 170 s of flight: world speed against the clock | 0.93 (one ten-second stretch at 0.46) | 1.00, and never visibly below |
| Same flight: frames per second | 35 average, swinging 9–57 | steady 60 |
| Same flight: visible freezes (no new positions for over 0.35 s) | 5, longest 3.6 s | 0 |
| Same flight: simulation step in the worker | 8.6 ms median, 13.6 ms at the 95th percentile | under 8 ms at the 95th |
| Swarm wave 15 headless: simulation step | 9.5 ms mean, 14.8 at the 95th, 58 worst | under 8 ms at the 95th, worst under 16 |
| Enemies attacking at once in a late Swarm round | 11 ships (plus brood bodies) at wave 15 | dozens, in composed groups, as many as hold a smooth frame (R19); measured, not assumed |
| Boot check (`npm run check:playable`) and replay (`npm run check:sim`) | 18/18 and green at the checkpoint | stay green |

Probes: `.devshots/director/travel-probe.mjs` (through the game lock) and
`node scripts/sim-crowd-stress.mjs --ticks=600 --warmup=240`. Numbers taken while agents are working
are not comparable to these: the same build measured 22.6 ms a step last night under load.

## 5. Board

| ID | What the player gets | Builder | State |
|---|---|---|---|
| CHECKPOINT | `master` is the game the owner actually runs | Director | **Landed** 9b3b0f1930 (code), 62539fd891 (assets), 1db5ddcbf0 (plans) |
| FRONT-DOOR | One rule; old queues, holds and claims boards are history; the modern-technique bar | Director | **Landed** e027b513ad, d480208bdb, eabea3daac |
| RULINGS | R13–R18: the horde, senses, calm populated sectors, powers that say what they do, plain words | Director | **Landed** 249f4c74b3 |
| ENGINE-1 | The picture never holds dead and never teleports; corrections ease | `engine` | Building (after: smooth slow-down under load, spikes, predicted player ship) |
| AI-1 | Enemy kinds with one job each, cheap pack brains, no attack cap, composed encounters (R19) | `ai` | Building (S0 landed 3ab03c4d4b; S1 parked, resumes re-scoped) |
| WORLD-1 | A calm harbour opening; no silent respawn or empty sectors; rocks that visibly regrow | `world` | Building slices 0–3 |
| COMBAT-1 | Every verb does what its name says; one input rule; Pin, Bomb and Plow fixed; real keys | `combat` | Investigating, then building |
| SWARM-1 | One press to round 1; no shop every round; one money; rounds built from composed waves (R19) | `swarm` | Building (slice 2 half done, uncommitted) |
| ADV-0 | The owner's Adventure ladder audited rung by rung | `adventure` (Sonnet) | Investigating |
| STREAM-0 | Why nearby ships and rocks never get their real model; the rule that makes it impossible | `streaming` | Investigating |
| VFX-0 | Why effects read as a blanket; the replacement technique, power by power | `vfx` | Investigating |
| PLANS-0 | Every unbuilt and unwired plan, ranked | `plans` (Sonnet) | **Done**: 9 unwired groups, ~110 unbuilt plans, 29 blocking rules |
| UX-FRESH-EYES | Where a stranger gets lost; the ten changes that fix it | Gemini Neon | **Done**: `.devshots/director/fable/ux/FRESH-EYES.md` |
| HUD-POWER-BAR | Six tiles that explain themselves; a quiet flight screen; edge chevrons | Gemini Neon | **Landed** f10cd0fe03 (bench stills judged; live frames still to judge) |
| COPY-SWEEP | Plain English and human units everywhere; a check that fails on jargon | GLM | Four batches landed (df01ea648d, 8bc22b0484, 0f5a510731, c7aef99cfe); run died on an API error; COPY-SWEEP-2 finishes it |
| DOCS-HYGIENE | The 29 leftover "wait / hold / get review" rules removed from other documents | GLM | **Landed** 9d0c514ae8, 84f0800472, 5fd218b028 |
| PERF-09 | Three repeated costs out of every simulation step | Devin | **Landed** 6ff08d5ac8 |
| ASSET-COST-AUDIT | What every model costs to draw, and which cost too much | GLM | **Done** 930259fa2f |
| TEXTURE-DOWNSIZE | Small props stop carrying big textures (about 94 MB of graphics memory back) | GLM | **Landed** 81f649ede9, 9bae17b8dd |
| STREAM-BUILD-1 | A body you can hit is a body you can see: nearby ships and rocks jump the model queue | Devin | **Landed** fdc58b8503, 2b4ae4d07b, 8954fd5c79 (probe passes; director to watch it in play) |
| ROCK-LOOK | Fractured rocks in stone, iron, ice and crystal; no painted ships in the sky | Gemini Neon | **Landed** 544d361c22; iron rocks still read as blurry foil, second pass queued |
| DRAW-COST-1 | Ships draw at the detail their size on screen needs, without a blink | Devin | Building |
| BUG-SWEEP-1 | Wrong-behaviour bugs, one commit each | zcode | Two landed (ccf2c47460, 1a3b4cb5d1); the seat times out at 30 minutes a turn, so jobs for it stay small |
| RULINGS-2 | R19–R24: composed encounters, the economy, the ladder, the cargo bag, one hand on ship and camera, the finish line | Director | **Landed** 295689c58b; design in `03` §9A and `06` §2.1, §5.4, §5.5 (0d4987862c) |
| CAPTURE | One command plays each mode's opening and records frames, smoothness, words and findings (the R24 measure) | Devin | Queued behind DRAW-COST-1 |
| HARMONY-AUDIT | Every system that moves the player's ship, the camera or the keys, and the ten worst clashes | GLM | Running → `.devshots/director/fable/harmony/AUDIT.md` |
| ECON-AUDIT | What the economy costs in flight; today's price formula; a sized proposal for R20 | GLM | Running → `.devshots/director/fable/econ/AUDIT.md` |
| CARGO-AUDIT | How the hold works today, and the slot model that replaces it | zcode | Running → `.devshots/director/fable/cargo/AUDIT.md` |
| COPY-SWEEP-2 | Tests repaired to the new wording; remaining batches; one unit for distance | GLM | Running |
| MAPS-1 | The minimap as the hero instrument: sweep, role glyphs, the room drawn, rings, breathing range | Gemini Neon | Running |
| MAPS-2 | The big chart: a real survey of the sector, decision layers on the galaxy, four tabs not nine | Gemini Neon | Queued behind MAPS-1 |
| SCREENS-1 | The station: an arrival page with one service button and five doors; market as a trading desk | Gemini Neon (second seat) | Running |
| SCREENS-AUDIT | Every other screen shot, measured, scored 1–5, grouped into jobs | DeepSeek (vision) | Running → `.devshots/director/fable/screens/AUDIT.md` |
| ROCK-LOOK-2 | Iron that reads as iron; crisp Foundry debris; the stray white card removed | Gemini Neon | Queued behind MAPS-2 |
| HUD-2 | Eight leftovers on the flight screen (stray box, mixed units, crawl, chips, ship panel, round card, prompts, shop cards) | Gemini Neon | Queued behind ROCK-LOOK-2 |
| PERF-AB | Old build against new, flown alternately on the same machine, so the frame-rate change is attributed and fixed | `engine` | First job at the next Claude window (today's re-flight read 23 fps against 36, under 75 % outside load: not comparable) |
| PROGRESSION | One Pilot Tree for both doors, nine branches, built out and on one screen (`06` §2) | new Opus lead | To open |
| ECON-BUILD | R20 prices and the trading game, from the audit | Opus lead or Devin | To open when the audit lands |
| CARGO-BUILD | R22 the bag: simulation side, then the screen | Devin, then Gemini Neon | To open when the audit lands |
| BACKLOG | A-rated and finished-but-unwired plans from `plans/INDEX.md`, wired before anything new is built | Sonnet | To open at the next Claude window |

Queued behind these, from the plans index: wire the five finished encounters sitting on
`codex/pro-five-integration` (TOWJAW, GLASSWAKE, SWITCHBACK, BLACKBOX RUNS, Kinetic Catalysts) once
the population owner exists; the live bugs left in `.dev/pr-expansion/HANDOFF.md`; the Foundry set's
cost, vanishing furnace casing and Shadows Off bypass; instanced enemy hulls; the Katamari line
(a run rating that grows with impact kills; everything breaks down a tier); boss plates the Line can
rip off; the enemy "Mind" shown on screen.

## 6. Landed before 2026-11-20

Every row below that reads **Parked** is on `master` (merged with 3474e87069 or the 9b3b0f1930
checkpoint). The lit Foundry (OVH-03a) is live with its defects open.

**2026-11-20, owner rule: no holds.** Finished work is never parked waiting for a reviewer: the director reviews it (with agy2 as the second eye when it is free) and lands it. Red master (callers importing uncommitted pieces after sweep commits) is repaired on sight: 96d40380cc, 65b2046fbd.

**2026-11-20 05:30: the Pilot Tree chain LANDED on master as 3474e87069** — OVH-01a/a2/b/b2/c1/c2/c2b/c3, OVH-06a, OVH-06b, OVH-08a + fix, PT-FIX-A, PT-FIX-C, CW-WPN (14 commits of park/pilot-tree merged onto master; 30 skills live). 787 test files on the merged tip vs master: 0 new failures after one pinned-curve test followed the retune; key tests 159/159 on the landed master; check:sim matches its (re-recorded) golden; every core module loads. agy2 delta re-review running in parallel; findings are fixed forward.

| ID | What the player gets | Builder | State |
|---|---|---|---|
| SHARP-01 | A sharp picture: integrated graphics draw at the screen's native pixels | Director | **Landed** e9b9ab5118. GPU timers (2×2, owner's laptop, Low): native costs ~3 ms in a plain arena (9.5 vs 6.4 ms) and nothing measurable with the Foundry; 30 Hz holds either way. |
| T2 | No flat brown fog cone ahead of every ship | Director | **Landed** fbdf528e84 |
| T1 + T1C | The rope never refuses; TOW / TUG / ANCHOR; briefs teach it | Director + Sonnet | **Landed** 343cd4f569 |
| T3/T4 + B2C | Fodder take a thrown hull; the starter pistol hits like a gun | Director + Sonnet | **Landed** fb79e4172d |
| LOOK-THREAT | Enemies read as lit hulls; the 2D emblem only on your target and bosses | Sonnet | **Landed** 0e10e3f29d |
| Front door (B3, B3C, T8C, OVH-04b) | No First-light modal; one-press calm preset; Swarm/Gauntlet and death words; the run's own pause menu | Director, zcode, Sonnet | **Landed** 5a0ca1eb0d |
| W3 = OVH-04 + OVH-09a | A Swarm run in its own space (load 43.1 → 38.8 s); loose rocks rest; every spawn clear | Codex, Devin, Sonnet porter, deepseek fix, director | **Landed** 638aa087ad (2026-11-20) with W3-fix + two director fix passes (agy2 review + delta re-review: Swarm/Pit plants stay live, impound pad seats against its yard, frozen arrival points, law reserves keep their witness-frame slot). 163 files / 1,610 tests vs master: 0 new failures; check:sim unchanged. |
| OVH-03a | The Ricochet Foundry as a lit set: factory deck, conveyors, furnace light, one shop-light shadow | Codex | **Parked** on top of W3. Frames: a dramatic step from black space. **Cost: ~17–20 ms of GPU per frame** (6–9 → ~26 ms, measured): holds 30 Hz, no room for 60. Before landing: cut the cost, fix the furnace casing that vanishes in some frames, respect Shadows Off. |
| OVH-08a | Every gun measured on damage against kick | zcode | Built. Review found three bench errors (cadence rounding, the mortar lifecycle, a 121-tick probe); fixed by OVH-08a-fix below. |
| OVH-01a | The Pilot Tree engine: 81 nodes (with the Conjurer bends), banked picks, the three-card draw | zcode | **Parked** on `refs/heads/park/pilot-tree` (the harvest dropped another agent's refund ledger). Clean-HEAD: 254 pass, the same 12 pre-existing failures; check:sim unchanged. Its XP-curve retune is live in the working folder. |
| OVH-01a2 | The route: the sim deals a hand the moment a pick is banked (never the screen); the screen asks by intent and hears refusals in words; only built nodes are dealt (`src/data/pilotLive.js`) | zcode | **Parked** 2a72ed65ff on `park/pilot-tree`. Director: zcode's editor flipped 146 LF lines of the mixed-ending `runSession.js` (restored line by line from the snapshot, `eol-restore.mjs`); the event surface regenerated from exactly the parked tree (`regen-surface.mjs`). |
| OVH-01b | Level up without a pause; three cards in the breath [FE] | Sonnet (`cards`) | **Parked** e59a2a8855 on `park/pilot-tree`. Frames seen (the cards read at a glance; capstone and evolution frames distinct). Director fixes: the overlay's key listener leaked per open; the cards now say the owner's refusals. No new failures against the engine alone (same 92 pre-existing). Not yet seen in a played round. |
| OVH-01b2 | The cards rise over a **paused** round end (found in a played round: the HUD tick stops while the draft pauses the game) | Director | **Parked** 182de3406d. Re-played on the ordinary route (seed 4242): level 5 in round 1, four picks over the draft, the draft revealed after, Ballast read live in round 2 (mass 40 → 52), no page errors. |
| OVH-01c1 | Skill effects — the body: Juggernaut (8 live) and the Bruiser kick chain on one kick stamp (6 live) | Devin `devin3` | **Parked** 94e592ca71. Director: Last Stand caps the hull LEVEL at 30 % (a lifetime ledger let it go dead); `juggernaut_unstoppable` left OFF (the player already never loses the helm to a contact — needs a new effect); `gunFamilies.js` (OVH-08a data) rides along because Heavy Slugs reads it. 4006 tests, no new failures. |
| OVH-01c2 | Skill effects — the rope and the powers: Long Reel, Quick Latch, Sweet Spot, Crane, Second Line, Whip Snap; Quick Cast, Wide Bore, Echo, Combo (10 live) | zcode `sess_94991cd7-4ec5-4a45-bffe-b399af9a1d5f` | **Parked** fa663feb9c (on OVH-06a; shares `tetherGameplay.js`). A vm-harness test was handed the new reach helper. Left OFF: `rigger_free_hand` (no latched aim penalty exists), `conjurer_deep_cast` (reads the hold from the presentation grip — zcode resumes at 18:04 EST to carry the hold in the recorded input). Until then a Conjurer cannot reach Echo/Combo. |
| OVH-01c3 | Skill effects — the guns: Hollow Point, Steady Hands, Drum, Spin-Up, Execution, Ricochet (6 live) | Devin `devin3` | **Parked** f34db8ae68. 4037 tests, no new failures; check:sim unchanged at the tip. **30 nodes live** across Gunner, Bruiser, Rigger, Conjurer, Juggernaut. Chain tip fa663feb9c: 113/113 skill-tree tests, check:sim unchanged. |
| OVH-06a | The camera answers only you: one cause-tagged gate; hard hull blows kick toward the hit side with a red edge pulse (static tint under reduced motion); hitstop only on hero beats, presentation-only — every Swarm sim slow-mo removed; damage numbers default off | Sonnet (`feel`) | **Parked** a7e5979cbe. Ported onto HEAD by its builder; 12 old-law collision tests moved to R10 (camera assertions only); 5,922 tests, no new failures; check:sim unchanged. Two editor EOL flips caught by `commit-eol.mjs` and fixed before push. Watch: the edge pulse is a full-screen blended layer (perf on integrated GPUs). |
| OVH-01c4 | The rest of the tree: the bends (with OVH-05), Coupler (OVH-07), cue line, energised stamp, plough, stealth (OVH-15) nodes, capstones | — | Each node turns on for the draw only when its effect is built and tested (`pilotLive.js`). Open: Unstoppable needs a new effect; Free Hand needs a penalty to remove; Deep Cast (above); Shred, Both Hands, Gold Thread, Quick Vent (OVH-08b), Cue Sight, Bowling (energised stamp), Through and Through, Breaker Rounds, Dozer Blade, Hummingbird, Coupler, the capstones of Rigger and Conjurer, the bends (OVH-05), Ghost (stealth, OVH-15), Industry (Adventure). |
| OVH-08b | Guns tuned to the curve; heat as rhythm (feathering, per-mount lockout) | — | After OVH-08a |
| OVH-09b | Pilots brake for each other | — | **Hold:** another agent's crossing-brake work is in `src/ai/maneuver.js` |
| LOOK-THREAT-b | The gun-ready cue rides the hull (muzzle / running lights) now the emblem is gone | — | Review note (non-blocking) |
| HUD-TAG-01 | The hover tag never prints over a floor sign ("F · TOW" on THE CRATE card) | — | Seen in Swarm frames |
| OVH-08a-fix | The bench is honest: every gun measured, cadence, mortar and probe errors fixed | Director | **Parked** f31affc679 on `park/pilot-tree`. MISS list (OVH-08b's order): Flak/PD S, Railgun M, Bank Stream M, Autocannon S, Heavy AC M, Ironsong, Concussion S, Lighthouse, Heavy Beam L, Plasma Cone |
| OVH-06b | Hits read on the body: flash, spark, scorch, the 60/30/10 ladder | Sonnet (`feel`) | **Parked** 7f144eaa8f (chain tip). A/B frames: subtle on small hulls; follow-up sizes the flash and spark by screen size |
| INV-21…26 | Six audits: dogfight AI, guns and hits, Adventure's first ten minutes, the Swarm loop, places, the interface | deepseek, GLM | **Done.** Their findings are rows in `02` (A10–A15, B24–B31, C19–C27, D13–D19, G1–G9) |
| W3-fix | A Swarm run stays in its own space: the arena's own sky, no campaign plants, no impound-yard leak | deepseek | **Landed** inside 638aa087ad |
| CW-AI | Enemy pilots (INV-21 #1, 6, 7, 9, 10): the dodge tier table, flights, tighter packs, the press ring, the flee announce, the line-of-sight fire hold | deepseek | **Landed**: half swept by 5ce67ccf04, the rest (dodge ranks, Swarm flights, LOS hold, tests) 2154f25b33 |
| CW-WPN | Enemy aim quiver and turret slew (INV-21 #2, 4); recoil on the hull, not the camera (INV-22 #7) | deepseek | **Landed** with the Pilot Tree chain 3474e87069 |
| PT-FIX-A | Pilot-tree review blockers: Esc, the overlay across pause, Ram Plate shields, Execution, kick order, the XP curve (L14 at R10), plain card words | deepseek | **Landed** with the chain 3474e87069 (3,640 tests vs the parked tip: 0 new failures). Stagger's min impulse still open (weapons.js) → PT-FIX-B |
| PT-FIX-C | Rope and power blockers: rack-bomb Echo, Long Reel physics, Combo self-blast, the combo queue, free Bomb echo | zcode | **Landed** with the chain 3474e87069, Deep Cast (now live); Combo back in the deck; Second Line out (replaces the player's line) |
| CW-TELLS | Every attack tells 0.6 s ahead, every cue gets a chip, the lane paints for every doctrine (INV-21 #3, 5) | GLM | **Landed** 0a469ef672 (the clock was swept onto master without its tests — 18 attack tests were red; now 2, both pre-existing) |
| PLACES-1 | Sectors that don't share a sky; an arrival plate that names the place (INV-25 #1, 2, 7) | GLM | **Landed** 0fe665373c; frames judged by the director; plate moved to the upper-centre (it crowded the gauges) |

**Agents on hand (2026-11-19):**
- **Devin:** `acct1` and `acct2` report "Upgrade to Pro" for SWE-2 Max, and `acct4` needs an interactive login, so Devin runs on `devin3` only.
- **zcode:** runs two at once and resumes with `zcode -r <session>`.
- **Sonnet subagents:** resume with SendMessage after a limit.
- **OpenCode Go** (deepseek and GLM): has a **5-hour usage limit**, hit at 18:40.
- **agy:** `agy1` is out of credits, so reviews run on `agy2`.
- **Codex:** out until 2026-11-24 15:52. The owner authorised agy-fleet reviews in its place.
- **Watcher trap:** `watch-any.mjs --min=` counts bytes, and an `EXIT.json` is ~130 bytes. `--min=200` never wakes. Use the default.
