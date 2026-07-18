# Maps & Menus — Refactor Context Dump (first-principles)

**Purpose:** a self-contained dossier for an agent that will refactor the navigation maps (and keep
them coherent with the menu family). It consolidates the target aesthetic, the full data/domain
inventory, the navigation mechanics the maps serve, the parity contract, the reusable vocabulary, and
the hard constraints — enough to redesign the maps from scratch, including showing **more** than they
do today.

**Status:** research/context only — no code changes claimed. The menu half is already shipped (§3);
the map half is the open work. Read alongside `design/MENU_OVERHAUL_BRIEF.md` (the menu handoff, now
historical) and `design/revamp/BP-03_ONE_MAP.md` (the open map-cutover spec).

**Authority order when sources disagree:** user direction → `ARCHITECTURE.md` → `GDD_2_0.md` →
`design/program/` → the activated plan/spec → live code + checks + player-route evidence. Live code
outranks prose in this file.

---

## 0. TL;DR

- **The menus are already on the new look** (the "menu fascia": opaque warm near-black plate, amber
  worklight accent, chamfered `clip-path` corners, Saira/Plex type trio, diegetic stamps). It lives in
  one shared stylesheet, `styles/menu.css`, applied by adding the `.sf-menu` class.
- **The maps are the remaining holdout** of the old "blue matte plastic" style (translucent navy +
  screaming cyan `#39d0ff` glow + soft rounded cards). The live map is `galaxyMap.js` (screen id
  `galaxyMap`); `starmap.js` + `localmap.js` are legacy and not on the normal player route.
- **The map is an instrument layout, not a centered plate** — so, like the station, it should adopt the
  menu's *material and tokens* while keeping its own composition. The standing rule (constitution,
  GDD §9.4): surfaces must "feel related without becoming visually identical."
- **A refactor may rethink composition, not just reskin.** The game's own contracts give latitude
  (§8). There is a lot of data available to show that the current map only partly surfaces (§4, §7).
- **Hard lines:** read-only over sim (only three bus intents out), pure model builders, UI perf budget
  ~1.2 ms, full keyboard/gamepad/touch parity, non-diegetic (no visor/cockpit), determinism preserved.

---

## 1. The game, in one paragraph (so the agent can judge taste)

Semi-3D top-down open-world space sandbox (Three.js + Rapier, browser + Electron, one shared route).
"Freelancer's living universe, played top-down, with physics you can feel." Mining, trading, combat,
missions, ship upgrading, sector jumping in one persistent 24-sector galaxy. Pacing is deliberate,
fair, readable. Signature verb is momentum/massline physics (tether, slingshot, winch). Voice:
**"crews talk like riggers, not like marketing"** — terse, dry, working-space. Tone is industrial,
lived-in, factional frontier — "places, not rocket badges." Quality bar: "must feel like a $30 premium
PC/browser release; nothing on screen is unexplained, nothing stutters, every input answers within
50 ms; every surface survives a 5-second sore-thumb test."

Sources: `README.md`, `design/GDD_2_0.md` §1/§3/§9, `design/vision/00_CONSTITUTION.md` §3/§4/§5,
`design/MENU_OVERHAUL_BRIEF.md` §1.

---

## 2. The north-star aesthetic — the menu fascia (`styles/menu.css`)

The menus are the established look to match. It is the station "workbench" material
(`styles/station-workbench.css`) translated onto a centered plate. **Token values mirror
station-workbench.css; keep the two in sync when the workbench palette moves.**

### 2.1 The material language
- **Surfaces:** opaque warm near-black — `--panel:#121518`, `--panel-2:#171b1f`, gradient
  `#191d20→#121518→#0e1113`, with a diagonal hatch (`repeating-linear-gradient(112deg,…)`), a bottom
  amber worklight glow (`radial-gradient(ellipse at 50% 112%, rgba(219,152,56,.05),…)`), and 1px
  hairline edges (`--mf-line-2:#3b403f`, top edge lighter `#4c4a44`).
- **Accent = amber worklight:** `--accent:#db9838`, `--accent-3:#ffc064`, secondary signal cyan
  `--accent-2:#56bbb2`. Meaning colors: `--good:#58c98a`, `--warn:#e3a13d`, `--danger:#ed6961`.
- **Ink (warm):** `--ink:#f1ede2`, `--ink-dim:#b3afa2`, `--ink-mute:#8a877d`.
- **Shape = sharp/beveled:** `border-radius` 2–3px, plus **`clip-path` chamfered corners** on plates,
  buttons, and the confirm dialog (e.g. `polygon(0 0, calc(100% - 16px) 0, 100% 16px, …)`).
- **Type trio:** `--mf-display:"Saira SemiCondensed"` (titles), `--mf-ui:"IBM Plex Sans"` (body),
  `--mono:"IBM Plex Mono"` (numbers/stamps). Self-hosted woff2 in `styles/fonts/`.
- **Diegetic stamps** burned into the fascia via `::before { content: attr(data-stamp) }` — tiny mono,
  `.18em` tracking, `--mf-stamp` color. Each screen sets its own (e.g. `PUBLIC TERMINAL / SPACEFACE`,
  `MISSION CONTROL / STANDBY`, `SYSTEMS / CONFIGURATION`).
- **Worklight edge:** `::after` amber bar across the top of the plate.

### 2.2 The key technique — token remap under scope
`menu.css §1` (lines 28–59) redefines the legacy tokens (`--panel`, `--accent`, `--ink`, `--mono`, …)
**under the `.screen.sf-menu` selector**, so old rules that still reference those names follow the new
material without a rewrite. The same trick works for any screen scope. The plate, buttons, headings,
tabs, slots, form primitives, title lockup, and confirm dialog are all owned by `menu.css` (§2–§8) —
screens inject only their *own* exceptions.

### 2.3 The buttons (the most-reused primitive)
Ghost rail: hairline outline + a left "index notch" that lights amber on hover/focus
(`menu.css:178-220`). Variants: `.sf-btn--primary` (solid amber gradient, dark text), `.sf-btn--danger`
(red-tinted). Focus is an inset line + border so it survives the chamfer clip.

### 2.4 Files
- `styles/menu.css` — the fascia (519 lines). Header comment is the authoritative in-code statement.
- `styles/station-workbench.css` — the station material it mirrors (the broader `.sx-*` vocabulary, §9.3).
- `styles/fonts.css` + `styles/fonts/*.woff2` — the type trio.
- `styles/accessibility.css` — forced-colors + dyslexia hooks key off `.screen`/`.panel`/`.sf-menu`
  (keep those class hooks).

---

## 3. Current state of every menu/screen surface

### 3.1 ON the menu fascia (already shipped — do not regress)
Each does `classList.add('panel','sf-menu')` + sets `data-stamp`:

| Screen | File:line | Stamp | Notes |
|---|---|---|---|
| Main menu (title) | `src/ui/screens/mainMenu.js:204` | `PUBLIC TERMINAL / SPACEFACE` | title lockup `.sf-title-logo`, save summary, 5 buttons, idle attract drift, continue→game fade |
| Pause | `src/ui/screens/pause.js:62` | `MISSION CONTROL / STANDBY` | FLIGHT BRIEF slot + button stack; **live frozen game frame shows behind it** (`ui.css` `:has([data-screen=pause])`) — preserve |
| New Game | `src/ui/screens/newGame.js:96` | `CONTRACT INTAKE / NEW OPERATOR` | own header/body/footer band, ship preview |
| Settings | `src/ui/screens/settings.js:56` | `SYSTEMS / CONFIGURATION` | tabs (Audio/Video/Gameplay/Access/Controls), rebinding |
| Save / Load | `src/ui/screens/saveLoad.js:45` | (wide) | slot rows |
| Help / Controls | `src/ui/screens/help.js:59` | (wide) | tabbed |
| Codex (Signal Archive) | `src/ui/screens/codex.js:98` | (wide) | tabbed |
| Confirm dialog | `src/ui/confirm.js` (CSS `menu.css §8`) | — | shared gate for irreversible actions |

### 3.2 DRIFTED (own scoped variants — refactor candidates beyond the maps)
- `galaxyMap.js` → `#sf-galaxymap` — **the live map, still old blue** (§5). Primary target.
- `starmap.js` → `#sf-starmap` — legacy blue; registered but not on the normal route (§5.4).
- `localmap.js` → `#sf-localmap` — legacy blue; registered but not on the normal route (§5.4).
- `gameOver.js:135` → `.sf-gameover` (own variant).
- `missionLog.js:1458` → `.sf-mlog` (own variant).
- `base.js` → `#sf-base` (scoped blue-plastic variant — base management).

### 3.3 Intentionally separate (leave alone unless asked)
- **Station** (`src/ui/station/*` + `station-workbench.css`) — its own full-bleed instrument aesthetic.
  This is the *source* of the shared material, not a target. User has explicitly scoped it out.

---

## 4. The map domain — three continuous zoom levels, one canvas

`galaxyMap.js` is a single zoomable surface across three levels (the "REVAMP 2.1" unification of the
old split N/M maps). Zoom is a scalar; thresholds pick the model builder.

| Level | Zoom threshold | Builder (`galaxyMap.js`) | What it draws |
|---|---|---|---|
| **GALAXY** | `< 1.6` | `buildGalaxyModel` `:851` | the 24-sector graph: faction-colored nodes, neighbor + wormhole edges, **confidence** (live/known/stale/rumored), faction *presence* rows, wreck bearings |
| **SYSTEM** | `1.6 – 2.8` | `buildSystemModel` `:947` | the current sector: stations/gates/POIs (live entities first, static fallback), **named sectorZones as tinted regions**, owned-claim markers, wreck bearings |
| **LOCAL** | `≥ 2.8` | `buildLocalModel` `:1060` | live near-field: ships/drones/stations/asteroids, hostility, velocity; owned claims; wreck bearings |

Thresholds: `ZOOM_MIN=0.35`, `ZOOM_MAX=22`, `LEVEL_SYSTEM_AT=1.6`, `LEVEL_LOCAL_AT=2.8`
(`galaxyMap.js:56-67`, `levelForZoom`). Layout is responsive: wide (≥1180) = 3 columns;
compact (≥760) = horizontal rail + canvas/inspector; narrow = vertical stack
(`resolveGalaxyMapLayout` `:82-119` — the single layout source; "tools never float over canvas").

### 4.1 Everything a map COULD draw (data inventory)

| Domain | Source | Key export / reader | Shape |
|---|---|---|---|
| Sectors graph | `src/data/sectors.js` | `SECTORS`; read via `sectorRecords(state)` `galaxyMap.js:661` | `{id,name,tier,security,charted,factionId,position{x,y},neighbors[],wormholeTo,stations[],fields[],hazards[],pois[]}` |
| Sector zones | `src/data/sectorZones.js` | `zonesForSector`, `zoneTypeMeta`, `zoneThreat` | `{id,name,type,factionId,center{x,z},radius,threat}` — 13 zone archetypes (trade_lane, mining_belt, outlaw_zone, radiation_field, anomaly_deep…) |
| Stations/gates/POIs | `sector.stations[]`, live entities | `buildSystemModel` `:982-1044` | station `{id,name,type,factionId,size,services[],contested?,hidden?}`; gate = station w/ `data.isGate` + `gateTo` |
| Factions | `src/data/factions.js` (+ `factions/<id>.js`) | `FACTION_META`; `factionColorOf/factionNameOf` `:49` | `{id,name,short,color}` |
| Faction presence (depth K1) | `src/data/factionPresence.js` | `mapFactionPresenceNodes({seed,revocationCount,storyFlags})` | nodes `{factionId,label,sectorIds,phase:asleep\|observer\|awake}` — Verge Layers phase-gated |
| Claimable bodies / claims | `src/data/claimableBodies.js` + `state.claims` | `buildClaimOwnershipMarkers` `:817`, `describeClaimMapMarker` `:772` | 3 specializations (refinery/relay/bastion) each w/ `mapGlyph`, `mapColor`, `playerVerb`, `consequence`, `riskLine`; runtime ledger via `claimsSystem.ledger(id)` |
| Unique wrecks / bearings | `src/ui/uniqueWreckMapLayer.js` | `uniqueWreckMapReadouts(state, sectorId)` | phase-gated: `rumored` (fuzzy center+radius) → `fixed`/`salvaged` (durable `fixedPos`, +`courseTarget`) |
| Commodities | `src/data/commodities.js` | `COMMODITIES` | `{id,name,legality:legal\|restricted\|illegal\|contraband}` |
| Market memory (visited quotes) | `state.player.marketMemory[stationId][cmdtyId]` | `src/ui/marketIntelligence.js`: `bestKnownSellAtStations`, `knownStationQuotes`; age bands fresh(<600s)/mid(<3600s)/old | `{sell,buy,seenAt}` |
| Price history (charts) | `src/ui/priceHistory.js` | ring buffer `history[stationId][cmdtyId][]` | `{mid,buy,sell,t,events}[]` (backfilled from economy on new game/load) |
| Price forecast cone (BP-12) | `src/ui/priceForecast.js` | `forecastArrow(signal)` | `{direction:rising\|falling\|steady, glyph, label, confidence:'forecast'}` |
| Sector signal field | `src/systems/sectorSim.js` | `sectorSignalFor(state,id)` `:902` | `{ownerId,danger,pricePressure,influence{},dominantFactionId,contestMargin,trend{…},driver{…},encounterLoad,marketFlowUnitsPerDay}` |
| Transit forecast | `src/systems/sectorSim.js` | `forecastTransitFor(state,id,{fromSectorId,via})` `:938` | `{via:gate\|drive,danger,maxSpeed,threatSpeed,incidentChance,expectedDamage,effectiveHp,survivalMargin}` |
| Effective sector (security/density) | `src/systems/sectorSim.js` | `effectiveSectorFor` `:878` | projected `security`/`enemyDensity` |
| Cause ledger ("why it changed") | `src/ui/causeLedger.js` | `causeFor(state,id)`, `driverPhrase` | receipts per field driver |
| Security/law profile | `src/ui/securityReadout.js` | `sectorLawProfile(state,id,sec)` | `{level,authority,illegal,response}` |
| Scan pings | `state.world.scanPings[sectorId]` | written `systems/scanner.js:160`; read `localmap.js:653` | `[{pos{x,z},…}]` (legacy-localmap-only today) |
| Scan-highlighted asteroids | `e.data.scanHighlightUntil` + `scanOreGlyph` | `localmap.js:631` | sim-time expiry + ore glyph (legacy-localmap-only today) |
| Live entities | `state.entities` (Map), `state.entityList` | `entityIterator(state)` `:754`, `playerEntity` `:748` | `{id,type,alive,pos,vel,rot,factionId,team,hull,radius,data{…}}`; hostility via injected `isHostileToPlayer` (`systems/scanner.js`) |
| Story beats / onboarding | `src/data/missions.js` `STORY_BEATS` (0..7); `state.nav.waypoint` | `activeMapGoal(state)` `:351` | single player-owned goal: `{objective:true,markerKind,missionId,sectorId,pos,label}` |
| Routes | `state.nav.route` (built `world.computeRoute`) | read `galaxyMap.js:357` | `{legs[{from,to,fuel,charge,interdict}],totalFuel,totalHops}` |
| Player nav state | `state.nav`, `state.jump`, `state.fuel` | — | `nav.{waypoint,route,autoTravel,autopilot}`; `jump.{state,targetSectorId,via,…}`; `fuel.{current,max}` |

**Map confidence (not fog) — BP-03.1, already done:** `mapConfidenceForSector` `:723` →
`{confidence:live|known|stale|rumored, confidenceAgeDays, lastSeenEpochDays}`. Fog only at the genuine
frontier. (`MAP_CONFIDENCE_STALE_DAYS=7`.) Verified by `scripts/check-map-confidence.mjs`.

---

## 5. The maps as they stand today

### 5.1 `galaxyMap.js` (live) — structure
- **Pure model builders** (`buildGalaxyModel`/`buildSystemModel`/`buildLocalModel`) — no DOM, importable
  headless, unit-tested. The screen object `galaxyMapScreen` (`:2258`) is the thin canvas/DOM shell.
- **DOM shell** (`mount` `:2317`, template `:2327`): `.gm-head` (title, search `/`, scale buttons
  Local/System/Galaxy, level chip, close) → `.gm-body-container` (`.gm-left-rail` layers + commodity
  select + controls hint; `.gm-viewport` canvas; `.gm-right-inspector`).
- **8 toggleable layers** (`:2292`): route, mission, market, security, faction, hazard, services,
  discovery — each with its own active color (`:1529-1549`).
- **Inspector** (`_updateInspector` `:2802`) renders per target kind: sector (authority/presence,
  security, nav cost preview, current conditions + cause receipts, station/hazard summary, best-known
  sell), station/gate, owned claim (ops readout), zone, waypoint, contact.
- **Search** (`getSearchTargets` `:2163`): sectors, stations/gates/POIs, owned claims, active goal,
  live contacts (LOCAL). Ranked by waypoint-target > tracked-mission > goal-proximity > semantic.
- **Canvas helpers:** deterministic label layout (`layoutMapLabels` `:205`, priority + collision +
  area budget), click picking (`pickMapTargetAt` `:382`), goal marker / waypoint pin / wreck bearing
  markers / service glyphs.
- **CSS** is a single in-file block `:1310-1814`, scoped to `#sf-galaxymap` — **still the old blue
  plastic** (`rgba(4,8,16,.98)` ground, `--accent, #39d0ff` cyan fallbacks, `rgba(57,208,255,…)` glows).

### 5.2 Legacy parity features (where they live) — the cutover checklist
`galaxyMap` "supersedes starmap+localmap once BP-03 parity passes" (`uiRoot.js:53`). The legacy screens
are the parity source. Features the unified map must preserve or intentionally drop:

**From `starmap.js` (inter-sector intelligence):**
- Danger-colored hex nodes, neighbor + wormhole edges (`_drawEdges`/`_drawWormholes`).
- Full sector-field sidebar: danger/exposure, encounter load, security/density, price pressure/trend,
  faction influence bars + contest margin, **drivers** (`DRIVER_LABEL` `:30-52`).
- **Per-edge animated commodity-flow beads** (moving dots surplus→scarcity, `_drawEdges` `:814-850`).
- **Commodity memory overlay** per sector (`marketMemoryStationOverlays` `:248`, fresh/mid/old tint).
- Route animation (marching-dash polyline + traveling bead, `_drawRoute` `:865`).
- Objective panel + route summary (`resolveStarmapObjective`, `describeStarmapObjectiveRoute`).
- **Transit forecast comparison** gate-vs-drive (`forecastTransitFor`, `:1053`).
- Hover tooltip readout (`_drawTooltip`).

**From `localmap.js` (near-field + economy):**
- **Remembered contacts with confidence/age decay** via `LocalSpaceIntel` (`navigation/localSpaceMapModel.js`);
  bright=fresh, faint=stale; hostile velocity-vector ticks.
- **Trade-route ranking panel** — `rankTradeRoutes` over `state.economy.marketIntel` beacons, top-5 by
  profit/min, reliability-weighted; row → `applyTradeNavigation` → `ui:setCourse` (`waypointKind:'trade'`).
- **Scan pings + scan-highlighted asteroids** (`_drawScanOverlays` `:629-674`).
- Mission geometry injected into the local model; objective panel with story/mission/waypoint/route states.

### 5.3 Known parity gaps in the live `galaxyMap` today (things a refactor can close)
1. Scan pings (`state.world.scanPings`) — not rendered.
2. Scan-highlighted asteroids (`scanHighlightUntil`/`scanOreGlyph`) — not rendered.
3. Remembered-contact confidence/age decay (`LocalSpaceIntel`) — galaxyMap reads raw live entities, no decay track.
4. Trade-route ranking panel (`rankTradeRoutes`) — absent.
5. Per-edge animated commodity-flow beads — galaxyMap has static trade-flow arrows only (`:3460`).
6. Transit forecast comparison (gate vs drive) in inspector — galaxyMap shows hop/fuel count only.
7. Territory overlay (faction color wash per sector from `state.world.sectors[].owner`) — BP-03 scope, unchecked.
8. Multi-point mission geometry — galaxyMap draws the single active goal only.

### 5.4 Routing reality (critical — do not break)
**Every player map opener funnels through `src/ui/mapAuthority.js → openGalaxyMap()` (`:113`) → the
`galaxyMap` screen.** M/N keys, gamepad View, touch Local/Star, pause "Review Map", Mission Log CTAs
all land here. `starmap`/`localmap` are registered in `uiRoot.js:55-56` for tools/checks only and are
**not** the normal surface (`mapAuthority.js:1-7`, `isMapScreenId` `:173`). Product vocabulary keeps
"LOCAL MAP"/"STAR MAP" labels via `mapHandoffAction` `:143` while targeting `galaxyMap`.

**Open-intent contract:** `setMapOpenIntent`/`takeMapOpenIntent` write a one-shot `state.ui.mapOpenIntent`
(`mapAuthority.js:80/89`); `applyMapOpenIntentToView` (`galaxyMap.js:568`) consumes focus + target on
show. `MAP_FOCUS = {LOCAL, SYSTEM, GALAXY}`.

---

## 6. Navigation mechanics the map serves (ground every action here)

**Ownership:** `src/systems/world.js` owns jump/route/waypoint. Bus wiring (`world.js:205-208`):

| Intent | Handler | Effect |
|---|---|---|
| `world:requestJump {targetSectorId, via}` | `_onRequestJump` `:1990` | validates neighbor-or-wormhole + fuel/toll/combat-lock, arms `state.jump={state:'CHARGING',…}`. Reject reasons: `unknown_target/busy/cooldown/not_a_neighbor/wormhole_locked/no_drive/combat_lock/low_fuel/credits` |
| `world:requestRoute {targetSectorId, mode:'fuel'\|'hops'}` | `_onRequestRoute` `:2053` | `computeRoute()` → writes `state.nav.route` |
| `ui:setCourse {pos?, sectorId?, …}` | `_onSetCourse` `:2059` | `pos` → clears route, writes `waypoint`+`autopilot`. Else (sector) → `computeRoute`, `autoTravel=true` |

**The map emits exactly these three** via `emitGalaxyMapPrimaryAction` (`:1277`) and the dblclick path
(`:3280`). **Never invent a parallel mutation path.**

- **Jump vs plot:** `isOneHopNeighbor(state, id)` (`:1172`) — target in current `neighbors[]`. One-hop →
  `jump` ("Set Course & Jump"); non-neighbor → `route` ("Plot Course"). In-range physical gate → `jump`.
  Any local fix → `waypoint`.
- **Gates:** a station w/ `data.isGate` + `gateTo`. **Gate jumps cost 0 fuel**; drive jumps cost
  `ceil(BASE_FUEL * edgeDist * drive.tierFuelMult)`. High-sec customs toll via economy.
- **Route computation:** linear-scan Dijkstra over 24 nodes (`world.computeRoute` `:2101`), edges =
  `neighbors[]` + unlocked wormholes, routes only through discovered sectors. galaxyMap has its own
  pure **preview** router `computePreviewRoute` (`:2107`, hop-count only) for hover previews.
- **`state.nav`** = `{waypoint, route, autoTravel, autopilot}`; **`state.jump`** = `{state, targetSectorId, via, chargeT, …}`; **`state.fuel`** = `{current, max}`.

---

## 7. Player decisions / job stories (the map's reason to exist)

The primary action vocabulary (`resolveGalaxyMapPrimaryAction` `:1190`):

| Player wants to… | Target | Action | Label |
|---|---|---|---|
| go to a neighboring system now | sector (one-hop) | jump | "Set Course & Jump" |
| plan a multi-hop route | sector (non-neighbor) | route | "Plot Course" |
| jump through a gate I've reached | gate (in range) | jump | "Jump" |
| fly to a station/gate/contact | station/gate/contact | waypoint | "Set Waypoint" |
| fly to my base | owned claim | waypoint | "Set Base Waypoint" |
| fly into a zone | zone | waypoint | "Align Autopilot" |
| re-arm the current goal | waypoint/objective | waypoint | "Track Waypoint" |
| fly to a scanned wreck fix | bearing (phase fixed) | waypoint | "Set Bearing" |

And the reading jobs the inspector serves: **glance** at a sector's danger/market/influence/security at
once; **compare** gate-vs-drive transit; **find** the best-known sell for a commodity; **understand**
why a field changed (cause receipts); **track** the active mission; **assess** an owned claim's
throughput/defense; **rank** trade routes by profit/min. (These map directly onto the interaction loop
in `STATION_SHELL_CONTRACT.md` §1: glance → focus → reveal → manipulate → simulate → commit → explain.)

---

## 8. First-principles latitude — what the agent is free to rethink

A refactor is **not** limited to a reskin. The game's own contracts grant deliberate latitude, and the
data inventory (§4.1) supports showing substantially more than today. Per `STATION_SHELL_CONTRACT.md`
(apply its reasoning to the map), `GDD_2_0.md` §9.4, and `styles/AGENTS.md`:

### 8.1 Representation should follow the reasoning problem (`STATION_SHELL_CONTRACT.md` §4)
- **relationships** (sector graph, faction influence) → graph / constellation
- **flow** (commodity surplus→scarcity, supply chains) → routed beam / Sankey / moving beads
- **time** (route ETA, transit forecast, field trends) → timeline / forecast cone
- **quantity** (fuel, danger, influence, cargo pressure) → threshold meter / scale / gauge
- **alternatives** (gate vs drive, route modes, trade-route picks) → ghost preview / comparison scrubber
- **location** (waypoint, contact, zone) → overlay on the real position
- **causality** (field change) → action receipt / cause ledger
- **hierarchy** (galaxy→system→local) → **semantic zoom** / progressive expansion
- **explanation** (driver prose, service list) → anchored disclosure

### 8.2 You MAY
- Rethink the three-pane (rail/canvas/inspector) composition — including semantic zoom that changes
  *what* is shown per level, not just how far it is zoomed.
- Surface data the current map hides: transit forecast comparison, trade-route ranking, scan
  pings/highlights, territory wash, multi-point mission geometry, price-history sparklines, cause
  receipts, remembered-contact decay (§5.3).
- Adopt the menu fascia via the **token-remap technique** (§2.2) under a map scope, or compose from
  the `.sx-*` workbench primitives (§9.3), or write a map-specific material that shares the tokens.
- Use the effect layer (§9.1) — galaxyMap is already an allowed target of `flickerGrid`, `rippleField`,
  `hexPattern`, `routeBeam`.

### 8.3 You MUST (non-negotiable)
- Stay **read-only over sim** — the three intents (§6) are the only outward mutations. Keep model
  builders pure (no DOM) so they stay headless-testable.
- Keep the **map-authority routing** (`openGalaxyMap`) and the open-intent/focus contract (§5.4).
- Keep **keyboard/gamepad/touch parity** (§10.3) — including `/` search, `Tab` layer cycle, M/N/Esc
  close, d-pad landing on a real control, text-entry guard so M/N aren't swallowed by the search input.
- Keep the **non-diegetic rule** — no cockpit/visor/helmet framing.
- Keep `.screen`/`.panel` class hooks so `accessibility.css` forced-colors/dyslexia rules keep working.
- Preserve the two good menu behaviors if touching menus: **pause shows the live frozen frame behind
  it**; **main menu keeps the cinematic still + idle attract drift**.
- Prove it with **checks + current player-facing screenshots** (§11). Source-pattern green alone is not
  visual acceptance.

### 8.4 You MUST NOT
- Impose a frozen palette/glow/radius/typography **recipe** as policy (`styles/AGENTS.md`,
  `STATION_SHELL_CONTRACT.md` §5). Choose per surface and prove it.
- Pass gates by lowering authored quality, disabling visuals, or hiding features.
- Produce a result "interchangeable with a generic admin dashboard," "walls of text," or a "repeated
  list / center card / inspector template" (`STATION_SHELL_CONTRACT.md` §5 — the quality boundary).
- Edit `test/*.expected.json` to pass determinism checks; cosmetic canvas randomness is separate from
  sim determinism but must stay seeded/non-wall-clock where it affects replay.

---

## 9. Reusable vocabulary (don't reinvent)

### 9.1 Effect layer — `src/ui/effects/index.js`
The only sanctioned home for visual effects. Every factory has `setActive(bool)` + `dispose()`.
`EFFECTS` (`:41`) is the registry; `EFFECT_CUES` (`:55`) is the lint table
(`scripts/check-ui-effects.mjs`). galaxyMap is an allowed target of:

| Effect | Factory | Use |
|---|---|---|
| `flickerGrid` | `createFlickerGrid` | scanline flicker |
| `rippleField` | `createRippleField` | radial ripple (e.g. on layer toggle) |
| `hexPattern` | `createHexPattern` | hex tile shimmer |
| `routeBeam` | `createRouteBeam` | marching dash along a route/flow (the route-animation language) |

Plus `circularGauge`, `glyphMatrix`, `dockRail`, `morphLabel`, `supplyTree` (not currently map targets).
Shared helpers: `EFFECT_TOKENS`, `prefersReducedMotion`, `makeRng`, `createRafDriver`, `svgEl`.

### 9.2 DOM primitives — `src/ui/uiPrimitives.js` + `listControls.js`
`uiPrimitives.js` (view-only, detached elements): `glyph(name)`/`glyphSvg(name)` (24×24 inline SVG),
`panel(opts)`, `card(opts)`, `chip(text,{tone})` (tones `info/good/warn/danger/story/muted`), `dataBar(value,{tone})`
(`shield/hull/energy/cargo/heat/risk/danger`, bakes `role=meter`+aria), `rail(items)` (tablist),
`assetStage(opts)`, `trace(elm,tone)` (one-shot border sweep, reduce-motion-safe). `listControls.js`:
`createListControls({search,onSearch,chips,onChip})` (search + filter chips), `buildSortHeader(…)`.

### 9.3 Station workbench components (`.sx-*`) — `styles/station-workbench.css`
The broader material vocabulary the menu fascia draws from. Layout shells: `.sx-app`, `.sx-topbar`,
`.sx-crest`, `.sx-status`, `.sx-readouts/.sx-readout`, `.sx-credits`, `.sx-workspace`, `.sx-screen`,
`.sx-enter`. Dock/tiles: `.sx-dock`, `.sx-tile` (+`.is-active/.is-attention/.is-disabled`, `__icon/__label/__seat`).
Panels/cards: `.sx-panel`, `.sx-dossier`, `.sx-brief`, `.sx-trade`. Lists/rows: `.sx-fac-row`,
`.sx-mkt-row`, `.sx-ct-row`, `.sx-job`, `.sx-route-row`. Data: `.sx-stat`, `.sx-kv`, `.sx-seg`,
`.sx-tag(--good/--bad)`, `.sx-pips`, `.sx-demand`, `.sx-ladder`. Market chart: `.sx-mkt-chart/line/avg/delta`.
Faction dial: `.sx-dial` (svg ring). Buttons: `.sx-btn-primary`, `.sx-btn-ghost`. Tokens: `--surface-*`,
`--void-*`, `--line-1/2/3`, `--ink-0/1/2/3`, `--azure/-bright/-dim`, `--gain/--loss`, `--sx-display/-ui/-mono`.

### 9.4 Map's own current canvas vocabulary (reusable internals)
`layoutMapLabels`, `mapLabelPriority`, `clampMapLabelX`, `pickMapTargetAt`, `mapTargetPriority`,
`mapSearchTargetPriority`, plus markers: `drawMapGoalMarker`, `drawWaypointPin`,
`drawUniqueWreckBearingMarker`, `drawServiceGlyphs`, `asteroidOreGlyph`, `hazardTypeGlyph`.

---

## 10. Hard constraints

### 10.1 Performance — `design/PERF_BUDGET.md`
Frame targets 16.7 ms (60 fps desktop), 33.3 ms floor (low-end). Per-frame allocation budget includes
**UI ≈ 1.2 ms** (the modal screen replaces the flight HUD while open, but the rAF loop + canvas-2D draw
+ label layout must stay cheap). Forbidden as default "fixes": lowering renderScale/pixelRatio/bloom/
shadows/particles, shipping low-quality assets, disabling authored visuals, claiming a win from average
FPS while p95/p99/hitches regress. Enforced by `npm run check:perf-budget`. The map already uses
signature caching (`_inspectorDetailsHtml`) and an area-budgeted label layout (`maxLabels`) — keep
that discipline.

### 10.2 Render lifecycle (keep)
`onShow` starts a rAF loop with smooth zoom lerp (`alpha=1-exp(-dt/0.10)`), scan rings, a 64 ms refresh
gate; `onHide` cancels rAF; re-show cancels first to avoid stacked loops. DPI = `min(2,
devicePixelRatio)`; `ResizeObserver` on the viewport. Hidden screens must stop render/animation work.

### 10.3 Accessibility — keyboard / gamepad / touch (parity is hard-required)
- **Keyboard** (`onKey` `:2685`): `/` focuses+selects search; `Tab` cycles layers (order route→…→discovery, fires a scan ring); `M`/`N`/`Esc` close; `Enter`/`Space` on a selected claim activates the primary action. Text-entry guard: when focus is in an input, all keys except Esc pass through.
- **Gamepad:** `mapFocusButtonSelector(intent)` (`:301`) returns the scale chip **only for gamepad
  source**; keyboard/pointer return null so focus parks on the dialog root (not the search input).
- **Touch:** `openGalaxyMap` accepts a `source`; touch openers pass Local/Star focus.
- **Search:** ArrowUp/Down navigate, Enter selects and hands focus to the primary action button.
- **Reduced motion:** LOCAL scan sweep + all effects respect `prefers-reduced-motion`.
- **Canvas a11y:** `setMapCanvasAriaLabel` (`:2050`) syncs an `aria-label` per scale.
- **Contrast/legibility:** verified by `check:wcag-contrast`, `check:ui-a11y`.

### 10.4 Determinism
Sim is fixed-60 Hz, uses `state.rng`/`state.simTime` (never wall-clock for outcomes). The map's model
builders are pure; canvas randomness (bead phase, scan sweep) uses seeded hashes — keep it cosmetic and
seeded, never feed it into sim outcomes or save state.

### 10.5 Layout determinism
`resolveGalaxyMapLayout(width,height)` (`:82`) is the single responsive-composition source (wide/
compact/narrow). "The map never lets tools float over the canvas."

---

## 11. Verification router

Run the narrow owning check first, then broaden with risk.

| Changed seam | Minimum proof |
|---|---|
| Map visuals/composition | `npm run check:ui-identity`, `check:ui-a11y`, `check:wcag-contrast`, `check:ui:perf`, `check:player-facing-labels`, `node scripts/check-ui-screen-imports.mjs`, plus current player-route screenshots |
| Map behavior/intents | `check:galaxymap` (BP-03 gate; replaces legacy `check:starmap-objective` + `check:localmap-routes`), `check-map-confidence`, `check-known-vs-live-prices`, `check-intent-glyphs` |
| Menu fascia | focused UI check + a11y/contrast + representative screenshot |
| Broad integration | `npm run check` after focused checks pass |

**Visual acceptance requires current player-facing evidence.** Green source-pattern checks alone do not
prove visual quality or usability (`AGENTS.md` §9, `STATION_SHELL_CONTRACT.md` §6).

---

## 12. File reference index

**Aesthetic / north star**
- `styles/menu.css` — the menu fascia (token remap §1 lines 28–59; plate §2; buttons §4; primitives §5; title §7; confirm §8; a11y §9).
- `styles/station-workbench.css` — the workbench material + `.sx-*` vocabulary.
- `styles/fonts.css` + `styles/fonts/*.woff2` — Saira / Plex Sans / Plex Mono.
- `design/MENU_OVERHAUL_BRIEF.md` — the (now-historical) menu handoff; old-vs-new axis table, migration recipe.

**Menu screens (on the fascia)**
- `src/ui/screens/{mainMenu,pause,newGame,settings,saveLoad,help,codex}.js`, `src/ui/confirm.js`.

**Maps**
- `src/ui/galaxyMap.js` — live map (model builders `:851/:947/:1060`; resolvers `:1129/:1190/:351`; screen `:2258`; DOM shell `:2327`; CSS `:1310-1814`; layout `:82`; inspector `:2802`; onKey `:2685`).
- `src/ui/screens/starmap.js`, `src/ui/screens/localmap.js` — legacy parity sources (§5.2).
- `src/ui/mapAuthority.js` — the single open path (`openGalaxyMap` `:113`, `MAP_FOCUS`, `mapHandoffAction` `:143`).

**Domain / data**
- `src/data/{sectors,sectorZones,factions,factionPresence,claimableBodies,commodities,missions}.js`.
- `src/systems/sectorSim.js` (`sectorSignalFor` `:902`, `forecastTransitFor` `:938`, `effectiveSectorFor` `:878`).
- `src/systems/world.js` (`_onRequestJump` `:1990`, `_onRequestRoute` `:2053`, `_onSetCourse` `:2059`, `computeRoute` `:2101`).
- `src/ui/{marketIntelligence,priceHistory,priceForecast,causeLedger,securityReadout,uniqueWreckMapLayer}.js`.

**Reusable**
- `src/ui/effects/index.js` (effect barrel + cues), `src/ui/uiPrimitives.js`, `src/ui/listControls.js`.

**Policy / contracts**
- `design/STATION_SHELL_CONTRACT.md` (interaction loop §1, representation rule §4, quality boundary §5).
- `design/revamp/BP-03_ONE_MAP.md` (the open map-cutover spec + parity checklist).
- `design/PERF_BUDGET.md`, `design/GDD_2_0.md` §9.4, `design/vision/00_CONSTITUTION.md` §5.
- `AGENTS.md` (root), `src/ui/AGENTS.md`, `styles/AGENTS.md`.

---

*End of dump. Generated from a read-only audit of the SpaceFace codebase; verify against the live tree
before acting (`git status --short`, `git log -1`).*
