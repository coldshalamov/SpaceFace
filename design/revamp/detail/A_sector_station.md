# A — SECTOR IDENTITY, STATION LIFE & HAZARD LANGUAGE (gold packets)

> **Lane:** clusters A (sector identity & atmosphere), B (stations), R (hazards & gates).
> **Destination:** mostly **BP-11 (Sector Atmosphere & Station Life)**; a few **BP-08 asset cross-refs**.
> **The one filter:** every packet lets the player **see**, **predict**, or **change** a system that already ships.
>
> These packets almost entirely **SURFACE** shipped systems — `sectorZones.js` (named zones with
> faction/reason/threat + the `world:zoneEntered` cue), `dockDeny.js` (faction-voiced dock refusal),
> `marketNews.js` (news ticker + dock event cards), `world.js` station + gate spawn, `encounterDirector` +
> `encounters.js` (deterministic zone-anchored encounter shapes), `sectors.js` hazards + `SECTOR_PALETTE_CLASSES`.
> The design already carries all the *data* (zone names, reasons, hazard types, station types); the flat feeling
> is that the player can't **see** it. Nearly every packet here is a UI/glyph/geometry pass over existing data.
>
> **Stable contracts honored throughout:** determinism (seeded domains named per packet, no `Math.random` in sim);
> `factionId` is cosmetic + kill-rep only, hostility via `scanner.isHostileToPlayer`; every hostile spawn is a
> `spawnBudget` client (MAX 12); all player-facing text via `voiceArbiter` (`ctx.helpers.voice.say`, one voice at
> a time); `sectorZones` is the placement substrate; MERGE PROTOCOL — packets create only NEW files and list the
> hot files they must NOT touch (orchestrator integrates).

---

## TOP 3 (highest impact = distance-from-shipped × first-15 / 47-A visibility)

1. **SECTOR POSTCARD ON ARRIVAL** — first thing every new player sees at minute 0 and on every gate jump; turns
   the invisible `sectorZones`/`sectors.js` identity data into a one-glance card. Pure UI over shipped data.
2. **STATION ORBIT BUBBLES** — the outer-traffic → patrol → docking → no-fire ring geometry makes *every* station
   legible from afar and gives the no-fire ring real teeth in the first-15 first-station beat.
3. **NON-DOCKABLE STATION SURFACED** — `dockDeny.js` is shipped but the player never meets a station that refuses
   them with a *voice*; this is "the story is in the paperwork" made visible in the first hour.

---

## BP-11 — Sector Atmosphere & Station Life

### PACKET A1 · SECTOR POSTCARD ON ARRIVAL  *(SURFACE)*

- **name:** Sector Postcard
- **fantasy:** "I arrive somewhere and instantly know its name, who runs it, how dangerous it is, and what it sells."
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-11
- **reuses:** `sectors.js` (name, `factionId`, `security`→`dangerTier`, primary commodity via station `services`),
  `sectorZones.js` (`zonesForSector` → dominant zone names + threat), `marketNews.js` (a live headline as the
  "rumor line"), the shipped `sector:enter` bus event, `voiceArbiter` (headline routes through `news` channel).
- **newFiles:** `src/ui/sectorPostcard.js` (pure builder `buildPostcard(state, sectorId)` → `{name, faction,
  securityTier, hazards[], primaryCommodity, dominantZone, rumor}`, + a `typeof document`-guarded card mount).
- **noTouch:** `world.js`, `uiRoot.js`, `bindings.js`, `sectors.js`, `sectorZones.js`.
- **budget:** spawn:none · voice:`news` (one line, only if a live headline exists) · draw:+1 (one DOM card, no meshes)
- **rng:** none / pure UI — variant text (if any) reuses `marketNews` seeded `hash32(seed,key)`; no per-frame rolls.
- **acceptance:** on `sector:enter`, a card names the sector + dominant faction + security tier + hazard glyph row +
  primary commodity + one rumor line, all read from shipped data; headless `buildPostcard` unit test asserts the
  card for `sector_helios_prime` reads "Helios Prime / Solar Concord / secure / — / …" deterministically; dismiss
  on any input; never blocks flight.
- **failureModes:** reads flat if it's a lore dump — cap to ONE line per field, six fields max; blows the voice
  budget if it *speaks* every field — only the rumor line goes to `news`, the rest are silent card text; must
  degrade to a bare name card for a sector with no zones/commodities.
- **size:** M

---

### PACKET A2 · STATION ORBIT BUBBLES  *(ENRICH — zone geometry)*

- **name:** Station Orbit Bubbles
- **fantasy:** "Approaching a station I read its rings — outer traffic, patrol lane, docking approach, and the hard
  no-fire zone where drawing a weapon is a crime."
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-11
- **reuses:** `world.js` station spawn (each station already carries `pos`, `dockRadius`, `size`, `factionId`),
  `sectorZones.js` (bubbles are a derived zone geometry, same substrate — a `stationBubbles(station)` helper that
  returns concentric radii keyed off `dockRadius`), `scanner.isHostileToPlayer` (no-fire-ring enforcement is a
  readability + comms cue, NOT a new hostility source).
- **newFiles:** `src/data/stationBubbles.js` (pure: `bubblesFor(station)` → `{traffic, patrol, docking, noFire}`
  radii + colors, derived from `dockRadius`·multipliers + `size`), `src/render/stationBubbleRings.js` (guarded
  ring meshes with count/detail derived from clarity and measured scene cost, faction-readable).
- **noTouch:** `world.js`, `combat.js`, `uiRoot.js`, `render` root, `scanner.js`.
- **performance profile:** spawn:none · voice:`warn` (one bark on first weapon-draw inside no-fire
  ring, decays) · initial implementation used four rings per visible station with distance LOD; rederive
  the representation from current readability and profile evidence rather than treating four as law.
- **rng:** none / pure geometry (radii are deterministic functions of `dockRadius`).
- **acceptance:** `bubblesFor` returns four monotonic radii for a size-L station (`noFire < docking < patrol <
  traffic`); a headless test pins the radii; approaching Helios Station shows four tinted rings; drawing a weapon
  inside the no-fire ring emits exactly one `voice.say('warn', …)` per entry (debounced), no double-voice.
- **failureModes:** ring spam if every station in the sector draws all four rings → LOD cull to the nearest/target
  station only; must not become a *new* spawn or collision system — rings are cosmetic + a comms trigger; if it
  couples "no-fire" to `factionId` it violates the hostility contract — enforcement stays advisory (bark + rep hit
  routed through the existing kill-rep path, not a spawn).
- **size:** M

---

### PACKET A3 · NON-DOCKABLE STATION SURFACED  *(SURFACE)*

- **name:** Sealed Berth
- **fantasy:** "I hail a station and it turns me away in its own voice — and now I know why, and who runs it."
- **pillar:** one-voice · world-was-here
- **wave/BP:** W3 / BP-11
- **reuses:** `dockDeny.js` (SHIPPED — `dockDenyReason(station, factionMeta)` → `{reason, text}`, faction-voiced),
  `world.js` station data (`factionId`, and future `abandoned`/`private`/`militaryOnly`/`quarantine`/`repGated`
  flags dockDeny already reads), `voiceArbiter` (the denial line is one voice), the target/scan panel for the label.
- **newFiles:** `src/ui/dockDenyBanner.js` (on a dock attempt against a non-dockable station, read `dockDenyReason`
  and surface `{label, reason, text}` as a scan-result line + a single comm-denial voice line).
- **noTouch:** `dockDeny.js`, `world.js`, `uiRoot.js`, `bindings.js`, `input.js`.
- **budget:** spawn:none · voice:`comms` (one denial line per dock attempt, debounced) · draw:none (text only)
- **rng:** none / pure — `dockDeny` is fully deterministic.
- **acceptance:** attempting to dock `station_customs` (military) or a `repGated`/`abandoned` station shows the
  faction-flavored denial text and a scan line naming the reason code; `dockDenyReason` already unit-tested — this
  packet only adds a headless test that the banner surfaces its `text` and speaks exactly once.
- **failureModes:** double-voice if the denial *and* a market card both fire on the same dock attempt — the arbiter
  already serializes, but the packet must route through `voice.say` not `bus.emit('toast')`; reads flat if generic
  text shows for a factioned station — always pass `factionMeta` so the flavored line wins.
- **size:** S

---

### PACKET A4 · STATION SILHOUETTE READOUT  *(SURFACE — cross-ref BP-08)*

- **name:** Station-Type Silhouette Readout
- **fantasy:** "A shape on the horizon is instantly a refinery, a customs blockhouse, or a smuggler cache — I don't
  need to scan it to know what it is."
- **pillar:** glance
- **wave/BP:** W3 / BP-11 (asset dependency owned by **BP-08 §2 P0** — the 8 faction-distinct station GLBs)
- **reuses:** `world.js` station data (`stationTypeId`, `factionId`, `archetypeGlb`), BP-08's 8 authored station
  silhouettes (`place_station_concord_hub` … `place_station_vael_spire`), the map/HUD glyph layer.
- **newFiles:** `src/data/stationGlyphs.js` (pure map: `stationTypeId`/`factionId` → map glyph + one-word type
  label; a *readout*, NOT a mesh — GLBs are BP-08's job). **DO NOT author GLBs in this packet.**
- **noTouch:** `world.js`, `uiRoot.js`, `galaxyMap.js`, everything under `assets/`.
- **budget:** spawn:none · voice:none · draw:+1 glyph per station on the map layer (within the map-glyph budget).
- **rng:** none / pure UI.
- **acceptance:** each of the 7 `STATION_TYPES` maps to a distinct glyph + label; the map shows a refinery glyph on
  `station_ceres` and a blackmarket glyph on `station_smuggler`; a headless test asserts the glyph table is total
  (every `STATION_TYPES` id covered) and 1:1. **Blocked-on:** BP-08 P0 silhouettes for the 3D read; the map glyph
  ships independently and degrades gracefully if a GLB is still procedural.
- **failureModes:** duplicates the BP-08 GLB manifest if it tries to define meshes — it must stay a glyph/label map;
  glyph budget blown if every derelict/gate also claims a glyph — scope to the 7 station types only.
- **size:** S

---

### PACKET A5 · STATION BROADCAST BEHAVIOR  *(ENRICH)*

- **name:** Station Broadcasts
- **fantasy:** "Stations feel awake — a refinery vents, a research dish sweeps, a smuggler cache pings low and
  furtive — each in its faction's character, without ever talking over the mission."
- **pillar:** glance · world-was-here · one-voice
- **wave/BP:** W3 / BP-11
- **reuses:** `world.js` station data (`stationTypeId`, `factionId`), `voiceArbiter` (ambient broadcast lines are
  the LOWEST priority channel, decay fast, never mask mission/combat), `marketNews` cadence pattern (read-only,
  seeded), the render dressing layer for the *visual* tic (vent flare / dish sweep).
- **newFiles:** `src/systems/stationBroadcast.js` (a SYSTEMS-only, non-UPDATE_ORDER ambient emitter: on a timer,
  picks the nearest visible station's type-appropriate broadcast, routes text via `voice.say('ambient', …)` and a
  guarded cosmetic VFX tic; fully `typeof window`-guarded so it's cosmetic-only and determinism-safe).
- **noTouch:** `world.js`, `voiceArbiter.js`, `combat.js`, render root.
- **budget:** spawn:none · voice:`ambient` (rate-capped ≤1 line / ~20 s, first to yield to any higher channel) ·
  draw:+1 cosmetic tic per visible station (VFX-per-significance: lowest).
- **rng:** cosmetic-only `Math.random` allowed (guarded by `typeof window`) since it emits no sim state; if any
  broadcast affects sim it must move to a seeded domain — it must NOT.
- **acceptance:** parking near a refinery station periodically shows a vent tic + an ambient line in that faction's
  voice; higher-priority voice (combat/mission) always pre-empts it (one-voice audit passes); with no station
  visible it's a strict no-op; disabling window makes it silent.
- **failureModes:** THE big one — becomes chatter and violates pillar 3; mitigated by the `ambient` channel being
  strictly lowest and post-combat-silenced; must never emit during a mission comm; VFX must be significance-gated
  so it doesn't add draw cost in a fight.
- **size:** M

---

### PACKET A6 · STATION SIDE-EVENTS  *(ENRICH)*

- **name:** Station Side-Events
- **fantasy:** "I watch a hauler ease into dock, a patrol wing launch, a repair drone crawl a hull — the station
  has a life that isn't about me."
- **pillar:** world-was-here · glance
- **wave/BP:** W3 / BP-11
- **reuses:** `encounterDirector` + `encounters.js` shape pattern (a side-event is a tiny non-hostile encounter
  anchored to a station's docking bubble), `spawnBudget` (ANY ship it spawns is a budget client; most side-events
  are *cosmetic ambient traffic* with NO budget draw), `sectorZones` (station bubbles from A2 as the geometry),
  `traffic.js` roles (hauler/patrol) for the movers.
- **newFiles:** `src/data/stationSideEvents.js` (pure shape defs: `hauler_dock`, `patrol_launch`, `repair_drone`,
  `cargo_tractor` — each with a station-type affinity, a movement path relative to the bubble, and a budget cost),
  `src/systems/stationSideEventDirector.js` (seeded scheduler mirroring `encounterDirector`'s deterministic plan).
- **noTouch:** `world.js`, `encounterDirector.js`, `spawnBudget.js`, `traffic.js`, `combat.js`.
- **budget:** spawn:0–1 via `spawnBudget` (cosmetic drones/haulers prefer the ambient-traffic path with 0 draw;
  a *launching patrol* requests 1 slot and releases it when it leaves the bubble) · voice:none (visual only) ·
  draw:+1–2 movers per active event, LOD-culled beyond the nearest station.
- **rng:** **seeded** — domain `stationSideEvents.rng` = `mulberry32(hash32(seed, sectorId, dayIndex, stationId))`,
  same pattern as `encounterDirector`; a self-test asserts the same station-day yields the same schedule.
- **acceptance:** sitting near `station_helios` for a few minutes shows ≥1 legible side-event (hauler docks OR
  patrol launches OR drone repairs) drawn from the seeded schedule; the schedule is reproducible for a fixed seed;
  a launched patrol releases its `spawnBudget` slot on leaving; total live ships never exceeds the cap.
- **failureModes:** spawn-budget war with zone ambient + encounters — mitigated by preferring cosmetic ambient
  traffic (0 budget) and capping budgeted side-events to 1 concurrent per sector; determinism leak if it rolls
  per-frame — all rolls come from the seeded day schedule; reads flat if events fire off-screen — anchor to the
  nearest *visible* station only.
- **size:** L

---

### PACKET A7 · HAZARD LANGUAGE & COUNTERPLAY  *(SURFACE)*

- **name:** Hazard Language
- **fantasy:** "I see a hazard's shape and color and instantly know what it does to me — and what I do about it
  (avoid, shield, time it, tether through, or upgrade past it)."
- **pillar:** glance · momentum-toy
- **wave/BP:** W3 / BP-11
- **reuses:** `sectors.js` `HAZARD_TYPES` (`dense_asteroid`, `nebula`, `radiation`, `debris`) + per-sector `hazards`
  geometry, `sectorZones.js` hazard zone types (`radiation_field`, `nebula_fog` — already `hazard:true` with a
  color), `world.js` `_tickHazards` (SHIPPED hazard effect application — this packet SURFACES its causes, doesn't
  add effects), `voiceArbiter` for the one-line counterplay hint on first entry.
- **newFiles:** `src/data/hazardLanguage.js` (pure: `HAZARD_LANGUAGE[type]` → `{glyph, color, damages:[…],
  counterplay:[…], hint}` — e.g. radiation → "damages shields + cargo / counter: shield up, transit fast, or
  route around"), `src/render/hazardGlyphs.js` (guarded edge glyph on the hazard's boundary + map marker).
- **noTouch:** `sectors.js`, `sectorZones.js`, `world.js`, `galaxyMap.js`, render root.
- **budget:** spawn:none · voice:`warn` (one counterplay hint the first time the player enters a hazard *type* per
  session, then silent — tutorial-memory) · draw:+1 boundary glyph + 1 map marker per hazard.
- **rng:** none / pure UI over authored hazard geometry.
- **acceptance:** entering the `radiation` hazard in `sector_vesta_forge` shows a radiation glyph, a "shields +
  cargo" damage tag, and a one-time counterplay hint; the language table covers every `HAZARD_TYPES` id and every
  `hazard:true` zone type; headless test asserts totality + that the hint fires once per type.
- **failureModes:** hint spam if it re-fires every entry — gate to once-per-type-per-session; reads flat if the
  glyph is decoration with no counterplay — the `counterplay` field is mandatory and must map to a real verb the
  player has (avoid/shield/time/tether/route); must not restate effects `world.js` already applies — it *labels*
  them.
- **size:** M

---

### PACKET A8 · GATE TRAFFIC-CONTROL  *(NEW — encounter shapes)*

- **name:** Gate Traffic-Control
- **fantasy:** "Jumping through a controlled gate is a scene — a Meridian toll, a Concord scan, a queue in safe
  space — not a silent loading screen."
- **pillar:** world-was-here · one-voice
- **wave/BP:** W3 / BP-11
- **reuses:** `world.js` gate spawn (gates already exist as entities with `isGate`, `gateTo`, `dockRadius`, at
  `gateR ≈ worldRadius*0.82`), `encounterDirector` + `encounters.js` shape pattern (a gate scene is a
  zone-anchored encounter keyed to the gate + the sector's controlling faction), `sectorZones` (the gate sits in a
  `patrol_corridor`/`border_checkpoint` zone that names the controller), `voiceArbiter` for the traffic-control
  chatter, `economy.js` (a toll is the *existing* credit path — this packet requests it, never writes credits
  directly), `scanner` for the scan (a Concord scan reads cargo via the shipped scan, not a new one).
- **newFiles:** `src/data/gateControl.js` (pure shape defs per controlling faction: `mts_toll`, `scn_scan`,
  `queue`, mapping a gate's controlling `factionId`+sector security to a scene + one comms line + an outcome hook
  — pay/submit/wait), `src/systems/gateControlDirector.js` (seeded, fires on approach to a controlled gate).
- **noTouch:** `world.js`, `encounterDirector.js`, `economy.js`, `scanner.js`, `combat.js`, `bindings.js`.
- **budget:** spawn:0–2 via `spawnBudget` (a Concord scan wing = up to 2 patrol ships, budget-requested, released
  on jump; a queue/toll may be pure comms with 0 spawn) · voice:`comms` (one traffic-control line) · draw:none new.
- **rng:** **seeded** — domain `gateControl.rng` = `mulberry32(hash32(seed, sectorId, gateTo, dayIndex))`; the scene
  type for a given gate-day is reproducible.
- **acceptance:** approaching the customs-controlled gate in a high-security sector triggers a scan scene (one comms
  line + optional scan wing) before the jump completes; a Meridian-controlled gate offers a toll routed through the
  existing credit path (no direct credit write); a low-traffic frontier gate is silent; deterministic per gate-day;
  any spawned wing releases its budget on jump; a hostile/red-rep player skips the polite scene and gets the
  hostile path instead (via `scanner`, not `factionId`).
- **failureModes:** must NOT include gate **sabotage** (doctrine §8 defer) — cut from this packet; blocks travel if
  the scene can't resolve — every scene has a default "wait N seconds then proceed" fallback so a jump never
  deadlocks; spawn-budget war at the gate — cap the scan wing to 2 and never stack with an ambient ambush on the
  same gate; determinism leak if the toll amount rolls per-frame — it's a seeded/fixed value.
- **size:** L

---

### PACKET A9 · SECTOR HAZARD GRADIENT ON THE MAP  *(SURFACE)*

- **name:** Danger Gradient Readout
- **fantasy:** "One look at the map tells me where air is cheap and who kills me on the way — the S0→S9 danger
  gradient is literally visible."
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-11 (feeds BP-03 one-map; ships standalone on the current map)
- **reuses:** `sectors.js` (`security`→`dangerTier`, `wealthIndex`, `dangerIndex` — SHIPPED pure helpers),
  `galaxyMap.js` node layer, `sectorZones` threat tiers for the per-sector detail.
- **newFiles:** `src/ui/dangerGradient.js` (pure: `gradientFor(sector)` → color + tier badge from the shipped
  helpers; a map-node tint, not new geometry).
- **noTouch:** `sectors.js`, `galaxyMap.js`, `uiRoot.js`.
- **budget:** spawn:none · voice:none · draw:+1 tint per map node (no new nodes).
- **rng:** none / pure math over shipped helpers.
- **acceptance:** the galaxy map tints Helios (secure) cool and Ashfall (lethal) hot using `dangerTier`; a headless
  test asserts `gradientFor` is monotonic in `dangerTier` across the 10 sectors; no new map data introduced.
- **failureModes:** duplicates BP-03's map work if it adds nodes/fog — it only *tints existing nodes*; one-source-
  of-truth violation if it recomputes danger — it must call the shipped `dangerTier`/`dangerIndex`, never re-derive.
- **size:** S

---

## VALIDATED (already shipped — reframed, NOT rebuilt)

| Brainstorm item | Shipped system it already is |
|---|---|
| Station news ticker tied to sectorSim causes (cluster B) | `src/ui/marketNews.js` — the news ticker + dock event cards, seeded, read-only over the economy. |
| One-sentence sector identity felt in gameplay / "why this sector matters" (cluster A) | `src/data/sectorZones.js` — every zone carries `name` + `factionId` + `reason` + `threat`; `world:zoneEntered` already announces it. The **Sector Postcard (A1)** is a UI *over* this, not a rebuild of it. |
| Zone-entry announcement ("⟢ Belt-Shadow Ambush") (cluster A) | `world.js:_tickZoneLabel` → `world:zoneEntered` + toast, already shipped. |
| "Why prices changed" tooltip from the sector field driver (cluster B) | Owned by **BP-12** (cause ledger over `dangerModel`/`sectorSim`); `marketNews` already surfaces the headline. Not this lane. |
| Toll gates / customs cones / claim markers as *zones* (cluster B) | Already the substrate: `border_checkpoint`, `patrol_corridor`, `outlaw_zone`, `refinery_approach` zone types in `sectorZones.js`. Gate Traffic-Control (A8) adds the *scene*, not the zone. |

---

## CUT / DEFER (no packet written)

| Item (cluster) | Action | One-line reason |
|---|---|---|
| Local station reputation independent of faction rep (B) | **DEFER** | Gold-plating; a second rep axis the player can't yet see or act on. Faction rep + kill-rep already drive `dockDeny`. |
| Vael "wrong-geometry probes that distort HUD labels" (B) | **DEFER/reshape** | HUD corruption is reserved for **authored 47-A moments only** (doctrine + cluster Q); an ambient generator fighting the HUD risks determinism/legibility. Belongs to the story lane if ever. |
| Gate **sabotage** by Reach (R) | **CUT (from A8), DEFER** | Named defer in doctrine §8; and a gate that can't be used breaks the one-map travel contract. Toll/scan/queue only. |
| Signature ambient **sound** per sector / adaptive music state (A, O) | **DEFER** | Audio cadence is a `voiceArbiter`/BP-10 addendum; adaptive-music is a named §8 defer. Out of this lane. |
| "≥1 named anchor landmark visible from afar" as *new* landmarks (A) | **VALIDATED-adjacent / CUT here** | Landmarks are BP-08's `landmark:true` manifest flag + Memorial Array etc. already in `sectorZones`. No new packet needed in this lane. |
| Starfield shifts by tier / planet backdrops with parallax (A) | **DEFER to render lane** | `SECTOR_PALETTE_CLASSES` + `spaceBackground` already tier the field; deeper parallax is a Wave-2 render addendum, not BP-11. |
| Visible-but-not-always-active station **defenses** (turrets track, drones launch on alert) (B) | **DEFER** | Real, but it's a combat-readability/BP-02 concern (turret tracking = intent read), and any launched drone is a `spawnBudget` client better owned with A6/BP-01. Fold there later. |
| "Service personality (same UI, different voice)" (B) | **VALIDATED-adjacent** | The *voice* already exists in `dockDeny.js` faction flavor + `barks`; surfaced by A3. A full per-service voiced dock UI is a BP-10 polish addendum, not new machinery here. |

---

*Authored under `DETAIL_DOCTRINE.md`. Packets create only NEW files and list no-touch hot files; the orchestrator
integrates registration into `registry.js`/`world.js`/`uiRoot.js`/`bindings.js` at merge. Every hostile spawn is a
`spawnBudget` client; every player-facing line goes through `voiceArbiter`; every seeded roller names its domain.*
