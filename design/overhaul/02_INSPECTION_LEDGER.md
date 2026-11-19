# 02 — Inspection ledger (running)

**Director, started 2026-11-18.** Every player-facing part of the game, what was actually seen, and
where its fix lives. This page is **updated in place** whenever a part is inspected again or its fix
lands; it is the coverage map that says whether "every part has been inspected and tuned".

## States — never mix them

| State | Meaning |
|---|---|
| **SEEN@sha** | The director looked at it on screen at that commit. Frame path given. |
| **SEEN-OLD@sha** | Seen on a frame older than a fix that claims to address it. Re-look before acting. |
| **CODE@sha** | Verified by reading code at that commit. Not yet seen on screen. |
| **CLAIMED** | Someone else's report, not verified by the director. |
| **OPEN** | Not inspected. The "How to inspect" column says how. |

Frame roots: `A7` = `.devshots/fleet/accept07/` (ACCEPT-07, HEAD 0c6f73de87, 2026-11-17);
`D1` = `.devshots/director/swarm-r3-head/` (director probe, HEAD 301d3fb074, 2026-11-18);
`B1` = UI bench stills shot by the director at 301d3fb074 (real DOM over a still, no game boot;
re-shoot with `node scripts/ui-bench.mjs --shot=<id>`).

Verdicts: **FAIL** (a stranger would notice), **WEAK** (works, below the bar), **OK**, **GOOD** (keep).

---

## A. Boot, title and menus

| # | Part | Evidence | State | Finding | Verdict | Fix lives in |
|---|---|---|---|---|---|---|
| A1 | Boot film | `A7/demo-swarm/01-intro-cinematic.png` | SEEN-OLD@0c6f73de87 | The captured frame is almost pure black: a ghosted logo and line-art at ~3 % brightness. The first thing a buyer sees reads as a black screen. Boot to title 38.5 s (FINISH-LINE, headed, Intel Arc). | FAIL | `08_INTERFACE.md` §2, `10_ENGINE.md` |
| A2 | First-run prompt "First light" | `A7/demo-swarm/02-prompt-first-light.png` | SEEN-OLD@0c6f73de87 | A modal titled "First light" with buttons USE FIRST LIGHT [ESC] / PLAY. Nobody outside the repo knows what it means. | FAIL | `08` §2 |
| A3 | Title | `A7/demo-swarm/03-mainmenu.png` | SEEN-OLD@0c6f73de87 | Two door cards (good). The live scene behind is murky: a large faceted brown low-poly rock that reads as a placeholder sits centre-right, the ship is half hidden, the frame is ~90 % near-black. | WEAK | `08` §2, `07` §5 |
| A4 | Swarm PLAY screen | `A7/demo-swarm/04-crucible.png` | SEEN-OLD@0c6f73de87 | **The key art is the best image in the game**: a warm-lit Foundry floor with trusses, conveyors and panel banks. Copy is jargon ("65% pressure", "Armory every round · Refit & boss every 10/5", TRAINING: OFF). | GOOD art / WEAK copy | `04_SWARM.md` §7, `08` §3 |
| A5 | Swarm match setup | `B1/crucible-door.png` | SEEN@301d3fb074 | 4 modes, 4 money purses, 9 arenas, zone, weekly challenges, "seed, perks, hangar & records" — before the first fight of a mode sold as instant. | FAIL | `04` §7 |
| A6 | Loading veil | `A7/demo-swarm/05-loading-r1.png` | SEEN-OLD@0c6f73de87 | Wireframe sweep with "SPACEFACE / Crucible / BUILDING THE SCENE" — an internal name on the player's screen. PLAY → first hostile 34–54 s cold (FINISH-LINE). | FAIL | `08` §2, `10` |
| A7 | Pause | `A7/demo-swarm/66-pause.png` | SEEN-OLD@0c6f73de87 | Orrery menu is handsome. It exposes DEV · SANDBOX, MEDIA · PHOTO/REPLAY/CLIPS and PHYSICS CHALLENGES to players; in Swarm it showed "Contract 47-A" (FIX-05 claims fixed). | WEAK | `08` §6 |
| A8 | Settings, Help/Controls, Credits, Achievements, Save/Load | — | OPEN | — | — | Inspect: `node scripts/ui-bench.mjs --shot=settings,help,credits,achievements,save-load --walk` then open every PNG |
| A9 | Controller, rebinding, reduced motion/flash | — | OPEN | — | — | Inspect: one sitting per doc 19 "How to check" |

## B. Swarm

| # | Part | Evidence | State | Finding | Verdict | Fix lives in |
|---|---|---|---|---|---|---|
| B1 | **The arena as a place** | `A7/demo-swarm/07-flight-start.png`, `D1/01-fight-open.png` | SEEN@301d3fb074 | In flight the "Ricochet Foundry" is black space with a nebula, scattered rocks and a few flat tan slabs (the room solids seen from above). Nothing in play resembles the lit floor on the PLAY screen. The player cannot see walls, lanes, gates or the room's machinery. | FAIL — biggest Swarm gap | `04` §6, `07` §4 |
| B2 | Finding your own ship | `D1/01-fight-open.png` | SEEN@301d3fb074 | The Hornet is ~25 px and dark against the void at round start. | FAIL | `07` §6, `04` §6 |
| B3 | Headlight beam | every flight frame in `D1`, `A7` | SEEN@301d3fb074 + CODE | A brown translucent cone ~300 px long in front of the ship in open space. Source: `LOOK_HEADLIGHT.beam` (`src/data/lookMoods.js:143`, density 0.0005, one Nocturne medium), landed e161b2bb9b. | FAIL | `07` §3 |
| B4 | "TOO HEAVY" on rocks | `D1/03-gunfire.png` | SEEN@301d3fb074 + CODE | A brown boulder under the cursor reads TOO HEAVY. Class I ceiling is 20 t (`src/data/lineProgression.js`); Swarm boulders are 60–95 t (ROCK-01). Holding one heats the winch and snaps the line (`src/systems/lineProgression.js`). | FAIL | `03_COMBAT.md` §2 (R12) |
| B5 | Pull on screen | `D1/10-pull-a.png` | SEEN@301d3fb074 | A white smeared blob beside the ship and a status chip "WELL — ENGAGED 3S". No visible well, no inward motion that reads. | FAIL | `03` §4, `07` §7 |
| B6 | Shove on screen | `D1/11-shove-b.png` | SEEN@301d3fb074 | A ring of flat orange crescent shapes around the ship and "REPULSOR — FADING 1S". Reads as a sprite, not a pressure wave. | FAIL | `03` §4, `07` §7 |
| B7 | Pin, Bomb, Rig (plough), latch-swing-throw on screen | — | OPEN | The probe's pilot died on round 3 before these fired. | — | Re-run `.devshots/director/powers-probe.mjs` (via the game lock) with `?swarmRound=1` and hull 9999 if a dev flag allows, or a staged fixture |
| B8 | Style / chain meter | `D1/03-gunfire.png`, `D1/11-shove-b.png` | SEEN@301d3fb074 | A real style meter exists ("IGNITION 14 · MIXED +2 · NEXT FLARE 25 · DOUBLE"; left panel "CHAIN 45 TERRAIN +2"). Good bones; the words are internal jargon and it speaks in two places at once. | WEAK | `04` §4, `08` §4 |
| B9 | Power bar | `D1/01-fight-open.png` | SEEN@301d3fb074 | Nine slots: Burn, 1 Pull, 2 Shove, 3 Pin, 4 Bomb, "Tap 5 C." (truncated), F Line, Gyre, Cloak. Gyre and Cloak show with no key. | WEAK | `03` §4, `08` §4 |
| B10 | Off-screen markers | `D1/01-fight-open.png` | SEEN@301d3fb074 | Red unlabelled "ruler" boxes on the top and bottom edges. | FAIL | `08` §4 |
| B11 | World tag over nothing | `D1/01-fight-open.png` | SEEN@301d3fb074 | "F·LATCH" with a diamond floating over what reads as empty space (a body too dark to see, or none). | FAIL | `08` §4, `07` §6 |
| B12 | Run level / XP | HUD "LV 1 … +3 XP"; code | CODE@301d3fb074 | `run:levelUp` is emitted by `src/systems/runSession.js:333`; its only listeners are `survivalAnnounce.js` and `survivalHud.js`. **Levelling grants nothing.** | FAIL (dead system) — and the best seam in the game | `04` §3, `06` §2 |
| B13 | Between-round Armory ("Ship equipment") | `B1/crucible-draft.png`; `A7/swarm-r10/r10-armory.png` | SEEN@301d3fb074 | Three "featured" cards (EMP Disruptor 48 cr, Beam Laser 48 cr, Plasma Cone 28 cr) plus Rearrange / Fortify / Re-roll / Browse all; a wallet of 64–750 cr; the footer reads "Guns from 18 cr". A shop that interrupts every round. | FAIL | `04` §2 (R3) |
| B14 | Swarm money | code | CODE@301d3fb074 | Starting purses 2,400 / 750 / 250 / 0 (`src/data/swarmStakes.js`), armory items from 18 cr, floor wall gun 500, Crate 950, Forge 5,000 (`src/data/swarmFloor.js`, `swarmMods.js`). Two scales, 28–53× apart, in one wallet. | FAIL | `04` §5 |
| B15 | Swarm progression systems | code | CODE@301d3fb074 | At least fourteen overlapping systems: stakes, perks (2-slot, star-earned), weapon levels (+12 % rate per level), evolutions, two draft pools, a synthesised 101-item catalogue, the Hangar (persistent +5 % hull/shield, +100 purse per rank), Taps/Forge, floor pads, ladder/zones/stars, account unlocks, crossover ledger, Fortify, run XP. | FAIL | `04` §5 |
| B16 | Fortify the field | `B1/crucible-fortify.png` | SEEN@301d3fb074 | Tower-defence placement while paused (Gravity Beacon 80, Repulsor Pylon 120, Tesla Pair 150, Kinetic Turret 180, Reflector Fin 90) at six numbered positions. Good toys in the wrong mode. | WEAK | `05_ADVENTURE.md` §4 (moves to the yard) |
| B17 | Run Over | `D1/12-rig-plough.png` | SEEN@301d3fb074 | Strong bones (big numbers, a hull diagram with the hit direction, "Run it again — same seed", Enter). Then: "5 cr banked into the hangar — the bounty now stands at 15522 cr", "Taking Unknown weapon fire", eight hit bars labelled "?", a faction name ("Crimson Reach") on a Swarm enemy, "Converged on Starter loadout". | WEAK | `04` §8 |
| B18 | Campaign leaking into Swarm | `A7/demo-swarm/08-latched.png`, ACCEPT-07 receipt | SEEN-OLD@0c6f73de87 | AFTERMATH / FIELD RESPONSE card over the boss bar; distant Helios Prime ships counted as Swarm hostiles; Contract 47-A on the Swarm pause; the bot chases Helios traffic 3–16 k u away. FIX-05 (bb76c66adf) claims the card and pause are fixed. The cause stands: a Swarm round runs inside the Helios sector. | FAIL until isolation is proven | `04` §6, `10_ENGINE.md` §3 |
| B19 | Enemy identification | `D1/03-gunfire.png` | SEEN@301d3fb074 | Every enemy wears a red ring; the ships under the rings are small and similar. | WEAK | `03` §9, `07` §6 (G08) |
| B20 | Blown-out white rock | `A7/swarm-r10/r10-1-mid1.png` | SEEN-OLD@0c6f73de87 | A pale crystal-like boulder rendered as a white-yellow blob (LOOK-03, on HOLD). | FAIL if it recurs | `07` §6 |
| B21 | Bosses (Iron Maw, Corsair Wing, Mirrorjaw, Yardmaster, Anvil, Forge Regent) | ACCEPT-06/07 receipts | CLAIMED | Iron Maw idles in passive watches; R10 boss bar froze (FIX-05 claims fixed). | — | Inspect: `?swarmRound=5,10,15,20,25,30` with a real pilot; each boss must have its trick (doc 12) |
| B22 | Freight lane, crusher, wall guns, Crate, Forge, Taps, drops | queue rows A01-02/03/04/05, CONTENT-01 | CLAIMED built | "THE CRATE · 950" label seen in `D1/11-shove-b.png`. The rest not seen by the director. | — | Inspect after B1 (the room) lands |
| B23 | The other eight arenas | — | OPEN | — | — | Inspect after B1 |

## C. Adventure

| # | Part | Evidence | State | Finding | Verdict | Fix lives in |
|---|---|---|---|---|---|---|
| C1 | Opening flight | `A7/beats/beat-raid-1.png`, `beat-dock-2.png`, `beat-seam-3.png` | SEEN-OLD@0c6f73de87 | An almost empty black field with a flat-lit ringed planet; the brown headlight cone; flat dark-blue "paper cut-out" ship shapes floating behind the player (distant traffic stand-ins); a stale top-centre voice line ("Latch the loose rock.") contradicting the objective; "OFFICIAL DENIAL" news mid-lesson; top-right "Overhead [\] \| Circuits" colliding with "RADIO OFF". | FAIL | `05` §8, `07` §5, `08` §4 |
| C2 | Station hub | `B1/station.png` | SEEN@301d3fb074 | A dark dashboard: 7 tabs + Comms + Help, Ctrl+K palette, two scrolling news crawls ("Bay screen", "Station wire"), risk/standing sliders, a credit-line draw, hold-to-accept. Competent; reads as enterprise software. | FAIL vs the bar | `08` §7 |
| C3 | Shipworks | `B1/station-shipworks.png` | SEEN@301d3fb074 | The ship preview is a white-and-cyan capsule, not a readable hull; "TAKE THE TESSERA TO THE RANGE" sits on the ship; the "Skirmisher" card overlaps the "Cargo OPEN / S" callouts. **The bench reported zero findings for this frame.** | FAIL | `08` §7; acceptance is the on-screen look (`11` §2) |
| C4 | Chart | `B1/chart.png` | SEEN@301d3fb074 | A blue schematic blob with labels and a 9-tab inspector (Overview, Route, Missions, Economy, Threat, Careers, Services, Discovery, History); "Ship fix (0, 0) · u · Hdg E · 49 u/s". | WEAK | `08` §8 |
| C5 | Asteroid Works — the board | `B1/asteroid-works.png` | SEEN@301d3fb074 | A ragged-edged rectangle of tiny cells on a star field; a 16-tool bar, most greyed; Heat and Charge dials. Does not read as an asteroid or as a puzzle. | FAIL | `05` §3 |
| C6 | Asteroid Works — close view | `B1/drill-build.png` | SEEN@301d3fb074 | Side-view dig: a derrick at the surface, a corridor with a yellow loader, a blue generator, rails. Rock is one photographic texture repeated with visible grid seams; ores are small icons ("Fe 8"). | WEAK — real potential | `05` §3, `07` §8 |
| C7 | Base Operations | `B1/base-claimed.png` | SEEN@301d3fb074 | A modal: generated header art, "RESEARCH NEXT — On-Site Refinery requires Deep-Core Mining", module slots, three "operating identity" cards. A management screen. | FAIL (R4) | `05` §4 |
| C8 | Automation | `B1/automation.png` + code | SEEN@301d3fb074 + CODE | "EST. NET VALUE −149 cr/min · +113 HEADROOM · CAP LOAD 1 %"; drones MK1–3 gated by research; "Up to ~113 cr/min capped · shared ceiling". `src/systems/automation.js:18` names a global passive-credit token bucket. ~6.8 k cr/hour ceiling on all passive income. | FAIL | `05` §5 |
| C9 | Research tree | `B1/tech-tree.png` | SEEN@301d3fb074 | A handsome radial tree: 35 nodes in Combat / Logistics / Industry / Drives, paid in credits plus research points; "Combat Basics" unlocks the Wasp, Pulse Laser S and Autocannon S. Gating basic guns behind research breaks R7. | WEAK (good screen, wrong content) | `06` §2 |
| C10 | Laser mining yield | code | CODE@301d3fb074 | Weighted random per rock type (`src/data/mining.js` `oreTable`). The owner's "laser gives the mix, the rover cherry-picks" already exists in data. | OK in code, untaught | `05` §2 |
| C11 | Adjacency | code | CODE@301d3fb074 | `src/data/sites.js`: "every machine reads its 8-cell contact ring"; matrix, basalt, ore veins (annuity vs lump), gas (power/feed). The owner's adjacency puzzle exists as law. | GOOD law, invisible | `05` §3 |
| C12 | Line heads | code | CODE@301d3fb074 | `LINE_HEADS` in `src/data/lineProgression.js` (Coupler, Breaker, Barb, Weld, Hush, Override, Bell, Spore, Index, Evidence Clamp): **no physics consumer for any behaviour.** A second head taxonomy exists via module mods (`masslineHeadId`: tractor, monofilament_sweep, twin_bridle, elastic_whip) read by `src/combat/attachments.js`. Doc 11's Coupler ("bolas") does not exist as a mechanic. | FAIL | `03` §2.6 |
| C13 | Adventure income and prices | — | OPEN | Reported by others: early income 3–6 k cr/hour; hulls 15 k–4.2 M (Saucer 4,200,000, `src/data/ships.js`). | — | Inspect: run the economy bench per activity for one simulated hour each (`06` §5) |
| C14 | Jobs, travel, gates, docking | — | OPEN | QUAL-02/09 (Codex) are working these routes. | — | Inspect after their rows close |
| C15 | Factions, law, WANTED | — | OPEN | ACCEPT-07: "claimed" beat auto-fires CARGO THEFT/HEAT 2 while the card still offers the choice. | — | Inspect the claimed beat and one law chase |
| C16 | Story staging (Kessler, the Skim) | queue OPENING-2/3 | OPEN | — | — | Inspect after OPENING-2 |
| C17 | Death and recovery (D8) | — | OPEN | — | — | Inspect: die in Helios, follow the wreck job |
| C18 | Stealth / cloak | `src/systems/cloak.js` exists; Cloak shows unbound in the Swarm bar | OPEN | — | — | `03` §10 |

## D. Flight, rope, guns, physics, AI (code)

| # | Part | State | Finding | Verdict | Fix lives in |
|---|---|---|---|---|---|
| D1 | Rope mass response | CODE@301d3fb074 | `src/core/constraints/masslineController.js`: "Rapier owns momentum exchange and the relative response of light/heavy bodies." The solver does mass polarity already. | GOOD | keep |
| D2 | Overclass strain and snap | CODE@301d3fb074 | `src/systems/lineProgression.js`: over the class ceiling, reel ×0.62, turn ×0.55, winch heat +0.16/s, snap 1.6 s after heat caps (~8 s). | FAIL (R12) | `03` §2 |
| D3 | Gun push | CODE@301d3fb074 | `src/data/weapons.js` `impulsePerHit` ranges 1–920; starter Pulse Laser S at dmg 5 with a forced vent, deliberately weak (row 482), pinned by `test/zc-a34-guns-nudge.test.mjs`. | FAIL (R5) | `03` §3 |
| D4 | Enemies dodge thrown bodies | CODE@301d3fb074 | `src/ai/reflexes.js`: BODY_DODGE is priority 0 for every pilot, survives every doctrine beat, 0.5 s window, 1.5 s cooldown. Fodder dodges the throws they exist to receive. | FAIL | `03` §9 |
| D5 | Pack spacing | CODE@301d3fb074 | `src/ai/maneuver.js:249` `friendlySeparationRadius: 118`. Packs rarely bunch for a bowling throw. | WEAK — change only with the density test | `03` §9 |
| D6 | Turning while thrusting | CODE@301d3fb074 | `src/core/flight/propulsionKernel.js` `assistedTurnBound`: in assisted mode with throttle held, yaw that leads the velocity path is pulled back to the path-follow rate. Whether this makes W+turn feel slower than turn alone is unmeasured. | OPEN measurement | `03` §8 |
| D7 | Camera | CODE@301d3fb074 | `src/render/camera.js`: perspective, 60° tilt, 50° FOV. Already angled; the flatness on screen comes from having nothing under the fight. | OK | `07` §4 |
| D8 | Shake admission | CODE@301d3fb074 | `src/render/shakeAdmission.js` bounds trauma in a decaying window. Keep as the guard. | GOOD | `03` §6 |
| D9 | Collision consequences | CODE@301d3fb074 | Momentum-based, provenance-blind lethality (FEEL_CONTRACT B6), hammer rule, heavy-as-terrain. No safety net for contacts nobody caused. | WEAK (R11) | `03` §5 |
| D10 | Lighting runtime | CODE@301d3fb074 | `src/render/nocturne/runtime.js`: pooled point lights, headlight spot slots, **one** shadow light at 256 / 512 / 1024 px updated at 10 / 15 / 20 Hz, four atmosphere media slots. | WEAK for the look | `07` §2 |
| D11 | Tone map | CODE@301d3fb074 | `src/render/renderer.js:9838` ACES Filmic, with LOOK-04 blending toward Khronos PBR Neutral (`lookMoods.js` comment). | OPEN look | `07` §2 |
| D12 | Audio library | CODE@301d3fb074 | `assets/audio` is 134 MB and generated by `generate-samples.mjs` / `generate-themes.mjs`; `src/audio/sampleLibrary.js` plays sample + synth hybrids. Reported elsewhere: three recorded samples in total. | WEAK | `09_SOUND.md` |

## E. Engine (measured by others)

| # | Part | State | Last number | Target | Fix lives in |
|---|---|---|---|---|---|
| E1 | Boot → title | CLAIMED (FINISH-LINE, 2026-11-15) | 38.5 s headed, Intel Arc | ≤ 10 s (doc 19) | `10` |
| E2 | Swarm PLAY → first hostile | CLAIMED (LOAD-03, 2026-11-17) | 36–42 s first door; 13–15 s later doors | ≤ 5 s | `10` |
| E3 | Adventure New Game → flying | CLAIMED (ACCEPT-05) | 13.5 s | ≤ 10 s | `10` |
| E4 | Frame rate, preset low | CLAIMED (ACCEPT-04/05/07) | Adventure 45–52; Swarm r3 ~26–30, r1 57 (headed) | 60 in Swarm r20 and crowded Helios | `10` |
| E5 | Console errors | CLAIMED | 6–10 `mergeGeometries()` per run (ROCK-04 claims fixed) | 0 | `10` |

## F. How this ledger is kept

- When a fix lands, change the row's State to `SEEN@<new sha>` with a new frame, and the Verdict.
- An OPEN row is closed only by looking. Code reading alone moves it to CODE, not SEEN.
- The bench (`scripts/ui-bench.mjs`) can say a frame has no geometry findings; it cannot say the frame
  is good. C3 is the proof.
- New parts found during work are added as rows, never as a separate list.
