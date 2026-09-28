# SEAM-BASE — destructible base entities (`combat:baseDestroyed`)

**Built:** the economy had listened for `combat:baseDestroyed` since before bases
existed — `onBaseDestroyed` ends piracy events tied to the dead base's station and
drops a `cmdty_narcotics` shortage — but nothing in the world could ever emit it.
Row 55 closes the seam from the sim/content side: real destructible bases now exist,
killing one emits the event, and an authored encounter fields the first one.

## The base

A base is an ordinary damageable `type: 'station'` entity carrying
`data.baseKind` (e.g. `'pirate_base'`), `data.dockless: true`, a finite hull, and a
persistent flag — not a new entity type, so the renderer, collision, and damage
paths already owned it.

- `src/core/coreSystem.js` — `dockless` stations skip `index.dockStations` while
  staying in `stations`/`statics`/`damageables`: no berth prompts, no traffic
  routing, still shootable.
- Station-service consumers audited over all 34 `index.stations` readers: physical
  and presentational ones (physics, HUD/map, world-record resolution, arena
  obstacles, faction presence) keep the camp; `stationId`-keyed lookups self-exclude;
  the four service-fictional ones now skip `dockless` bodies — `stationBubbles`
  (a pirate camp mints no law-voice no-fire ring), `stationSideEventDirector`
  (no repair-drone ambience), `stationBroadcast` (no ads from a gun nest), and
  `protectedStationAt` was already safe (no `stationId`, non-lawful).
- `src/systems/combat.js` — `entity:killed` now carries `baseKind`; when the victim
  has one, the kill path emits `combat:baseDestroyed` with the fields the economy
  consumes (`type`, `stationId`, `stationType`, `factionId`, `sectorId`, `killerId`,
  `pos`). Field camps emit `stationId: null` — the listener accepts them and touches
  no market.
- `src/systems/sectorSim.js` — a `pirate_base` kill books `base_destroyed`
  (danger −0.05, faction influence −0.16) instead of `infrastructure_loss`: burning
  a press camp makes its pocket *safer*, not disrupted.

## The first one — 358 THE PRESS CAMP

A Reach forward camp (`press_camp_raid`, combat deck, `ambush_lane`/`outlaw_zone`/
`derelict_field`, `maxSecurity 0.75`) standing a lawless pocket: the dockless hardstand,
a 3–4-ship raider garrison on station loiter, a pressed captive mule held under the
guns (`ai.moraleImmune` while the guns point), and the press-gang's take parked in real
cargo pods beside it.

- **team: 1** — the camp is a lawful hostile target; burning it can never file a
  witnessed `unlawful_kill` while the bounty desk pays out on the same act.
- **Ships spawn before the base** — every fire-time abort happens while the camp
  does not exist yet. Stations never enter the movables lane, so a `despawnAt`
  stamp could never retire one; ordering is the leak fix. Once the world has a camp
  it persists as a physical fixture even across a later abort.
- **Burn the camp** → `base_destroyed`: captive scatters (`forceFlee`, freed),
  reach rep −3, free rep +2 if the captive lives, pods become salvage.
- **Break the garrison** → `garrison_broken`: the released camp persists as a
  killable world body — the seam stays live after the encounter ends.
- **Walk away** → `raid_over`: cast releases unstamped; the camp works its pocket.

## Validation

`test/seam-base-destruction.test.mjs` — 9/9 green:

- Shape registered on the hollow zoneTypes.
- Fire materializes a damageable, dockless, persistent, team-1 hostile base excluded
  from `dockStations`; garrison/captive cast and take pods are real bodies; the
  captive's morale immunity lives on `data.ai` where every consumer reads it.
- End-to-end in one sim: `combat.kill` on the live camp emits `entity:killed`
  (`baseKind`, `targetHostileToPlayer: true`) then `combat:baseDestroyed`, and the
  runtime resolves `base_destroyed` with the captive freed.
- Garrison wipe resolves `garrison_broken` leaving the standing camp unstamped;
  a post-materialization abort stamps movable cast but the camp stands.
- Economy: piracy event ends and the narcotics shortage lands for a named station;
  a berthless field camp is accepted quietly.
- sectorSim: `base_destroyed` impulse (negative danger) vs `infrastructure_loss`
  for an ordinary station kill.
- Index regression: ordinary stations remain dockable.

Sibling hygiene: `356-the-surge-line.js` carried the same `moraleImmune` write to
`data` root — fixed to `data.ai` in this pass.

Encounter batch (76 tests) and adjacent combat/economy/sectorSim suites (31 tests)
green. The four red checks in the current smoke sweep are browser-runtime probe
timeouts (onboarding cold-open paths other lanes own); the same probes failed in
the morning sweep before this work started.
