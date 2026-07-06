# BP-11 — SECTOR ATMOSPHERE & STATION LIFE

> **New BP** (one of three capped detail BPs — see `DETAIL_DOCTRINE.md` §6). Governed by the doctrine's one
> filter: *see it, predict it, or change it.* **Absorbs brainstorm clusters A (sector identity/atmosphere,
> 1-10), B (stations, 11-31), R (hazards & gates, 451-480).** Packets: `detail/A_sector_station.md` +
> `DETAIL_PACKETS.md`. **Extends** SPEC3-F7/F8; **reuses** the shipped `sectorZones`/`world.js`/`marketNews`/
> `dockDeny`; **depends on** BP-08 station-silhouette assets (Grok) for the visual half.

## Goal
Kill "flat and empty" at the level the player feels first: **every sector announces its identity, and every
station reads as an inhabited place with a purpose** — not an identical floating shell. Objective #1 + #2 (the
universe was here before you; readable at a glance).

## Scope (packets live in `detail/A_sector_station.md`; highlights)
- [ ] **Sector postcard on arrival** — identity line + dominant silhouette + "why it matters" + rumor line, drawn from `sectorZones` + the shipped `world:zoneEntered` cue. (Extends the shipped zone toast — do not rebuild it.)
- [ ] **Station orbit bubbles** — outer traffic / patrol / docking / hard no-fire inner rings, as zone+spawn geometry; hostiles/patrols already respect `spawnBudget`.
- [ ] **Non-dockable stations surfaced** — label + reason + scan result + comm-denial via the shipped `dockDeny.js` (this is a SURFACE packet — the data exists).
- [ ] **Station-type silhouettes** — cross-reference BP-08 P0 (the 8 faction-distinct station cores); **do not author GLBs here** (Grok's lane).
- [ ] **Station broadcast behavior + side-events** — refinery vents, shipyard cranes, scan beams; hauler docking, patrol launch, repair drones (budgeted VFX-per-significance + `spawnBudget` for any ships).
- [ ] **Station news ticker** — VALIDATED (already `marketNews`); this packet only wires station-local framing.
- [ ] **Hazard language + counterplay** — radiation rings / nebula fog / mine triangles / gravity arcs as readable glyphs with a counterplay verb each.
- [ ] **Gate traffic-control** — queues (safe) / tolls (Meridian) / scans (Concord) as `encounterDirector` shapes near ring-gates.

## Contracts
Determinism (seeded); `spawnBudget` client for any spawns; `voiceArbiter` for station comms; `sectorZones` is
the placement substrate; map-glyph + silhouette budgets are hard caps (doctrine §1).

## Acceptance
`check:sector-atmosphere` (new): entering any sector fires exactly one postcard through `voiceArbiter`; a
non-dockable station returns a specific reason; each hazard type renders a distinct readable glyph; five-second-
screenshot test — every station type is identifiable by silhouette. No console errors; perf within the 30fps floor.

## Dependencies
`sectorZones` (shipped) · `marketNews`/`dockDeny` (shipped) · BP-08 station/landmark assets (Grok) for the visual half.
