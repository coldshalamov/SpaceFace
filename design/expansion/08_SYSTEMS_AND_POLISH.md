<!-- LIFETIME: STABLE -->
# 08 — Systems and polish

The systems an A-list version of SpaceFace runs on, and the polish bar it is held to. The
measurements that justify each section are in `build_map.md` §33.0. The work items are §33 rows
482–497 and §34 rows 498–550.

## 1. The core loop at four timescales

| Scale | Loop | It is great when… | Rows |
|---|---|---|---|
| **10 seconds** | see a cluster → grab something → swing → release → impact → cascade | the impact lands (hit-stop, crumple, chunks) and the cascade is legible | §33 482, 487, 490–492; §34 503, 509–510 |
| **3–5 minutes** | a situation (07 §3): read it, pick a verb, make a story, leave a receipt | every situation offers three solutions and fails forward | §34 515–532, 497 |
| **20–30 minutes** | a goal → tonnes moved → a new class, head or toy → "wait, could I use this to…?" | every 15–25 minutes the player can do something they couldn't before | §34 498–501, 544 |
| **Hours** | Books, faction arcs, the tide, the Gate Audits, your stations and gardens | the map looks like your history | §34 520–523, 533–539 |

## 2. Progression — "heavy is honest"

### 2.1 Tonnage Logged and Line Class (Adventure, permanent)

The player's progression is **true mass moved**. LOG keeps the count, and the Line never lies about
it. The **Line Class** sets the heaviest body the Line can move at full control.

| Class | Full-control mass | Earned by (any one opens the trial) | What it unlocks in play | Typical Book |
|---|---|---|---|---|
| I | 20 t | start | pods, buoys, pebbles | B0 |
| II | 100 t | 2,000 t logged | containers | B1 |
| III | 400 t | 15,000 t logged or a TARE trial | **light ships as ammunition** | B2 |
| IV | 2,000 t | 80,000 t logged or a Slate winch rebuild | wreck sections, Bristle rams | B3 |
| V | 10,000 t | 400,000 t logged or a SHEPHERD-12 trial | haulers, station modules | B4 |
| VI | 40,000 t | 1.5 Mt logged or a HOLDFAST trial | derelict freighters | B5 |
| VII | 150,000 t | 6 Mt logged or a Measure Engine set | station chunks | B6 |
| VIII | the Maw | **The Line** site trial (03 §3) | the dreadnought | B7 |

The numbers are design targets. The balance owner tunes them with the M3 cohort simulation against
§2.4.

- **Over-class towing is allowed and costly** (row 499). Above full-control mass the Line still
  holds, but it strains: reel speed falls, the cable glows hot, and the ship's turn authority drops.
  A sustained over-class tow heats the winch, and if you push it too far it snaps (a visible event).
  This is how the player feels "almost": Katamari's "not yet".
- **The hull shows the class** (05 §3): winch head, cable thickness, anchor pads.
- **LOG stamps records.** The first time the Line holds a new record mass: `412 T. CORRECT.` The
  first time it holds exactly 12.4 t (within 50 kg), LOG adds one line: `12,400 KG. THEY KNEW THE
  MASS. SO DO YOU.` It fires once per save.

### 2.2 In-run rating (the Cull and swarm mode)

A separate rating that resets each run (§33 row 483). Both use the same Katamari grammar and
different ledgers. Heads, cosmetics and starting rating carry across runs (§33 row 489).

### 2.3 Line heads

The catalog is in 05 §7.1 (row 501). Earned from faction arcs (06), Cull leagues, ace drops and
rare salvage. **A head changes what the Line does, never a percentage.**

### 2.4 Economy re-pace (row 544)

The M3 cohort simulation shows hunters spend about 80 % of a session travelling and buy nothing in
90 minutes. The targets for hour one:

- **Travel share ≤ 50 %** for hauler and hunter cohorts (§33 row 497). Compress hops and add the
  physical shortcuts: Fulfillment hitchhiking (E-25), Proteus slingshots (E-13), and Pitborn sling
  buoys at lane junctions.
- **A purchase that changes play every 15–25 minutes.** That can be a head, a frame, a Line rebuild
  or a ship. Starting credits and early prices are tuned to it.
- **Pay by the physical act.** Bounties and salvage pay by tonnes delivered or moved (the Understory
  already "pays by the tonne"). The ledger in your hands *is* the economy.

### 2.5 Provenance rarity (loot)

Loot rarity is allowed (owner, 2026-10-21). In SpaceFace it is **provenance**, not colour (row
500): an item's rarity is its history.

| Tier | Mark | Meaning | Example effect (a behaviour, not a stat) |
|---|---|---|---|
| **Stock** | plain | factory | as listed |
| **Worked** | copper rim | repaired and re-tuned on the shop floor | one small behaviour (a Worked Breaker splits into 4 chunks, not 3) |
| **Named** | silver rim plus a maker's name ("Slate-welded", "Kindling Yard") | a known hand made it | a maker's signature behaviour |
| **Storied** | gold rim plus a deed ("flew with the Red Wake") | carries a past owner's history | the history acts: a Storied Barb from a Reach clan makes hooked ships' wingmen panic |
| **Relic** | pearl rim | precursor or Vethari | a rule-breaking behaviour (Multi-latch) |

**Backordered** is a Fulfillment-spill flavour of Worked or Named. It carries the original order
text ("ORDER 0003-PIT"), and that is the joke.

## 3. AI that reads as intention

The measured problem (§33.0) is enemies averaging about 50 speed against the player's 117, with 0.8
turn reversals per second against the scripted pilot's 0.36. The fix is to commit to readable
cycles (§33 row 491). The swarm version of that fix is in 03 §1.2 (rows 503–504).

- **Every role has an attack cycle**: approach → wind-up (telegraph ≥ 0.6 s at the chase camera) →
  committed attack → exposed recovery.
- **Formations have a commander** (Concord, Helix, Reach packs): kill or fling the commander and the
  formation's behaviour changes visibly.
- **Swarm members are linked**: coupling filaments, and pathologies as openings.
- **Rare physicists** (owner ruling): one authored specialist at a time.
- **Consolidate, don't extend**: the reflex stack in `src/ai/reflexes.js` becomes one rare, big,
  visible dodge per role instead of eight overlapping jitters.

## 4. Physics

- **Substance materials** (05 §2, row 509) layer on top of the body-class materials.
- **Breakage cascades** (row 510): every throwable breaks into the next tier down, so arenas refill.
- **The Line's strain model** (row 499) is the honest scale. Its readout is the game's hero
  instrument.
- **The physics budget** (§33 row 488): sleep distant bodies and simulate far fields cheaply. The
  closer the player gets, the more truthful the world becomes (VISION).
- **Determinism**: sim code stays independent of Three.js and uses `state.rng` and `state.simTime`
  (`AGENTS.md` §2). Cosmetic VFX randomness is separate.

## 5. Mass-signature stealth (row 513)

This is the owner's stealth idea from 2026-10-21, made physical. Instead of vision cones, **sensors
read mass and heat inside a radius**, and the world's big bodies cast **mass shadows**.

- **Scanners**: Concord Scale Barges and weirs, Quiet relays, Archive page drones, Verge Surveyor
  Prisms. Each draws its sweep on the glass as a soft ring with a moving edge, readable with no
  marker.
- **Hiding**: park in a large body's mass shadow, coast cold (engines off cuts heat), hold cargo with
  a Hush Head, or hand off to a decoy pod.
- **Heat seekers use the same model**: Lantern cysts and Furnace maws track heat. Coasting cold
  makes them drift to the next hot hull.
- **Uses**: The Weighing (E-04), The Swap (E-07), the Margin sweep, the Evidence Locker heist
  (E-31), the Lantern Bombardment (E-16).

## 6. Camera (row 545)

- Frame for the **largest relevant body**. The camera opens as the Line rating rises and as speed
  climbs (VISION's 60-second fantasy).
- Impact kick only at **T4 and above**. Shake always has a cause you can see ("no camera shake with
  no moved mass", CV-HAND *Thin*).
- The player's ship is never under the HUD (demo ledger D240).
- Bosses get framing beats at phase changes, never cutscenes in mid-fight.

## 7. The glass (HUD)

§33 row 494 is the authority (three tiers: always, when it matters, never in flight). This bible
adds:

- **The Line readout is the hero instrument**: held mass, strain, and the class ceiling, drawn at the
  ship, not in a corner.
- **The power preview** (05 §7.2): holding a power's key outlines every body it will move and draws
  its path.
- **LOG**, the kill-feed narrator (row 502), is the only text stream that may run during a fight. It
  sits on one line and fades in 3 s.
- **Faction tells** (05 §9) replace faction text tags in flight.

## 8. Onboarding without gating (row 546)

Owner rulings: a new game starts with everything, and the problem is the powers' readability, not
unlock pacing. So teach **by situation, not by lock**:

- The first ten minutes place one situation per power that suggests it: a pod field suggests a
  throw, a tight pack suggests Pull, a hull leech suggests a scrape, a ring of crystal suggests the
  Bell.
- The power preview teaches what each power will do before the player commits.
- The rail names every power individually (§33 row 493), with no hidden group labels.
- "I've flown before" skips all of it.
- **The First Light prompt (observed 2026-10-21).** The first thing a new player sees highlights
  calm motion and reduced flashing as the default action. Keep the offer, but make **"Play"** the
  primary action and calm motion one tap away. Accessibility is preserved (`AGENTS.md` §6), and the
  juice is not hidden from everyone by default.

## 9. Sound

The owner plays muted. **Everything must read with sound off.** Audio is a layer the CV-EAR
campaign owns, so no row in §34 depends on audio for readability.

## 10. Performance

- The integrated GPU on the play machine is the target (§33 row 488: wave 15 at p95 ≤ 20 ms on a
  quiet host).
- Every new body ships with LODs and fits the frame-solid budget (`build_map.md` §21.4).
- Load time: an interactive title in 10 s on the VM profile (row 473 exists). A 2-minute-plus load
  was observed on a contended host on 2026-10-21. The fleet's own load is a confound, not the
  measure.

## 11. Persistence (row 549)

Every receipt in this bible persists (law 6), **bounded**: caps per sector, oldest-first decay for
the trivial, never for the meaningful (gardens, stations, lit paths, homesteads). Saves migrate
(`src/save/migrations.js`). A persisted fact without a reader the player can fly into is a defect
(§31.0 fault 1).

## 12. The A-list polish checklist (row 548)

Fifty statements, each true or false on the default route, checked by a fixed-seed run, a focused
test, or a bench shot. Row 548 audits them as a pass. An agent who finds a false one fixes it or
files one demo-ledger row (`AGENTS.md` §7).

**Feel**
1. The first throw happens within 2 minutes of New Game.
2. Every mass kill has hit-stop scaled by mass.
3. Every impact moves something you can see.
4. The Line's strain is readable at the chase camera.
5. The release arc is drawn whenever the Line is held.
6. Enemies cruise at ≥ 70 % of the player's cruise speed.
7. No enemy reverses its turn more than 0.4 times per second outside a telegraphed dodge.
8. Every attack is telegraphed for ≥ 0.6 s at the chase camera.
9. A swarm panic cascade is visible as snapped filaments.
10. Over-class towing feels heavy, and a snap is an event.

**Read**
11. Every everyday enemy role is identifiable from silhouette alone in 3 of 4 stills.
12. Red rings appear only for off-screen threats.
13. Each of the five powers has one colour, and no two share one.
14. Holding a power's key shows what it will move.
15. The HUD never covers the player's ship.
16. No debug provenance string reaches the flight HUD.
17. Every number on the flight HUD has a unit a person knows.
18. Peak effects reach about 10 % of the screen without hiding a threat.
19. Everything reads with sound off.
20. A T5 body *looks* enormous next to a T1 body.

**World**
21. Contact within 2 minutes; recurring every 3–5.
22. A quiet beat follows every loud one.
23. Every faction is recognisable by how it flies.
24. Every sector is recognisable from 30 seconds of motion.
25. Every encounter leaves a receipt on the chart.
26. A garden you fed is visibly bigger on your return.
27. A structure you built is still there, at its exact shape.
28. The tide line moves because of what you did.
29. LOG narrates physics outcomes in the house voice.
30. Ordinary life is visible in every sector: someone is working.

**UX**
31. New Game to flight in under 30 s on a warm cache.
32. No label is truncated at 1280×720 or 1920×1080.
33. No prompt borrows a power key without showing it.
34. No modal covers a live threat.
35. Every power is named individually on the rail.
36. Map, pause and station screens use the ORRERY library (no hand-rolled boxes).
37. Every failure explains itself in one plain sentence.
38. Every reward shows what it lets you do.
39. Every store item shows what it changes in play.
40. A first-time player can say what each power does after 10 minutes.

**Tech**
41. Wave 15 holds p95 ≤ 20 ms on the integrated GPU (quiet host).
42. No hitch over 50 ms during a T5 break.
43. Saves load across versions.
44. No uncaught page error on the default route.
45. Determinism: the same seed gives the same outcome.
46. Every new body has LODs.
47. The physics body count stays inside its budget.
48. Load to an interactive title in 10 s (VM profile).
49. Player-truth passes for every mode touched.
50. No persisted fact without a reader.

## 13. Production order (director's recommendation; the owner may overrule)

| Phase | Goal | Rows |
|---|---|---|
| **1. The fight** | one swarm round at A-list craft | §33 488 → 482, 487, 490, 491, 492; §34 502, 503, 509, 510 |
| **2. The Katamari curve** | grow what you can move | §33 483, 485, 486, 484, 489; §34 498–501, 507, 511 |
| **3. Identity** | every faction and sector reads | §34 514–519, 524–532, 512, 540, 541 |
| **4. The world moves** | tides, audits, the ticker, the chart | §34 508, 513, 520–523 |
| **5. The story plays** | Books 0–7, doors, interludes, arcs, the Cull | §34 533–539, 504 |
| **6. People** | cast, faces, machine-people | §34 505, 506, 542, 543 |
| **7. Polish** | the 50-point checklist; the power and arsenal merge (owner calls) | §34 544–550; §33 493–497 |

Phases 3 and 6 can run in parallel with Phase 2, because they touch art and data rather than the
fight code.
