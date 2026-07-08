# Command-Deck Effects & Gameplay Expansion Bible

**Date:** 2026-07-08 · **Type:** research + design synthesis (NO implementation this pass).
**Authority chain:** `ARCHITECTURE.md` > `design/GDD_2_0.md` > `design/spec2/00_MASTER_TASTE.md` >
`design/spec2/06_UI_IDENTITY.md` / `design/spec3/SPEC3-F8-graphics-visuals.md` /
`design/spec3/SPEC3-F10-ux-meta-tastemaster.md` > this doc. Where this doc and a spec disagree, the
spec wins; edit the spec in the same change if you need to deviate (constitution law).
**Companion inventories:** `design/revamp/FRONTEND_REBOOT_AUDIT.md` (surface list),
`design/revamp/ONE_VOICE_CLOSEOUT.md` (attention arbiter), `design/revamp/HUD_THREE_ANCHOR.md`.

---

## 0. The thesis — why the generic menus are a failure

SpaceFace runs a real 60 Hz physics sim with a living economy, a faction war, a cost-basis ledger, a
mass-line tether, and a campaign director. **Its best systems are built and mute** (SPEC3-42 §1:
"the game's core problem is not missing content — it's unexpressed content"). A frontend agent that
answers "build the outfitting screen" with a slot grid + a stat table has shipped a *SaaS dashboard
bolted to a spaceship*. That is the failure this bible exists to prevent.

**The one rule under all the others:** every major screen is a **playable instrument**, not a
document. An instrument has a spatial/temporal centerpiece you read at a glance and manipulate
directly; a document has rows you scroll. SPEC3-F10 §4 names the trap by name — *the spreadsheet
trap: depth expressed as tables. Our law: every number the player must know has a spatial or
temporal read first.* SPEC3-42 §3: *numbers are for crime and fitting* — everywhere else, show the
state (arc, color, motion, position), not the digit.

Three inherited hard walls frame everything below (spec2/00 §3–4, unchanged):

- **Locked palette (tokens only, never raw hex):** `--accent` cyan = interactive/friendly/info ·
  `--warn` amber = warning/strain/attention · `--danger` red = danger/hostile · `--accent-3` violet
  = story/anomaly · `--accent-2` mint = resource/gain · `--ink` white = text. Sector accents live in
  `src/data/sectors.js` palette blocks, ≤10% usage. **No new hue enters without adding it there
  first.** Reuse `--console-*` for flight-console surfaces and the `sf-*` primitive tunables
  (`--sf-bar-*`, `--sf-trace-dur`, `--sf-cut`, `--sf-chip-color`).
- **Motion means state change.** Nothing pulses, glows, morphs, or animates at rest. Transitions
  120–250 ms ease-out (`--ease`), decays ≤600 ms. The ONLY at-rest exceptions in the whole game are
  the 4.2 Hz seam ember (≤18% amplitude) and ≤8% engine idle flicker — **neither is a UI effect.**
- **Non-diegetic, dark, cheap.** No visor/cockpit/helmet motifs (permanent user decision). No
  `backdrop-filter`. Background luminance <18% sRGB. No new runtime dependency, no second frontend
  framework — the whole overlay is vanilla DOM/CSS/`<canvas>` over Three.js (AGENTS.md §2).

Everything in §1–§6 is a way to be *more* expressive inside those walls, never a reason to breach
them.

---

## 1. Visual-effect grammar

Eleven effects, each mapped from a Magic UI reference to a **game meaning**. An effect with no state
behind it is decorative and therefore forbidden (spec2/00 §3, SPEC3-F8 anti-patterns: "effects at
rest"). Reduced-motion behavior assumes `state.settings.video.motionReduce` /
`html.sf-reduce-motion` (the global blanket in `styles/accessibility.css` already forces
animation/transition to ~0 ms; effects must *degrade to a legible static state*, never to a blank).

Every effect below composes with the existing `sf-*` primitive layer
(`src/ui/uiPrimitives.js` + the `styles/ui.css` EOF block) and must obey the flight-HUD frame-sleep
rule (`scripts/check-ui-frame-sleep.mjs`): **no `box-shadow`/`transition`/`animation` on always-mounted
flight elements** — these effects live on *screens* and *contextual* surfaces, not the resting HUD.

### 1.1 Scanner Grid  *(Magic UI: flickering grid)*
- **Mechanic meaning:** an active sensor field. Cell brightness = signal return at that bearing;
  a lit cell means "something scanned here." It is the visual language of *sensors are on*.
- **Allowed screens:** Galaxy/System Map (nav backdrop), Exploration/scan overlays, Station Hub
  scanner tab, Main Menu tableau (very low density).
- **Trigger:** a scan pulse (`scan:pulse`), map open, or contact-resolve. Cells light *toward
  detected returns*, never randomly.
- **Max duration:** the sweep animates ≤600 ms per pulse, then holds a static lit state; it does
  **not** free-run.
- **Reduced motion:** no flicker; render the final lit grid statically (lit = detected, dim = empty).
- **Forbidden:** as ambient wallpaper on any screen with no scan state; on the flight HUD; behind
  readable text at >8% contrast.

### 1.2 Ping Ripple  *(Magic UI: ripple)*
- **Mechanic meaning:** a discrete event radiating from a point — a scan pulse, a contact detection,
  a trade confirmation, a claim landing. One ripple = one event (No Man's Sky scanner cadence).
- **Allowed screens:** Map, Exploration, Market (trade-confirm), Station Hub (dock/undock), radar
  contextual reveal.
- **Trigger:** exactly one bus event per ripple (`scan:pulse`, `contact:detected`,
  `economy:tradeCompleted`, `dock:docked`). Never on hover, never on a timer.
- **Max duration:** ≤500 ms, single expansion, ends at opacity 0.
- **Reduced motion:** replace with a 1-frame static ring mark that fades via opacity only.
- **Forbidden:** stacking (>1 concurrent ripple from the same source = a bug); decorative "alive"
  pulsing; anything on the resting HUD.

### 1.3 Hex Sector Lattice  *(Magic UI: hexagon pattern)*
- **Mechanic meaning:** the tessellation of *space itself* on a strategic surface — territory tiles,
  jurisdiction zones, sensor coverage cells, claim regions. A hex's fill = who owns / what's known.
- **Allowed screens:** Galaxy Map, Factions/territory board, Automation fleet-ops map.
- **Trigger:** map open (static draw) + state-change recolor (`faction:sectorFlipped`,
  discovery reveal, claim). Recolor tweens ≤250 ms.
- **Max duration:** static once drawn; only recolors animate, and only on ownership/knowledge change.
- **Reduced motion:** instant recolor, no tween.
- **Forbidden:** animated at rest (no shimmering hex field); as pure texture with no per-hex state;
  introducing a fill hue outside the sector/faction palette.

### 1.4 Dependency Spindle  *(Magic UI: file tree)*
- **Mechanic meaning:** a directed acyclic graph of *prerequisites and supply* — tech unlocks,
  crafting recipes (raw→refined→component→module), module dependencies. Edges are supply; nodes are
  states (locked / available / owned / short-on-inputs).
- **Allowed screens:** Tech tree, Crafting/Manufacture, Outfitting (module dependency inspector),
  Automation (outpost supply chain).
- **Trigger:** screen open (static layout); node/edge state recolor on `tech:researched`,
  `craft:queueChanged`, inventory change. Expand/collapse on click ≤200 ms.
- **Max duration:** static graph; only expand/collapse + state recolor animate.
- **Reduced motion:** instant expand/collapse; no edge-draw animation.
- **Forbidden:** flowing/marching edges at rest (edges only animate when material is *actually
  moving* — see Route Beam); using it where a flat list of 3 items would read faster.

### 1.5 Console Key  *(Magic UI: interactive hover button)*
- **Mechanic meaning:** a physical panel control — dock services, fleet orders, loadout presets,
  power toggles. Hover/focus reveals its consequence (cost, delta, target) *before* commit.
- **Allowed screens:** every screen's action controls; Station Hub Service Dock; Automation orders;
  Outfitting fit/buy.
- **Trigger:** hover/focus only. Reveals a delta chip or preview; commit is a click.
- **Max duration:** hover reveal ≤150 ms in, ≤150 ms out.
- **Reduced motion:** the reveal appears instantly (opacity swap, no slide); keyboard focus must show
  the identical reveal (a11y parity).
- **Forbidden:** idle glow to "look clickable" (spec2/00 forbidden list); reveals that hide the
  affordance until hover (discoverability); more than one delta surface at once (one-voice on screen).

### 1.6 Ring Gauge  *(Magic UI: animated circular progress)*
- **Mechanic meaning:** a bounded process with a deadline — cruise/jump charge, weapon heat, refine
  timer, route ETA, siege countdown, passive-income cap fill. The arc *is* the number (SPEC3-42:
  numbers only for crime/fitting).
- **Allowed screens:** any screen with a timed/bounded process; contextual HUD (charge) as an arc on
  the status cluster, not a fourth anchor.
- **Trigger:** process start → arc fills/drains to real progress; snaps to state, never eased past
  truth by >100 ms (input-answer law).
- **Max duration:** bounded by the process; the gauge disappears ≤250 ms after completion.
- **Reduced motion:** the arc still tracks progress (it's information, not decoration) but drops any
  pulse/glow on completion — a static color flip marks "done."
- **Forbidden:** spinning "loading" rings with no bounded backing process; heat/charge gauges that
  lie about the sim value; rest-state pulsing when idle at 0 or 100%.

### 1.7 Anomaly Glyph Matrix  *(Magic UI: glyph/icon matrix)*
- **Mechanic meaning:** encoded, partially-decoded information — an anomaly signature, a cargo
  manifest, a contact-code roster, a signal archive entry, an assay readout. Glyphs resolve from
  scrambled → legible as the player *earns* the read (scan, decode, board).
- **Allowed screens:** Exploration/anomaly, Codex/Signal Archive, Market cause-inspector, Cargo
  manifest, Salvage anatomy, Factions contact roster.
- **Trigger:** a decode/scan/board event resolves glyphs (one settle per event); or hover to inspect
  a single glyph.
- **Max duration:** the settle animation ≤600 ms total across the matrix (staggered), then static.
- **Reduced motion:** show final resolved glyphs immediately; unresolved glyphs stay a static "░".
- **Forbidden:** perpetual scramble as "sci-fi flavor" (that's the lore-dump/juice-inflation trap);
  matrices whose glyphs never resolve to real data.

### 1.8 Route Beam  *(Magic UI: animated beam)*
- **Mechanic meaning:** *directed flow along a line* — a plotted nav route, a trade lane with goods
  moving, a power-flow conduit (reactor→system), a tether/mass-line, a convoy path. Direction +
  speed + color = flow direction, throughput, and legality/threat.
- **Allowed screens:** Map (route), Market (trade lanes), Outfitting/HUD (power-flow), Automation
  (drone/convoy paths), Factions (supply lines).
- **Trigger:** the flow must be *real and active* — a set course, a live trade route, powered
  conduit. The marching dash is the sanctioned state-change motion (spec2/06 §5: "route line animates
  a 3-px marching dash").
- **Max duration:** animates only while the flow is active; a plotted-but-inactive route is a static
  dashed line.
- **Reduced motion:** static dashed line with a direction arrowhead; no marching.
- **Forbidden:** beams between things with no actual flow; power-flow that doesn't match the fit;
  marching on the resting HUD.

### 1.9 Readout Morph  *(Magic UI: morphing/animated text)*
- **Mechanic meaning:** a value *changed* — price tick, credits delta, ETA countdown, cargo count.
  The morph draws the eye to the change and nowhere else.
- **Allowed screens:** Market (price ticks), any screen's live counters, contextual credit/cargo
  chips.
- **Trigger:** value change only. The digit rolls/crossfades from old→new once.
- **Max duration:** ≤200 ms per change; no residual motion.
- **Reduced motion:** instant value swap with a ≤250 ms color flash (up=mint, down=amber/red) instead
  of a roll.
- **Forbidden:** morphing at rest / on a timer (the "ticking clock that never stops" is rest-motion);
  morphing static labels; using it where the number isn't allowed at all (flight HUD states).

### 1.10 Service Dock  *(Magic UI: dock)*
- **Mechanic meaning:** a rail of station/tool services (refuel, repair, ammo, market, missions,
  shipyard…) that reads as a physical berth control strip. The focused service magnifies + reveals
  its readiness (fuel need, repair cost, stock).
- **Allowed screens:** Station Hub (the docked service console centerpiece), tool docks on ops
  screens.
- **Trigger:** hover/focus magnify (like Console Key); selection swaps the panel. Readiness badges
  update on state change only.
- **Max duration:** magnify ≤150 ms; no idle bounce.
- **Reduced motion:** no magnify scaling; focus shown by a border/outline swap; readiness badges
  static.
- **Forbidden:** the macOS idle-bounce/wobble; decorative magnification with no readiness payload;
  becoming a second nav bar that duplicates the tab rail.

### 1.11 Nav Globe / System Sphere  *(Magic UI: globe)*
- **Mechanic meaning:** a 3D orientation instrument for a *system or body* — planets/stations/gates
  in their orbits, an approach vector, a claim's coverage sphere. It answers "where am I in this
  system" spatially (the top-down flight plane never rotates; this is a *map/approach* instrument
  only).
- **Allowed screens:** Galaxy Map (SYSTEM zoom level — augments the existing canvas), Station/planet
  approach, Claim/base coverage.
- **Trigger:** open at system-zoom; slow settle on entry (the SPEC3-33 "establishing shot" ambition,
  ≤1.2 s, skippable); rotation is *player-dragged*, not auto-spun.
- **Max duration:** entry settle ≤1.2 s then still; interaction-driven thereafter.
- **Reduced motion:** no entry settle, no auto-rotate; a static oriented projection.
- **Forbidden:** an auto-spinning globe at rest (rest-motion); reintroducing a first-person/cockpit
  frame around it; using WebGL where the existing 2D canvas already reads better (galaxyMap's
  GALAXY/LOCAL levels stay 2D — F8-33 anti-pattern: "3D belongs in the flight layer").

**Cross-cutting rule for all eleven:** an effect is allowed *only* where a game state changes it.
Ship them in `src/ui/effects/*` (see §6), never inline per screen, and lint them the way `vfxCues.js`
lints the 3D layer (SPEC3-F8-34): a table of `{effect, screen, triggerEvent, maxMs}` that a check can
walk. The composition already-shipped `sf-border-trace` (one-shot ≤250 ms edge sweep on state change)
and `sf-spotlight` (hover/focus wash) are the two *primitive* members of this same grammar and set
the precedent.

---

## 2. Screen centerpiece plan

Every major screen gets **one** interactive centerpiece — the thing a stranger names first in the
five-second test (spec2/00 §7). "Current" reflects the live code (per the surface audit); "→" is the
instrument it should become. No screen may ship with only cards/tabs/tables (§5).

| Screen | Current (live) | Centerpiece → | Core effect(s) | Reads |
|---|---|---|---|---|
| **Main Menu** | JPG splash + button column | **Live title tableau** — the hero ship drifting through the parallax stack (F8-33), sector lattice ghosting behind the title; input-quiet, motionReduce-off | Hex Lattice (low), parallax stack | none (render-only) |
| **Galaxy Map** | ✅ 3-level zoomable `<canvas>` (strong) | **Navigation command table** — keep the canvas; add plotted Route Beams, Hex Lattice territory fills at GALAXY zoom, a Nav Globe at SYSTEM zoom | Route Beam, Hex Lattice, Nav Globe, Ping | `world.discovery`, `sectorSim.field`, `factions` owner, `nav.waypoint` |
| **Station Hub** | Tab rail + panel-swap shell (router) | **Docked service console** — a Service Dock rail of berth services with live readiness badges; the active service panel is the content | Service Dock, Console Key | `services` readiness, `player.cargo/credits`, `fuel`, `entities` hull |
| **Hold / Inventory** | *(no dedicated screen — cargo lives in chips + station header)* | **Cargo-hold schematic** — a bay grid you load/jettison, showing fill, mass distribution, fragile/contraband cells, and hold value | Cargo schematic (data-bar fills), Glyph Matrix (manifest) | `player.cargo`, `cargo` mass/value, `fragileCargo`, `heat` (contraband) |
| **Market** | ✅ card grid + per-card sparklines + expandable canvas chart (partial) | **Trade intelligence scope** — lean into the price/forecast canvas as the hero; commodity list becomes the *selector*, the scope is the read | Readout Morph (ticks), Route Beam (lanes), Glyph Matrix (cause), Ring (regime) | `economy.markets/econEvents`, `priceForecast`, `priceHistory`, `marketMemory` |
| **Outfitting** | slot grid + stat table + shop table (generic) | **Ship hardpoint schematic + power-flow graph** — the hull as a diagram; slots are positions on it; a reactor→system Route-Beam graph shows the fit's power budget | Ship schematic, Route Beam (power), Ring (heat/power caps), Dependency Spindle (module reqs) | `ships` derived stats, `moduleInventory`, `researchedNodes`, `weapons` |
| **Shipyard** | ✅ WebGL 3D turntable + hull table (strong) | **3D hangar** (keep) — add the power-flow graph readout beside the turntable so buying a hull previews its budget, not just its stats | 3D hangar (shipPreviewMount), Route Beam (power) | `ownedShips`, `ships` unlock/derived, `render.envMap` |
| **Missions** | card list + progress bars (generic) | **Operations contract board** — contracts as a routed board: each contract shows its objective on a mini route map (origin→waypoints→payout) with stage Ring gauges | Contract board, Route Beam, Ring, border-trace (stage advance) | `missions.active/completed/receipts`, `nav.waypoint`, `story` |
| **Automation** | tabbed cards + metric tiles + bars (generic) | **Fleet operations map** — drones/traders/outposts plotted on a sector map with their routes as Route Beams; the cap-fill is a Ring, not a bar | Fleet ops map (Hex Lattice + Route Beam), Ring (cap) | `automation.{drones,traders,outposts,fleet}`, `balance`, passive cap |
| **Factions** | standings list + chips (generic) | **Diplomacy/territory board** — a Hex Lattice territory map (who owns what, war-wash) beside a relationship web (Route-Beam graph of standings) | Hex Lattice, Route Beam (relations), Glyph (contacts) | `factions[id].rep/owner`, `sectorSim`, `heat` (wanted), war state |
| **Tech / Crafting** | node grid / recipe list (generic) | **Dependency / supply-chain tree** — a Dependency Spindle: tech prereqs and craft recipes as one DAG; edges light when inputs are in hold | Dependency Spindle, Route Beam (supply flow when crafting), Glyph (recipe) | `researchedNodes`, `crafting` queue, `player.cargo`/materials, `claims` |

**Station Hub note:** it is legitimately a *router shell* (the audit calls it that). Its centerpiece
is the **active child panel** plus the Service Dock rail — do not gild the frame; invest the
instrument budget in the panels (Market scope, Outfitting schematic, etc.). This keeps SPEC3-36's
"shared header" promise without a fourth anchor.

---

## 3. Gameplay expansion matrix (56 features)

Extracted from the reference set (spec2/00 §8 "steal exactly this" + the open-source and commercial
studies below). **GPL/open-source games are pattern sources only — no code is copied** (Endless Sky,
Naev, Oolite, Vega Strike are GPL; Pioneer is GPL/MIT-mixed). Every row names a *real* repo system it
touches (see AGENTS.md §8 UPDATE_ORDER) and a centerpiece/effect from §1–§2, so no feature is a
floating idea.

Columns: **Feature** · **Inspiration** · **Why it fits SpaceFace** · **Repo system(s)** · **UI
centerpiece / effect** · **Risk** · **First vertical slice**.

### 3.1 Combat
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Subsystem targeting (engine/weapon/shield) | EVE, Elite | Rewards the "read the battlefield" pillar; makes disable-and-board possible | `combat.js`, `targetPanel.js` | Target schematic overlay + Ring (subsystem hp) | Med | Target panel gains a subsystem picker; damage routes to that subsystem's hp field, arcs mirror it |
| Power-flow pips in combat (weapons/engines/shields) | Elite Dangerous | Turns the fit into a real-time verb; uses the sim's momentum identity | `ships.js`, `weapons.js`, `flightV3.js` | Power-flow Route Beam + Ring gauges | Med | 3-way pip allocation on `state.player`; derived stats read pips; HUD arc shows balance |
| Flown siege / wave-defense at claims | Starsector, tower-defense | SPEC3-42 bar: "the only flown tower-defense in a space-trader" | `claims.js`, `encounterDirector.js`, `spawnBudget.js` | Contextual wave cards + territory board | High | One claim, 3 scripted waves, a defense-battery module, a Ring countdown |
| Boarding / disable-and-capture | Endless Sky, Star Valor | Closes the mining→tether→salvage loop into combat; capture as reward | `combat.js`, `tetherGameplay.js`, `salvage.js` | Cargo schematic + capture Ring | High | Disable via subsystem kill → tether-dock → capture prompt → hull enters `ownedShips` |
| Weapon convergence & heat discipline | Elite, X4 | Heat is already modeled (`weapons.js` vent); surface it as a managed gauge | `weapons.js`, `hud.js` | Ring (heat), Console Key (group toggle) | Low | Per-group heat Ring on the outfitting/HUD; forced-vent stance already exists |
| Threat-priority overview (weaponized EVE list) | EVE overview | The overview strip exists; add threat scoring + one-key focus-fire | `radar.js`, overview, `wingmen.js` | Overview + Glyph Matrix (threat codes) | Low | Sort overview by threat score; `F` = focus wing on top threat |

### 3.2 Mining / resource
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Vein/seam network map (deep-drill) | Deep Rock Galactic, NMS | `drill.js` ant-farm exists but is mute; give it a read | `drill.js`, `mining.js` | Vein schematic canvas + Ping | Med | Drill screen renders the current body's vein graph; mined veins deplete visually |
| Ore assay / purity grading | EVE, X4 | Purity already hinted in economy; make it a scanned read that gates price | `mining.js`, `economy.js` | Glyph Matrix (assay) + data-bar | Med | Scan a rock → assay glyphs resolve → purity multiplies sale value |
| Tether slingshot / mass-throw | SpaceFace identity (spec2/01) | The signature verb; mining *teaches* the tether (SPEC3-42 coherence) | `tetherGameplay.js`, `combat.js` | Route Beam (arc) + Ring (charge) | Med | Charge-throw a chunk at a target; damage scales with momentum (partly built) |
| Prospecting scan minigame | DRG, NMS scanner | Mining as aim-and-rhythm, not hold-button (spec2/00 reference map) | `scanner.js`, `mining.js` | Scanner Grid + Ping Ripple | Low | Scan pulse reveals seam-rich rocks as lit grid cells; cadence rewarded |
| Refinery supply chain (raw→refined→component) | X4, EVE | Feeds crafting + claims; the built `crafting.js` needs a spatial home | `crafting.js`, `claims.js` | Dependency Spindle + Route Beam (flow) | Med | Manufacture tab shows the DAG; a running job animates supply flow along edges |
| Field depletion & regeneration economy | EVE belt depletion | `sectorSim` already models offscreen fields; surface scarcity as strategy | `sectorSim.js`, `mining.js` | Sector map heat (Hex) + Ring (regen) | Low | Belt richness decays with extraction, regenerates over game-days; map tints it |

### 3.3 Trading / economy
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Multi-hop trade-route planner | Elite, X4 | Surfaces the living economy as *knowledge* (spec2/00: "market data as knowledge") | `economy.js`, `galaxyMap.js` | Nav command table + Route Beam | Med | Pick A→B→C; planner shows per-leg margin + fuel; plots as a beam route |
| Price-forecast regime scope | Elite (market honesty) | `priceForecast`/`economyCycles` are built; the chart exists — lean in | `economyCycles`, `priceForecast`, `market.js` | Market scope (canvas) + Ring (regime) | Low | Promote the price/forecast canvas to the market hero; regime label as a Ring band |
| Cost-basis P&L ledger | SpaceFace built (mute) | SPEC3-42 §1 names the cost-basis ledger as invisible depth to express | `economy.js`, `causeLedger.js` | Trade scope + Readout Morph | Low | Track buy cost-basis per commodity; sell shows realized P&L morph |
| "Why this price" cause inspector | SpaceFace built (`causeLedger`) | Connect headline→price→cause (audit debt #8) | `causeLedger.js`, `marketNews.js` | Glyph Matrix / cause web | Low | Click a price → the drivers (war, blockade, event) resolve as a cause web |
| Contraband / customs-risk trading | Elite, Freelancer | `customsPrompt`+`heat` exist; risk is *numbers-for-crime* (allowed) | `customsPrompt.js`, `heat.js`, `economy.js` | Scan-risk card + Ping (scan) | Med | Contraband cargo raises scan-risk; customs ping resolves inspect vs pass |
| Market manipulation / blockade play | X4, EVE | Ties economy to the faction war (coherence arrow) | `economy.js`, `factions.js`, `encounterDirector.js` | Territory board + trade-lane beams | High | Blockading a lane spikes downstream prices; player can run or relieve it |

### 3.4 Exploration / anomaly
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Signal-source triangulation | NMS, Elite FSS | Turns the scanner into an exploration verb with breadcrumbs | `scanner.js`, `world.js` | Scanner Grid + Ping + Nav Globe | Med | Multiple pulses narrow a signal's bearing; converge to reveal a POI |
| Anomaly glyph decode (Vale thread) | SpaceFace story, Outer Wilds | The frontier "holds the story's answer" (coherence); decode is earned read | `story.js`, `scenarioRuntime.js`, `salvage.js` | Anomaly Glyph Matrix | Med | An anomaly's signature is a scrambled matrix; scan actions resolve rows |
| Cartography / discovery-fog reveal | Endless Sky charted-map | spec2/00: charted space is charted; frontier is the only unknown | `world.js`, `galaxyMap.js` | Hex Lattice reveal + Route Beam | Low | Jumping/scanning reveals adjacent hexes; ??? only on true frontier (forbidden elsewhere) |
| Derelict / wreck salvage anatomy | SpaceFace built (`salvage`) | Salvage system is built; give wrecks a readable anatomy | `salvage.js` | Ship schematic + Glyph Matrix | Med | A wreck shows salvageable modules as schematic cells you cut free (tether) |
| Deep-space POI breadcrumb chase | NMS POI cadence | Pulls the player frontier-ward (coherence arrow) | `world.js`, `scanner.js` | Nav Globe + Ping | Low | Scanning surfaces a distant POI marker that resolves closer with each pulse |
| Sector establishing-shot arrival | SPEC3-33 ambition | The parallax stack becomes the arrival moment | `renderer.js` (render), `galaxyMap.js` | Nav Globe / parallax | Med | 1.2 s camera settle through the depth stack on jump-in; skippable |

### 3.5 Ship / outfitting
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Hardpoint / subsystem schematic fitting | EVE fitting, Space Engineers | Fixes the #1 generic screen; fitting becomes spatial not tabular | `outfitting.js`, `ships.js` | Ship hardpoint schematic | Med | Render the hull as a diagram; slots are positions; drag/assign modules |
| Power-flow allocation graph | Elite pip mgmt | Fit has a budget you can *see*; couples to combat pips (3.1) | `ships.js`, `weapons.js` | Route Beam (reactor→system) + Ring | Med | Reactor node feeds weapon/engine/shield nodes; overdraw flags amber |
| Module synergy / build-identity tells | SpaceFace built (synergy-tells) | Synergy is computed but unsurfaced; show why a build sings | `ships.js`, build-identity | Dependency web + `sf-spotlight` | Low | Equipping a synergistic pair lights an edge + a one-line tell |
| Damage-state persistence & repair | SPEC3-34 ambition | Ships "wear their history" — unscripted storytelling | `combat.js`, `ships.js` | Ship schematic damage overlay | Med | Hull hits mark schematic cells; repair clears them; visible in shipyard |
| Loadout presets / role templates | X4 | Fast re-fit for a run type (haul/bounty/survey) — ties to the choice-beat | `ships.js`, `outfitting.js` | Console Keys + schematic | Low | Save/apply a named fit; preview deltas before commit |
| Hull comparison turntable (exists) | SpaceFace built (shipyard) | Already the reference bar — reuse, don't rebuild | `shipyard.js`, `shipPreviewMount.js` | 3D hangar | Low | Add the power-flow readout beside the turntable |

### 3.6 Fleet / automation
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Fleet operations map | X4, Homeworld | Fixes the generic ops board; surfaces the built automation depth | `automation.js` | Fleet ops map (Hex + Route Beam) | Med | Plot drones/traders/outposts on a sector map with their routes |
| Drone program editor | Factorio, X4 | Automation "texture, never main income" — programming is the toy | `automation.js` | Route Beam (path) + node graph | Med | Assign a drone a mine→depot loop by picking nodes; path draws as a beam |
| Outpost supply-chain flow graph | X4, Factorio | Bases as strategy; the passive cap stays sacred (SPEC3-42) | `automation.js`, `claims.js` | Dependency Spindle + Route Beam | Med | An outpost's inputs/outputs as a flow graph; throughput animates when live |
| Passive-income cap gauge | SpaceFace built (0.45 funnel) | The cap is a *design promise*; visualize it so idle-drift is legible | `automation.js` | Ring (cap fill) + data-bar | Low | Header cap Ring: fills toward A(T)·0.45, reads "at ceiling" honestly |
| Convoy escort / interception meta | Freelancer | Ties traffic + director + economy (multiple coherence arrows) | `automation.js`, `traffic.js`, `encounterDirector.js` | Route Beam + threat overlay | Med | Escort a convoy along a beam route; interdiction spawns from the director |

### 3.7 Factions / diplomacy
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Territory / war board | EVE sov, Stellaris | The war is built and mute; the war-wash hook exists (SPEC3-35) | `factions.js`, `sectorSim.js` | Hex Lattice territory map | Med | Sector ownership as hex fills; war-wash tints contested sectors |
| Standing relationship web | Star Valor, X4 | Makes rep a *graph* you read, not a column of numbers | `factions.js` | Route Beam relationship web | Low | Factions as nodes; your standing + inter-faction relations as edges |
| Bounty / wanted-heat management | Elite, Freelancer | `heat.js` is built; wanted status as a manageable scan-risk | `heat.js`, `factions.js` | Scan-risk card + Ring (decay) | Low | Wanted level card; decay Ring; bounty NPCs from the director |
| Faction contracts / letters-of-marque | EVE, Freelancer | War contracts that move territory — closes the war→economy arrow | `factions.js`, `missions.js` | Contract board + territory board | Med | A faction offers a strike contract; success flips a contested hex |
| Diplomatic influence / blockade relief | SpaceFace built (blockade-relief) | Blockade-relief exists; give diplomacy a lever | `factions.js`, `economy.js` | Territory board + cause web | Med | Pay/fight to lift a blockade; prices normalize; standing shifts |

### 3.8 Station / planet interaction
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Docked service console | Freelancer services | Fixes the hub-shell feel; services as a physical berth strip | `services.js`, `stationHub.js` | Service Dock rail | Low | Refuel/repair/ammo as dock services with live readiness badges |
| Station reputation & docking rights | Freelancer, Elite | Standing gates access — consequence you can see | `factions.js`, `stationHub.js` | Console Keys + standing web | Low | Low rep → docking-deny (banner exists); high rep → discounts |
| Bar / contacts rumor network | SpaceFace built (`bar.js`) | Diegetic intel (SPEC3-40 ambition: bar NPC leads a stalled player) | `bar.js`, `story.js` | Contact web + Glyph | Low | Bar contacts as a small web; rumors resolve into map markers |
| Planet / body approach & claim | SpaceFace built (`claims`) | Claimables are thin (SPEC3-42 §1.4); approach makes them places | `claims.js` | Nav Globe + territory | Med | Approach a claimable body; coverage sphere shows what a claim controls |
| Station side-events / dock incidents | SpaceFace built (side-events) | Built system; surface as contextual color, not modal | `stationBroadcast.js`, `encounterDirector.js` | Contextual cards + ticker | Low | A dock incident surfaces as a one-voice card + a Service Dock badge |

### 3.9 Narrative / contracts
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Operations contract board | SpaceFace built (`missions`) | Fixes the generic mission list; multi-stage contracts as ops | `missions.js` | Contract board + Route Beam | Med | Contracts show objective route + stage Rings; track plots the route |
| Contract clauses / moral-trap reveals | SpaceFace built (contractClauses, moralTrap) | Built systems; the *reveal* is the drama | `contractClauses.js`, `moralTrap.js` | Glyph reveal + `sf-border-trace` | Low | A clause hidden in a contract resolves (glyph) when triggered |
| Story-beat objective spindle | SpaceFace story (Vale) | The story thread as a legible through-line, not a toast you missed | `story.js`, `onboarding.js` | Objective spindle / breadcrumb | Low | Current beat + next objective as a persistent spindle node |
| Branching evidence / investigation | SpaceFace built (47a, scenarioRuntime) | The 47a branch logic is built; decode is the play | `scenarioRuntime.js`, `salvage.js` | Glyph Matrix decode + cause web | Med | Recovered evidence resolves glyphs that gate a branch choice |
| Signal-archive / decoded codex | SpaceFace built (`codex`) | Lore as *earned fragments* (anti lore-dump) | `codex.js` | Glyph Matrix + file-tree | Low | Archive entries decode from fragments as you scan/board |

### 3.10 UI-driven gameplay
| Feature | Inspiration | Why it fits | Repo system | UI / effect | Risk | First slice |
|---|---|---|---|---|---|---|
| Overview as active target management | EVE | The list *is* the combat UX; one-key priority focus | `radar.js`, overview, `wingmen.js` | Overview + Glyph Matrix | Low | Threat sort + focus-fire key; wing obeys |
| Scanner pulse as a played verb | NMS | The pulse is aim + cadence, a skill not a button | `scanner.js` | Scanner Grid + Ping | Low | Pulse cost/cooldown Ring; well-timed pulses reveal more |
| Map route-plotting as strategy | Elite, X4 | Danger-weighted routing is a real decision | `galaxyMap.js`, `world.js`, `dangerModel.js` | Nav table + Route Beam | Med | Plot a multi-hop route weighing danger vs fuel vs profit |
| Power-flow as a real-time verb | Elite | Pip juggling under fire is skill expression | `ships.js`, `weapons.js` | Power-flow Route Beam | Med | Live pip shift changes derived stats within one tick |
| Wingman command radial (exists) | SpaceFace built (`wingmanRadial`, Z) | Built; formalize into the fleet grammar | `wingmanRadial.js`, `wingmen.js` | Fleet radial | Low | Extend the radial with formation + focus orders |
| HUD quiet-mode / instrument focus | SPEC3-36 ambition | Confidence as a feature; screenshot/flow mode | `hud.js`, `uiRoot.js` | fade (no effect) | Low | `H` hold fades all but the one-voice line to 10% |

*(56 features across 10 groups — ≥40 satisfied. Curate down per wave; do not build breadth-first.)*

---

## 4. Top 12 recommended features

Chosen because each **expands gameplay and de-genericizes a screen in the same stroke**, leans on a
built-but-mute system (SPEC3-42 §1), and sits at low/medium risk. Ordered by leverage.

| # | Feature (gameplay) | Screen it fixes | Centerpiece / effect | Built system surfaced | Risk |
|---|---|---|---|---|---|
| 1 | **Hardpoint schematic fitting** | Outfitting (most generic) | Ship hardpoint schematic | `ships` derived stats | Med |
| 2 | **Power-flow allocation** (fit budget + combat pips) | Outfitting → HUD | Power-flow Route Beam + Ring | `ships`/`weapons` | Med |
| 3 | **Fleet operations map** | Automation (generic) | Fleet ops map (Hex + Beam) | `automation` (0.45 funnel) | Med |
| 4 | **Operations contract board** | Missions (generic) | Contract board + Route Beam | `missions` receipts | Med |
| 5 | **Cargo-hold schematic** (new screen) | Hold/Inventory (absent) | Cargo schematic + Glyph manifest | `cargo`/`fragileCargo` | Low |
| 6 | **Trade intelligence scope** (lean-in) | Market (partial) | Price/forecast canvas + cause web | `economyCycles`/`causeLedger` | Low |
| 7 | **Territory / war board** | Factions (generic) | Hex Lattice territory map | `factions`/`sectorSim` war | Med |
| 8 | **Subsystem targeting** | Combat / target panel | Target schematic + Ring | `combat` | Med |
| 9 | **Vein map + ore assay** | Mining / drill | Vein schematic + assay Glyph | `drill`/`mining` | Med |
| 10 | **Signal triangulation + anomaly decode** | Exploration | Scanner Grid + Glyph Matrix | `scanner`/`scenarioRuntime` | Med |
| 11 | **Docked service console** | Station Hub (shell) | Service Dock rail | `services` | Low |
| 12 | **Tech/craft dependency spindle** | Tech/Crafting (generic) | Dependency Spindle + supply Beam | `crafting`/`claims` | Low |

**Sequencing suggestion (aligns with SPEC3-42 waves):** build the *effect primitives* in
`src/ui/effects/` first (Ship schematic, Route Beam, Ring Gauge, Hex Lattice, Glyph Matrix), then
land #6/#5/#11 (low-risk, high-legibility) as the pattern proof, then the medium-risk screen rebuilds
(#1–#4, #7) each paired with the built system it expresses.

---

## 5. Anti-generic screen checklist

Run this at design review and in the five-second test (spec2/00 §7). **A screen FAILS if any is
true:**

1. **It is only cards / tabs / tables.** No spatial or temporal centerpiece — just rows to scroll.
   (The spreadsheet trap, SPEC3-F10 §4.)
2. **It has no interactive centerpiece.** Nothing the player manipulates directly; it only displays.
3. **It has no state-driven effect.** Nothing on it changes in response to a game state a player can
   act on. (If it *does* animate with no state → it fails #6 instead.)
4. **It could be mistaken for a SaaS dashboard.** If a screenshot would look at home in a fintech app,
   it is not a command deck.
5. **It duplicates another screen's information** as its primary content. "Every system speaks once,
   through its surface" (SPEC3-42 §3) — a fact shown as the *main read* on two screens is a bug.
6. **It uses decorative animation not tied to a game state.** Any pulse/glow/morph/marching at rest,
   or an effect whose trigger is a timer/hover-for-flavor rather than a state change. (spec2/00 §3.)

**Additional teeth (a screen should also):**
- Pass the five-second test: a stranger names every element (spec2/00 §7, §2 pillar 2).
- Show **states, not numbers**, except for crime and fitting (SPEC3-42 §3). A HUD/overview number
  that could be an arc/color/position is unfinished feedback.
- Never open a **new modal for a fact a chip can say** (spec2/00 §6 forbidden list).
- Keep **one voice**: at most one new transient text surface at a time (route through the voice
  arbiter; see ONE_VOICE_CLOSEOUT.md).
- Use **only palette tokens** and stay dark (<18% bg luminance); reduced-motion degrades to a legible
  static state.

**Pass bar:** name the centerpiece in one noun phrase ("the fleet ops map", "the power-flow graph").
If you can't, there isn't one — the screen fails #2.

---

## 6. Dependency policy

Magic UI is a **React/Tailwind** component library. It is a **reference for behavior and look, not a
dependency.** SpaceFace's overlay is vanilla DOM/CSS/`<canvas>` over vendored Three.js with an
importmap and a zero-dependency dev server (AGENTS.md §2). Porting an effect means *reimplementing its
idea* in that stack.

**An effect may be locally ported / reimplemented ONLY if ALL hold:**
1. **No new framework or runtime dependency.** No React, Tailwind, Next, shadcn, or any second
   frontend framework. No npm add. (spec2/00 §6 forbidden list; new deps need lead sign-off.) A
   *reference* note in the file header is fine ("pattern after Magic UI 'animated beam'"); a code port
   that drags in a dependency is not.
2. **Isolated in `src/ui/effects/*`.** One module per effect, view-only (no `gameState` mutation, no
   sim import — UI reads state and emits intents). Screens import effect factories; effects never
   import screens. This mirrors `src/ui/uiPrimitives.js` (the `sf-*` layer) and
   `src/ui/shipPreviewMount.js` (isolated WebGL) — the proven seams.
3. **No idle rAF when hidden.** Any `requestAnimationFrame` loop stops when the effect is off-screen
   or its state is at rest (the galaxyMap/shipPreviewMount pattern: start on show, cancel on hide).
   The flight-HUD frame-sleep rule (`scripts/check-ui-frame-sleep.mjs`) is the precedent; effects on screens
   must self-park. **A running rAF behind a closed screen is a defect.**
4. **`motionReduce` respected.** Read `state.settings.video.motionReduce` /
   `html.sf-reduce-motion`; every effect degrades to a legible static state (see each §1 entry). The
   global blanket in `styles/accessibility.css` zeroes durations; effects must still *look right*
   static.
5. **No new hue.** Palette tokens only (`--accent`, `--warn`, `--danger`, `--accent-3`, `--accent-2`,
   `--ink*`, `--console-*`, sector accents). Use `color-mix(in srgb, var(--token) N%, transparent)`
   for tints (already the accessibility.css pattern). No raw hex.
6. **Checks pass:** `check:ui:perf` (incl. `scripts/check-ui-frame-sleep.mjs`), `check:ui-a11y`,
   `check:wcag-contrast`, `check:bundle` (if `package.json`/import graph changed), `check:launch-policy`
   (effects must not diverge browser vs desktop or gate reachability). Add a `check:ui-effects` lint
   later that walks an effect→trigger→maxMs table the way `vfxCues.js` lints the 3D layer.

**Effect module contract (proposed, for `src/ui/effects/`):**
```
createEffect(mountEl, opts) → {
  update(state),   // re-read game state; recolor/redraw (called on state change, not per-frame)
  setActive(bool), // start/stop any rAF; MUST cancel on false (no idle loop when hidden)
  dispose(),       // remove DOM/canvas, cancel rAF, drop listeners
}
```
This is the same shape `shipPreviewMount` and the screen factories already use — new agents get a
familiar seam, and the lint can assert every effect exposes `setActive`/`dispose`.

**Do NOT copy GPL game code.** Endless Sky, Naev, Oolite, Vega Strike (GPL) and Pioneer (GPL/MIT
mixed) are studied for *design patterns and data/system ideas only* — never source. Commercial
references (EVE, Elite, NMS, X4, Starsector, Space Engineers, KSP, Starflight) are pattern
inspiration, not assets.

---

## Appendix A — Research digest (patterns extracted, not code)

**Magic UI effects → the grammar (§1):** flickering grid→Scanner Grid; ripple→Ping Ripple; hexagon
pattern→Hex Sector Lattice; file tree→Dependency Spindle; interactive hover button→Console Key;
animated circular progress→Ring Gauge; glyph matrix→Anomaly Glyph Matrix; animated beam→Route Beam;
morphing text→Readout Morph; dock→Service Dock; globe→Nav Globe. Common thread SpaceFace keeps: these
are *behaviors bound to data*, and SpaceFace binds each to a game state and kills the at-rest motion.

**Open-source space games (GPL — patterns only):**
- **Endless Sky:** charted-map clarity, honest outfitting, mission-as-conversation, "the map is the
  game's spine." → Galaxy Map, Missions, Outfitting legibility.
- **Naev:** the overlay map + electronic-warfare/scan layers, faction standing consequences, outfit
  slots by size. → Scanner, Factions, Outfitting.
- **Pioneer:** newtonian nav + orbital plotting, the system view as a 3D instrument, commodity
  economy across a big galaxy. → Nav Globe, trade routes.
- **Oolite:** the readable radar/ID grammar, equipment-as-verbs, station docking flow. → radar
  honesty (already spec2/06), Service Dock.
- **Vega Strike:** ship systems/power management, factional universe, cargo economy. → Power-flow,
  Factions.

**Commercial references (inspiration, no assets):**
- **EVE Online:** the overview list as knowledge, fitting as constraint, market data as an
  intelligence layer, sovereignty map. → Overview, Outfitting schematic, Market scope, Territory
  board. (Refuse its pace + spreadsheet-first depth — SPEC3-42 §4.)
- **Elite Dangerous:** power-pip management, FSS/scanning as a verb, market/route honesty, contraband
  scans. → Power-flow, Signal triangulation, Trade scope, Customs.
- **No Man's Sky:** scanner-pulse cadence, mining-beam heat rhythm, POI breadcrumbs. → Scanner Grid,
  Ping, mining rhythm (spec2/00 explicitly steals this).
- **X4: Foundations:** empire/automation flow graphs, supply chains, fleet orders. → Fleet ops map,
  supply-chain spindle. (Refuse its tab-maze — instrument the flow instead.)
- **Starsector:** flown fleet combat, deployment as economy, faction war. → Siege/wave defense,
  fleet tactics.
- **Space Engineers:** block/hardpoint spatial fitting, power grids. → Hardpoint schematic,
  power-flow.
- **Kerbal Space Program:** the part-tree + staging read, dependency clarity. → Dependency Spindle,
  fitting.
- **Starflight:** the terse crew-station command deck, exploration + trade + narrative in one shell.
  → the whole "command deck" framing of this bible.

---

## Appendix B — Non-goals for this pass (acceptance guard)

- No gameplay implementation, no screen rewrites this pass (documentation + optional
  `src/ui/effects/README.md` stub only).
- No new dependency, no new hue, no visor motif, no `backdrop-filter`, no rest-state animation
  introduced anywhere.
- This doc is a *plan*; each feature still owes its own spec-named check + five-second-test screenshot
  pair when it is actually built (SPEC3-42 §7 review protocol).
