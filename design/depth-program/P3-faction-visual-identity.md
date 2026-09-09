# P3 — Faction Visual Identity Kit

**Thread:** depth-P3 · **Reads:** root `AGENTS.md`, `assets/AGENTS.md`, `assets/ships/AGENTS.md`,
`src/render/AGENTS.md`, this pipeline, `src/data/factions.js`, `src/data/palettes.js`,
`src/render/partsLibrary.js`, `src/systems/world.js` (station spawn), and
`src/data/sectorAnchors.js` · **Status:** PLAN
**Thread pitch:** 8 factions have distinct identity (Concord lawful-blue, Meridian corporate-gold, Drift blue-collar-orange, Reach pirate-red, Quiet smuggler-violet, Vael alien-green, Frontier independent-cyan, Choir zealot-magenta) — but **a station's GLB is chosen by station type, with faction never consulted.** A Concord trade_hub and a Meridian trade_hub look identical. Faction identity surfaces today only as ship hull/accent material tint, galaxy-map node color, and a colored dot on the factions screen. Stations — where players spend their docked time — have zero faction visual identity. This pipeline combines **runtime livery** for reusable coverage with evidence-selected **hero silhouettes** wherever authored form carries the identity.

---

## Ground truth (verified against the working tree 2026-07-12)

- **8 factions** in `FACTION_META` (`src/data/factions.js:6-81`). Canonical `color` hex per faction. Plus `faction_helix` (paper-only — no ships, no territory; contracts/news/dock-deny only).
- **Richer per-faction palette** at `src/data/palettes.js:7-72` — `FACTION_PALETTES` gives each faction 6 fields: `primary, secondary, accent, hull, emissive, thruster`. **This is what the render track actually consumes.** Also `PAINT_PROFILES` (palettes.js:88-98) keyed by *personality* (lawful/corporate/independent/blue_collar/pirate/smuggler/xenophobic) with `grime, chrome, noseArt, killMarks, patches` — the documented "dirty outlaw vs clean authority" look.
- **Station GLB selection is type-driven, not faction-driven.** Each station anchor carries `archetypeGlb` verbatim (`src/data/sectorAnchors.js` line 22, 23, 41, 42, 61, 62, 79, 80, 98, 99, 118, 138, 156, 172, 189; same pattern in `src/data/frontierRegions/*.js`). `world.js:1010` copies `archetypeGlb: st.archetypeGlb || null` into the spawned station entity. `partsLibrary.js:545, 599, 739, 877` read `data.archetypeGlb` to pick the GLB from `PLACE_FILES`. The 8 archetypes are `STATION_ARCHETYPE_FILES` (partsLibrary.js:44-53). **Faction is not consulted at any point.**
- **BUT — material tint IS already faction-aware.** `paletteFor(entity)` (`partsLibrary.js:3110-3128`) keys off `entity.factionId`. Station entities carry `factionId` (`world.js` stamps it), and the authored station GLB tints via `buildPlacePropRoot` → `paletteFor` (line 730) on its `Material_Hull`/`Material_Accent` slots. So today a station's *color* is faction-aware; its *silhouette* is not.
- **The existing accent-variant mechanism is mis-named.** `factionAccentVariants` in `parts_manifest.json` (e.g. line 2469-2486) is keyed by **palette-class** (core/belt/fringe/anomaly), NOT faction. It's a build-time hint consumed by `scripts/build-world-station-archetypes.mjs:199` — **not read at runtime.** This is the seam to extend.
- **No "livery" / "station_skin" mechanism exists** — a repo-wide search returns zero results. P3 creates it.

KNOWN BUGS: none. The glyph layer (`stationGlyphs.js`) is type-driven too; a Concord trade_hub and Meridian trade_hub show the same `⬢ Market` on the map. P3-tier-runtime could optionally extend to glyphs but that's out of scope for the first pass.

---

## §1. Why

Stations are where players spend docked time — the shipyard, the market, the missions board, the bar. Flying to a station and not knowing *whose* station it is until you read the faction label is a constant low-grade "same place" friction. Faction identity is the second-biggest spatial-repetition driver (after same-prop-per-zone, which is P1). Runtime livery (tint + emissive accent + decal slot) is the efficient first layer; bespoke geometry remains available wherever playtesting shows that material treatment cannot deliver a distinct faction read.

## §2. The design — complementary identity layers

### Layer A — Runtime faction livery (broad reusable coverage)

A per-faction **livery override** that goes beyond the existing `paletteFor` material tint. For each faction, define a `stationLivery` block (in `palettes.js` or a new `src/data/factionLivery.js`) keyed by factionId, containing: an `accentEmissive` color (glow strips / running lights), an optional `decalMaterial` slot ref, and a `silhouetteTag` (for future hero-station routing). Wire a new resolver — `stationLiveryFor(entity)` in `partsLibrary.js`, sibling to `paletteFor` — that the station build path consults when `entity.factionId` matches a livery entry.

This can make a shared station body read differently through faction-authored material, marking,
lighting, wear, and motion treatments. The existing palette values are starting references; judge each
result in representative sectors and extend the data shape when tint and emissive fields are not enough.

### Layer B — Hero faction station GLBs (evidence-selected authored identity)

Author **bespoke station archetype GLBs** wherever silhouette, structure, material response, animation,
or close exposure is central to faction identity, and route specific stations through a faction-aware
extension of `STATION_ARCHETYPE_FILES`. Initial candidates include Vael, Reach, and Choir, but current
captures may justify others. Choose geometry, materials, and LOD from real exposure and representative
performance captures rather than a fixed range.

**Allocation rule:** establish a reusable livery path and author hero silhouettes in parallel where
the intended identity clearly depends on form. Captures/playtests decide the mix; livery is not a gate
that a faction must fail before authored geometry is allowed.

## §3. Architecture & wiring (touch files)

| Touch | Purpose | Layer |
|---|---|---|
| `src/data/palettes.js` **or** new `src/data/factionLivery.js` | define `STATION_LIVERY[factionId] = { accentEmissive, decalMaterial?, silhouetteTag? }` | A |
| `src/render/partsLibrary.js` (~line 3110, sibling to `paletteFor`) | add `stationLiveryFor(entity)`; consult it in `buildPlacePropRoot` (line 730) for the `Material_Emissive`/`Material_Accent` slot tints | A |
| `src/render/partsLibrary.js:44-53` (`STATION_ARCHETYPE_FILES`) | append evidence-selected hero faction GLBs | B |
| `assets/ships/parts/places/place_station_<faction>_<archetype>.glb` | new hero GLBs | B |
| `assets/ships/parts/parts_manifest.json` | register hero GLBs | B |
| `src/data/sectorAnchors.js` + `src/data/frontierRegions/*.js` | point specific stations at hero `archetypeGlb` by faction | B |

**Do NOT touch:** `release_manifest.json` (auto-written). The legacy render files. `src/systems/input.js`.

**Serialization:** `src/render/partsLibrary.js` is the C-thread single-writer point (`00_ORCHESTRATION.md` §6). If a graphics lane is active, do not edit it — coordinate.

## §4. Key code — the seam to extend

The runtime tint resolver that already keys off faction:

```js
// src/render/partsLibrary.js:3110 — EXISTING, faction-aware material tint
function paletteFor(entity) {
  const faction = entity.factionId && FACTION_PALETTES[entity.factionId];
  if (faction) return { hull: faction.hull||faction.primary,
                        accent: faction.accent||faction.primary,
                        thruster: faction.thruster||...,
                        dark: faction.secondary||'#111820' };
  if (entity.team === 0) { /* faction_free palette */ }
  if (entity.team === 1) { return { hull:'#7a3540', ... }; }
  return { hull:'#6b7280', ... };
}
```

P3-Tier-A adds a sibling:

```js
// PROPOSED — src/render/partsLibrary.js, sibling to paletteFor
function stationLiveryFor(entity) {
  if (!entity.factionId) return null;
  const livery = STATION_LIVERY[entity.factionId];
  if (!livery) return null;
  return livery;  // { accentEmissive, decalMaterial?, silhouetteTag? }
}
// buildPlacePropRoot (~line 730) consults it AFTER paletteFor:
//   emissive slot tint = livery?.accentEmissive ?? palette.emissive
```

The build-time accent-variant block to optionally rename/extend:

```json
// parts_manifest.json:2469 — currently keyed by palette-CLASS (mis-named "faction")
"factionAccentVariants": {
  "core":    { "accent": "#39d0ff", "thruster": "#88aaff" },
  "belt":    { "accent": "#ffb35c", "thruster": "#ff8844" },
  "fringe":  { "accent": "#ff5c5c", "thruster": "#ff4466" },
  "anomaly": { "accent": "#8d66ff", "thruster": "#4ddc92" }
}
```

## §5. The faction backlog

Layer A (runtime-livery coverage for the sector-owning factions):

| Faction | `factionId` | Palette anchor | Livery character | Paint profile (personality) |
|---|---|---|---|---|
| Solar Concord Navy | `faction_scn` | `#3A78FF` blue | clean, cool-blue emissive window strips, chrome | lawful |
| Meridian Trade Syndicate | `faction_mts` | `#F2B233` gold | warm gold accents, corporate holographic decals | corporate |
| Drift Miners Collective | `faction_dmc` | `#C9772E` orange | industrial orange, worn hazard stripes, exposed mechanisms | blue_collar |
| Crimson Reach | `faction_reach` | `#D8334A` red | jittery red-orange emissives, welded/cobbled, grime | pirate |
| The Quiet | `faction_quiet` | `#7A5FB0` violet | dim violet, masked/running-dark, minimal emission | smuggler |
| The Vael | `faction_vael` | `#2FCFA0` green | green-cyan resonance glow, organic pulse | xenophobic |
| Free Frontier | `faction_free` | `#4ECBE0` cyan | plain cyan, utilitarian, no strong identity (the "default") | independent |
| Ascendant Choir | `faction_choir` | `#E85FD0` magenta | magenta cathedral-glow, tall emissive spires | (zealot — add to PAINT_PROFILES) |

Layer B hero-silhouette candidates (can proceed alongside livery when form is identity-defining):

| Faction | Candidate archetype | Why bespoke |
|---|---|---|
| `faction_vael` | research / military | Alien geometry (resonance rings, curves) can't be carried by tint alone |
| `faction_reach` | blackmarket | Cobbled/welded pirate haven silhouette is identity-defining |
| `faction_choir` | research / military | Cathedral/spire zealot geometry |

**First worked example:** implement the reusable livery resolver and a representative faction treatment,
then compare Vael and Concord in normal routes. In parallel, use the Vael hero GLB as the authored-form
proof if current evidence shows that alien identity depends on silhouette. The example proves both
paths can compose; it does not impose a global livery-first sequence.

## §6. Libraries / tooling

- **Implementation fit:** existing data and resolver seams should cover the base feature. Runtime or build dependencies remain allowed when they materially improve quality and their license, bundle/performance, determinism/save, and maintenance impact are documented.
- **New acceptance check recommended:** `scripts/check-faction-livery.mjs` — asserts (a) every `factionId` in `FACTION_META` that owns sectors has a `STATION_LIVERY` entry, (b) each livery has valid color data and preserves semantic contrast/accessibility, and (c) Layer B hero GLBs (if any) are registered in all required manifests and runtime maps. Distinctness itself is accepted from representative side-by-side player-route captures at real viewing conditions, not a synthetic palette-distance threshold. Wire as `check:faction-livery`, add to `check` aggregate. Build it as iteration 0.

## §7. Build plan

### Iteration 0 (the wiring)
1. Decide home for the livery data: extend `src/data/palettes.js` or new `src/data/factionLivery.js`. Prefer `palettes.js` (keeps faction color data together).
2. Add `stationLiveryFor(entity)` in `partsLibrary.js` (sibling to `paletteFor`); consult it in `buildPlacePropRoot` for the emissive/accent slot.
3. Build `scripts/check-faction-livery.mjs` (iteration 0 check).
4. Run `npm run check:visual-stability`, `npm run check:sim:compare`. Screenshot a Vael station vs a Concord station into `.devshots/`.

### Per faction (Layer A)
1. Define `STATION_LIVERY[factionId] = { accentEmissive, silhouetteTag }`.
2. If the faction's personality isn't in `PAINT_PROFILES`, add it (e.g. `zealot` for Choir).
3. Run `check:faction-livery`, `check:visual-stability`, screenshot the faction's stations in 2–3 owned sectors.
4. Update `**Status:**`. Print 10-line summary.

### Per faction (Layer B, when authored form materially improves identity)
1. Verify current asset ownership, then author `place_station_<faction>_<archetype>.glb` with the material roles required by the runtime classifier. Set geometry and LOD from screen-space need and measured scene cost.
2. Register in all 3 registries (parts_manifest.json, auto-written release_manifest, `STATION_ARCHETYPE_FILES`).
3. Point the faction's stations at the hero `archetypeGlb` in `sectorAnchors.js` / `frontierRegions/*.js`.
4. Run full asset acceptance (`check:asset-reachability`, `check:assets:live`, `check:asset-status`, `check:visual-stability`).

## §8. Anti-patterns

- **DON'T** force every faction through a tint-only gate before authoring form. Spend authored effort
  where current captures show silhouette, material, or animation is the identity-bearing layer.
- **DON'T** edit `partsLibrary.js` while a graphics lane is active — it's the C-thread single-writer point. Coordinate or wait.
- **DON'T** key livery by palette-class (the existing mis-named `factionAccentVariants` mistake) — key by `factionId`. The whole point is per-faction identity.
- **DON'T** make livery colors that clash with the faction's canonical `FACTION_PALETTES` — livery *extends* the palette, it doesn't override it. The accent emissive should harmonize with `faction.accent`/`emissive`.
- **DON'T** diverge browser and desktop (AGENTS.md §6) — livery is runtime data, must be identical in both.
- **DON'T** solve perf by disabling station emissives (AGENTS.md §6 Performance policy) — if emissives are heavy, batch/instance, don't cut.

## §9. Ambition ceiling

A fully-liveried galaxy is the foundation for **faction territory read** — flying from Concord space into Reach space should *feel* like crossing a border, with the station livery shifting from clean-blue to jittery-red over 2–3 jumps. Beyond livery: per-faction **dock interior** variants (the `place_dock_interior*` family at `shipPreviewMount.js:31-39` currently keys by station archetype; it could key by faction), per-faction **billboard** content (`place_station_billboard`), and per-faction **nav buoy** glyphs. And the map glyph layer (`stationGlyphs.js`) could grow a faction ring/color around the type glyph. Each is a small follow-on; none belong in P3-first-pass.

---

## Dispatch block (copy into the agent thread)

> **You are THREAD depth-P3 — Faction Visual Identity Kit only.**
>
> Read in order: root `AGENTS.md` · `assets/AGENTS.md` · `assets/ships/AGENTS.md` ·
> `src/render/AGENTS.md` · this file · `src/data/factions.js` · `src/data/palettes.js` · the live
> `src/render/partsLibrary.js` faction/material and station-routing seams · `src/data/sectorAnchors.js`.
> Use current manifests and code when dated line references have drifted.
>
> **Target:** `<FACTION_ID>` (e.g. `faction_vael` — see §5 backlog), with reusable livery, an
> evidence-selected hero asset, or both as the intended identity requires.
>
> **Iteration 0 (wiring, once):** add `stationLiveryFor(entity)` to `partsLibrary.js`, consult in `buildPlacePropRoot`; build `scripts/check-faction-livery.mjs`; screenshot a Vael vs Concord station.
>
> **Ownership protocol for authored assets:** inspect markers together with live Blender/export
> processes, recent writes, and active agent ownership. Coordinate genuine overlap or select a
> non-overlapping asset; a marker alone is not a stop condition.
>
> **Do (Layer A):** define `STATION_LIVERY[factionId]`, add personality to `PAINT_PROFILES` if missing, run checks, screenshot the faction's stations across representative owned sectors (default game path).
>
> **FORBIDDEN:** overwriting `partsLibrary.js` during verified active overlapping work without
> coordination. Keying livery by palette-class. Treating existing palette values as exclusive art
> direction. Browser/desktop divergence. Silent perf cuts. Editing `release_manifest.json` by hand.
> Destructive shared-tree git operations prohibited by root policy.
>
> **Acceptance:** `node scripts/check-faction-livery.mjs` green (after iter 0) · `npm run check:visual-stability` · `npm run check:asset-reachability` (Layer B) · `npm run check:assets:live` (Layer B, failureCount:0) · `npm run check:sim:compare` (hashEqual:true) · `node scripts/check-tether-gameplay.mjs` · screenshot pair in `.devshots/`.
>
> `git add -N` every new file immediately. Report which faction and tier shipped, livery fields or authored asset characteristics, which sectors show it, representative performance observations, green checks, screenshot paths, and deferred items.
