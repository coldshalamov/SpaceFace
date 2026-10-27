<!-- LIFETIME: CAMPAIGN -->
# Alive-world plan — density, toybox, chaos (2026-10-27)

Owner direction: GTA-like fun — controlled chaos, more physics, a world you can
push on. The world "seemed mostly empty." Planning phase; asset-light first
(set the pieces this repo already has); ambitious model-work goes to build_map.

Evidence base: three audits (density / vaulted content / interaction verbs),
2026-10-27, all file:line verified against the live tree. Headline: **the world
is not under-authored, it is under-delivered to the default route** by pacing
caps, spawn short-circuits, proximity/rumor gates, and unregistered places.

## Diagnosis (the empty world, quantified)

- Starter sector Helios: `enemyDensity: 0` (sectors.js:60) short-circuits the
  ambient spawner (world.js:4350) — its authored Customs Corridor patrol
  (sectorZones.js:108-110) is dead data. Fresh-player sky = 6 clustered
  freighters, 0 hostiles (traffic.js:156-158, POCKET_CLUSTER_R 420).
- 234 of ~355 encounter shapes are `externalOnly` — the planner never rolls
  them (encounterDirector.js:3740). Lived vignettes are consumed once-ever per
  save even when they abort (livedWorldDirector.js:203-221).
- Majors planned on 35% of days, hard caps 1/2/3 per 600 s day, RARE_GATE,
  900-1200 s cooldowns (encounterDirector.js:184-202) → ~8-14 low-stakes
  scenes/hour, zero combat in hour one.
- Frontier sectors carry authored silence (`trafficPerMin: 0`, sectors.js:1233,
  :1344); traffic spawns only on sector:enter — no ambient loop.
- Fauna: 19 sites, none in the starter arc; casts never respawn
  (alienEcology.js:384-388). A player can finish hour 5 never seeing a creature.
- All 6 wonders, the one planet, and the marquee set-pieces sit 2-6 gate jumps
  out; local unique wrecks materialize only after a rumor mints their bearing
  (uniqueWrecks.js:673-678). Proximity gating + STARTER_SAFE_RADIUS 1400 keep
  everything away from the player (sectorCoordinates.js:31).
- Content covers under 2% of the playable sector disc.

## Tier 1 — turn the dials (constants + data rows; days, not weeks)

1. **Starter-sector life**: Helios enemyDensity 0 → 0.2-0.35; decouple
   zone-presence spawning from the hostile grant (world.js:4350→:4371) so
   authored patrols spawn in lawful sectors as lawful presence.
2. **Open the encounter planner**: livedRotation flags on more scenes; stop
   consuming a vignette forever on abort; majors 35%→60% of days; minor cap
   2→3; ambient 3→5; shorten scene cooldowns. Target: a beat every 2-3 min.
3. **Continuous traffic**: ambient top-up loop (not just sector:enter);
   MAX_PER_SECTOR 8→12; hollow frontier sectors get 1-2/min (lonely convoys,
   not zero); widen POCKET_CLUSTER_R.
4. **Shrink safe shells**: 1400/1100/900 → ~700/600/450 so life happens near
   the player (keep no-spawn-on-top via line-of-sight spawns).
5. **Career-scale toll gates**: minCargoValue 160-240 flat → scaled by career
   day, so hour-one players get pirated for 2 ore — which is still a story.
6. **Fauna on-route**: 1-2 sites within two jumps of Helios; non-keystone
   casts respawn per season (keystone uniques stay one-time).

## Tier 2 — open the vaults (built content, zero/unwired; days each)

7. **tethysSwitchyard** — complete authored place + GLBs + custody helpers,
   zero importers. Register it.
8. **Borrowed Sun** — full system + berths + prompt UI, unregistered (the data
   file says so itself). One registry row: "the station that is only visiting,"
   docking at a different sector per calendar.
9. **adventureArenaSites** — 5 Crucible physics laws as real world sites,
   currently consumed only by save migration. Wire them live.
10. **Discovery pressure**: a rim rumor/board ladder (landmarkMissions pattern)
    for the 14 frontier sectors, 6 wonders, 17 landmark quests; a one-line
    pointer for the Bolus; an approach hail for the Ilex Ark; post-ending
    teaser rows for the mega-heists/bosses. ~30 rim-proximity special-500
    entries come alive free once this exists.
11. **Crucible cross-feed**: adventure deeds earn ladder stars (6 of 9 authored
    arenas are star-gated in a menu mode).

## Tier 3 — the toybox (controlled-chaos verb unlocks; the GTA lever)

12. **Gyre Snare diet**: absorb payloads/pickups/mines/jettisoned pods, not
    just asteroid/wreck (GYRE_ABSORBABLE_TYPES, data/gyreSnare.js:29). Every
    lane becomes a katamari range. And TEACH it — it is on Quote with zero
    onboarding mentions (absent from TAUGHT_FLIGHT_ACTIONS and verbSpeech).
13. **Ram consequences**: admit asteroids as damage receivers
    (DAMAGEABLE_MOTION, collisionConsequences.js:70) — asteroid-on-asteroid
    shatters, hurled rock dents site structures. Stations stay ram-proof but
    their loose props become shoveable via the existing unmoored status
    (fields.js UNMOORED_STATUS_ID) — stations become physics playgrounds.
14. **Player mine-laying**: the hard part ships (player-thrown mines are
    provenance-stamped grenades, mines.js:7,208-210); add the one player verb.
15. **Litter**: overkill kills spawn 2-4 manifest pods instead of 1
    (lootShards.js D2) — every fight leaves grabbable, tetherable loot.
16. **Generalize the witnessed-tow template** (towlineTable.js:44 is one desk
    at Ceres) to any station manifest; hull-burst full-bumper setting for
    neutrals; a starter-grade Twin Bridle head so world-to-world rope physics
    is discovered in hour one, not after a shop roll.

## Tier 4 — ambition (build map additions, need new models/work)

- 2-3 more gas giants/stars on the existing generic band machine (skim/sling
  is one planet today; planetRuntime is built for more).
- Destructible station externals with authored damage states (new GLBs).
- Station interiors (proto exists in proto/).

## Sequencing

Tier 1 first (it changes the feel of every existing minute, cheapest per
unit of felt-aliveness), Tier 3 items 12-15 next (chaos verbs), Tier 2 in
parallel lanes (pure registration), Tier 4 to build_map. Each tier lands with
player-truth adventure + a fixed-seed density count (entities-in-view at
camera, events/hour on the starter route) so "empty" is a number we retire.
