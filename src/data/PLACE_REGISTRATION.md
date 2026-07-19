# Registering a map-visible place

<!-- atlas-example: zone_tethys_driftmark -->

**A new planet, station, system, route, or region is NOT done when it exists in the data. It is done
when it charts.** A place the Atlas cannot see has no map marker, no inspector panel, no accessible
description, no route leg, and no mission destination — it is invisible to every navigation surface
in the game while looking complete in the file you wrote it in.

The gate that decides is:

```
npm run check:atlas-integrity
```

Green means the place arrived. Red names the id, the file, and what is wrong with it.

> **Authority.** This document describes the *path*. The architecture behind it is
> `design/program/atlas/01_DECISIONS.md` (D2: the Atlas is a derived read model plus a validator —
> never a registry). The record shapes are owned by `src/core/atlasIndex.js`. Where this file and
> those disagree, they win and this file is stale — say so rather than editing them to match.

---

## The one thing people get wrong

**Author in sector-local coordinates. Always.** Every anchor, centre and position in `src/data/` is
relative to its own sector's origin. The conversion to galactic-global happens once, at the Atlas
boundary, in `sectorLocalToGlobalForSector`.

This matters more than it looks. `sector_helios_prime` has origin `(0, 0)`, so in Helios the two
frames are numerically identical and *every* frame bug is invisible. Helios is also the starting
sector — which is exactly why a projection defect once survived all the way to a shipped map that
drew nonzero-origin systems 12,288 WU away from themselves.

**So: never validate a new place only in Helios.** Put it somewhere with a real origin, or you have
tested nothing.

---

## The path

### 1. Choose the file

| What you are adding | Where it goes |
|---|---|
| A station, gate, or POI in an existing sector | `src/data/sectorAnchors.js` (or the region file under `src/data/frontierRegions/`) |
| A named region / zone in an existing sector | `src/data/sectorZones.js` |
| A self-contained place you do not want to thread into a large contended table | `src/data/authoredPlaces.js` |
| A whole new sector | `src/data/sectors.js` + `src/data/sectorCoordinates.js` (a frozen lattice origin) |

`authoredPlaces.js` exists because `sectorZones.js` and `sectorAnchors.js` are large and frequently
contended by several writers at once. It is an *additive seam*, not a second registry: the records in
it are ordinary zone records in the ordinary schema, appended into the same `SECTOR_ZONES` map the
Atlas has always derived from. Deleting the file and pasting its record back into `sectorZones.js`
would change nothing downstream.

> **Append, never spread.** `{ ...base, ...additions }` looks like the right merge and is not — it
> *replaces* a sector's entire zone list with your additions and silently deletes everything already
> authored there. Use `appendAuthoredZones`.

### 2. Write the record

Zone schema (`src/data/sectorZones.js`, `ZONE_TYPES` for the type vocabulary):

```js
{
  id: 'zone_tethys_driftmark',        // stable, unique across EVERY kind — saves depend on it
  name: 'Driftmark Survey',           // shown on the map and spoken by screen readers
  type: 'anomaly_deep',               // must be a key of ZONE_TYPES
  factionId: 'faction_archive',       // must be an id in FACTION_META
  reason: 'A cluster of survey buoys pinned around a mass reading that will not hold still.',
  center: { x: -2050, z: -1370 },     // SECTOR-LOCAL, not global
  radius: 480,
  threat: 1,                          // optional; overrides the archetype default
  // presence: omitted -> no spawns. See "Weight" below.
}
```

Station / gate / POI anchors (`src/data/sectorAnchors.js`) additionally accept `archetypeGlb`
(stations, gates) or `landmarkGlb` (POIs) naming an asset in `assets/ships/parts/places/`. **These
are optional.** See "Art" below.

### 3. Register it

For `authoredPlaces.js`, add the record to `AUTHORED_PLACE_ZONES` keyed by sector id. Everything else
is already wired — the Atlas derives from `SECTORS` and `SECTOR_ZONES` and needs no further step.

### 4. Validate

```
npm run check:atlas-integrity     # did it arrive, is it representable, does it resolve
npm run check:map-frames          # did it land in the right coordinate frame
npm run check:atlas-place-path    # can a player see, select, route to and save it
```

---

## Art: your place does not need any

**This is the rule that matters most, so it is stated plainly: adding ordinary content must never be
gated on an artist first modelling something for it.**

`src/core/atlasProxy.js` resolves every place to the cheapest representation that carries its
meaning, cheapest first:

| Tier | When | Cost |
|---|---|---|
| `glb-derived` | The place already ships gameplay art (`archetypeGlb` / `landmarkGlb`) | Reuses an existing asset; the pipeline decimates it. No new asset. |
| `procedural` | The place has authored geometry — a radius, a ring, a chord | Parametric, generated at runtime. **Free.** |
| `glyph` | Neither of the above, or no surveyed position | A standardized glyph plus accessible text. Cannot fail. |

The last tier cannot fail, so a place authored five minutes ago with no art at all still charts,
still labels, still reads to a screen reader, and still inspects. The gate asserts this directly
(`noPlaceRequiresBespokeArt`): if that check ever fails, ordinary content has silently become
"commission a hologram first".

**Never load full gameplay art to draw a distant marker.** A station GLB is several megabytes because
it must read as architecture from 200 WU. At chart range it is a dot. Proxies are capped at
`MAP_PROXY_TRIANGLE_CAP` (512 triangles), which the gate re-derives every run to confirm it stays
below the cheapest shipped `places/` asset.

Bespoke Blender work is an **earned upgrade** for places carrying narrative weight, never an entry
requirement. Authoring one: `node scripts/author-place-archetype.mjs <place_id>` (see
`assets/ships/parts/places/AGENTS.md`).

## Weight: your place does not need to spawn anything

A zone with no `presence` contributes no spawns. `planZoneSpawns` filters on that field, so an
ordinary map-visible place cannot move combat behaviour or the deterministic 47a golden. **A place
does not have to justify itself to the simulation in order to exist.** Add `presence` only when you
actually want ships there.

---

## What the gate checks, and what each failure means

| Assertion | It fails when | Fix |
|---|---|---|
| `authoredPlacesReachAtlas` | You authored a place the Atlas never saw | Check it is in a registered table; the id must be a non-empty string |
| `uniqueNodeIds` | Two places share a stable id | Rename one. Ids are shared across *all* kinds |
| `nodeSectorResolves` | The place names a sector with no frozen origin | Add the origin to `sectorCoordinates.js`, or fix the sector id |
| `anchorRoundTrip` / `globalPositionMatchesAuthored` | The local→global→local conversion is lossy | Almost always a global coordinate written into a sector-local field |
| `zonesInsideSector` | A zone centre is outside its sector's `worldRadius` | It is authored in the wrong frame, or genuinely too far out |
| `everyNodeHasMapRepresentation` | No label, no accessible text, or no inspector rows | Give the record a `name` |
| `noPlaceRequiresBespokeArt` | A place is unrepresentable without art | A proxy tier regressed — this is an engine bug, not a content bug |
| `proxyAssetsAvailable` | `archetypeGlb` names an asset not in the manifest or not on disk | Fix the id, or add the asset to `parts_manifest.json` |
| `proxyBudgetsWithinCap` | A derived proxy exceeds the triangle cap | Lower the decimation target |
| `authoredReferencesResolve` | Unknown faction, service, zone type, or `gatedBy` rule | Typo, or a genuinely new value that must be added to its vocabulary |
| `missionDestinationsResolve` | A mission routes to an id the chart has never heard of | The destination was renamed or never charted |
| `docExampleValidates` | **This document's worked example stopped validating** | The example below was deleted or broken — fix it or repoint the marker |

Report-only findings (non-reciprocal gates, unanchored places, overweight proxy sources) print but do
not fail. They are judgement calls for a human, not defects — a one-way wormhole is authored on
purpose. Asset *weight* is ruled on by `scripts/check-parts-manifest.mjs`, not here.

---

## Worked example: Driftmark Survey

The example this document is checked against is `zone_tethys_driftmark`, authored in
`src/data/authoredPlaces.js`. The marker at the top of this file names it, and
`check:atlas-integrity` fails if it stops being a live, charted, representable place — so this
section cannot rot into fiction without turning a gate red.

It was chosen to exercise the things that actually break:

- **Nonzero origin.** `sector_tethys_junction` is at `(12288, 8192)`. Its sector-local centre
  `(-2050, -1370)` is negative in both axes, so it converts to global `(10238, 6822)`. A conversion
  that drops the origin, or adds it with the wrong sign, lands somewhere provably wrong. The same
  record in Helios would prove nothing.
- **No art.** It resolves to a procedural 24-segment disc outline from its authored radius — the
  ordinary-content path, costing nothing.
- **No presence.** No spawns, no sim impact, no golden movement.
- **On a real route.** It sits on the inbound Helios → Tethys chord, so it is a place the default
  travel route passes rather than set dressing in a corner.

Its resolved accessible description:

> Driftmark Survey, region; anomaly deep; in tethys junction; radius 480 world units; at 10238, 6822
> galactic; charted.
