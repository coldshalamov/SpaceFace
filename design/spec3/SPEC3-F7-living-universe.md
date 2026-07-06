# SPEC3-F7 — World & Living Universe (specs 29–32)
**Thread:** F7 · **Reads:** `_context/02_SIM_ECONOMY_WORLD.md` §4/§5, GDD pillar 4 · **Status:** PLAN
**Thread pitch:** "the universe was here before you" — traffic that flies its own routes, sectors
with authored souls, secrets worth the frontier, and a story that pays the whole thing off.

Ground truth: 10 handcrafted sectors, ~20 edges, wormhole Veil→Ashfall (one-way, tech-gated). POI
types `beacon/derelict/cache/colony/anomaly/wormhole/wreck`; hazards `dense_asteroid/nebula/
radiation/debris`; hidden POIs need the scan pulse (8 s cd, 1200 wu). Discovery reveals one-hop
neighbors; survey data buyable `750+tier·1250`. Interdiction `0.35·(1-security)·(1-stealth)` capped
0.6 (Helios 0.7% → Ashfall 21.6%). Sector identity docs exist for all 10 (recon §4.5 one-liners).
Gaps (recon §4.6): Charon bounty-board archetype missing; Tethys "contracts hub" is generic; world
is small — "more world = authored content." Story: the 47-A / Director Vale spine (8 beats, 3-phase
HUD meta-arc, 5 endgame choices) is substantially BUILT (`missions.js:209-226`, `narrative.js`,
`docs/worldbuilding/story/`).

---

## SPEC3-29 — The living universe: traffic, convoys & the world half of the director
**One-line pitch:** civilian life — traders flying real routes, patrols walking beats, convoys worth
robbing or guarding — orchestrated by the same pressure director that runs combat (F4-21).

### 1. Why
GDD pillar 4 promises traffic that "flies its own routes"; today `trafficPerMin` is a spawn number,
not a life. Every genre great (Freelancer above all) sells its world with *indifferent* NPCs — ships
with somewhere to be that isn't you.

### 2. The design
- **Ambient traffic with itineraries:** spawned traders pick real station-pairs weighted by the
  actual economy (produce→consume gradients, recon §1.8) and *visibly dock/undock*. They are
  scannable ("hauling 40 refined metals → Vesta Forge") — the world's economy made flesh. Density
  per sector = `trafficPerMin` shaped by wealth/war (war zones thin out; that silence reads as dread).
- **Patrol beats:** security-faction wings walk gate→station→belt loops, scan-pulse near contraband
  players (F1-12's card), and *respond to distress* — including yours (rep-gated: Trusted+ patrols
  actually come). Watching a patrol wreck the pirates chasing you is the "living world" jackpot moment.
- **Convoys (the set-piece economy):** scheduled heavies (3 haulers + escort doctrine per faction)
  on the richest lanes, announced on the ticker ("MTS bullion convoy departing Tethys, 10 min").
  Rob it (war/pirate lean, huge heat + siege-tier response), guard it (contract, F4-20 escort verbs),
  or *front-run its cargo effect* (it delivers a stock flood — trade around the price move, F1
  knowledge play). One event, three playstyles, all existing systems.
- **NPC miners & the shared world:** belt sectors get 1–2 NPC miners chipping the same fields
  (`fieldsDepleted` is shared state!) — your renewable is their renewable. They flee to stations
  under threat; killed miners headline and nudge DMC rep/economy. (F2-15's rivalry hook.)
- **Distress & rescue (60/40 rule):** drifting ships (fuel-out, pirate-hit) request fuel/repair/
  escort. 60% genuine (rep + pay + rumor), 40% at low security are bait (F4-21 shape). Trust
  becomes a read, never a rule.

### 3. Architecture & wiring
Extend the F4-21 encounter director with a *civilian deck* (shapes: `trader_run, patrol_beat,
convoy, npc_miner, distress`) drawing from a separate, calmer budget (ambience must not starve
combat pressure or vice versa). Traders/patrols use existing AI archetypes with itinerary FSMs
(dock → cruise lane → gate); they interact with the real economy via *bounded* `applyTradePressure`
(the hired-trader plumbing, recon §6.3, reused — NPC trade must never destabilize the sim: pressure
capped per tick). Convoy schedule seeded per day. Distress = existing bar-rumor + comms plumbing.
Emits `world:convoyDeparted`, `world:distress`, etc. for ticker/missions.

### 4. Key code
```js
// NPC traders touch the economy through ONE bounded valve. Without the clamp, ambient life
// becomes an invisible hand that out-trades the player and flattens every gradient.
function npcTradeArrive(run, econ) {
  const qty = Math.min(run.qty, NPC_PRESSURE_CAP_PER_ARRIVAL);     // cap: 15u equivalent
  econ.applyTradePressure(run.toStation, run.cmdtyId, +qty);       // existing hired-trader API
  econ.applyTradePressure(run.fromStation, run.cmdtyId, -qty);
}
```

### 5–6. Assets / deps
Reuses hulls/AI/VFX; convoy escort doctrine data only. No new deps.

### 7. Build plan
1. Civilian deck + trader itineraries + bounded econ valve; `scripts/check-living-traffic.mjs`
   (traffic density per sector; economy drift bounded with traffic on/off within 3%; determinism).
2. Patrol beats + distress response + contraband scan hook.
3. Convoys + ticker + rob/guard/front-run outcomes.
4. NPC miners + shared field state + rivalry.
5. Floor: `check:sim:compare` (the econ-bound check above is the critical one), director checks.

### 8. Anti-patterns
NPCs that orbit the player (itineraries are sacred — indifference IS the feature); ambient life
that eats the frame budget (hard cap: ≤8 civilian entities per sector, pooled); NPC economy actually
balancing the market (bounded valve or the player's edge dies); distress that's always bait or
never bait.

### 9. Ambition ceiling
Persistent named civilians: 6 recurring captains with schedules ("the Tuesday hauler") — recognition
without simulation depth; kill one and the route stays empty a while. The world remembers lightly.

---

## SPEC3-30 — Sector content & identity: the build-out map
**One-line pitch:** the authored plan that makes each of the 10 sectors *play* like its one-line
soul reads — what each contains, why you go, what you risk, and what only exists there.

### 1. Why
Recon §4.5/4.6: identities are written and mostly realized *visually*, but content density is thin
and near-uniform (2 claimables world-wide; bounty board missing; Tethys hub generic). "Big and
expansive" here ≠ more sectors — it's each sector becoming a *destination with a verb*.

### 2. The design — the canonical sector table (data targets, all systems referenced exist or are SPEC3)
| Sector | Verb (why you fly here) | Unique content to add | Claimables | Signature danger |
|---|---|---|---|---|
| Helios Prime | learn, resupply, story | tutorial polish, Vale's tower POI (B0/B7 anchor) | 0 | none (dens. 0) |
| Ceres Belt | first mining, first claim | starter belt events, vein tutorial field, NPC miners | 1 S + 1 M | volatile seams |
| Tethys Junction | contracts hub | **real contracts board** (chained offers UI), convoy nexus, war-front ticker board | 1 S | scan-heavy patrols |
| Vesta Forge | industry | fab contracts (`industry_supply`), module reroll vendor, slag-radiation runs | 1 M | radiation pockets |
| Pallas Drift | smuggling | blackmarket depth (F1-12), bribe-friendly patrols, hidden caches | 1 S | gate camps |
| Io Reach | claim rush & war front | contested-pair showcase, charter discounts, claim-vs-claim NPC drama | 2 M (rush theme) | war sieges |
| Charon Expanse | bounty hunting | **bounty_board archetype** (F1-12), hunter rumors, wreck-tow yards | 1 S + 1 L | moving radiation |
| Sker Haven | pirate life | rep-gated black market, toll war, raider contracts (play the other side) | 1 M | gate camp + hunters |
| Veil Nebula | exploration | anomaly fields (F7-31), sensor-ghost hazards, Vael research vaults | 1 M | sensor denial |
| Ashfall Reach | endgame | dreadnought arena (exists), amazonite cores, final-act staging, trophy claim | 1 L (trophy) | 21.6% interdiction, everything |
- **Sector rules of taste:** every sector answers in one screen: *what do I do here, what's the
  risk, what can't I get anywhere else.* Palette/audio identity (SPEC3-35/39) must agree with the
  verb (Sker sodium-dread, Veil hum-wonder).
- **Density targets:** each sector: 4–7 POIs (≥1 hidden), 1–2 fields (belt sectors 3), 1 signature
  hazard *that interacts with a verb* (radiation ↔ timed runs; sensor denial ↔ scan craft; gate
  camps ↔ route choice).

### 3. Architecture & wiring
Pure data expansion: `sectors.js`, `sectorAnchors.js`, `claimableBodies.js`, OFFER_MIX per new
archetype, palette hooks. The Tethys contracts board = missionLog/board UI variant (chained-contract
browsing, F1-12 types featured). No new sim systems — this spec *consumes* F1/F2/F4/F6 content.

### 4. Key code
None — this is the content bible for data authors. The one rule: every POI/hazard entry must name
the system that makes it play (`interacts: ['scanner','tether']`) — a lint check enforces no dead
dressing (`scripts/check-sector-content.mjs` asserts every POI's `interacts` references live systems).

### 5. Assets & generation
Per-sector prop palettes from existing kit + SPEC3-35 treatments; Vale's tower + trophy-claim body
are 2 authored meshes (SPEC3-37 queue).

### 6–7. Deps / build plan
No new deps. Build: 1) Charon bounty board + Tethys contracts board (closes recon §4.6 gaps);
2) claimable-body pass (with F6-26); 3) POI/hazard density pass per table; 4) hidden-POI/anomaly
placement (with F7-31); 5) lint check green.

### 8. Anti-patterns
Uniform density (contrast is identity — Helios busy-safe, Ashfall empty-lethal); POIs with no verb
(the lint rule exists to kill these); adding an 11th sector before the 10 sing; hazards as pure
damage floors (every hazard must be routable-around at a cost).

### 9. Ambition ceiling
One *changed-state* variant per sector tied to war/story (Io under occupation, Veil during a
research lockdown) — the world's biggest "it's alive" signal, all data swaps.

---

## SPEC3-31 — Exploration, anomalies & secrets
**One-line pitch:** make the frontier worth the fuel — scan-craft archaeology, anomaly expeditions,
corrupted tech, and secrets that convert curiosity into the game's best stories.

### 1. Why
Discovery policy (GDD §7.2) fixed the map-fog complaint; what remains is the *pull*: reasons to
point the nose at the dark. Recon: hidden-POI plumbing, survey data, wormhole gating, boss
persistence all exist — the frontier just has too few secrets on it.

### 2. The design
- **Anomaly sites (Veil/Ashfall + 1 roaming):** multi-stage scan puzzles: pulse reveals a ghost
  contact → triangulate (3 pings from different bearings — flying IS the puzzle) → stabilize
  (mini drill-timing beat, drill.js bench reused) → the vault: corrupted modules (F5-24's
  power-with-drawback), lore fragments, amazonite cores (F2-15).
- **Derelict archaeology:** derelicts get interiors-lite: 2–3 tether-anchor salvage points (cut
  plating, winch out the prize — F3-17 industry verb), a log fragment (story ecology, F7-32), and a
  10% "still powered" surprise (defense drone or survivor — 60/40 trust rule).
- **The rumor economy:** bars sell rumor cards (existing plumbing): hunter locations (F4-22), vein
  whispers (F2-15), anomaly bearings, cache coordinates. Rumors are *bearings, not waypoints* —
  you still fly the find. Sensor Post claims (F6-26) generate one local rumor/day.
- **Codex as trophy case:** every secret found fills a codex plate (K screen exists) with the
  find-story auto-written from its events ("Triangulated in Veil, 3rd attempt, under sensor denial").
  Completion % per sector on the nav chart — the explorer's scoreboard.
- **One true mystery:** a 5-stage cross-sector secret (the Vael signal, seeded per save) whose
  final vault holds the game's only unique ship part + a story key for B7's "Only Honest Option"
  ending. Community-bait by design; solvable solo by attention.

### 3. Architecture & wiring
Anomaly stages = small FSM in `scanner.js`-adjacent `src/systems/anomalies.js`; triangulation =
bearing intersection math on scan events (deterministic; the ghost position is seeded). Salvage
anchors = tether-valid child anchors on derelict defs. Rumors extend the bar screen data
(`narrative.js` + bar.js). Codex entries from event log. All state under `state.world.discovery`
(exists, persists).

### 4. Key code
```js
// Triangulation — the puzzle is POSITIONING, not UI. Three pings, bearings stored, intersect.
// Tolerance generous (8°) — the fantasy is "clever navigator", not "surveying exam".
function addPing(anom, shipPos, rng) {
  anom.bearings.push(bearingTo(shipPos, anom.truePos, jitter(rng, 2 /*deg*/)));
  if (anom.bearings.length >= 3) {
    const est = intersectBearings(anom.bearings);
    anom.revealed = dist(est, anom.truePos) < anom.radius * 1.5;   // close enough → vault appears
  }
}
```

### 5–6. Assets / deps
Anomaly VFX = existing nebula/energy recipes re-parameterized; vault prop = 1 authored mesh
(SPEC3-37). No new deps.

### 7. Build plan
1. `anomalies.js` + triangulate loop + 1 Veil site; `scripts/check-anomaly.mjs` (seeded solve
   deterministic from input tape).
2. Derelict salvage anchors + surprises.
3. Rumor cards (4 kinds) + Sensor Post daily rumor.
4. Codex plates + sector completion %.
5. The 5-stage mystery (authored last, after all systems prove).

### 8. Anti-patterns
Quest-marker exploration (bearings, never waypoints); pixel-hunt scanning (generous tolerances,
strong audio feedback); secrets gated on wiki knowledge (every stage teaches its next step);
lore dumps (fragments ≤3 lines, ever — the ecology carries it).

### 9. Ambition ceiling
Roaming anomaly: one site that *moves* between saves' sectors on a hidden schedule players can
chart — the genre's "Fata Morgana" legend, cost: one schedule table.

---

## SPEC3-32 — The narrative spine, paid off
**One-line pitch:** polish and surface the built Director Vale arc — pacing beats into the systems
game, making complicity legible, and landing all five endings as *playable* differences.

### 1. Why
Recon §5.3: the 8-beat spine, 3-phase complicity meta-arc, and 5 endings are "substantially built
and a real asset" — rewritten beyond the CONTENT_BIBLE's stale version. The risk is classic: a good
story the systems game never makes you *feel*. The fix is integration, not authorship.

### 2. The design
- **Beats ride systems (never interrupt):** each beat's trigger stays a systems milestone (B3 =
  afford T2; B6 = first passive asset). Beat *delivery* = one arbiter-priority line + a board-
  featured mission, never a modal after the opening. The spine is the tide, not the traffic.
- **Complicity made legible:** the 3-phase HUD arc (PROTECTIVE→COMPLICIT→ABSENT) gets one diegetic
  tell per phase (manifest font drift exists; add: customs scans wave you through in phase 2;
  station comms drop your callsign in phase 3 — you become infrastructure). Phase shifts headline
  *quietly* (one ticker line, no fanfare — dread is quiet).
- **Vale as presence:** 3 authored comms moments (REF 44-C filings) triggered by *player-economy*
  milestones (first 100k profit; first sector flip; first claim charter) — the antagonist notices
  what you actually did, not what the script assumed.
- **Endings as states, not credits:** each of the 5 choices sets a world-state package (faction
  reps, station access, HUD skin, OFFER_MIX shifts, epilogue card) and *keeps playing* — 47-B's
  "PENDING" hook (exists) becomes the New Run+ seed: one carried keepsake (keel item, F5-24) +
  hunter grudges persist. The ending you chose is legible every session after.
- **The ecology speaks:** graffiti/NPC barks (docs' NPC-ECOLOGY) get 12 war/story-reactive variants
  so Sker graffiti mourns flips and Helios ads deny them — the world corroborates the story.

### 3. Architecture & wiring
`story.js`/`narrative.js` own beats (exist). Add: milestone listeners for Vale moments
(`economy:*`, `war:*`, `claims:*` events all exist post-F1/F6); ending packages = data
(`narrative.js`) applied once at B7 resolution + saved flag; New Run+ = newGameDefaults overlay
keyed on prior-save ending. Arbiter integration is SPEC3-40's contract; this spec registers its
priorities. All deterministic (milestones are sim events).

### 4. Key code
```js
// Vale notices YOUR game. Milestone → one comms card, once, priority 'story'.
const VALE_MOMENTS = [
  { id: 'v1', once: true, when: s => s.player.stats.lifetimeProfit >= 100_000, ref: 'REF 44-C/7' },
  { id: 'v2', once: true, when: s => s.flags.playerNudgedFlip, ref: 'REF 44-C/12' },
  { id: 'v3', once: true, when: s => s.claims.bodies.length > 0, ref: 'REF 44-C/19' },
];
```

### 5–6. Assets / deps
12 graffiti/bark text variants (writing, no art); ending epilogue cards = UI template. No new deps.

### 7. Build plan
1. Beat-delivery audit to arbiter lines (kill any post-opening modal).
2. Complicity tells ×3 + quiet phase headlines.
3. Vale milestone moments; ending state packages + epilogue cards.
4. New Run+ (keepsake + grudges) — after F4-22/F5-24 land.
5. Floor: `check:onboarding`, `check-first-hour.mjs`, story-beat determinism check.

### 8. Anti-patterns
Modal story delivery (one voice, arbiter-gated, always); complicity as a meter UI (tells, not
gauges); endings that end (states, not credits); Vale monologues (3 moments, ≤5 lines each —
scarcity is menace); story gates on combat skill (every beat passable by any playstyle).

### 9. Ambition ceiling
A 6th, unmarked ending: refuse everything — never flip, never charter, never choose at B7 — and the
game notices ("SUBJECT NONCOMPLIANT. FILE REMAINS OPEN.") . The community finds it in week two.
