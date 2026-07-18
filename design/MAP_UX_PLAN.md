# MAP_UX_PLAN — "Surveyor's Table" (galaxyMap refactor)

**Status:** implemented in `src/ui/galaxyMap.js` (survey-table material, strategy deck, semantic
zoom rail/iris, keyed glyphs, transit forecast, trade lanes, edge ticks, scan overlays). All eight
parity gaps closed (§8). Companion: `MAP_DATA_HANDOFF.md` (content tasks — H1–H4 and H6 landed).
Context audit: `MAP_OVERHAUL_BRIEF.md`.

**Polish pass (later session)** added on top of the above: contact memory with confidence decay at
LOCAL, multi-point mission geometry, authored mission briefs and station chart notes, hover
pre-selection, numbered route legs with a current-leg marker, pressure-scaled flow beads with a
travel envelope, foreign-sector gate/station recession, a chart-mark legend, and canvas-side
reduced-motion handling. It also fixed a live defect: the inspector read `mission.name`, which no
mission instance ever carries, so every active contract rendered the placeholder
`Contract Objective`.

**Review + legibility pass (this session)** — adversarial multi-agent review of the above, then the
fixes it justified. See §10 for the full ledger. The headline: **continuous residency was leaking
neighbouring sectors into both spatial levels.** `buildSystemModel`'s live-entity loop had no sector
predicate at all, so a SYSTEM survey of Helios Prime listed ~10 foreign gates — including
`Gate → Helios Prime` — and, because those twins sit a lattice hop away, the auto-fit blew the span
out ~8x and squeezed the sector's own furniture into an unreadable dot. The same leak drove the
LOCAL span to ~27,900u. One filter at the source fixed the SYSTEM view, its span, its label
crowding and the spurious compass-octant suffixes at once.

**Scope:** `src/ui/galaxyMap.js` only (the one live map — GALAXY / SYSTEM / LOCAL). Menus are already
on the fascia; station is explicitly out of scope; other drifted screens (missionLog, gameOver, base)
are follow-up polish, not this plan.

---

## 1. Concept

The map is a **surveyor's plotting table**: a heavy machined instrument with a dark plotting
surface, brass worklight accents, hairline registration marks, and stencil-cut label plates. Not a
hologram. The rendering language is the *technical drawing*: precise hairlines, tick marks, chamfered
plates, keyed silhouettes. One warm palette; faction colors are the only saturated hues on the table.

The same material family as the menu fascia and station workbench (warm near-black, amber worklight,
Saira/Plex type) — translated to an instrument layout, per the standing "related, not identical"
rule (GDD §9.4).

### Problems → moves

| Problem (user) | Move |
|---|---|
| Ugly primary colors, no intentional palette | Token remap to the fascia palette under `#sf-galaxymap`; canvas ink/amber/teal/red grammar (§3) |
| No icon diversity; can't tell marks apart | Keyed silhouette per object class (§4) + service pictograms + inspector chips with icon **and** label |
| LOCAL items packed together; can't navigate | Edge-of-viewport bearing ticks for important off-screen objects; declutter tiers; tighter default span (§5.3) |
| Bloomed glassmorphic buttons, clownish glow | Hairline ghost rails + amber index notch (menu button language); zero box-glow anywhere |
| Generic fonts, no character | Saira SemiCondensed titles, IBM Plex Sans UI, IBM Plex Mono numerals — in DOM **and** canvas |
| Controls spelled out 100% of the time | `?` hint popover on demand; one contextual hint in the inspector empty state |
| "$ TRADE" with no icon meaning | Service pictogram library (canvas) + labeled service chips (inspector) + rail legend |
| Harsh level clip; no concentric feel | Continuity zoom rail (LOCAL—SYSTEM—GALAXY track) + iris transition flash at threshold crossing (§6) |
| Map lacks strategy function | Default inspector becomes a **strategy deck**: trade-lane ranking, best-known-sell intel, transit forecast comparison on sectors (§5.4) |

---

## 2. Material (DOM/CSS)

- **Token remap under scope** (menu.css §1 technique): `#sf-galaxymap` redefines
  `--panel/--ink*/--accent*/--good/--warn/--danger/--mono/--mf-*` to the fascia values. One source
  of truth; keep in sync with `styles/menu.css` §1.
- **Surfaces:** opaque warm near-black gradient + diagonal hatch + hairline `#3b403f` edges; header
  is a machined strip with a 3px amber worklight edge and a diegetic stamp
  (`NAV CHART / SURVEY TABLE`).
- **Buttons:** ghost rail + left index notch that lights amber on hover/focus; primary action is
  solid amber gradient (menu fascia language). Chamfered corners via clip-path on the primary
  action and scale rail.
- **Layer toggles:** icon + label + state swatch. Active = filled swatch + ink text; inactive =
  outline swatch + dim text. Layer accent hues survive only in the 10px swatch, not as glowing
  rainbow borders.
- **Type:** Saira for title/level chip; Plex Sans for labels; Plex Mono for numbers/stamps/stamps.
- **Hints:** permanent controls list replaced by a `?` button in the header that toggles a compact
  popover. The inspector empty state carries the single most valuable hint
  ("double-click a mark to set course").

---

## 3. Canvas grammar (all levels)

| Element | Language |
|---|---|
| Ground | `#0c0e10`; warm hairline graticule; corner registration marks; subtle bottom worklight wash |
| Ink | `#ede8d8` primary, `#b3afa2` secondary, `#8a877d` mute |
| Action/navigation (route, waypoint, player, market) | amber `#e8a33d` / bright `#ffc064` |
| Infrastructure (gates, stations) | signal teal `#56bbb2` / brass `#d8b26a` |
| Hostile/hazard | red `#ed6961`; warn `#e3a13d` |
| Discovery/wreck bearings | archive gold `#e6bf6a` (kept — already reads "survey archive") |
| Faction | faction hues, keyed fills only |
| Selection | white double keyline ring — never a colored glow |
| Labels | hairline dark plates with a 1px keyed edge; mono numerals; collision layout unchanged |

Determinism: all cosmetic animation (flow beads, dashes, iris, sweep) runs off the screen's own rAF
accumulator + per-edge seeded hashes. No `Math.random`, no wall-clock in sim-affecting paths.

---

## 4. Keyed silhouettes (canvas glyph library)

Every object class gets a distinct mark, constant screen-size, stroke-drawn:

- **Station** — chamfered square plate with center pip (brass); service pictogram row beneath when
  the services layer is on.
- **Gate** — open ring (teal) with a directional tick pointing along its link; clearly "a door",
  not a rock or a shop.
- **POI** — small cross mark.
- **Ship (neutral)** — heading chevron (ink-dim); **hostile** — red open diamond + velocity tick.
- **Asteroid** — deterministic irregular polygon from id hash (never a circle); scan-highlighted
  rocks get an amber ore pip (closes parity gap 2).
- **Zone** — tinted disc, hairline keyed border; hazards get dashed red border + glyph.
- **Claim** — specialization glyph inside a double keyline circle (existing language, kept).
- **Wreck bearing** — dashed survey region / fixed cross-diamond (existing, kept, re-inked).
- **Waypoint/goal** — amber diamond pin + white keyline + dashed course line (existing, re-inked).
- **Player** — amber heading triangle with white keyline (was glowing cyan blob).

**Service pictograms** (8px stroke icons, drawn under stations and reused in inspector chips):
trade = coin; shipyard = hull frame; repair = wrench; refuel = drop; refine = crucible;
missions = contract diamond; ore buy = hex; black market = inverted triangle; module craft = plus;
scan = reticle. Inspector chips always pair pictogram + full label (accessibility).

---

## 5. Panels & information

### 5.1 Header
Title `STAR CHART` (Saira) + stamp · search with `/` kbd chip · **continuity rail** · `?` hints ·
close (with `ESC` chip). The `[data-level]` readout and `.gm-scale-btn[data-focus]` chips live
inside the rail (contract-preserved).

### 5.2 Continuity rail
A horizontal track with three stations — LOCAL · SYSTEM · GALAXY — and a sliding marker. It reads
as one continuous instrument, not three modes. Clicking a station = existing `_setScaleFocus`.
Gamepad focus selector contract preserved (`.gm-scale-btn[data-focus="…"]`).

### 5.3 LOCAL level (the pilot's scope)
- **Edge bearing ticks:** important objects (stations, gates, hostiles, claims, waypoint, bearings)
  that fall outside the viewport get a keyed tick at the viewport edge in their true direction, with
  a click target that selects them. This is the "see beyond my viewframe" function.
- **Span tune:** auto-fit multiplier relaxed so the default view is tighter; far contacts become
  edge ticks instead of being squeezed into the center cluster.
- **Scan pings** rendered (parity gap 1): `state.world.scanPings[sectorId]` as fading survey pings.
- Scan-highlighted asteroids rendered with ore pips (parity gap 2).
- Range rings + unit labels kept; sweep kept (reduced-motion safe); "CLEAR SKIES" kept.

### 5.4 Inspector
Target kinds keep every current section (contracts) and gain:

- **Sector:** transit forecast comparison — gate vs drive cards (incident %, expected damage,
  survival margin) via `forecastTransitFor` (parity gap 6); route leg list when a route is plotted.
- **Station/gate:** labeled service chips (pictogram + label), market memory, mission links.
- **All kinds:** a record stamp (`SECTOR RECORD`, `STATION RECORD`, …) in the section header.

**Default inspector (nothing selected) = the strategy deck:**
1. Command status (existing: sector/credits/cargo/heat/hull).
2. **Trade lanes** — top-5 ranked routes from `rankTradeRoutes` over `state.economy.marketIntel`
   (parity gap 4), reliability-tinted; a row click resolves the destination station and emits the
   existing course intents (no new mutation path).
3. **Best known sell** for the selected commodity across all remembered stations, age-tinted.
4. The one contextual hint.

### 5.5 GALAXY level
- Territory: current-sector halo becomes brass corner brackets; charted edges = warm hairlines;
  uncharted = faint dashes (kept).
- **Commodity flow beads** (parity gap 5): edges with a meaningful price-pressure gradient animate
  seeded beads surplus→scarcity, replacing the static arrowheads (arrow kept as bead direction).
- Confidence: stale sectors render their labels in muted italic; rumored frontier stays fog '?'.
- Mission destinations: amber tick above the node (existing), plus the goal marker (kept).

### 5.6 SYSTEM level
- Sector name as a stencil plate top-left (kept); zones keyed as §4; asteroid fields re-inked;
  service pictograms under stations; claim/bearing language unified with LOCAL.

---

## 6. Level transitions (the "concentric" fix)

- Threshold crossing triggers an **iris flash**: an expanding double hairline ring from screen
  center + a one-word stencil (`LOCAL` / `SYSTEM` / `GALAXY`) that fades in ≤ 450 ms, plus a 1-frame
  model crossfade (old level drawn at fading alpha while the new model draws beneath) so the switch
  reads as passing through a membrane instead of a hard cut. Reduced-motion: instant, no flash.
- The continuity rail marker slides with the eased zoom value, reinforcing that levels are one scale.

---

## 7. Contracts preserved (do not break)

Source-string contracts: `drawWaypointPin`, `waypointMapLabel`, `waypointClickTarget`,
`kind: 'waypoint'`, `ACTIVE WAYPOINT`; `world:requestRoute` / `ui:setCourse` / `world:requestJump` /
`via: 'gate'` / `Set Course & Jump` / `data.gateTo`; never `state.nav.route =`, `enterSector(`,
`jump.state =`; `export function applyMapOpenIntentToView` / `resolveMapOpenTarget` /
`mapConfidenceForSector`; `_selectedTarget = view.openTarget`; `cancelAnimationFrame(this._animFrame)`;
`takeMapOpenIntent`; `import { sectorLawProfile } from './securityReadout.js'`;
`Security & Jurisdiction`; literal `<b…>ILLEGAL:</b> ${law.illegal}` / `<b…>RESPONSE:</b>
${law.response}`; `MAP_CONFIDENCE_STALE_DAYS`…`playerEntity` slice free of RNG/wall-clock/timers;
`buildLocalModel`, `scanner.js` import; `resolveCourseTarget`.

DOM contracts: `#sf-galaxymap`; `.gm-head/.gm-title/.gm-search-container/.gm-search-input
(tabindex="-1")/.gm-search-results/.gm-search-item`; `.gm-scale-btn[data-focus]`; `[data-level]`;
`.gm-close`; `.gm-body-container`; `.gm-left-rail/.gm-rail-title/.gm-layer-buttons/
.gm-layer-btn[data-layer]`; `.gm-rail-commodity` + `#gm-commodity-select`; `.gm-viewport` + canvas;
`.gm-right-inspector/.gm-inspector-header/.gm-inspector-content/.gm-inspector-details`;
`#gm-set-course-btn` (persistent node, hidden+disabled at mount, exactly one click handler);
`.gm-ins-section/.gm-ins-title/.gm-ins-row/.gm-ins-row-val(.fresh/.mid/.old)`.

Inspector text contracts: `Current Conditions`, `Why it changed`, `Danger`/`Price pressure`/
`Control` rows (percent + trend word order), cause receipts order; button labels from
`resolveGalaxyMapPrimaryAction` (`Set Waypoint`, `Align Autopilot`, …); `Set Course & Jump` /
`Plot Course` on sectors.

Behavior contracts: `resolveGalaxyMapLayout` geometry (non-overlap, viewport mins);
`mapFocusButtonSelector` (gamepad only); `/` focuses search; `Tab` cycles layers; M/N/Esc close;
text-entry guard; 64 ms refresh cadence; rAF cancel on hide/re-show; aria-label per level;
read-only over sim (three intents only).

---

## 8. Parity ledger (brief §5.3)

| Gap | This plan |
|---|---|
| 1. Scan pings | **closes** (LOCAL) |
| 2. Scan-highlighted asteroids | **closes** (LOCAL) |
| 3. Remembered-contact decay | **closes** (LOCAL — screen-owned `LocalSpaceIntel`, `options.intel`) |
| 4. Trade-route ranking | **closes** (strategy deck) |
| 5. Commodity-flow beads | **closes** (GALAXY market layer) |
| 6. Transit forecast comparison | **closes** (sector inspector) |
| 7. Territory wash | **closes** (faction layer: owner color underlay on nodes) |
| 8. Multi-point mission geometry | **closes** (`missionMapGeometry` — LOCAL + SYSTEM) |

---

## 9. Verification

1. `node test/galaxy-map-inspector-stability.test.mjs` (script form: `npm run check:galaxy-map-inspector`)
2. `npm run check:map-authority` (includes `test/unified-map-professional.test.mjs`)
3. `npm run check:ui-identity` · `npm run check:ui-a11y` · `npm run check:wcag-contrast` ·
   `npm run check:player-facing-labels` · `node scripts/check-ui-screen-imports.mjs`
4. `npm run check:map-confidence` · `npm run check:intent-glyphs` · `npm run check:known-vs-live-prices`
5. `npm run check:m2:map-cutover` · `node --test test/m2b-map-route.test.mjs test/galaxy-map-gate-jump-seam.test.mjs test/galaxy-map-market-discovery.test.mjs test/sector-law-presentation.test.mjs test/objective-navigation-hierarchy.test.mjs`
6. `npm run check:ui:perf` (perf budget + frame sleep + radar perf + identity)
7. `node scripts/capture-maps.mjs` → current player-route screenshots of all three levels.
8. `npm run check:sim:compare` (no sim drift — the map stays read-only).

**Two reds in this suite are pre-existing and proven not to come from map work.** Do not spend time
on them here:

- `check:m2:map-cutover` → `check-m2b-region-data` — "original story anchor XZ drift". A/B'd by
  reverting `src/data/sectors.js` to HEAD: the *actual* hash is byte-identical either way
  (`68fcd1e1…`), so the H2 `chartNote` authoring is not the cause. The pinned anchor fingerprint
  drifted upstream of this work.
- `check:ui:perf` → `check-vfx-frame-sleep` — `ERR_MODULE_NOT_FOUND: 'three'`. Environment only
  (`node_modules/three` absent); the `check:perf-summary` half of that script passes.

---

## 9b. Art direction — the sector sigil

The §1 concept ("the rendering language is the *technical drawing*") was written but never actually
executed on the canvas. What shipped was a bubble chart: a sector was `g.arc(x, y, 13)` filled with
a faction colour, and every additional fact — owner, security, selection, contested, you-are-here —
became **another concentric ring at another radius**. Five facts, five rings, one bullseye. 46
`arc()` calls, 20 of them full circles, everything at ~5px with a ~1.4px stroke. The marks were not
ugly; they were *undifferentiated*, all whispering at one volume.

**The move: a sector is a star system, so draw it as one.** `drawSectorSigil` replaces the disc with
a primary, an inclined orbit, and the berths riding that orbit:

| encoding | carries |
|---|---|
| orbit hue (lifted toward light via `liftHue`) | who holds the sector |
| bead count (0–4, gates excluded) | berths you can actually dock at |
| broken/dashed orbit | lawless space — the lane itself is not intact |
| unrest arc, sweep **and** weight | danger — and **silent below threshold** |

Two principles are doing the real work:

1. **Facts are carried by different FORMS, not stacked radii.** That is the whole fix. A ring can
   only ever say one thing, so a ring per fact was always going to converge on a bullseye.
2. **Silence is information.** Real charts mark hazards, not safety. A calm sector draws nothing
   extra, so the eye stops only where there is trouble. An earlier iteration encoded security as a
   24-tick gauge rim; it was the loudest element on the glyph for the least important fact, and it
   read as a loading spinner. Killed.

Inclination, ellipse squash and bead phase are all seeded from the sector id through
`cosmeticHash01`, so two dozen sigils read as a hand-plotted survey rather than one icon stamped 24
times. Deterministic and cosmetic — never fed into sim.

**Sized for the real thing, not the specimen sheet.** The first version was refined at 4× and
invisible at 1×: the well was the same value as the table, so the glyphs dissolved. The fix was a
*lit dish* well (a value above the ground) plus `liftHue` on the faction colour. Radius stays at
**13** — the existing footprint — so label geometry and the `radiusPx: r + 8` click target are
untouched. Every change is craft, not scale.

**Composed per active layer.** With the faction layer off the orbit falls to neutral ink; with the
security layer off the unrest arc is suppressed entirely. Each encoding has to read alone, which is
both the legibility win and the reason five signals never pile onto one 13px glyph at once.

**Not cached, deliberately.** GALAXY draws ~24 sigils on the 64 ms inspector cadence — the
display-refresh path is LOCAL-only — so an offscreen tile cache would cost more bookkeeping than it
saves. If GALAXY ever joins the rAF path, revisit.

Propagated to the rest of the mark family:

- **Station** — was a chamfered square with a pip ("generic facility"). Now a berth ring with four
  mooring stubs on the **diagonals**, kept off the axes so they never collide with the label plate.
- **Gate** — was a plain teal circle with one tick, which read as "small planet" as often as "door".
  Now two opposing arcs with the mouth open on the travel axis plus a direction tick. An
  intermediate version hung jaws off one end; at 6× it read as a portal pointing down but a slashed
  circle pointing right, so it was cut — **the mark has to survive rotation.**
- **POI** — was a bare plus, the single most generic mark available. Now a broken cross with end
  serifs: a surveyor's register mark, matching the table's own corner registration.
- **Ground** — a worklight falloff over the table centre, so marks read as objects sitting on a
  surface rather than shapes in a void. One gradient fill per frame.
- **Lanes** — charted links are now engraved (a wide soft rule with a dark score cut down the
  middle) rather than a single wire. Uncharted stays one faint dash: rumour has no groove.

**Method.** Four look-dev iterations in a standalone harness rendered headlessly through Playwright
(the `_plumelab.html` pattern), judging every candidate at **true size and 4× side by side**, and as
a **constellation** rather than a specimen row — a glyph that looks good alone can still fail as a
field of two dozen. Five directions were built and discarded before this one (faceted plate,
aperture/iris, survey cartouche, and two security encodings). The identity guards
(`check:ui-identity`, `check:wcag-contrast`) were the tripwire for "still in the world": boldness
went into engraving, weight hierarchy and composed glyphs — never into a new colour story.

---

## 10. Review ledger (this session)

Multi-agent adversarial review: 25 findings raised across render-safety, perf, determinism,
correctness, UX and contract axes; 10 survived refutation; deduped to 8.

**Fixed.**

| # | Finding | Fix |
|---|---|---|
| 1 | `buildSystemModel` live-entity loop had **no sector predicate** — foreign gates flooded SYSTEM, blew the span ~8x, ate the label budget (gates outrank stations at 760) and triggered meaningless octant suffixes | New `entityHomeSector(e)` helper (reads `e.homeSectorId` **and** `e.data.homeSectorId`/`sectorId` — the old LOCAL check read only the `data` side and silently misclassified); filter at the source in the loop. One change, four symptoms |
| 2 | Killed ships lingered as dead-reckoned ghosts for up to ~142 s | Subscribe to **`entity:killed`**, not `entity:destroyed`. `entity:destroyed` fires for every removal incl. despawn/TTL/projectiles — deleting on it would forget exactly the despawns the memory layer exists to render. Subscribed in `onShow`, released in `onHide` |
| 3 | `Marked points N/M cleared` was pinned at 0 while the denominator shrank per kill (a killed target is filtered out of `targetEntityIds` *and* swap-removed from the entity list, so `done` is structurally unreachable) | Row now reads `N on chart` — the question the geometry can actually answer. `done` documented as unreachable for kill targets |
| 4 | LOCAL span set by a single far outlier (~27,900 u); the edge-tick path it documents was consequently dead code | Fit on **p85** of navigationally-significant marks, excluding foreign, remembered and asteroids (a belt's hundreds of rocks otherwise frame the scenery and push every station off-frame). Rings went 13,947 u → 734 u; edge ticks now fire |
| 5 | `disambiguateGateLabel` counted foreign gates that can never claim a label, so a lone unambiguous local gate wore a bearing suffix to distinguish it from a twin the pilot cannot see | Count only label-eligible gates |
| 6 | `compassOctant` doc claimed `+Z` is north; the math returns N for `dz = -1` | Comment corrected (the math was right — verified at all eight octants plus the 2π wrap) |
| 7 | `_syncLocalIntel` walked every entity at display refresh rate, rewriting byte-identical tracks (decay is a pure function of `timeS - lastSeenS`, so re-observing at one simTime cannot change any output) | Early-return when `simTime` is unchanged |
| 8 | **Test gap that let the `mission.name` defect ship**: the only test pinning the inspector's no-churn contract used a fixture with `missions.active: []` and no `state.ui`, so the mission block was never rendered and never asserted on | Fixture gained an active tracked contract + title assertions. **Verified by reintroducing the defect** — the old test passed with it, the new one fails |

**Verified clean, no change needed** (checked because the review suspected them): `localMemoryBand`
at every boundary incl. `NaN`/`null`/out-of-range; `mutedZoneColor`'s hex guard (`parseInt` → `NaN`
→ `Number.isFinite` catches it); `compassOctant` octant math and wrap; `projectTrack`'s options
threading; `save`/`restore` balance in the new draw paths.

**Also fixed (pre-existing, surfaced by the review).**

| # | Finding | Fix |
|---|---|---|
| 9 | **GALAXY bypassed `layoutMapLabels` entirely** — `_drawGalaxy` drew sector names with a bare `fillText` and pushed zero candidates, so the densest part of the chart was the one place with no collision handling. Neither label priority nor span tuning could ever have fixed it | Name + faction presence rows + `STALE` now travel as lines of a single `makeMapLabelCandidate`, so the block moves as a unit and rows cannot orphan from their name. The goal plate's rectangle is `reserved` so a node label is never placed under it. Side benefit: GALAXY now uses the same plated label language as SYSTEM/LOCAL instead of bare text |
| 10 | **Hostility latched permanently** into contact-memory tracks — `observeContact` OR'd against the previous track, so a lawful patrol seen during a WANTED window stayed red as a ghost after heat cleared. It also selects the decay half-life (18 s vs 35 s), so a mis-latched track faded ~2x fast | An explicit reading now wins; OR-inheritance is kept only for callers that omit the field. Verified back-compatible against the other consumer (`src/ui/screens/localmap.js`), which passes a real boolean for ships and omits it for stations/asteroids — so this fixes the latch there too |

**Still open (documented, not attempted).**

- **`buildSystemModel` mixes coordinate frames** — the live loop pushes global `e.pos` while the
  static station/gate/POI fallbacks push authored sector-local `anchor`. Invisible at Helios
  (origin `0,0`); will surface at any sector with a non-zero origin. Deliberately not folded into
  the foreign-gate fix — it is a separate correctness question with its own blast radius.
- **Recycled-id bleed into contact memory.** `tracks` is keyed on the raw runtime id, and
  `coreSystem` recycles ids LIFO through `state.freeIds`. Finding #2's `entity:killed` deletion
  closes the common case; the residue needs a generation/spawn counter in the key. Narrow enough
  that it needs four events inside one decay window to reproduce.
- **`missionMapGeometry` / `trackedMissionOf` / `localMemoryBand` / `projectTrack` are unpinned** —
  they appear only in `src/`, never in `test/` or `scripts/`. `capture-maps.mjs` sets no tracked
  mission, so the `drawMissionPoint` loops are unexercised by the render smoke too.
- **The `entity:killed` subscription is unpinned.** It is the first bus subscription this file has
  ever had. The inspector-stability test asserts remount disposal for the rAF loop and the Set
  Course button, but nothing counts bus listeners across a show/hide/show cycle, so a future leak
  there would not be caught. Worth an assertion alongside the fixture work above.
