# B — Traffic, Pirates, Aces & Bounty Hunters (gold packets)

> **Lane:** brainstorm clusters **C** (traffic roles 32–52), **D** (pirates & aces 53–75, 121–125),
> **E** (bounty hunters 77–80). **Destinations:** traffic → **BP-11**; pirates/aces/bounty →
> **BP-13 (Pirate Ecology & Named Characters)**.
>
> **The one filter applied to every packet below:** *see it, predict it, or change it — else it is cost.*
>
> **What is already shipped (surface, do not reinvent):**
> - `src/systems/traffic.js` — the **8 causal roles** (hauler/courier/miner/patrol/escort/smuggler/pirate/rescue)
>   with distinct movement behaviors (`_stepOrbit`/`_stepFlee`/`_stepMiner`/`_stepEscort` + hauler dock loop),
>   causal per-sector role mix (`roleMixForSector`), a **seeded RNG domain** (`state.traffic.rngSeed`), and it
>   already tags each spawned entity `data.trafficRole` + `data.trafficLabel`. It emits real trades. **It does
>   NOT** call `barks.js`, has **no map glyph**, and has **no consequence-when-attacked** hook. That gap is this lane.
> - `src/data/barks.js` — per-faction radio VOICE corpus + deterministic `barkFor(factionId, situation, rng)`.
>   Situations already include `scan`, `warn`, `demand-cargo`, `attack`, `flee`, `reinforce`, `taunt`,
>   `patrol-greeting`. **Nothing in traffic.js reads it yet.**
> - `src/systems/encounterDirector.js` — deterministic ambush/convoy/patrol/distress-bait/named-miniboss shapes
>   anchored to zones, all `spawnBudget` clients, all speaking via `voice.say`. **`ambush-from-cover` is here →
>   VALIDATED (see bottom).** `enc.boss.names` already names captains.
> - `src/data/enemies.js` — `reaver_pirate` already *flees at <20% hull and calls 1–2 swarmers*; `corsair_raider`
>   ambush packs; `patrol_lawman` hostile-only-if-wanted. Pirate flee/reinforce behavior is shipped.
> - `src/systems/scanner.js` — `isHostileToPlayer` (hostility via team/archetype/context, **never factionId**);
>   `contactStateWord` already resolves MINER/TRADER/PATROL/HOSTILE/NEUTRAL; `PLAYER_DANGER_CONTEXTS` already
>   lists `bounty_hunter`. `contactThreatTier` is mass-based.
> - `src/ui/marketNews.js` — `createMarketNews(ctx)` + `bus.emit('news:headline', {...})` is the **faction-news seam**.
> - `src/systems/spawnBudget.js` — `request(n, id)` / `release(id)` / `releaseSome(id, n)`, MAX 12.
>
> **Merge protocol:** every packet below creates only NEW files (data tables + a thin system) and lists the hot
> files it must NOT touch (orchestrator wires those at merge). All hostile spawns go through `spawnBudget`.
> All player-facing lines go through `voiceArbiter` (`ctx.helpers.voice.say`), one voice at a time.

---

## TOP 3 (highest impact by first-15 / 47-A visibility)

1. **B1 — Traffic Radio Vocabulary** (surface `barks.js` through `traffic.js`) — turns 8 silent gold dots into
   8 *voices*. Every sector, minute one, the world starts talking in-character. Zero new spawns.
2. **B2 — Per-Role Contact Glyph & Intent Word** (surface `traffic.js` roles on the contacts strip) — the
   overview strip already shows a word; this makes hauler/courier/smuggler/rescue **read at a glance** on the
   first screen the player sees. Pure UI reader.
3. **B3 — Consequence-When-Attacked** (the missing causal hook in `traffic.js`) — shooting a hauler → scarcity
   + heat; a miner → Drift anger; a rescue craft → a moral scar. Makes piracy a *decision with a price*,
   the core of "the universe was here before you."

---

# BP-11 — Traffic (surface & deepen the shipped roles)

### B1 · Traffic Radio Vocabulary
- **name:** Traffic Radio Vocabulary
- **fantasy:** The gold dots on my scope aren't scenery — a hauler grumbles, a courier snaps, a patrol warns.
- **pillar:** one-voice · world-was-here
- **wave/BP:** W3 / BP-11
- **reuses:** `barks.js` (`barkFor`), `traffic.js` (role records + `data.trafficRole`), `voiceArbiter`
  (`ctx.helpers.voice.say`), sector `factionId`
- **newFiles:** `src/data/trafficVoice.js` (role→situation→faction mapping table + a `pickTrafficBark(role, situation, factionId, rng)` wrapper over `barkFor`, so a courier under chase draws `flee`, a patrol on approach draws `patrol-greeting`, a smuggler-when-scanned draws `warn`)
- **noTouch:** `traffic.js`, `voiceArbiter.js`, `barks.js`
- **budget:** spawn:none · voice:one line per event via arbiter (rate-capped by arbiter; ambient traffic barks are LOW priority so combat/story always wins) · draw:none
- **rng:** seeded — reuse `state.traffic.rngSeed` (`_rng()`); no `Math.random`
- **acceptance:** headless — for a fixed seed + sector, entering the sector and stepping one patrol to greeting range yields the identical bark string across two runs; combat comms preempt an in-flight ambient traffic bark (arbiter priority test)
- **failureModes:** chatter spam (mitigate: per-ship cooldown ≥ 20 s + arbiter LOW priority + only on *state changes*, never per-frame); two voices at once (arbiter owns this — never bypass it)
- **size:** M

### B2 · Per-Role Contact Glyph & Intent Word
- **name:** Per-Role Contact Glyph & Intent Word
- **fantasy:** One glance at the strip and I know hauler from courier from smuggler from rescue.
- **pillar:** glance
- **wave/BP:** W3 / BP-11
- **reuses:** `scanner.js` (`contactStateWord`, `contactThreatTier`), `traffic.js` (`data.trafficRole` + `data.trafficLabel` already set on spawn), the HUD contacts strip
- **newFiles:** `src/data/trafficGlyphs.js` (role→glyph + role→intent-word table for the currently shipped HAULER/COURIER/MINER/PATROL/ESCORT/SMUGGLER/RAIDER/RESCUE roles, with a readable fallback for future data-driven roles) + a pure `trafficRoleReadout(entity)` reader
- **noTouch:** `scanner.js`, `hud.js`, `uiRoot.js`
- **budget:** spawn:none · voice:none · draw:none (text/glyph only, reuses existing strip rows)
- **rng:** none / pure UI
- **acceptance:** five-second-screenshot test — every traffic contact in a populated sector shows a distinct role word; `contactStateWord` still returns its existing values for non-traffic entities (regression: no change to combat contacts)
- **failureModes:** unreadable or indistinguishable contact marks (validate current and future roles at actual strip/radar size, using text or shared shapes where that reads better); collision with `contactStateWord`'s existing MINER/TRADER words (resolve by having the reader *prefer* `data.trafficRole` when present, fall through to the shipped word otherwise)
- **size:** S

### B3 · Consequence-When-Attacked (the missing causal hook)
- **name:** Traffic Attack Consequence
- **fantasy:** I shot a hauler for its cargo — and the station's shelves went bare and the law remembers.
- **pillar:** world-was-here · one-voice
- **wave/BP:** W3 / BP-11
- **reuses:** `traffic.js` (`data.trafficRole`), heat system (`heat.js` — `isPlayerWanted` seam already used by scanner), `economy` trade-event bus (`aiTrader:requestTrade`, already emitted by traffic), `marketNews` (`news:headline`), `voiceArbiter`
- **newFiles:** `src/systems/trafficConsequence.js` (listens for `entity:damaged`/`entity:destroyed` on a `data.trafficRole` entity; maps role→consequence: hauler→scarcity nudge + heat, miner→Drift-anger heat + "claim jumper" bark, rescue→moral/rep scar + somber news line, courier→request-escort call). Owns only its own listener state.
- **noTouch:** `heat.js`, `economy.js`, `traffic.js`, `marketNews.js`, `combat.js`
- **budget:** spawn:none (may *release* a fled courier's escort request only via existing encounterDirector, no new spawner) · voice:one bark via arbiter on the attacked ship · draw:none
- **rng:** seeded — a `trafficConsequence` domain hashed from `state.meta.seed` for any magnitude jitter; no `Math.random`
- **acceptance:** headless — damaging a `miner` traffic entity raises heat by the fixed delta and enqueues one arbiter bark; killing a `rescue` entity emits exactly one `news:headline` of the somber kind; determinism check identical across two runs
- **failureModes:** double-counting economy (only *nudge* scarcity via the existing trade-event path, never write prices directly — BP-04 owns prices); heat runaway (cap per-incident delta); news spam (one headline per incident, arbiter-gated)
- **size:** M

### B4 · Role Movement Signatures (deepen the shipped step-behaviors)
- **name:** Role Movement Signatures
- **fantasy:** The heavy hauler wallows and takes forever to turn; the courier jinks and burns short and hot.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-11 (addendum tuning to `traffic.js` behaviors — data only)
- **reuses:** `traffic.js` (`TRAFFIC_ROLES` speed/archetype, `_stepOrbit`/`_stepEscort` already exist), flight intent (`setIntent`)
- **newFiles:** `src/data/trafficMovement.js` (per-role kinematic profile: turn-rate scalar, brake distance, burst cadence, offset-approach angle for smugglers, wedge-loop params for patrols — a pure data table the traffic step reads; NO new step functions, it parameterizes the existing dispatch)
- **noTouch:** `traffic.js`, `flightV3.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** seeded (reuse traffic domain for burst-timing jitter) · none for the profile constants
- **acceptance:** headless — a hauler's heading changes slower than a courier's over the same dt given identical targets (turn-rate scalar honored); smuggler approaches a station off the radial axis (approach angle ≠ 0); patrol traces a wedge loop not a circle
- **failureModes:** determinism leak if burst cadence uses wall-clock (must use `simTime`); visual-only tweak that fails the filter (mitigate: turn-rate & approach-angle are *predictable* — the player reads intent from motion, so it passes "predict it")
- **size:** M

### B5 · Rescue Craft Appear After Accidents (surface the shipped `rescue` role causally)
- **name:** Rescue Craft On Cue
- **fantasy:** A ship blew up near me and minutes later a rescue skiff drifts in to pick through the debris.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-11
- **reuses:** `traffic.js` (`rescue` role already defined, currently spawned only at sector-enter by weight), `salvage.js`/wreck events, `spawnBudget`
- **newFiles:** `src/systems/rescueDispatch.js` (on a combat-death or mining-accident event in-sector, requests ONE slot from spawnBudget and injects a `rescue`-role traffic record targeting the wreck; releases on arrival/despawn). Thin, additive.
- **noTouch:** `traffic.js`, `salvage.js`, `spawnBudget.js`, `world.js`
- **budget:** spawn:1 via spawnBudget (client; skips cleanly if world at cap) · voice:optional one "responding to distress" bark · draw:none
- **rng:** seeded — `rescueDispatch` domain for spawn offset
- **acceptance:** headless — a simulated `entity:destroyed` of a civilian in-sector, with budget headroom, produces exactly one rescue-role spawn heading to the wreck; at cap, zero spawns and no throw
- **failureModes:** spawn-budget war (always a *client*, never bypasses; 1 slot max, low priority); rescue spam on a big fight (cooldown + one-in-flight cap)
- **size:** M

---

# BP-13 — Pirate Ecology & Named Characters (all `spawnBudget` clients)

### B6 · Scan → Toll → Violence Ladder
- **name:** Pirate Toll Ladder
- **fantasy:** The raider doesn't just open fire — it sizes me up, demands a cut, and *then* shoots if I refuse.
- **pillar:** one-voice · glance · world-was-here
- **wave/BP:** W3 / BP-13
- **reuses:** `barks.js` (`scan`/`demand-cargo`/`attack` situations already exist), `encounterDirector` (ambush spawns), `scanner.isHostileToPlayer`, `voiceArbiter`, cargo/heat
- **newFiles:** `src/systems/pirateParley.js` (a small state machine layered on an already-spawned pirate squad: SCAN → DEMAND (bark `demand-cargo`, opens a short comply/refuse window) → VIOLENCE (bark `attack`). Comply = drop a cargo tithe, they break off; refuse/timeout = hostile. Owns only its own per-squad parley state.)
- **noTouch:** `encounterDirector.js`, `combat.js`, `scanner.js`, `barks.js`, `cargo.js`
- **budget:** spawn:none (rides an existing encounterDirector ambush squad) · voice:the three ladder barks via arbiter, one at a time · draw:none
- **rng:** seeded — `pirateParley` domain from `state.meta.seed`+squadId for tithe amount and demand-vs-immediate roll
- **acceptance:** headless — a spawned pirate squad with a `parley` doctrine emits SCAN then DEMAND barks before any weapon fires; complying (dropping the tithe) flips the squad to break-off; refusing flips `isHostileToPlayer` true within the window. Determinism identical across runs.
- **failureModes:** softlocks if the window never resolves (hard timeout → violence); pirates that were always meant to be hostile-on-sight (bait/distress) must NOT get the ladder (gate by doctrine, not by all pirates); two barks at once (arbiter)
- **size:** L

### B7 · Fake-Civilian-Until-Scan
- **name:** Wolf In Gold Paint
- **fantasy:** That "hauler" reads neutral on my scope — until I scan it and the manifest is a lie and the guns come out.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-13
- **reuses:** `scanner.js` (`contactStateWord`, scan pulse resolves data fields), `traffic.js` team-2 neutral rendering, `barks.js` (`warn`/`attack`), `encounterDirector`
- **newFiles:** `src/data/pirateDisguise.js` (a doctrine flag `disguised:true` + a `revealOnScan` reader) — a disguised pirate carries `data.trafficRole='hauler'` cosmetically and reads NEUTRAL until a scan pulse sets `data.disguiseBlown`, after which `contactStateWord`/`isHostileToPlayer` see the true archetype
- **noTouch:** `scanner.js`, `traffic.js`, `hud.js`
- **budget:** spawn:via existing encounterDirector (no new spawner) · voice:one `warn`/`attack` bark on reveal · draw:none
- **rng:** seeded (which disguise skin) via encounter director's stream
- **acceptance:** headless — before scan, `contactStateWord` returns a civilian word and `isHostileToPlayer` is false; after a scan pulse sets `data.disguiseBlown`, both flip to hostile. No per-frame flicker (reveal is sticky).
- **failureModes:** unfair ambush (the disguise must be *scannable* — the counterplay is scan-before-approach, so it passes "predict it"); breaking the hostility contract (route reveal through the scanner seam only, never couple to factionId)
- **size:** M

### B8 · Break-Off-When-Patrol-Arrives
- **name:** Law On The Horizon
- **fantasy:** The raiders scatter the moment a Concord patrol wing shows up — the law actually means something here.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-13
- **reuses:** `enemies.js` (pirates already flee at low hull), `scanner.js` (lawful patrol detection), `encounterDirector` (patrol shapes), `barks.js` (`flee`), SG-06 flee behavior
- **newFiles:** `src/systems/pirateDisengage.js` (checks for a live lawful `patrol` context ship within a radius of a pirate squad; if present, sets the squad's AI to disengage/flee and speaks a `flee` bark. Reuses the *existing* flee FSM, only supplies the trigger.)
- **noTouch:** `encounterDirector.js`, `enemies.js`, `combat.js`, SG-06 AI files
- **budget:** spawn:none · voice:one `flee` bark per squad · draw:none
- **rng:** none (deterministic proximity trigger) — or seeded for a small nerve threshold
- **acceptance:** headless — a pirate squad with a lawful patrol spawned within the radius transitions to flee within N ticks and emits one flee bark; with no patrol present it keeps its normal behavior (no false disengage)
- **failureModes:** pirates that instantly evaporate (add a nerve delay so it reads as a *reaction*, not a teleport); flee-loop chatter (one bark, cooldown)
- **size:** M

### B9 · Pirate Doctrines (surface as a readable data axis)
- **name:** Pirate Doctrines
- **fantasy:** A toll-collector wants my money; a thief wants my cargo; a salvage-jackal wants my wreck — and they act like it.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-13
- **reuses:** `encounterDirector` (already passes `doctrine` through to `spec.data.ai.doctrine`), `barks.js`, SG-06 (already reads doctrine), `enemies.js`
- **newFiles:** `src/data/pirateDoctrines.js` (defines `toll` / `thief` / `salvage-jackal` / `tech-raider` / `ideological` as a table: each maps to a demand type (B6 ladder), a target-preference (value vs weakness), and a bark register. **Cut `slaver` — defer, gold-plating/tonal.** Feeds the encounter director's existing `doctrine` field.)
- **noTouch:** `encounterDirector.js`, `encounters.js`, SG-06 AI, `barks.js`
- **budget:** spawn:none (data only) · voice:none directly · draw:none
- **rng:** seeded via director's stream (which doctrine a given ambush rolls)
- **acceptance:** headless — an ambush with `doctrine:'toll'` triggers the B6 parley ladder; `doctrine:'thief'` skips demand and grabs cargo; the doctrine is queryable for the contacts strip / scan readout
- **failureModes:** doctrine that changes nothing observable (each doctrine MUST alter demand type OR target choice OR bark — else cut it); scope creep into new AI FSMs (doctrines only *parameterize* existing behavior)
- **size:** M

### B10 · Named Crews & Aces (flee-and-remember + faction news)
- **name:** Named Crews & Aces
- **fantasy:** "Yara No-Cut" jumped me, I hurt her, she ran — and next week the station news says she's back with a bigger crew.
- **pillar:** world-was-here · one-voice
- **wave/BP:** W3 / BP-13
- **reuses:** `encounterDirector` (`enc.boss.names` already names captains; `data.encounterBoss`), `enemies.js` (flee-at-low-hull), `marketNews` (`news:headline`), `barks.js`, `voiceArbiter`, `spawnBudget`
- **newFiles:** `src/data/namedAces.js` (a small roster: Red Latch Crew / Sker Hooks / The Empty Ledger crews; leaders Yara No-Cut, Toll Saint Venn, Mako of the Broken Ring — each with a loadout gimmick tag + a signature bark line) + `src/systems/aceMemory.js` (persists per-ace state in `state.aceMemory`: encountered / fled / defeated; on a flee, schedules a "returns bigger" flag; on defeat, emits a faction `news:headline`)
- **noTouch:** `encounterDirector.js`, `marketNews.js`, `enemies.js`, `narrative.js`
- **budget:** spawn:via encounterDirector as a named-miniboss (existing `spawnBudget` path) · voice:signature bark on appearance + one news headline on flee/defeat · draw:none
- **rng:** seeded — `aceMemory` domain from `state.meta.seed`+aceId for return timing
- **acceptance:** headless — defeating a named ace emits exactly one `news:headline` naming that ace; a fled ace's `state.aceMemory[id].fled` is set and a return is scheduled deterministically; save/reload round-trips `state.aceMemory`
- **failureModes:** ace state not saved (must live in saved `state.aceMemory`, versioned); news spam (one headline per state transition); factionId-coupled hostility (route through scanner/context only)
- **size:** L

### B11 · Spared-Pirate-Returns-Bigger ("pirate promotion")
- **name:** Pirate Promotion
- **fantasy:** I let that raider run instead of finishing him — and he came back with a better ship and a grudge.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-13 (rides B10's `aceMemory`)
- **reuses:** `aceMemory` (B10), `encounterDirector` (spawn with a higher level band on return), `spawnBudget`, `barks.js` (`taunt`)
- **newFiles:** *(none — an addendum to `aceMemory.js` from B10: on a scheduled return, request the ace at a bumped level/loadout and speak a "you should have finished me" taunt)*
- **noTouch:** `encounterDirector.js`, `enemies.js`
- **budget:** spawn:via encounterDirector/spawnBudget (existing) · voice:one taunt bark on return · draw:none
- **rng:** seeded (aceMemory domain) — return delay + level bump
- **acceptance:** headless — an ace flagged `fled` re-appears after the scheduled interval one level band higher with a callback taunt; a *defeated* ace does NOT return (no zombie bosses)
- **failureModes:** infinite escalation (cap the promotion at N tiers); un-losable difficulty spiral (bump is bounded); determinism (all timing seeded)
- **size:** S

### B12 · Station Pirate-Rumor Heat
- **name:** Pirate Rumor Heat
- **fantasy:** The station board warns "three haulers vanished near the Pallas Spur" — and it's *true*, that lane really is hot.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-13
- **reuses:** `marketNews` (headline seam + dock cards), `encounterDirector` (ambush frequency per zone), `sectorZones` (named lanes), traffic-attack events (B3)
- **newFiles:** `src/systems/pirateRumor.js` (accumulates a per-zone "loss heat" from actual ambush spawns + civilian deaths in a lane; surfaces the hottest lane as a `news:headline`/dock card naming the zone. Purely a *reader/aggregator* of events that already happen.)
- **noTouch:** `marketNews.js`, `encounterDirector.js`, `sectorZones.js`
- **budget:** spawn:none · voice:one dock-card/headline via news seam · draw:none
- **rng:** seeded (which rumor phrasing) — reuse marketNews `pickVariant`
- **acceptance:** headless — after K ambushes/civilian-losses seed into one zone, `pirateRumor` emits a headline naming that zone; a quiet zone produces none. Heat decays over time (no permanent scare).
- **failureModes:** rumor that lies (must derive from *real* ambush/loss events → "no random spawn without provenance"); news spam (one rumor per zone per cooldown)
- **size:** M

### B13 · Ignoring-Pirates-Raises-Route-Danger / Defeating-Leader-Boosts-Convoys
- **name:** Route Danger Feedback
- **fantasy:** I cleared out the raider captain and suddenly there are more convoys on the lane; I ignored them and the lane got deadlier.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-13 (rides B10 + B12)
- **reuses:** `aceMemory`/`pirateRumor`, `encounterDirector` (ambush weight per zone), `traffic.js` (`roleMixForSector` — convoy/hauler weight), `marketNews`
- **newFiles:** *(none — an addendum to `pirateRumor.js`: a defeated-leader event *lowers* a zone's ambush weight and nudges traffic role-mix toward convoys for a period; sustained ignored ambushes *raise* it. Both surface a one-line news cause.)*
- **noTouch:** `encounterDirector.js`, `traffic.js`, `marketNews.js`
- **budget:** spawn:none (adjusts *weights* the existing spawners read) · voice:one news cause line · draw:none
- **rng:** seeded (rumor domain)
- **acceptance:** headless — a defeated-leader event reduces that zone's scheduled ambush count on the next plan and raises convoy weight; the change is announced once via news. Bounded (weights clamp).
- **failureModes:** unbounded feedback (clamp min/max weights); silent change (every shift emits a cause line — "no economy/world change without cause")
- **size:** S

### B14 · Ambush Signatures (readable pre-ambush tells)
- **name:** Ambush Signatures
- **fantasy:** A dead beacon, a debris line, cargo bait, a sudden sensor fog — I learn to read a trap before it springs.
- **pillar:** glance
- **wave/BP:** W3 / BP-13
- **reuses:** `encounterDirector` (ambush placement in ambush/derelict/nebula zones), `sectorZones` (hazard types: nebula fog, debris), scan pulse, wreck/salvage props
- **newFiles:** `src/data/ambushSignatures.js` (a table pairing an ambush shape with a *pre-spawn tell* prop: disabled-beacon marker / debris line / cargo-bait pod / false-distress ping / sensor-fog patch) + a thin placer that drops the tell prop a beat before the ambush fires
- **noTouch:** `encounterDirector.js`, `sectorZones.js`, `scanner.js`
- **budget:** spawn:none for hostiles (the tell is a passive prop, not a ship) · voice:none (the *false-distress* variant reuses the shipped distress bark) · draw:+1 passive prop marker per pending ambush
- **rng:** seeded via director stream (which signature)
- **acceptance:** headless — a pending ambush places its paired tell prop before the ships spawn; scanning the tell hints "possible ambush" (counterplay); no tell → no ambush of that shape (provenance)
- **failureModes:** decorative-only tell that fails the filter (each tell must be *scannable* into a warning → predictable); draw budget (one lightweight prop per pending ambush, released with it)
- **size:** M

### B15 · Ambush Wreck Fields → Salvage POIs / Pirate-Base Discovery
- **name:** Ambush Leaves A Grave
- **fantasy:** Where raiders keep hitting convoys, a wreck field grows — and following the wreck trail leads to their nest.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-13 (folds toward BP-01 salvage; the *pirate-vector* half lives here)
- **reuses:** `salvage.js`/`wreckMissions.js`, `sectorSim` offscreen losses (wreck provenance), `pirateRumor` (repeated-ambush-vector), `encounterDirector`
- **newFiles:** *(none new here — a hook: `pirateRumor` marks a zone with repeated ambushes as a candidate pirate-base POI, handed to the salvage/POI system to seed a discoverable base. The wreck-field seeding itself is BP-01's job; this packet only supplies the pirate-vector provenance.)*
- **noTouch:** `salvage.js`, `encounterDirector.js`, `sectorSim`
- **budget:** spawn:none directly (base discovery routes through existing POI/salvage spawners) · voice:none · draw:none
- **rng:** seeded (rumor domain)
- **acceptance:** headless — a zone that accumulates ≥ K ambushes is flagged as a pirate-base candidate exposed to the POI system; the flag is provenance-linked to the actual ambush events
- **failureModes:** base with no payoff ("no POI without payoff" — the base must offer salvage/bounty when reached; that payoff is BP-01/BP-06's contract, this packet just plants the seed)
- **size:** S

---

## BP-13 — Bounty Hunters

### B16 · Bounty-Hunter Neutrality (the player is not the contract)
- **name:** Bounty Hunter Neutrality
- **fantasy:** A hunter blows past me chasing someone *else* — I can help, hinder, or stay out of it.
- **pillar:** world-was-here · glance
- **wave/BP:** W3 / BP-13
- **reuses:** `scanner.js` (`isHostileToPlayer`, `PLAYER_DANGER_CONTEXTS` **already lists `bounty_hunter`**), `encounterDirector` (spawn shape), `enemies.js` archetypes, `spawnBudget`, `barks.js`
- **newFiles:** `src/data/bountyHunters.js` (a bounty-hunter encounter shape whose ships carry `ai.spawnContext='bounty_hunter'` **and a `data.contractTargetId`**; hostile to the player ONLY when `contractTargetId === playerId`, otherwise neutral and chasing an NPC target) + a thin `src/systems/bountyHunt.js` that spawns the hunter, gives it an NPC quarry to pursue, and lets the player's interference shift the outcome
- **noTouch:** `scanner.js`, `encounterDirector.js`, `combat.js`
- **budget:** spawn:1–2 via spawnBudget (client) · voice:hunter hail bark via arbiter · draw:none
- **rng:** seeded — `bountyHunt` domain for quarry selection + spawn placement
- **acceptance:** headless — a bounty hunter with `contractTargetId !== playerId` returns `isHostileToPlayer=false` and pursues its NPC quarry; set `contractTargetId=playerId` and it flips hostile. Interfering (killing the quarry / defending it) changes the recorded outcome deterministically.
- **failureModes:** hunter that treats everyone as hostile (the neutrality is the whole point — gate hostility strictly on `contractTargetId`, never on `bounty_hunter` context alone. **Note:** `PLAYER_DANGER_CONTEXTS` currently contains `bounty_hunter`, which would make ALL hunters hostile — this packet must route hunter hostility through `contractTargetId` and the orchestrator must reconcile the context list so a neutral hunter is not force-hostile. Flag to merge.)
- **size:** M

### B17 · Bounty-Hunter Signature Trick (one gimmick per hunter)
- **name:** Hunter's Signature Trick
- **fantasy:** This hunter cuts tethers; that one drops mines; another spools an emergency jump when cornered — each is a puzzle.
- **pillar:** glance · momentum-toy
- **wave/BP:** W3 / BP-13 (rides B16)
- **reuses:** `enemies.js` (archetypes + weapons), SG-06 AI, tether/impulse physics (`flightV3`, tether system), `barks.js`
- **newFiles:** `src/data/hunterTricks.js` (a table: tether-cutter / mine-dropper / phase-jammer / shield-turtle / ram-plate / decoy-clone / emergency-jump-spool — each maps to an existing physics/combat verb + a telegraph + a counter-window). Assigned to a bounty-hunter via B16's shape.
- **noTouch:** `combat.js`, `flightV3.js`, tether system files, SG-06 AI
- **budget:** spawn:none (rides B16's hunter) · voice:one telegraph bark per trick · draw:trick VFX counts against VFX-per-significance budget (one telegraph per activation)
- **rng:** seeded — which trick a given hunter carries (bountyHunt domain)
- **acceptance:** headless — a hunter with `trick:'emergency-jump-spool'` telegraphs (bark + spool state) before jumping, giving a counter-window; each trick maps to exactly one existing verb (no new physics subsystem); determinism identical across runs
- **failureModes:** trick with no telegraph = unfair (every trick MUST telegraph → "predict it"); new-machinery creep (each trick reuses an existing verb; if a trick needs a wholly new system, defer it); VFX spam (one telegraph per activation, budgeted)
- **size:** M

---

## CUT / DEFER

| Item (source cluster) | Action | Reason |
|---|---|---|
| Slaver pirate doctrine (D 59) | **Defer** | Tonal/gold-plating; boarding/slaver branches explicitly deferred by doctrine §8. |
| Disable-and-board / surrender-if-disarmed / bribe-to-escape full branch matrix (D 59) | **Defer** | Rich but wrong-decade; B6 toll ladder delivers the *core* comply/refuse verb; full matrix is backlog. |
| "Wrecks contain evidence of who funds them" (D 60) | **Defer** | Evidence/47-A machinery is cluster Q's lane (BP-12/story); a pirate packet shouldn't own the fact graph. |
| Nonlethal-unless-resisted as a distinct outcome system (D 59) | **Reshape** | Subsumed into B6 (comply → break-off) rather than a parallel outcome engine. |
| Pirate "shift routes if convoys well-defended" full adaptation model (L overlap) | **Defer** | B13 gives the *readable* slice (defeat→convoys up, ignore→danger up); a full pathing-adaptation model is BP-04/BP-01 economy scope. |
| Bounty-hunter chase as a standalone questline | **Reshape** | B16 delivers the ambient help/ignore/interfere verb; a scripted questline is BP-05 story scope, not a traffic/pirate detail. |

## VALIDATED (already shipped — reframed, NOT rebuilt)

- **Ambush-from-cover / pirate ambush shapes** ≡ `encounterDirector.js` + `encounters.js` `ambush`/`distress`
  (bait)/`named_miniboss` shapes anchored to `ambush_lane`/`outlaw_zone`/`derelict_field` zones. **Do not rebuild.**
- **Fake distress bait** ≡ `encounters.js` `distress` variant (60% genuine / 40% pirate bait, seeded roll).
- **Pirates flee at low hull + call reinforcements** ≡ `enemies.js` `reaver_pirate`
  (`flees at <20% hull`, `reinforcements: wasp_swarmer`). B8/B10 supply *new triggers* (patrol-arrival, ace-memory),
  not a new flee FSM.
- **Named captains** ≡ `encounters.js` `named_miniboss.boss.names` (Vane the Ash, Redcut Sorrel, …). B10 *persists
  and remembers* them; it does not re-invent naming.
- **Hostility via context, not factionId; lawful patrols hostile only if wanted** ≡ `scanner.isHostileToPlayer`
  + `patrol_lawman` (`factionLawful`). B16 routes bounty-hunter hostility through this exact seam.
- **Per-faction radio voice** ≡ `barks.js` `barkFor` corpus (8 factions × 8 situations). B1 *surfaces* it through
  traffic; it does not add a parallel voice system.
- **Global one-voice cap** ≡ `voiceArbiter` — every bark above goes through it.
- **Station news headline seam** ≡ `marketNews` `news:headline` / dock cards — B10/B12/B13 emit through it.
