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

**2026-11-19 sweep.** Rows were re-checked against the board's landings, and six audits added rows:
- `INV-21` dogfight AI
- `INV-22` guns and hits
- `INV-23` the Adventure first ten minutes
- `INV-24` the Swarm run loop
- `INV-25` places
- `INV-26` the interface

Their receipts are under `.devshots/fleet/runs/` and `.devshots/director/inv/`. An audit's word is **CLAIMED** until the director looks. A claim the director grepped at `38a235afab` is marked **CODE@38a235afab**.

---

## A. Boot, title and menus

| # | Part | Evidence | State | Finding | Verdict | Fix lives in |
|---|---|---|---|---|---|---|
| A1 | Boot film | `A7/demo-swarm/01-intro-cinematic.png` | SEEN-OLD@0c6f73de87 | The captured frame is almost pure black: a ghosted logo and line-art at ~3 % brightness. The first thing a buyer sees reads as a black screen. Boot to title 38.5 s (FINISH-LINE, headed, Intel Arc). | FAIL | `08_INTERFACE.md` §2, `10_ENGINE.md` |
| A2 | First-run prompt "First light" | `A7/demo-swarm/02-prompt-first-light.png` | CODE@5a0ca1eb0d | Retired by B3 (landed 5a0ca1eb0d). Still left: with the OS reduce-motion hint on, a locked Full/Reduce question appears before the title (INV-26); 08 §2 says honour the OS setting silently. | fixed — re-look; motion ask OPEN | `08` §2 |
| A3 | Title | `A7/demo-swarm/03-mainmenu.png` | SEEN-OLD@0c6f73de87 | Two door cards (good). The live scene behind is murky: a large faceted brown low-poly rock that reads as a placeholder sits centre-right, the ship is half hidden, the frame is ~90 % near-black. | WEAK | `08` §2, `07` §5 |
| A4 | Swarm PLAY screen | `A7/demo-swarm/04-crucible.png` | SEEN-OLD@0c6f73de87 | **The key art is the best image in the game**: a warm-lit Foundry floor with trusses, conveyors and panel banks. Copy is jargon ("65% pressure", "Armory every round · Refit & boss every 10/5", TRAINING: OFF). | GOOD art / WEAK copy | `04_SWARM.md` §7, `08` §3 |
| A5 | Swarm match setup | `B1/crucible-door.png` | SEEN@301d3fb074 | 4 modes, 4 money purses, 9 arenas, zone, weekly challenges, "seed, perks, hangar & records" — before the first fight of a mode sold as instant. | FAIL | `04` §7 |
| A6 | Loading veil | `A7/demo-swarm/05-loading-r1.png` | SEEN-OLD@0c6f73de87 | Wireframe sweep with "SPACEFACE / Crucible / BUILDING THE SCENE" — an internal name on the player's screen. PLAY → first hostile 34–54 s cold (FINISH-LINE). | FAIL | `08` §2, `10` |
| A7 | Pause | `A7/demo-swarm/66-pause.png` | SEEN-OLD@0c6f73de87 | Orrery menu is handsome. It exposes DEV · SANDBOX, MEDIA · PHOTO/REPLAY/CLIPS and PHYSICS CHALLENGES to players; in Swarm it showed "Contract 47-A" (FIX-05 claims fixed). | WEAK | `08` §6 |
| A8 | Settings, Help/Controls, Credits, Achievements, Save/Load | — | OPEN | — | — | Inspect: `node scripts/ui-bench.mjs --shot=settings,help,credits,achievements,save-load --walk` then open every PNG |
| A9 | Controller, rebinding, reduced motion/flash | — | OPEN | — | — | Inspect: one sitting per doc 19 "How to check" |
| A10 | Skipping the boot film | INV-23 | CLAIMED | No key or click dismisses the film. The veil lifts only when loading finishes (38.5 s to the title, E1). | FAIL | `08` §2, `10` |
| A11 | Title on desktop | INV-23, INV-26 | CLAIMED | The orrery dial sits over the dusk field. The two-door composition is phone-only. After 6 s idle, the attract tape plays a Swarm replay, so it sells the other door. | WEAK | `08` §2 |
| A12 | Unfinished things reachable from the title | INV-26 | CLAIMED | Sandbox and Physics Challenges are ungated title verbs. `sandbox.js` documents a production guard that its `mount()` never performs. | FAIL (01 §8.8) | `08` §6 |
| A13 | Photo mode, Replay and Clips by keyboard or pad | INV-26 | CLAIMED | Photo mode places no focus and swallows Tab document-wide. Replay and Clips cannot be tabbed into. | FAIL (doc 19) | `08` §10 |
| A14 | Banned words | INV-23, INV-26; `TOO HEAVY` grepped | CODE@38a235afab + CLAIMED | Banned words are still player-visible. No gate enforces the 08 §5 list; INV-26 counted 37 hits in the English catalogue.<br>• Swarm HUD: IGNITION/FLARE/NOVA, MIXED +2, TERRAIN/DIRECT +2, FIELD RESPONSE, "CRUCIBLE / FIRST CHAMPION DOWN"<br>• Line and map instruments: GYRE — TOO HEAVY, STALE, Ship fix/Hdg<br>• Menus and screens: cr/min/headroom/cap load, Research points, "Crucible" in seven achievements<br>• Station asides: Bay screen/Station wire | FAIL | `08` §5 |
| A15 | One hand made it | INV-26 | CLAIMED | The screens do not look like one hand made them:<br>• 15+ style vocabularies and 11 button shapes<br>• a 1,352-line `!important` bridge sheet for the station<br>• retired stylesheets still loaded (`menu.css` boot-linked; `orbital.css` and `command-deck-refit.css` dead weight)<br>Geometry is clean (41/41 bench cells) and the 12 px floor holds. | WEAK | `08` |

## B. Swarm

| # | Part | Evidence | State | Finding | Verdict | Fix lives in |
|---|---|---|---|---|---|---|
| B1 | **The arena as a place** | `A7/demo-swarm/07-flight-start.png`, `D1/01-fight-open.png` | SEEN@301d3fb074 | In flight the "Ricochet Foundry" is black space with a nebula, scattered rocks and a few flat tan slabs (the room solids seen from above). Nothing in play resembles the lit floor on the PLAY screen. The player cannot see walls, lanes, gates or the room's machinery. **2026-11-19:** OVH-03a is parked on `park/w3-foundry`. It is a lit factory deck, a dramatic step from black space, but it costs ~17–20 ms of GPU per frame, the furnace casing vanishes in some frames, and it ignores Shadows Off. The other eight arenas are still dark. | FAIL — biggest Swarm gap (fix parked, must-fixes open) | `04` §6, `07` §4 |
| B2 | Finding your own ship | `D1/01-fight-open.png` | SEEN@301d3fb074 | The Hornet is ~25 px and dark against the void at round start. | FAIL | `07` §6, `04` §6 |
| B3 | Headlight beam | every flight frame in `D1`, `A7` | CODE@fbdf528e84 | Was a brown translucent cone ~300 px long ahead of the ship in open space. T2 (landed fbdf528e84) removed the beam medium in clear space. | fixed — re-look on screen | `07` §3 |
| B4 | "TOO HEAVY" on rocks | `D1/03-gunfire.png` | CODE@343cd4f569 | T1 (landed 343cd4f569): the Line never refuses, there is no overclass snap, and the tags read ANCHOR / TOW / TUG. **Still left:** the Gyre instrument prints "GYRE — TOO HEAVY ×N" (grepped at 38a235afab). | Line fixed; Gyre FAIL | `03_COMBAT.md` §2 (R12) |
| B5 | Pull on screen | `D1/10-pull-a.png` | SEEN@301d3fb074 | A white smeared blob beside the ship and a status chip "WELL — ENGAGED 3S". No visible well, no inward motion that reads. | FAIL | `03` §4, `07` §7 |
| B6 | Shove on screen | `D1/11-shove-b.png` | SEEN@301d3fb074 | A ring of flat orange crescent shapes around the ship and "REPULSOR — FADING 1S". Reads as a sprite, not a pressure wave. | FAIL | `03` §4, `07` §7 |
| B7 | Pin, Bomb, Rig (plough), latch-swing-throw on screen | — | OPEN | The probe's pilot died on round 3 before these fired. | — | Re-run `.devshots/director/powers-probe.mjs` (via the game lock) with `?swarmRound=1` and hull 9999 if a dev flag allows, or a staged fixture |
| B8 | Style / chain meter | `D1/03-gunfire.png`, `D1/11-shove-b.png` | SEEN@301d3fb074 | A real style meter exists ("IGNITION 14 · MIXED +2 · NEXT FLARE 25 · DOUBLE"; left panel "CHAIN 45 TERRAIN +2"). Good bones; the words are internal jargon and it speaks in two places at once. | WEAK | `04` §4, `08` §4 |
| B9 | Power bar | `D1/01-fight-open.png` | SEEN@301d3fb074 + CLAIMED | Nine slots were seen, but that was the `?swarmRound=` developer route; the ordinary route shows slots 1–6 (T6). INV-26: unbound support slots still render as empty sockets, and the Swarm hero cues print a literal "unbound" or "status unavailable". | WEAK | `03` §4, `08` §4 |
| B10 | Off-screen markers | `D1/01-fight-open.png` | SEEN@301d3fb074 — disputed | Red unlabelled "ruler" boxes on the top and bottom edges. INV-26 found no such element in code, only a decorative tick comb. | needs a re-look on screen | `08` §4 |
| B11 | World tag over nothing | `D1/01-fight-open.png` | SEEN@301d3fb074 | "F·LATCH" with a diamond floating over what reads as empty space (a body too dark to see, or none). | FAIL | `08` §4, `07` §6 |
| B12 | Run level / XP | played probe (seed 4242) + CODE@38a235afab | CODE (parked chain) | Levelling now deals the Pilot Tree's three cards, including over a paused round end (OVH-01a…01c3, parked on `park/pilot-tree`, live in the working copy). Only 29 of 81 nodes are live: no evolutions, Ghost empty, Conjurer stops at four points (grepped). | WEAK until the tree fills | `04` §3, `06` §2 |
| B13 | Between-round Armory ("Ship equipment") | `B1/crucible-draft.png`; `A7/swarm-r10/r10-armory.png` | SEEN@301d3fb074 + CODE@38a235afab | Three "featured" cards (EMP Disruptor 48 cr, Beam Laser 48 cr, Plasma Cone 28 cr) plus Rearrange / Fortify / Re-roll / Browse all. The wallet holds 64–750 cr; the footer reads "Guns from 18 cr". The shop interrupts every round: `SWARM_DRAFT_EVERY = 1`, still at HEAD. | FAIL | `04` §2 (R3) |
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
| B24 | Door to round 1 | INV-24, INV-26; grepped | CODE@38a235afab | It takes four presses and a shop to reach round 1: Swarm door → Choose ship → Review equipment → the opening armory's Launch. The one-press start in `swarmQuickStart.js` has no importer, yet its test is green. The first panel is titled "Match setup" and offers seven controls. | FAIL | `04` §7, `08` §3 |
| B25 | XP curve against the live tree | INV-24; PT-FIX-A | CLAIMED | The run reaches ~22 levels by R10 (design ~14) and ~52 by R30. The live tree runs out around R14–15, after which levels promise picks that can never be dealt. `RUN_XP_SOURCES` is dead outside its definition. PT-FIX-A retuned this to about L14 at R10; that change is built but not yet reviewed. | FAIL → review | `04` §3 |
| B26 | The room pays | INV-24 | CLAIMED | A furnace kill pays the same Scrap and XP as a gun kill (design: 2.5×). The chain pays score only. The STYLE row still shows in Swarm because its gate has no `!swarm` check. | FAIL — the owner's core idea is not felt in the wallet | `04` §4–§5 |
| B27 | Floor shops in every arena | INV-24; grepped | CODE@38a235afab | Wall guns, the Crate, the Forge and the Taps exist only in the Foundry (`arenaId !== FOUNDRY_ARENA_ID` returns). Six arenas have no mid-round spend. Even in the Foundry, a 500-Scrap wall gun loses to shop items priced 12–112. | FAIL | `04` §2, §5 |
| B28 | Boss and brood pay | INV-24 | CLAIMED | A boss pays a normal kill: no 100 XP, no named purse, no level beat. Brood kills pay no XP at all. | FAIL | `04` §3 |
| B29 | Run length | INV-24 | CLAIMED | The 30 rounds total 1,143 quota bodies: 32–48 minutes of fighting plus 30 shop stops, against a 20–25 minute target. Round 6 is a cliff (28 → 40 bodies). | WEAK | `04` §1, §10 |
| B30 | Nothing makes the next run stronger | INV-22, INV-24 | CLAIMED | Hangar plating, shield and purse, perks, and weapon levels (+12 % rate per level) still apply in Swarm. Daily, ghost and checkpoint starts still use purses. | FAIL (§9) | `04` §5, §9 |
| B31 | Run Over plate | INV-24, INV-21 | CLAIMED | The plate has the right bones, but crowding sections bury the six lines. "Again" is same-seed only, so the retry deals the same build. Blast kills read "Unidentified weapon" with "?" bars. | WEAK | `04` §8 |

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
| C19 | First dock | INV-23 | CLAIMED | The first dock lands on the 66-row Market table (the default tab), and every handoff word misleads:<br>• Step 1 "Open your hold" opens the Market.<br>• Step 3 can name the retired "Services" tab, and clicking it undocks.<br>• The Departure Check Heat chip does nothing.<br>• The Yard chip fires a refuel its text doesn't name. | FAIL (cheap) | `08` §7 |
| C20 | Adventure levelling | INV-23; grepped | CODE@38a235afab | Adventure runs are pilot-free by contract (`runSession.js`), so there are no levels and no cards. Beat 0 pays 4 research points (the retired currency). Basic gear is still research-gated (`tech.js`). | FAIL (R1, R7) | `06` §2, §4 |
| C21 | Ten-minute glass and the first leg | INV-23 | CLAIMED | Helios sits on a seeded ring 1.0–1.8 k WU out, an empty leg with nothing staged. Overhead · Circuits, Field Build and Radio OFF show during lessons. Four retrospective hint toasts drain at the first dock. The raid and claimed beats have no waypoint. | WEAK | `05` §8 |
| C22 | The Skim | INV-23 | CLAIMED | Staged as a kill feed, a gauge and a toast, not "the escorts die on screen". | WEAK | doc 20 storyboard |
| C23 | First-hour route proof | INV-23 | CLAIMED | `test/rc-458-first-half-hour.test.mjs` fails 5 of 13 in the shared tree. The cause is a stale pin from the OPENING-1b reorder plus a data drift: the first trade now runs to Tethys. | FAIL (proof) | — |
| C24 | Places look like places | INV-25; PLACES-1 frames | CLAIMED | 17 of 25 sectors share four family skies: 8 fringe crimson, 3 belt ember, 6 anomaly ion. Ashfall (the endgame) has no profile and wears the Veil's sky. **PLACES-1 began per-sector rows and frames, then stopped at the OpenCode limit.** | FAIL | `07` §4–§5 |
| C25 | Things to do between places | INV-25 | CLAIMED | The empty spaces:<br>• The 14 frontier sectors' lanes have no furniture.<br>• 17 sectors have no staged story.<br>• Veil and Ashfall have zero traffic.<br>The work looks the same everywhere:<br>• Job boards key on station type, not on the place.<br>• Only 3 of 6 race circuits pay. | WEAK | `05` §1, §8 |
| C26 | Names that contradict | INV-25 | CLAIMED | "Pallas Industrial Moon" lives in Io Reach. Io has two different "Mercenary Outpost"s. | FAIL (cheap rename) | — |
| C27 | Station friction | INV-26 | CLAIMED | Fitting a part takes four clicks, including a forced confirm. Selling takes three. Contracts are hold-to-accept. Repair and Refuel are one click each (keep). | WEAK | `08` §7 |

## D. Flight, rope, guns, physics, AI (code)

| # | Part | State | Finding | Verdict | Fix lives in |
|---|---|---|---|---|---|
| D1 | Rope mass response | CODE@301d3fb074 | `src/core/constraints/masslineController.js`: "Rapier owns momentum exchange and the relative response of light/heavy bodies." The solver does mass polarity already. | GOOD | keep |
| D2 | Overclass strain and snap | CODE@301d3fb074 | `src/systems/lineProgression.js`: over the class ceiling, reel ×0.62, turn ×0.55, winch heat +0.16/s, snap 1.6 s after heat caps (~8 s). | FAIL (R12) | `03` §2 |
| D3 | Gun push and the family curve | CODE@fb79e4172d + CLAIMED (INV-22, OVH-08a bench) | The starter is fixed: T4 (landed fb79e4172d) gives dmg 9. **Still left:** 13 of 19 live guns miss their family band:<br>• Concussion M moves 0.92 of a screen depth (needs ≥ 1.0).<br>• The Railgun takes 2 shots and has no pass-through.<br>• The Bank Stream bounces only with a mod.<br>• The Pulse M is a strict upgrade over the S, and the Autocannon S is a downgrade.<br>• Heavy Beam and Lighthouse are too fast.<br>Only Thump moves rocks, and the Tumbler does not exist. | FAIL (R5) | `03` §3, OVH-08b |
| D4 | Enemies dodge thrown bodies | CODE@fb79e4172d + CLAIMED (CW-AI) | Fodder no longer dodge (T3, landed fb79e4172d). CW-AI built the full tier table: light hulls dodge once per 4 s, medium after a ~0.3 s hesitation, and heavies are terrain. CW-AI also built tighter fodder packs, the press ring, flights, the flee announce and a line-of-sight fire hold. | built — review | `03` §9 |
| D5 | Pack spacing | CODE@301d3fb074 | `src/ai/maneuver.js:249` `friendlySeparationRadius: 118`. Packs rarely bunch for a bowling throw. | WEAK — change only with the density test | `03` §9 |
| D6 | Turning while thrusting | CODE@301d3fb074 | `src/core/flight/propulsionKernel.js` `assistedTurnBound`: in assisted mode with throttle held, yaw that leads the velocity path is pulled back to the path-follow rate. Whether this makes W+turn feel slower than turn alone is unmeasured. | OPEN measurement | `03` §8 |
| D7 | Camera | CODE@301d3fb074 | `src/render/camera.js`: perspective, 60° tilt, 50° FOV. Already angled; the flatness on screen comes from having nothing under the fight. | OK | `07` §4 |
| D8 | Shake admission | CODE@301d3fb074 | `src/render/shakeAdmission.js` bounds trauma in a decaying window. Keep as the guard. | GOOD | `03` §6 |
| D9 | Collision consequences | CODE@301d3fb074 | Momentum-based, provenance-blind lethality (FEEL_CONTRACT B6), hammer rule, heavy-as-terrain. No safety net for contacts nobody caused. | WEAK (R11) | `03` §5 |
| D10 | Lighting runtime | CODE@301d3fb074 | `src/render/nocturne/runtime.js`: pooled point lights, headlight spot slots, **one** shadow light at 256 / 512 / 1024 px updated at 10 / 15 / 20 Hz, four atmosphere media slots. | WEAK for the look | `07` §2 |
| D11 | Tone map | CODE@301d3fb074 | `src/render/renderer.js:9838` ACES Filmic, with LOOK-04 blending toward Khronos PBR Neutral (`lookMoods.js` comment). | OPEN look | `07` §2 |
| D12 | Audio library | CODE@301d3fb074 | `assets/audio` is 134 MB and generated by `generate-samples.mjs` / `generate-themes.mjs`; `src/audio/sampleLibrary.js` plays sample + synth hybrids. Reported elsewhere: three recorded samples in total. | WEAK | `09_SOUND.md` |
| D13 | Heat | CLAIMED (INV-22) | Heat is a punishment on a minority of guns:<br>• Pegging any one mount locks every mount for 1.74 s.<br>• There is no amber band and no feathering.<br>• About half the guns never heat.<br>• The HUD shows one aggregate arc, not which gun is hot. | FAIL | OVH-08b |
| D14 | Recoil on the hull, not the camera | CLAIMED (CW-WPN) | The FOV punched on every shot, and Thump and Needle never nudged the hull. CW-WPN built hull recoil and removed the per-shot FOV punch. | built — review | `03` §3 |
| D15 | Damage that stays | CLAIMED (INV-22) | Scars live 0.48–8 s in one 32-mark ring shared by the whole scene. Running-light flicker has no consumer. The first hit on each mesh allocates a material clone (a hitch risk at ×50). | WEAK | `03` §6–§7 |
| D16 | Enemy aim and turrets | CLAIMED (CW-WPN) | NPC fire was a perfect solution, and capital turrets had no slew. CW-WPN built an aim quiver scaled by the pilot's aim and the target's motion, plus a 1.5 rad/s turret slew. | built — review | `03` §9 |
| D17 | Readable attacks | CLAIMED (INV-21; CW-TELLS) | Attacks are hard to read:<br>• Tells were 0.5 s (design 0.6).<br>• Lane wedges appear for only two doctrines.<br>• Eight cue kinds have no HUD chip.<br>• `pack_call` has no in-world marker.<br>• The Enemy Mind (flank, bait, punish) has no listener and is held off in Swarm.<br>**CW-TELLS stopped at the OpenCode limit, half done.** It set the 0.6 s clock and partly built the chips. `combat-doctrines.test.mjs` is red on a stale 30-tick pin. | FAIL — half-built | `03` §9 |
| D18 | Each enemy its own pace | CLAIMED (INV-21) | Each hull's flight model overwrites its archetype speed, so the Lancer is not slower than the Reaver. | WEAK | `03` §9 |
| D19 | Uncaused contacts | CLAIMED (INV-21) | There is no "energised" safety net. A contact nobody caused can still tumble or kill. | WEAK (R11) | OVH-09 |

## E. Engine (measured by others)

| # | Part | State | Last number | Target | Fix lives in |
|---|---|---|---|---|---|
| E1 | Boot → title | CLAIMED (FINISH-LINE, 2026-11-15) | 38.5 s headed, Intel Arc | ≤ 10 s (doc 19) | `10` |
| E2 | Swarm PLAY → first hostile | CLAIMED (LOAD-03, 2026-11-17) | 36–42 s first door; 13–15 s later doors | ≤ 5 s | `10` |
| E3 | Adventure New Game → flying | CLAIMED (ACCEPT-05) | 13.5 s | ≤ 10 s | `10` |
| E4 | Frame rate, preset low | CLAIMED (ACCEPT-04/05/07) | Adventure 45–52; Swarm r3 ~26–30, r1 57 (headed) | 60 in Swarm r20 and crowded Helios | `10` |
| E5 | Console errors | CLAIMED | 6–10 `mergeGeometries()` per run (ROCK-04 claims fixed) | 0 | `10` |

## G. Shipping basics (doc 19, added 2026-11-19)

| # | Part | State | Finding | Verdict | How to inspect / fix lives in |
|---|---|---|---|---|---|
| G1 | The one sitting | OPEN | Nobody who didn't build it has done doc 19's full sitting. | — | Doc 19 "How to check": install → Swarm to a death → Again → quit mid-run → resume → controller → motion down → Adventure → dock → quit → continue. Write down every wait, squint and "what do I press". |
| G2 | Resume a Swarm run tomorrow | OPEN | — | — | Quit after a round, relaunch, resume. Owner: EC-G12 |
| G3 | Old saves survive new versions | OPEN | The Pilot Tree, the Swarm economy cut and the station rework all change save shape. | — | `npm run check:playable:saves` plus a migration test per change (06 §7) |
| G4 | An evening without a crash | OPEN | The playable check passes 18/18 on the working copy (2026-11-19 21:40, boot 13.2 s). No long-session soak has been run. | — | A two-hour soak per door |
| G5 | The Steam build | CODE | `dist:steam`, the Steamworks adapter and 44 achievements exist. Achievement wording still says "Crucible". The store art in `build/store` predates the overhaul. | — | Build, install and run from Steam's client; re-shoot the store art from the new look |
| G6 | Languages | CODE@38a235afab | es / fr / de / pt-BR are at 1.2 % (219 of 17,798 strings reviewed). | owner's call | English-only launch, then translate after the text cut |
| G7 | Sound | CODE@301d3fb074 | 134 MB uncompressed, mostly synthesised (D12). | WEAK | `09_SOUND.md`: encode, thirty hero sounds, a score, real reverb |
| G8 | Store page | OPEN | — | — | Capsule art, screenshots and a trailer, all from the lit Foundry and the new look, once they land |
| G9 | Controller-only and handheld | OPEN | This repeats A9. | — | Rope cone-aim with a stick, rumble on tension and impact, text at 1280×800 |

## F. How this ledger is kept

- When a fix lands, change the row's State to `SEEN@<new sha>` with a new frame, and the Verdict.
- An OPEN row is closed only by looking. Code reading alone moves it to CODE, not SEEN.
- The bench (`scripts/ui-bench.mjs`) can say a frame has no geometry findings; it cannot say the frame
  is good. C3 is the proof.
- New parts found during work are added as rows, never as a separate list.
