# MAP_UX_PLAN — "Surveyor's Table" (galaxyMap refactor)

**Status:** activated plan for the live map refactor. Companion: `MAP_DATA_HANDOFF.md` (grunt-work
content/data tasks for a second agent). Context audit: `MAP_OVERHAUL_BRIEF.md`.

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
| 3. Remembered-contact decay | follow-up — `MAP_DATA_HANDOFF.md` (needs LocalSpaceIntel port) |
| 4. Trade-route ranking | **closes** (strategy deck) |
| 5. Commodity-flow beads | **closes** (GALAXY market layer) |
| 6. Transit forecast comparison | **closes** (sector inspector) |
| 7. Territory wash | **closes** (faction layer: owner color underlay on nodes) |
| 8. Multi-point mission geometry | follow-up — `MAP_DATA_HANDOFF.md` (needs mission target shape) |

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
