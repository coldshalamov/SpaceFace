<!-- LIFETIME: DURABLE -->
# SCREENS B — THE SHIP · THE RANGE


> **2026-08-30 IDENTITY NOTE:** the visual identity mandates in this document that predate the
> 2026-08 revision (neon cyan/teal/mint/purple accents, Saira SemiCondensed, tracked-out micro
> labels, coloured left rails, glass/glow treatments) are **superseded** by
> [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md) §3/§4 (2026-08 revision): neutral charcoal,
> one blue accent #4f8fdd, desaturated semantics, Plex Sans/Mono, no rails/glass/glow/tracking.
> Read this document for its structural and interaction design; take every colour, type, and
> surface treatment from the grammar.

**Parent authority:** `design/frontend/INSTRUMENT_GRAMMAR.md` (binding — type, colour roles, motion
contract, CREST/STAGE/APRON/DRAWER skeleton, disclosure tiers, naming rules, technique catalogue).
This document does not restate it. Where this document gives a number, that number is the decision;
where it does not, the grammar's default applies.

**Product authority:** `design/VISION.md` — *"Progression means increasing physical agency."* Every
value on these two screens answers **"what can I do now?"**. No screen in this document is permitted
to lead with a delta on a damage number.

**Scope:** two screens.

| Screen | id | Archetype | Verb | Centerpiece |
|---|---|---|---|---|
| **THE SHIP** | `ship` | a stage you orbit | **ORBIT** | your actual hull, lit, wearing your scars |
| **THE RANGE** | `range` | a box you play in | **FLY** | a live teaching physics sandbox |

**Reading order for an implementer:** §0 (shared bindings — read once, applies to both), then §1 or
§2, then §3 (build order). §0.9 lists everything this spec deliberately does **not** build.

---

# 0 · Shared bindings

## 0.1 Colour roles → hex (BINDING)

The grammar assigns colour by role and defers hex to "the token block." That token block does not
exist in `styles/` today (`--sf-you` / `--sf-foe` / `--sf-goal` / `--sf-calm` / `--sf-paper` return
zero matches). The mapping below is therefore **promoted into `INSTRUMENT_GRAMMAR.md` §4 and now binding on ALL surfaces** (this local scoping is void)
until a shared token block lands; when it lands, these two screens adopt it by find/replace and this
sub-section is deleted.

| Role | Hex | Existing token it equals | Contrast on `#0b1220` | Used for |
|---|---|---|---|---|
| `--sf-you` | `#7af7d0` | `--accent-2` | 14.3 : 1 | your hull, your unlocked capability, your route, a gain |
| `--sf-foe` | `#ff5470` | `--danger` | 6.0 : 1 | threat, cost, over-budget, damage, a loss |
| `--sf-goal` | `#ffb347` | `--warn` | 10.5 : 1 | the next unlock, the objective gate, opportunity |
| `--sf-calm` | `#84a0c8` | `--ink-dim` | 6.9 : 1 | labels, chrome, inactive state, structure |
| `--sf-paper` | `#d3e6ff` | `--ink` | ~14 : 1 | all body copy |
| *(surface)* | `#0b1220` | `--panel` | — | screen backdrop base |
| *(edge)* | `#1d3350` | `--panel-edge` | — | 1 px separators, socket rings |

**`--accent` (`#39d0ff`, cyan) is assigned NO role on these two screens and may not be used.** It is
the colour behind the flight HUD's 99 saturated-cyan usages and the "flat blue wash"; giving it a
role here would re-import the failure. A cyan pixel on THE SHIP or THE RANGE is a review failure.

**80 % rule (grammar §4).** At rest, ≥ 80 % of painted area on both screens is `--sf-calm` +
`--sf-paper` on the surface. `you` / `foe` / `goal` are spent on: the active handling bar fills, the
earned/next capability chips, the scar callouts, the power beams, and the Range verdict. Nothing
else.

**Second channel is mandatory.** Every colour-coded state also carries shape or a word:
`you` chips carry a filled dot; `goal` chips carry a hollow dot **and** the word `NEXT`; `foe`
carries a slash bar **and** the word (`OVER BUDGET`, `HURT`, `MISS`).

## 0.2 Type scale (BINDING, concrete px)

| Role | Face / weight | THE SHIP | THE RANGE | Notes |
|---|---|---|---|---|
| DISPLAY | Saira SemiCondensed 700 | **40 px** hull name (CREST) | **40 px** rule sentence (CREST) | exactly one per screen |
| SUBHEAD-L | Saira SemiCondensed 600 | 22 px handling verb sentence | 22 px verdict verb | one per screen |
| SUBHEAD | Saira SemiCondensed 600 | 19 px band titles, capability chip verbs | 19 px band titles, toy names | |
| MICRO | Saira SemiCondensed 600, uppercase, `.18em` | **12 px** band names only | **12 px** band names only | the single tracked style; 12 px floor |
| BODY | IBM Plex Sans 400 / 500 | 14 px prose, 13 px callout sub-line | 14 px / 13 px | |
| DATA | IBM Plex Mono 500, `tabular-nums` | 20 px hero numerals, 15 px bar values, 13 px raw record | same | **numerals only** |

Nothing below 12 px. Letter-spacing above `.06em` only on MICRO.

**Verb outranks number, everywhere on both screens.** A capability reads
`Scoop cargo without stopping` (SUBHEAD 19) over `magnet 180 wu` (DATA 13). Never the reverse.

## 0.3 Class-name map (BINDING)

New markup uses the approved `sf-*` vocabulary. `sx-*` is the station-workbench namespace; it stays
only where §1.2's promotion explicitly preserves it.

| Zone / part | Class | Why not the obvious name |
|---|---|---|
| screen root | `sf-ship` / `sf-range` | — |
| crest | `sf-crest` | — |
| stage | `sf-stage` | — |
| apron | `sf-apron` | — |
| drawer | `sf-drawer`, deck inside it `sf-drawer__deck` | **not** `…__panel` — `forced-colors` strips `background-image`/`box-shadow` from `[class*="panel"]` |
| a band inside the apron | `sf-deck` | — |
| one capability / stat cell | `sf-tile` | **not** `…-card` — same `forced-colors` strip |
| the hull-pinned callout | `sf-anchor` | — |
| the scar callout | `sf-scar` | — |
| the gauge housing | `sf-housing` | — |
| lesson list in the Range drawer | `sf-rail` | — |
| state suffixes | `--latch` `--spool` `--settle` `--live` `--spent` `--locked` | — |

**Banned substrings anywhere in these screens' class names:** `pulse`, `blink`, `flash` (blanket
`animation:none; opacity:1` under `sf-reduce-flash`), and `panel`, `card`, `menu`, `modal` on any
element whose meaning lives in a gradient, shadow, or background image.

**Positioning rule (verified hazard).** `styles/ui.css:177` sets `button:active { translate: 0 1px; }`
using the **independent `translate` property**. Any hull-pinned button that centres itself with
`translate: -50% -50%` will be **replaced** on press and jump to its raw anchor point. Centre
callouts with `transform: translate(-50%, -50%)` only — that composes with the press nudge instead
of being clobbered. (`.sx-hardpoint` in `styles/station-workbench.css:317` already does this
correctly; do not regress it.)

## 0.4 Registration — three places, all mandatory

| # | File | Edit |
|---|---|---|
| 1 | `src/ui/uiRoot.js` — `SCREEN_MODULES` (line ~54) | add `{ path:'./ship/shipScreen.js', load:()=>import('./ship/shipScreen.js'), name:'shipScreen' }` and the same for `./range/rangeScreen.js` |
| 2 | `src/ui/screenManager.js` — `PAUSING_SCREENS` (line 16, a literal `Set`) | add `'ship'`, `'range'` |
| 3 | `src/ui/input.js` — the keydown `switch` | add `case 'F2':` → `screenManager.pushScreen('ship')`; `case 'F4':` → `pushScreen('range')`. Both `ev.preventDefault()` then `bus.emit('audio:cue', { id: 'ui_open' })`. F1 (help) and F7 (debug) are already literal-string cases; F2/F4 follow that precedent and are unbound today. **`F3` is THE FOOTPRINT — see the canonical key table in `INSTRUMENT_GRAMMAR.md` §10.5, which outranks this file.** |

**Do not touch the dock rail.** `scripts/check-station-tab-navigation-runtime.mjs` pins seven
destinations — `['market','shipworks','industry','contracts','factions','bar','ledger']` — on
`[data-screen="station"] .sx-dock [data-nav]`, with exactly one `aria-selected="true"` and roving
tabindex. `data-nav="shipworks"` **stays and keeps its label**. Promotion adds a second host for the
same module; it removes nothing.

**Do not rename** `syncHudAccessibility`, `_isRestorableOpener`, `_restoreFocus`, `_ensureFocusIn`,
or the `hud.inert` line in `screenManager.js` — `check-ui-a11y` asserts them as literal substrings.

## 0.5 One WebGL context, two hosts (BINDING)

`createShipPreviewMount` constructs its **own `THREE.WebGLRenderer`**. Browsers cap live contexts
(~8–16); a second mount created because the player opened THE SHIP from flight after having opened
it from the dock is a leak that will surface as a black bay, not as an error.

- **One module instance, one mount.** `src/ui/ship/shipScreen.js` owns exactly one
  `createShipPreviewMount`. The dock's `shipworks` destination and the `ship` screen both render
  **the same instance**, re-parented, never re-created.
- **Teardown contract.** The grammar is explicit: `onHide()` is the only teardown and receives **no
  arguments**; there is no `dispose` hook on the screen def. Therefore:
  - `onHide()` → `mount.setActive(false)`, clear every timer, `cancelAnimationFrame` every id, and
    `setActive(false)` on all effect instances. It must **not** dispose.
  - `dispose()` (called by the station adapter / module teardown only) → `mount.dispose()`.
  - Reopening after `onHide()` calls `mount.setActive(true)` and reuses the cached mesh.
- **No idle rAF.** `shipPreviewMount` renders on demand (`rotating:false`). Keep it. Projection
  refresh is `requestAnimationFrame`-scheduled per interaction and self-cancels — carry
  `scheduleSpatialProjection()` forward verbatim.

## 0.6 The anchor convention (BINDING — corrects a common misreading)

`projectLocalPoint(localPos)` expects **ship-mesh-local units**. Both authored anchor sources in this
repo are stored **normalised** and must be multiplied by the hull's radius first.

```
radius = Math.max(5, Number(shipDef.collisionRadius) || 12)
local  = { x: pos[0] * radius, y: pos[1] * radius, z: pos[2] * radius }
```

This is exactly what `shipworks.localSlotAnchor` already does. It is **also** required for the
Living-Hull transforms: `livingHullPresentation.sync()` applies `root.scale.setScalar(entity.radius)`
to the whole presentation group, which is what turns `PATCH_TRANSFORMS[0].position = [-0.30, 0.335, 0.23]`
into ship-space. Feeding those raw arrays to `projectLocalPoint` collapses all four patch labels
within a few pixels of the hull origin.

**Honesty flag.** `PATCH_TRANSFORMS` / `SCORCH_TRANSFORMS` / the graffiti plane were authored
against one hull's proportions (topside `y ≈ 0.33`, flanks `z = ±0.515`). On a Colossus or an Atlas
they float off the surface. Mirror the convention `shipworks` already uses for slots
(`PHYSICAL` vs `SYSTEM`) and label scar anchors:

| Anchor kind | Condition | `data-anchor-kind` | Sub-line reads |
|---|---|---|---|
| `AUTHORED` | `shipDef.id === 'ship_kestrel'` (the hull the transforms were authored against) | `authored` | `AUTHORED` |
| `APPROX` | any other hull | `approx` | `APPROX` |

`APPROX` callouts render with a dashed reticle ring (same treatment `SYSTEM` slots already get at
`styles/station-workbench.css:345`). Do not silently pretend.

## 0.7 Living-hull decals are DOM, not 3D (BINDING)

`livingHullPresentation` attaches to the **flight** player mesh inside the main renderer.
`shipPreviewMount` is a separate WebGL context that builds its own mesh through `visualFactory`.
**Nothing attaches the presentation to the preview, and this spec does not add that.**

THE SHIP shows scars as **DOM callouts pinned with `projectLocalPoint`** (grammar §9 technique 2).
An implementer looking for 3D decals in the bay will not find them and must not build them.

## 0.8 State the screens read (canonical paths)

| What | Path | Notes |
|---|---|---|
| owned hulls | `state.player.ownedShips[i]` → `.defId`, `.fittings[]`, `.appearance`, `.livingHull` | array; `livingHull` is per-owned-ship |
| active hull index | `state.player.activeShipIndex` | |
| wallet | `state.player.credits`, `state.player.researchPoints` | |
| research | `state.player.researchedNodes[]` | `Set`-ify at read |
| **live condition** | `state.entities.get(state.playerId)` → `.hull`, `.hullMax`, `.shield`, `.shieldMax`, `.cap`, `.capMax`, `.armorHp`, `.armorMax` | **the only source of current damage**; `getDerivedStats` returns *maxima*, always full |
| derived block | `getDerivedStats(defId, fittings, state.player)` from `src/systems/ships.js` | ~35 fields; see §1.4 |
| handling vs roster | `handlingProfileForShip(shipId, { fittings, player })` from `src/ui/panels/handlingProfile.js` | `.axes[] {id,label,raw,bar 0-100,higherMeans}`, `.flightClass`, `.driveLabel`, `.driveFamily` |
| fit preview | `buildMassDelta(shipId, { beforeFittings, candidateModuleId, slotIndex, player })` from `src/ui/panels/massDelta.js` | `.metrics[] {label, verb, delta, pct, unit}`, `.summary` |
| fit risk | `moduleRiskStrip(moduleIds, { shipId, fittings, player })` from `src/ui/panels/moduleRisk.js` | `.risks[] {id, glyph, label, tone, basis}` |
| tech readiness | `describeTechNodeReadiness(node, state, TECH_NODES)` from `src/ui/screens/techTree.js` | `.state` ∈ `researched \| locked \| funding \| available \| missing`, `.missingPrereqs[]`, `.missingCost[]` |
| tech data | `TECH_NODES` from `src/data/tech.js` — 29 nodes, `{id,name,branch,prereqs[],cost{credits,rp},unlocks{ships[],modules[]}}` | |
| service access | `shipworksActionAvailability(state)` from `src/ui/station/screens/shipworks.js` | `{hullEnabled, outfitEnabled, hullLabel, outfitLabel}` |
| enemies | `ENEMY_TYPES` from `src/data/enemies.js` — 15 rows | |
| weak points | `WEAK_POINTS_BY_CLASS`, `weakPointForEntity`, `isHitInWeakArc` from `src/data/weakPoints.js` — 7 classes | |
| encounters | `ENCOUNTERS`, `ENCOUNTER_BARKS`, `NAMED_CAPTAINS` from `src/data/encounters.js` | |

## 0.9 SIM ASKS — explicitly NOT implemented by this spec

These are cross-lane requests. **Do not build them while implementing these screens; do not block on
them either.** Each screen degrades correctly without them (stated per item).

| # | Ask | Owner | Degrade-without behaviour |
|---|---|---|---|
| SA-1 | A second `researchPoints` writer, so THE RANGE can reward play. Today the only writer is mission completion (`src/balance/careerCohorts.js`). | economy / progression lane | THE RANGE awards **nothing**. Its APRON verbs stay non-economic (RETRY / NEXT RULE / SWAP HULL / RETURN). No placeholder currency, no fake counter. |
| SA-2 | A `livingHullWithGraffiti` writer reachable by the player (a station verb that sets `graffitiLine`/`graffitiAuthor`). Reducer exists; nothing calls it from a live surface. | station / services lane | THE SHIP renders the graffiti callout only when `graffitiLine` is non-null. Otherwise the socket simply does not exist — no "add graffiti" affordance, no empty prompt. |
| SA-3 | Attaching `livingHullPresentation` to the preview mount so scars appear as 3D decals. | render lane | §0.7 — DOM callouts only. This is the shipped design, not a stopgap. |
| SA-4 | A per-hull authored scar-transform table so `PATCH_TRANSFORMS` stop being Kestrel-specific. | asset lane | §0.6 — non-Kestrel hulls label their scars `APPROX` with a dashed reticle. |
| SA-5 | Costs / RP economy rebalance. | **ruled out by the owner — presentation only.** | This spec proposes *presentation that makes the existing curve visible* (§1.8 CAPABILITY band) and changes no number. |

---

# 1 · THE SHIP

## 1.1 Concept, archetype, verb, silhouette

**Concept.** One lit hull, standing in a bay, that you turn with your hand. Everything the screen
knows is written **on** or **around** that object — never in a table beside it. It answers four
questions in this order: *what is my ship* (CREST) → *how hurt is it, and where* (STAGE, on the
hull) → *why does it fly like this* (APRON, handling) → *what can I do now* (APRON, capability).

**Archetype:** a stage you orbit. **Primary manipulation: ORBIT** — pointer drag / two-finger
horizontal to rotate, wheel or pinch to close in, `←`/`→` to step yaw, `+`/`-` to zoom, `Home` to
recentre. All of this already exists in `shipworks.js` and is carried forward verbatim.

**Silhouette with the text removed.** A full-bleed dark bay. One large lit solid mass, off-centre-up.
A loose **constellation of small ringed dots on and around that mass**, each with a short leader line
to a flat caption bar. A thin vertical **rack of six circles** down the right edge of the stage. Under
the stage, a **horizontal ladder of four filled bars** and, below that, a **single row of small
lozenges** — some solid, one hollow. Nothing is boxed; nothing floats on a card.

Nothing else in the game has a lit solid with tethered dots. THE CHART is a flat slab of points; THE
RANGE is a wireframe box with a moving glyph; MARKET is a beam. Distinguishable at a glance.

## 1.2 Hosts, routes, and what "promotion" means

**One implementation. Two entry points. No second ship screen.**

`src/ui/station/screens/shipworks.js` is promoted to `src/ui/ship/shipScreen.js`. The module exports
one factory that takes a `mode`:

```
createShipScreen(ctx, { host: 'dock' | 'flight' })
```

| | `host:'dock'` (docked, from the rail) | `host:'flight'` (F2, pausing) |
|---|---|---|
| Commerce panes | shown | **hidden** — the Buy Ship segment, the price/buy bar, and the module `Buy · N cr` buttons |
| Fit / unfit verbs | enabled per `shipworksActionAvailability(state)` | disabled with the reason string; the chooser opens **read-only** so you can still study a module's effect |
| MAKE ACTIVE | enabled per `availability.hullEnabled` | hidden |
| Fleet rail (other owned hulls) | shown | shown, **inspect-only** |
| Backdrop | `dockInteriorIdForArchetype(...)` — the station bay | `setDockId(null)` — transparent, over the screen's own backdrop |
| APRON verb count | 4+ | **≥ 2** (§1.5) |

Everything else — the mount, the projection, the callouts, the bands, the drawer — is identical.
Two hosts must never render two different screens.

**Route wiring**

- Flight: `F2` (§0.4). Pushes `ship`; `PAUSING_SCREENS` pauses the sim.
- Dock: `data-nav="shipworks"` continues to select the same module inside the station shell. The
  rail is untouched.
- The pause screen's existing list gains one entry pointing at `ship`.

## 1.3 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ sf-crest                                                       12 %  │
│  KESTREL                          HURT · 62 %      [ CONDITION ]     │
│  Turns fast, stops badly. Loaded, it stops 40 m later.               │
├──────────────────────────────────────────────────────────────────────┤
│ sf-stage                                                       58 %  │
│                                            ┌──┐                      │
│      ○─── PLASMA REPEATER                  │  │ MASS               │
│              PHYSICAL / M                  │  │ ENERGY             │
│                ▓▓▓▓▓▓▓▓                    │  │ SHIELD             │
│         ◌─── 4 KILLS                       │  │ CARGO              │
│              AUTHORED                      │  │ THRUST             │
│      ○─── SHIELD                           └──┘ HEAT               │
│              SYSTEM / M                     sf-housing (6 gauges)   │
├──────────────────────────────────────────────────────────────────────┤
│ sf-apron                                                       30 %  │
│  HANDLING ─────────────────────────────────────────────────────────  │
│  Agility ▓▓▓▓▓▓░░░░  Inertia ▓▓▓░░░░░░░  Top speed ▓▓▓▓▓▓▓░░░       │
│  Brake ▓▓▓▓░░░░░░   ·  INTERCEPTOR  ·  Coilburn II                  │
│  WHAT YOU CAN DO NOW ──────────────────────────────────────────────  │
│  ●Swing off anything  ●Scoop cargo in flight  ●Jump 2 gates         │
│  ○NEXT · Tow a disabled hull                                        │
│  [ TAKE IT TO THE RANGE ]  [ FIT ]  [ MAKE ACTIVE ]  [ RECORD ]     │
└──────────────────────────────────────────────────────────────────────┘
                                                 sf-drawer ◀── right edge
```

Proportions: **CREST 12 % / STAGE 58 % / APRON 30 %** of screen height. Full-bleed; no centred card.
Its own opaque backdrop: a dark bay gradient (`#070c16` → `#0b1220`, top-left key) with a single
1 px horizon rule at 62 % stage height. That backdrop is what stops the Ship bay and the Footprint
board reading as the same room.

**Below 1280 × 720:** the gauge rack collapses from a 1 × 6 column to a 2 × 3 block anchored bottom-
right of the STAGE, and the HANDLING band's four bars wrap 2 × 2. Nothing is removed. Verified at
1440 × 900 and 1280 × 720 (grammar §12.8).

### CREST contents (exact)

| Slot | Content | Type | Source |
|---|---|---|---|
| Line 1, left | Hull name — **the one DISPLAY element** | DISPLAY 40 | `SHIPS.find(id === owned.defId).name` |
| Line 1, right | Condition chip: verb + `%` | SUBHEAD 19 + DATA 20 | §1.6 CONDITION |
| Line 2 | Handling verb sentence | SUBHEAD-L 22 | §1.10 bank H |

The CREST **holds no controls** (grammar §6). The condition chip is a tier-2 `[data-why]` target, not
a button; tier 3 is reached from the APRON's `RECORD` verb.

### STAGE contents (exact)

| Layer | Element | Implementation |
|---|---|---|
| 0 | hull mesh | `createShipPreviewMount(canvas, { allowFastFallback:false, authoredShips:true, authoredWarmup:true, dockId })`, `rotating:false` |
| 1 | reactor node | a single `sf-anchor--reactor` dot at stage `(0.5 w, 0.62 h)` — the coordinate `shipEngineeringStage.reactorPoint()` already uses |
| 2 | power beams | `createRouteBeam(overlay)`; one polyline reactor → each **powered** slot |
| 3 | slot callouts | `localSlotAnchor()` × `projectLocalPoint()` — carried from `shipworks.js` unchanged, including `PHYSICAL`/`SYSTEM` honesty and the fan-out label constellation |
| 4 | scar callouts | §1.6 SCARS — new, same projection, `AUTHORED`/`APPROX` per §0.6 |
| 5 | selection ping | `createRippleField(overlay)` — one ping on slot select |
| 6 | gauge rack | six `createCircularGauge(mount, { size:48, stroke:4, kind })` — the exact `GAUGE_DEFS` table from `shipEngineeringStage.js` (`mass, capMax, shieldMax, cargoCap, maxSpeed, continuousDrain`) with its authored normalisation divisors (250 t / 600 / 800 / 400 u / 350 / regen×1.5) |

Layers 0–2, 5 and 6 **are `src/ui/shipEngineeringStage.js`**, which is built and currently
unreachable. Adopt it as the stage's effect layer rather than re-deriving beams and gauges;
`setShip / setPowerFlow / setHighlightSlot / setGauges / setLabel / setActive / resize / dispose` is
the surface. Its internal `slotLocalAnchor` is **superseded** by shipworks' `localSlotAnchor` (which
handles `visuals.drill`, `visuals.sensor`, multi-engine averaging, and the `authored` flag); pass the
richer anchors in rather than accepting the polar-ring fallback.

### APRON contents (exact)

Three stacked decks, `12 / 10 / 8` of the apron's 30 rows.

| Deck | MICRO label | Contents |
|---|---|---|
| `sf-deck--handling` | `HANDLING` | four bars (§1.6 HANDLING) + `flightClass` + `driveLabel` |
| `sf-deck--capability` | `WHAT YOU CAN DO NOW` | capability chips (§1.6 CAPABILITY) — the absorbed tech tree |
| `sf-deck--verbs` | *(none — verbs need no label)* | the verb row (§1.5) |

### DRAWER

**One drawer, right edge, three panes, never two at once, never modal-over-modal.** `sf-drawer` is
`role="dialog"` with `aria-modal="false"` and a focus trap that releases on `Escape`. Width
`min(520px, 42vw)`. It slides 180 ms; under reduced motion it appears.

| Pane | Opened by | Holds |
|---|---|---|
| `fit` | clicking a slot callout | the compatible-module list — the current `openChooser` list markup, moved out of its floating `role="dialog" aria-modal="true"` box into the drawer. **`.sx-chooser__panel` must be renamed** (`[class*="panel"]` is stripped under `forced-colors`) → `sf-drawer__deck`. `@floating-ui/dom` positioning is deleted with it. |
| `record` | APRON `RECORD` verb, or clicking the CREST condition chip | §1.8 tier 3 — the living-hull ledger + the full derived block |
| `tech` | clicking any capability chip | the 29-node DAG — `techTree.js`'s canvas, embedded, read-only, with the clicked capability's node pre-selected |

## 1.4 What information is shown — exhaustive

### A · Identity & condition (CREST + gauges)

| Shown | Field | Presentation |
|---|---|---|
| hull name | `shipDef.name` | DISPLAY 40 |
| role / tier | `shipDef.role`, `shipDef.tier` | BODY 14, calm |
| condition verb + % | `entity.hull / entity.hullMax` | §1.6 CONDITION |
| shield state | `entity.shield / entity.shieldMax` | gauge 3 arc + condition tier-2 |
| armour state | `entity.armorHp / entity.armorMax` | condition tier-2 only (armour is 0 on most hulls; a zero-max armour row renders **nothing**, never `0/0`) |
| energy state | `entity.cap / entity.capMax` | gauge 2 arc |
| grime | `livingHullGrimeAt(owned.livingHull, state.simTime)` | §1.6 SCARS |

**`getDerivedStats` returns maxima and always starts full** (`hull: hullMax`, `shield: shieldMax`,
`cap: capMax`). Reading condition from it produces a permanently undamaged ship. Condition comes
from `state.entities.get(state.playerId)` and **only** from there. When no player entity exists (at
the dock, before flight, viewing a non-active hull), the CREST condition chip renders the word
`STOWED` in calm and no percentage — never a fabricated 100 %.

### B · The derived block (the stat gap this screen closes)

`getDerivedStats` returns ~35 fields; the current Shipworks readout shows six. Every field below is
now shown, in the stated place. **No field is shown as a bare number in a list.**

| Field | Where it appears | As |
|---|---|---|
| `hullMax`, `shieldMax`, `shieldRegenRate`, `shieldRegenDelay` | gauge 3 + condition tier-2 | arc + `[data-why]` |
| `capMax`, `capRegen` | gauge 2 + power beams | arc + beam velocity |
| `continuousDrain` | gauge 6 (`Heat`) + **beam reversal** | §1.6 POWER |
| `cargoCap` | gauge 4 + capability chip `Carry N u` | arc + chip |
| `maxSpeed` | gauge 5 + handling bar 3 | arc + bar |
| `mass`, `dryMass`, `cargoMass`, `operationalMass`, `operationalFeelMass` | gauge 1 + handling tier-2 | arc + `[data-why]` sentence |
| `flightModel.inertia` | **stage arrival overshoot amplitude** (§1.7) + handling bar 2 | motion + bar |
| `flightModel.angularAccel` | handling bar 1 (Agility) | bar |
| `flightModel.angularBrake` | handling bar 4 (Brake) + **overshoot settle time** | bar + motion |
| `flightModel.maxYawRate`, `mainAccel`, `reverseAccel`, `strafeAccel`, `linearDrag`, `lateralDrag`, `assistStrength`, `bankMax` | drawer `record` pane, raw | DATA 13 |
| `flightClass` | HANDLING deck, next to the bars | SUBHEAD 19 |
| `bankFactor` | handling verb sentence (`rollier`/`flatter`) | word |
| `turnRate`, `thrust`, `drag` | handling tier-2 `[data-why]` + drawer | sentence + DATA |
| `propulsion` (`driveLabel`, `driveFamily`, `travelCeiling`) | HANDLING deck, drive name | SUBHEAD 19 + tier-2 |
| `masslineHeadId` | capability chip (§1.10 bank C) | chip |
| `tetherSpoolMult`, `tetherReelRateMult` | capability chips | chip |
| `magnetRange` | capability chip + **ripple radius** on the hull (§1.7) | chip + motion |
| `radarRange`, `radarRangeMult` | capability chip + ripple radius | chip + motion |
| `jumpDriveTier` (`'jump_tN'`) | capability chip | chip |
| `droneBayCount` | capability chip | chip |
| `hullRepairOOC` | capability chip | chip |
| `hiddenCargoPct`, `scannerCloak` | capability chips (tone `foe`-adjacent: these are illegal-adjacent) | chip + `moduleRisk` glyph |
| `ramDamageDealtMult` | capability chip | chip |
| `weaponRangeMult`, `weaponDmgMult` | capability chips | chip |
| `damageReductionMult` | capability chip | chip |
| `boost.max / drainRate / regenRate / dashImpulse / dashCooldown` | capability chip `Dash` + drawer raw | chip + DATA |
| `radius` | not shown (it is a physics constant, not a player fact) | — |
| `roleIdentity` (`roleLabel`, `shortWhy`, `counterRoles`, `upgradeAdjacency`) | CREST tier-2 `[data-why]` on the hull name | sentence |

### C · The mass → handling chain (fully modelled, never previously shown)

The whole chain is exposed as **one sentence plus one bar pair**, never as five constants:

```
speedMass = 2 / (1 + massRatio)          turnMass = 1.4 / (0.4 + massRatio)
bankFactor = shipDef.bankFactor / √massRatio
massRatio  = (dryMass + cargoMass) × opMassBias / shipDef.mass
```

Presentation: the HANDLING deck's tier-2 on Inertia reads from bank M (§1.10), e.g.
*"14 t of cargo. That is why you turn 18 % slower than empty."* The percentage is computed live as
`turnMass(loaded)/turnMass(empty) − 1`. When `cargoMass === 0` the sentence is the empty variant —
never a `0 %` row.

### D · Living hull (never shown in any menu before)

| Field | Cap | Shown as |
|---|---|---|
| `killTally` | 13 | one scar callout: `N KILLS` |
| `repairPatches` | 4 | up to 4 callouts: `WELD` |
| `heatScorch` | 3 | up to 3 callouts: `SCORCH` |
| grime (derived from `lastWashAtT`) | 0.72 | one callout `GRIMY · N CYCLES` when > 0.01 |
| `washCount` | — | drawer `record` only |
| `graffitiLine` + `graffitiAuthor` | 96 / 40 chars | one callout carrying the line verbatim, sub-line `— {author}`. Rendered only when non-null (SA-2). |

### E · Fit context

`shipworksActionAvailability(state)` → `{hullEnabled, outfitEnabled, hullLabel, outfitLabel}` gates
the verbs; the **labels are printed on the disabled verb**, never swallowed.
`findMasslineHeadConflict(fittings, slotIndex, def)` → the drawer row reads
`Unfit {name} first`. `moduleRiskStrip(...)` glyphs ride each fitted callout.

## 1.5 Actions — the APRON always holds ≥ 1 verb

| Verb | Label | Enabled when | Emits | Host |
|---|---|---|---|---|
| V1 | `TAKE IT TO THE RANGE` | **always** | `screenManager.pushScreen('range')` with `{ shipId, fittings }` handed through `state.ui.rangeSubject` | both |
| V2 | `RECORD` | always | opens `sf-drawer` pane `record` | both |
| V3 | `FIT` | `availability.outfitEnabled` **and** a slot is selected; otherwise prints `availability.outfitLabel` | opens `sf-drawer` pane `fit` | dock enabled / flight read-only |
| V4 | `MAKE ACTIVE` | `availability.hullEnabled` **and** viewing a non-active owned hull | `ui:setActiveShip {index}` | dock only |
| V5 | `BUY` | `mode === 'buy'` and affordable | `ui:buyShip {defId}` | dock only |

**V1 is the load-bearing one.** It is what guarantees the in-flight APRON is never verb-empty when
commerce is hidden, and it is the single strongest expression of *"progression means increasing
physical agency"*: the answer to *what can this new fit do?* is **go fly it**, not read a delta.

Additional non-APRON actions on the STAGE: orbit (drag / two-finger / arrows), zoom (wheel / pinch /
`+` `-`), recentre (`Home`), select a slot callout (click / gamepad via `spatialFocusTarget`, no
registration needed), hover a module row → ghost preview (§1.7).

## 1.6 What is shown symbolically rather than as text or numbers

| # | Encoding | Symbol | Reads intuitively because |
|---|---|---|---|
| S1 | **CONDITION** | the hull's own callout dots go from filled to hollow-with-a-slash as `hull/hullMax` falls; the CREST chip carries the verb | damage is *on the ship*, in the place it happened, not in a bar named "HP" |
| S2 | **SCARS** | kill tallies, welds, scorch, grime and graffiti pinned to their real positions on the hull | the record of what you did is written on the object, which is the entire *"this is my fucking ship"* claim |
| S3 | **POWER** | `routeBeam` marching reactor → each drawing slot. Dash **velocity** ∝ `capRegen − continuousDrain`. When that goes negative the dash **reverses direction** | you *see* power flowing out of the reactor faster than it comes back before you read a word |
| S4 | **HANDLING** | four bars normalised against the **whole 13-hull roster** (`handlingProfileDomain()`), so a full bar means "the best in the game", not "100 units" | a bar without a comparison set is a number in disguise; this one is an actual ranking |
| S5 | **CAPABILITY** | lozenge chips: filled dot = earned, hollow dot + `NEXT` = the nearest unlock; the row is **ordered by depth** so the shape of the row *is* the curve | an empty socket filling is the most legible expression of progression there is (grammar §9.9) |
| S6 | **MASS** | the whole stage **overshoots on arrival** with amplitude ∝ `flightModel.inertia` and settle time ∝ `angularBrake` | the menu obeys the ship's physics — a heavy ship's menu feels heavy, and nobody else's space game does this |
| S7 | **REACH** | `rippleField` ring on the hull at radius ∝ `magnetRange` (on hover of the scoop chip) and `radarRange` (on hover of the sensor chip), scaled to the same world-to-pixel ratio the hull uses | reach is a distance; drawing it as a distance is the honest form |
| S8 | **EMPTY SOCKET** | an unfitted slot renders as a ring with **no fill** and the word `OPEN`, never as a part named "Empty Cargo" | already fixed in `shipworks.js`; do not regress |
| S9 | **RISK** | `moduleRiskStrip` glyphs (`contraband`, `noise`, `mass`, `power`, `mass-stack`) ride the fitted callout as small marks | the drawback is attached to the thing that causes it |

## 1.7 Animation & interaction

Every animation maps to a row of grammar §5. Anything not in this table is decoration and gets cut.

| Animation | §5 row | Verb | Bound to | Duration |
|---|---|---|---|---|
| Stage arrival overshoot | *Stage arrival overshoot amplitude* | SETTLE | `flightModel.inertia` normalised over the roster → `0.4°…4.0°` of yaw overshoot | settle time = `clamp(180 / angularBrake, 60, 180)` ms |
| Callout constellation arrival | *Overshoot settle time* | SETTLE | `angularBrake` | ≤ 180 ms, staggered 12 ms per callout |
| Power beam dash | *Beam dash velocity, and reversal* | SPOOL | `capRegen − continuousDrain` | continuous while visible; **reverses** when negative |
| Gauge arc fill on ship change | *Gauge snap-back rate* | SETTLE | shield gauge uses `shieldRegenRate` | ≤ 180 ms |
| Slot select ping | — | LATCH | discrete selection | 90 ms, then `rippleField` ttl 420 ms |
| Reach ripple on capability hover | *Ripple radius* | SPOOL | `magnetRange` / `radarRange` | ≤ 180 ms to full radius, then static |
| Capability chip **earned reveal** | *Tree edge march* | LATCH | a chip crossing `locked → earned` between opens | 90 ms + `ui_confirm` |
| Ghost preview on module hover | — | SETTLE | `buildMassDelta` metrics | handling bars travel to the ghost value in ≤ 180 ms and return on `pointerleave` |
| Drawer slide | — | LATCH | open / close | 180 ms |
| Preview reveal gating | *(existing)* | SPOOL | real asset settlement (`onAssetSettled` / `watchPreviewSettlement`) | **bound to work, never a fixed timer** — carry the existing 8 s degraded terminal state forward |

**Nothing exceeds 180 ms.**

**What makes it a small game** (grammar §9, by number):
1 **direct manipulation of a real object** — you turn your own hull;
2 **labels pinned to 3D** — your scars are named where they are;
3 **physics-consistent motion** — the bay overshoots by your inertia;
4 **state-encoding animation** — the beams reverse when you overdraw;
5 **hover-reveals-cause** — `[data-why]` on every questionable value;
6 **ghost-preview on hover** — `buildMassDelta` moves the bars before you commit;
7 **spatial hit-testing** — you pick systems by pointing at them on the hull;
9 **earned reveal** — sockets fill;
10 **sound on every state change** — one delegated `pointerover` on `#screens`, rate-limited ~40 ms,
emitting `ui_hover`; `ui_click` on select, `ui_confirm` on fit, `ui_deny` on a blocked verb,
`ui_open`/`ui_back` on the drawer.

Technique **8 (a playable inset) is deliberately absent here** — it is THE RANGE's entire idea, and
V1 is the door to it.

## 1.8 Progressive disclosure

| Tier | Trigger | Content |
|---|---|---|
| **1 — Decide** | always visible | hull name; condition verb + %; handling verb sentence; four handling bars + `flightClass` + drive name; the capability chip row (earned + exactly **one** `NEXT`); the slot/scar constellation; six gauges; the verb row. |
| **2 — Why** | hover / focus, **no click** — `[data-why]` | *hull name* → `roleIdentity.shortWhy` + `counterRoles`. *condition chip* → hull / shield / armour numerals + `shieldRegenRate` + the phrase from bank D. *each handling bar* → bank M sentence naming the actual cause (`14 t of cargo`, `the Coilburn II drive`, `this hull's frame`). *each capability chip, earned* → what it lets you physically do (bank C). *each capability chip, `NEXT`* → `describeTechNodeReadiness(node, state)` rendered through bank T — **never `readiness.actionLabel` verbatim**, which returns `'⟫ Research'` and would ship the bracket punctuation grammar §9 bans. *each scar callout* → bank S. *each slot* → fitted module role (`moduleRole()`) + `moduleRiskGlyphs` detail strings. *each gauge* → `label: value` from `setGauges`. |
| **3 — Record** | one click → `sf-drawer`, never a second modal | **`record` pane:** the living-hull ledger (`killTally`, `repairPatches`, `heatScorch`, `washCount`, cycles since wash, `graffitiLine`/`graffitiAuthor`, `updatedAtT`) + the complete derived block as raw DATA rows + `flightModel` in full. **`tech` pane:** the 29-node DAG. **`fit` pane:** the compatible-module list with `buildMassDelta` chips per row. |

### The tech tree, absorbed

A separate tree screen is what makes progression feel like a spreadsheet in another room. Here it is
a **band on the ship**:

- **Tier 1** is the chip row. Chips are derived, not authored per node:
  - **Earned chips** come from the live derived block (§1.10 bank C predicates over
    `getDerivedStats`). What you can do is what your *current fit* can do — not what you have
    researched but not installed. That distinction is the whole point.
  - **The one `NEXT` chip** = the cheapest `describeTechNodeReadiness(...).state === 'available'`
    node by `cost.rp`; if none is `available`, the cheapest `'funding'` node; if none, the shallowest
    `'locked'` node. Its label is the **capability** its `unlocks.modules[0]` would grant, mapped
    through bank C — not the node's name. *"Tow a disabled hull"*, not *"Tractor Systems II"*.
- **Tier 2** is `describeTechNodeReadiness`'s structured blockers, re-phrased through bank T.
- **Tier 3** is the DAG in the drawer, opened with that node selected.
- **Ordering makes the curve visible** (permitted presentation; SA-5 forbids touching costs):
  chips sort by the node depth that grants them (longest prereq chain — `techTree.js` already
  computes this in `buildLayout`). Early capabilities sit left, deep ones right, and the hollow
  `NEXT` chip's horizontal position *is* how far along the curve you are.
- `techTree.js` remains registered for tools and checks. **Do not delete it, and do not "fix" its
  canvas font in this work** — Canvas 2D silently ignoring `var()` in `ctx.font` is a known separate
  defect (grammar §11).

## 1.9 Reduced motion & forced colors

**Reduced motion** — the global blanket only neutralises CSS; WAAPI and JS motion must call
`prefersReducedMotion()` from `src/ui/effects/effectRuntime.js` themselves. Every §1.7 encoding has
an **authored static form** (grammar §5). A reduced-motion build is never a blank build.

| Motion | Static equivalent (authored, always present in the DOM; the *only* difference is which one is visible) |
|---|---|
| Stage overshoot amplitude | the printed word in the HANDLING deck: `SLUGGISH` / `NEUTRAL` / `TWITCHY` (bank H2) |
| Overshoot settle time | `STOPS BADLY` / `STOPS CLEAN` (bank H3) |
| Beam dash velocity | `POWER +6/s` in `you` |
| **Beam reversal** | `OVER BUDGET −14/s` in `foe`, with a slash bar |
| Gauge snap-back | `SHIELD RECOVERS 12/s` |
| Reach ripple | `SCOOPS TO 180 wu` |
| Earned reveal | the chip is simply present and filled |
| Ghost preview | the delta chips print (`Turn −6.2% · Stop distance +41m`) with no bar travel |
| Drawer slide | drawer appears |

Under reduced motion the mount is still interactive — orbit, zoom, select all work; only the
*animated transitions* stop. `mount.setRotating(false)` is already the default; nothing idles.

**Forced colors** (`styles/accessibility.css` §197). `background-image`, `box-shadow`, `filter`,
`backdrop-filter` and `text-shadow` are stripped from `[data-screen]`, `[class*="panel"]`,
`[class*="card"]`, `[class*="menu"]`, `[class*="modal"]`, `[role="dialog"]`, `[role="region"]`.

| Element | Must survive by |
|---|---|
| slot / scar callouts | a **2 px solid border + text**. Never a translucent fill, never a gradient leader line — the leader is a `<span>` with `border-top`, not a `linear-gradient`. |
| `AUTHORED` vs `APPROX` | dashed vs solid **border-style** (survives), plus the printed word |
| handling bars | `border: 1px solid CanvasText` on the track and a **solid fill on the filled portion** plus the DATA numeral beside it |
| capability chips | `●` / `○` glyph characters (real text) + the word `NEXT`, plus `[aria-selected]`/`.active` for the Highlight treatment |
| gauges | SVG `stroke: currentColor` (not `filter`), plus the `label: value` text under each |
| power beams | SVG strokes survive; **the over-budget state additionally prints `OVER BUDGET`** because stroke colour alone is not a second channel |
| the drawer | class is `sf-drawer` / `sf-drawer__deck` (§0.3) so it is not caught by the `[class*="panel"]` strip; the 2 px `CanvasText` border from `[role="dialog"]` is the intended frame |
| the 3D canvas | the authored world canvas keeps its rendered scene by policy — but the callouts above it must be legible **without** it, so no callout may depend on the render behind it for contrast |

**Never encode by colour alone** (grammar §4) applies identically in normal mode.

## 1.10 Enumerated phrase banks

The UI never invents. An unrecognised state renders **nothing** — never a guess. This is the
`causeLedger.js` discipline promoted to house law.

**Bank D — condition verb** (from `entity.hull / entity.hullMax`):

| Range | Verb | Tone |
|---|---|---|
| no player entity | `STOWED` | calm |
| ≥ 0.95 | `SOUND` | calm |
| ≥ 0.75 | `SCRAPED` | calm |
| ≥ 0.45 | `HURT` | goal |
| ≥ 0.20 | `BADLY HURT` | foe |
| > 0 | `FAILING` | foe |
| = 0 | `WRECKED` | foe |

**Bank H — handling verb sentence** (CREST line 2). Composed from exactly three clauses, each from
its own sub-bank; a clause with no matching row is **omitted**, not replaced.

- H1 *turn*, from the Agility bar percentile: `Turns hard.` / `Turns steadily.` / `Turns wide.`
- H2 *mass*, from `massRatio`: `Light on the stick.` / *(omitted at neutral)* / `Sluggish under load.`
- H3 *brake*, from the Brake bar percentile: `Stops clean.` / `Stops badly.`
- H4 *stop distance*, appended only when `cargoMass > 0`:
  `Loaded, it stops {Math.round(stopDistanceEstimate(flightModel))} m later.`

**Bank C — capability chips.** Each row is `predicate over getDerivedStats` → verb. A chip with a
false predicate does not render.

| Predicate | Chip verb (SUBHEAD 19) | Sub-numeral (DATA 13) |
|---|---|---|
| `masslineHeadId === 'tractor'` | `Tow things that do not want to be towed` | `TRACTOR` |
| `masslineHeadId === 'elastic_whip'` | `Store a swing and give it back` | `SPRING` |
| `masslineHeadId === 'frame_coupler'` | `Hold two hulls together without tearing` | `COUPLER` |
| `masslineHeadId === 'monofilament_sweep'` | `Cut a hostile line` | `SWEEP` |
| `masslineHeadId === 'transverse_snare'` | `Snare something crossing your path` | `SNARE` |
| `masslineHeadId === 'twin_bridle'` | `Anchor to two points at once` | `BRIDLE` |
| `tetherSpoolMult > 1` | `Swing off things further away` | `×{n} line` |
| `tetherReelRateMult > 1` | `Reel in faster than they can pull away` | `×{n} reel` |
| `magnetRange > 0` | `Scoop cargo without stopping` | `{n} wu` |
| `droneBayCount > 0` | `Put {n} drone(s) in the water` | `{n} bay` |
| `jumpDriveTier !== 'jump_t1'` | `Reach further out` | `{tier}` |
| `hullRepairOOC > 0` | `Heal between fights` | `{n}/s` |
| `hiddenCargoPct > 0` | `Carry what you should not be carrying` | `{n}% hidden` |
| `scannerCloak > 0` | `Read quieter than you are` | `{n}%` |
| `ramDamageDealtMult > 0` | `Use your own hull as the weapon` | `×{n}` |
| `boost.dashImpulse > 0` | `Break away instantly` | `{n} impulse` |
| `damageReductionMult < 1` | `Take the hit and keep going` | `−{n}%` |
| `weaponRangeMult > 1` | `Reach them before they reach you` | `+{n}%` |
| `radarRangeMult > 1` | `See them first` | `{n} wu` |
| `cargoCap > 0` | `Carry {n} units` | `{n} u` |
| *(the `NEXT` chip)* | the bank-C verb of the capability its node's `unlocks.modules[0]` would grant | `NEXT` |

An unlockable module whose mods map to **no** bank-C row produces **no** `NEXT` chip; the selector
moves to the next candidate node. Never invent a verb for an unmapped mod.

**Bank T — tech blocker phrasing** (tier 2 on the `NEXT` chip), from `describeTechNodeReadiness`:

| `.state` | Phrase |
|---|---|
| `available` | `Ready to research.` |
| `funding` | `Short {missingCost.join(' and ')}.` |
| `locked`, 1 missing | `Needs {missingPrereqs[0]} first.` |
| `locked`, > 1 | `Needs {n} earlier steps.` |
| `researched` | *(chip renders as earned; no blocker phrase)* |
| `missing` | *(renders nothing)* |

**Bank S — scar phrasing** (tier 2 on scar callouts):

| Scar | Line |
|---|---|
| kills | `{n} confirmed kill(s) painted on the nose.` (`n` capped at 13 by the record) |
| weld | `A heavy repair left this plate.` |
| scorch | `A weapon vent burned this panel.` |
| grime | `{n} cycle(s) since the last wash.` |
| graffiti | `{graffitiLine}` — sub-line `— {graffitiAuthor}` when present |
| `APPROX` anchor | `Marked approximately — this hull has no authored plate for it.` |

**Bank M — handling cause** (tier 2 on each handling bar). Each bar names the single largest
contributor; ties resolve in the listed order.

| Bar | Cause | Sentence |
|---|---|---|
| Agility | cargo | `{n} t of cargo. That is why you turn {p}% slower than empty.` |
| Agility | modules | `{n} t of fitted modules. That is why you turn {p}% slower than bare.` |
| Agility | hull | `This frame turns {p}% {faster\|slower} than the roster median.` |
| Inertia | any | `{n} t moving. It takes {t}s to change your mind.` (`t = 1 / linearDrag`) |
| Top speed | drive | `The {driveLabel} sets your ceiling.` |
| Top speed | mass | `Mass costs you {p}% of your ceiling.` |
| Brake | any | `From flat out you need {n} m to stop.` |

## 1.11 Definition of done — THE SHIP

1. Silhouette (§1.1) distinguishable from every other screen with text removed.
2. Exactly one DISPLAY element (the hull name). Nothing below 12 px.
3. APRON holds ≥ 2 verbs in flight, ≥ 4 docked; `TAKE IT TO THE RANGE` is always one of them.
4. STAGE responds to pointer, keyboard **and** gamepad (`spatialFocusTarget` needs no registration).
5. Every animation maps to a §1.7 row.
6. Legible and complete under reduced motion **and** `forced-colors`.
7. `[data-why]` wired for: hull name, condition, all four handling bars, every capability chip,
   every scar, every slot, every gauge.
8. **Looked at** in captured frames at 1440 × 900 and 1280 × 720 — with a damaged hull, a scarred
   hull, a stock hull, and an over-budget fit. A green check is not proof: confirm the callouts
   actually land on the mesh (`__sfPreviewDiagnostics` on the canvas returns the rendered scene
   facts) rather than trusting that `previewReady === 'true'`.
9. No cyan (`#39d0ff`) pixel anywhere on the screen.
10. Exactly one `WebGLRenderer` alive after opening the screen from both hosts in one session.

---

# 2 · THE RANGE

## 2.1 Concept, archetype, verb, silhouette

**Concept.** Nothing in this game explains a rule. `screens/help.js` is four blocks of keybindings.
`screens/codex.js` is eight *narrative* tabs gated on story beats with zero systems coverage.
Onboarding speaks one six-second voice line that is unrecoverable. THE RANGE is the answer, and it
is **playable**: each rule gets a short toy with one asteroid and one drone.

> You do not read that mass costs turn rate. You fly the heavy hull through the gate and you miss.

**Archetype:** a box you play in. **Primary manipulation: FLY** — you actually pilot, with the
player's own bindings.

**Silhouette with the text removed.** A dark rectangle bounded by a bright 1 px wireframe box that
fills the stage. Inside: one small arrow glyph, one irregular grey blob, one small hostile diamond,
and — depending on the rung — two or three thin vertical gate lines. A trail streams behind the arrow.
Along the bottom, a single wide horizontal band with one large word in it and three lozenge verbs.

Nothing else in the game has a **wireframe box with a glyph that moves under your keys**.

## 2.2 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ sf-crest                                                       12 %  │
│  HEAVY HULLS TURN WIDE                     GATE 2 / 4  ·  CLEARED 1  │
│  Fly the loaded Mule through all four gates without touching one.    │
├──────────────────────────────────────────────────────────────────────┤
│ sf-stage                                                       64 %  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │        ╎              ╎              ╎              ╎          │  │
│  │   ➤~~~~╎              ╎        ⬤     ╎              ╎          │  │
│  │        ╎              ╎              ╎        ◆     ╎          │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│ sf-apron                                                       24 %  │
│  YOU CLIPPED GATE 3                                                  │
│  Empty, this hull clears it. Loaded, it needs 40 m more to turn.     │
│  [ AGAIN ]  [ TRY IT EMPTY ]  [ NEXT RULE ]  [ ALL RULES ]           │
└──────────────────────────────────────────────────────────────────────┘
                                        sf-drawer ◀── left edge (rules + bestiary)
```

Proportions **CREST 12 % / STAGE 64 % / APRON 24 %**. Full-bleed. Its own backdrop: flat `#070c16`
with a 1 px `--sf-calm` boundary rectangle inset 24 px — a *range*, not a bay, not space.

**Precedent to read before writing a line:** `src/ui/screens/drill.js` — a 3 154-line playable,
full-screen, pausing minigame already in this repo. Copy its shape: canvas playfield, fixed-step
input controller, `prefersReducedMotion` consulted directly, `onShow`/`onHide` with a `_cleanup`,
`rafId` cancelled on hide. Do not copy its ore/geology domain.

### CREST contents

| Slot | Content | Type |
|---|---|---|
| Line 1, left | **the rule sentence** — the one DISPLAY element, ≤ 4 words | DISPLAY 40 |
| Line 1, right | live progress: `GATE n / N · CLEARED n` | DATA 20 |
| Line 2 | the instruction, one sentence | BODY 14 |

The DISPLAY element is the **rule**, not the toy's name and not a score. It is what the player is
supposed to leave with.

### STAGE contents

A single `<canvas>` playfield, `tabindex="0"`, `role="application"`, with an `aria-label` naming the
rule and the control map (`resolveDrillControlMap(state)` already produces exactly this shape — reuse
the pattern, not the drill bindings). Drawn contents per rung in §2.6.

### APRON contents

| Row | Content |
|---|---|
| 1 | the **verdict** — SUBHEAD-L 22, from the rung's verdict bank, with `createMorphLabel` scramble on change (~120 ms) |
| 2 | the **because** — BODY 14, one sentence naming the real cause with the real number |
| 3 | the verb row (§2.4) |

### DRAWER (left edge)

| Pane | Opened by | Holds |
|---|---|---|
| `rules` | `ALL RULES` verb, or `Tab` | the rung list as an `sf-rail`: 4 groups × their rungs, each with state `NEW` / `FLOWN` / `CLEARED`, persisted to `state.ui.rangeCleared[]` |
| `bestiary` | clicking the drone in the box, or the `WHO IS THIS` affordance | the enemy record (§2.7) |

## 2.3 What information is shown — exhaustive

| Shown | Field | Where |
|---|---|---|
| the rule | authored per rung (§2.6) | CREST DISPLAY |
| the instruction | authored per rung | CREST line 2 |
| live progress | rung-local (`gateIndex`, `cleared`) | CREST right, DATA |
| the subject hull | `state.ui.rangeSubject.shipId` (handed by THE SHIP's V1) or `player.ownedShips[activeShipIndex].defId` | drawn, and named in the APRON |
| the subject fit | `state.ui.rangeSubject.fittings` | affects the flight model; named in the APRON `because` line |
| flight model | `getDerivedStats(shipId, fittings, state.player).flightModel` — `mainAccel`, `reverseAccel`, `strafeAccel`, `angularAccel`, `angularBrake`, `maxYawRate`, `linearDrag`, `lateralDrag`, `inertia`, `maxSpeed`, `normalMaxSpeedMult`, `boostMaxSpeedMult`, `mass` | the integrator (§2.5) |
| tether capability | `derived.masslineHeadId`, `tetherSpoolMult`, `tetherReelRateMult` | Massline rungs: line length = `base × tetherSpoolMult` |
| ram capability | `derived.ramDamageDealtMult` | ram rung outcome |
| magnet | `derived.magnetRange` | scoop rung |
| power budget | `derived.capRegen`, `derived.continuousDrain`, `capMax` | energy rung |
| stop distance | `stopDistanceEstimate(flightModel)` from `massDelta.js` | brake rung target line |
| the drone | one `ENEMY_TYPES` row: `name`, `shipClass`, `maxSpeed`, `turnRate`, `mass`, `collisionRadius`, `behavior`, `aiDoctrine.preferredRange` | drawn + bestiary pane |
| its weak point | `WEAK_POINTS_BY_CLASS[shipClass]` → `label`, `arcCenter`, `arcHalfWidth`, `bonusMult`, `hint` | weak-point rungs: the arc is drawn on the drone |
| the verdict | rung verdict bank | APRON row 1 |
| the cause | computed, named (§2.6 per rung) | APRON row 2 |
| clear state | `state.ui.rangeCleared[]` (transient UI state; **not** a save-schema change) | drawer rail |

## 2.4 Actions — the APRON always holds ≥ 1 verb

| Verb | Label | Enabled when | Does |
|---|---|---|---|
| R1 | `AGAIN` | always | resets the rung, same hull, same fit |
| R2 | *(rung-specific contrast verb)* — e.g. `TRY IT EMPTY`, `TRY THE HEAVY HULL`, `TRY IT WITHOUT THE TETHER` | the rung defines one | re-runs with the single variable flipped — **this is the teaching mechanism**, not a convenience |
| R3 | `NEXT RULE` | always | advances the rung |
| R4 | `ALL RULES` | always | opens the `rules` drawer |
| R5 | `RETURN TO THE SHIP` | when entered from THE SHIP's V1 | `screenManager.popScreen()` |

In-box actions: fly (the player's own bindings), fire (`LMB`), tether (`Massline` binding), boost,
brake. `Escape` closes the screen. `Tab` opens the rules drawer.

**No verb on this screen grants credits, RP, or items** — see SA-1. When a second RP writer lands, R3
gains a first-clear award and nothing else about the screen changes.

## 2.5 The teaching integrator (BINDING)

**THE RANGE does not run the sim.** It runs a small self-contained fixed-step integrator that
**reads the real flight model** so the lessons are true rather than mocked.

```
STEP        = 1/60 s
MAX_FRAME   = 0.1 s        // catch-up ceiling, drill.js precedent
model       = getDerivedStats(shipId, fittings, state.player).flightModel
```

Per fixed step, for the player glyph `{ x, z, vx, vz, rot, yawRate }`:

| Quantity | Update | Reads |
|---|---|---|
| yaw rate | `yawRate += turnInput * angularAccel * STEP`; when `turnInput === 0`, decay toward 0 by `angularBrake * STEP`; clamp `abs(yawRate) ≤ maxYawRate` | `angularAccel`, `angularBrake`, `maxYawRate` |
| heading | `rot += yawRate * STEP` | — |
| accel | forward: `a = mainAccel`; reverse: `a = reverseAccel`; strafe: `a = strafeAccel` on the perpendicular | `mainAccel`, `reverseAccel`, `strafeAccel` |
| velocity | `v += (a_vec − v_along * linearDrag − v_perp * lateralDrag) * STEP` | `linearDrag`, `lateralDrag` |
| speed clamp | `maxSpeed * normalMaxSpeedMult`, or `* boostMaxSpeedMult` while boosting | `maxSpeed`, `normalMaxSpeedMult`, `boostMaxSpeedMult` |
| position | `x += vx * STEP; z += vz * STEP` | — |

Terminal velocity is `a / linearDrag`, which is the same relationship the sim's own comment
documents (`steady-state speed = thrust/drag`).

**Massline constraint** (swing rungs). While tethered to an anchor at distance `L`: each step,
remove the radial velocity component relative to the anchor and clamp the radius to `L` (a rigid
rod). Tangential velocity is untouched. Release keeps the current velocity vector. This produces a
true swing and a true slingshot from three lines of code, and it matches the vision's description
exactly: *the player supplies intent, the physical rules supply the consequence*.
`L = BASE_TETHER_LEN * derived.tetherSpoolMult`.

**Collisions.** Circle–circle. Impulse along the normal, split by `mass` ratio
(`derived.mass` vs the body's `mass`). Light bodies fly; heavy bodies barely move. That *is* the
"light enemies are almost ammunition" lesson, and it must fall out of the mass ratio, not a table.

**Rules the integrator must obey:**
- It reads `flightModel` — it never hard-codes a constant that exists there.
- It never writes to `state`. It is a pure local simulation over a snapshot.
- A divergence in feel between THE RANGE and flight is a **spec bug to file**, not something to tune
  away inside THE RANGE. Tuning the Range to feel better than the game is how a teaching tool starts
  teaching a lie.
- One `rAF`, started on `onShow`, `cancelAnimationFrame`d in `onHide`, self-parked when the rung is
  in its verdict state and nothing is moving.

## 2.6 The rung catalogue

Four groups. Each rung: one asteroid, one drone, one rule, one contrast verb. Rungs marked ▲ are the
first wave; the rest follow the same template and need no new spec.

### Group 1 · MASS (the thing nobody is ever told)

| ▲ | Rule (DISPLAY) | Setup | Win | Contrast verb (R2) | Cause sentence (APRON row 2) |
|---|---|---|---|---|---|
| ▲ | `HEAVY HULLS TURN WIDE` | 4 gates, alternating offsets, spaced `3 × stopDistanceEstimate`; subject hull loaded to 80 % `cargoCap` | pass all 4 untouched | `TRY IT EMPTY` | `Empty, this hull clears it. Loaded, it needs {n} m more to turn.` (from `turnMass` empty vs loaded) |
| ▲ | `STOPPING TAKES ROOM` | one wall line at exactly `stopDistanceEstimate(flightModel)` from the start | stop before the line from full speed | `TRY THE LIGHT HULL` | `From flat out this hull needs {n} m. You used {m}.` |
| | `MASS IS THE ARGUMENT` | ram a drifting pod; pod mass steps 0.2× → 5× your `mass` | move the pod past a marker | `TRY THE HEAVY HULL` | `You weigh {a} t. It weighs {b} t. That ratio is the whole result.` |

### Group 2 · THE MASSLINE (the signature mechanic)

| ▲ | Rule | Setup | Win | Contrast verb | Cause sentence |
|---|---|---|---|---|---|
| ▲ | `SWING, DO NOT PULL` | one large asteroid anchor, one exit gate 90° off your entry | tether, swing, release through the gate | `TRY IT WITHOUT THE TETHER` | `You entered at {v} and left at {w}. The rock gave you the corner.` |
| | `THEY BECOME THE WEAPON` | one `wasp_swarmer` drone, one second drone downrange | tether the first, release it into the second | `TRY SHOOTING IT INSTEAD` | `A {n} t hull at {v} carries more than your gun does.` |
| | `LINE LENGTH IS A CHOICE` | same anchor, gate at two radii | clear both | `TRY THE LONGER LINE` | `Your line is {n} wu. Spool changes the radius, not the speed.` |

### Group 3 · POWER & HEAT

| ▲ | Rule | Setup | Win | Contrast verb | Cause sentence |
|---|---|---|---|---|---|
| ▲ | `YOU CAN RUN DRY` | hold fire on a target for 20 s with the current fit | keep `cap > 0` for the full 20 s | `TRY THE OTHER FIT` | `You draw {d}/s and regenerate {r}/s. That is {t}s of trigger.` |
| | `HEAT IS A TIMER` | sustained fire until vent | vent before the forced vent | `TRY THE COOLER GUN` | `This fit vents at {t}s. The forced vent costs you {n}s of nothing.` |

The energy rung draws a `routeBeam` along the top of the box using the **same reversal encoding as
THE SHIP** (§1.6 S3). One vocabulary, learned once, read in two places.

### Group 4 · WEAK POINTS (per enemy class)

One rung per `WEAK_POINTS_BY_CLASS` entry — **7 rungs, generated from the table, not authored
individually**:

| Field | Use |
|---|---|
| `label` | the arc's caption on the drone (`DRIVE COIL`, `REACTOR VENT`, `ORE PROCESSOR`, `AMMO MAGAZINE`) |
| `arcCenter`, `arcHalfWidth` | the drawn arc, and `isHitInWeakArc()` verbatim for scoring |
| `bonusMult` | the cause sentence: `Hits there land {n}× harder.` |
| `hint` | the instruction: `Get behind it.` for `REAR` |

Rule (DISPLAY), shared: **`EVERY BIG HULL HAS A BACK`**. Win: three consecutive hits inside the arc.
Contrast verb: `TRY IT FROM THE FRONT`. Drone class is picked from `ENEMY_TYPES` by matching
`shipClass`; where several match, the lowest `levelRange[0]`.

**Do not re-implement weak-point geometry.** `isHitInWeakArc(target, hitPos, wp)` is pure and
already correct; import it.

## 2.7 The bestiary, absorbed

`src/data/enemies.js` (15 types), `src/data/encounters.js` (48 encounters, 31 barks, 38 receipts) and
`src/data/weakPoints.js` (7 classes) have **zero UI importers** today. THE RANGE is where they land.

**Not as a list screen.** The bestiary is reached by **pointing at the drone in the box** — grammar
§9.7, spatial hit-testing over lists. Clicking the live drone opens the `bestiary` drawer pane on
that enemy.

| Tier | Content |
|---|---|
| 1 (on the drone, in the box) | its name, and its class glyph. Nothing else — you are flying. |
| 2 (`[data-why]` on the drone label) | `behavior` verbatim from `ENEMY_TYPES` (`"kite at max range, retreat when closed"`) + `aiDoctrine.preferredRange` as `Fights at {n} wu.` |
| 3 (`bestiary` drawer pane) | full record: `hull/armor/armorFlat/shield/shieldRegen`, `maxSpeed/accel/turnRate/mass/collisionRadius`, `weapons[]` resolved to names, `bountyCr`, `illegalToKill`, `loot.drops[]`, `reinforcements`, the `WEAK_POINTS_BY_CLASS` row, and **which `ENCOUNTERS` shapes can field it** (filter `ENCOUNTERS` by archetype reference). `NAMED_CAPTAINS` who use this archetype get a line each: name + `gimmick` + escort composition. |

**Barks are quoted, never spoken.** `ENCOUNTER_BARKS` lines appear in the tier-3 record as printed
quotations attributed to the shape. THE RANGE emits **no** voice line — `check:one-voice` owns the
voice channel and a training screen must not compete with it.

**No enemy row renders a field it does not have.** A missing `reinforcements` renders nothing, not
`none`.

## 2.8 What is shown symbolically rather than as text or numbers

| # | Encoding | Symbol | Reads intuitively because |
|---|---|---|---|
| R-S1 | **the lesson itself** | you miss the gate | a failed turn is not an opinion |
| R-S2 | **turn radius** | a faint arc drawn ahead of the glyph at the current `yawRate` and speed — your actual turning circle, live | it is the geometry the gate is testing, drawn before you commit |
| R-S3 | **stop distance** | a bar on the ground ahead of the glyph at `v² / (2 × reverseAccel)` | the number becomes a distance you can see coming |
| R-S4 | **momentum** | a velocity trail whose length ∝ `speed × mass` | mass and speed are the same fact in a collision |
| R-S5 | **the tether** | a bright white line under tension, thickening as radial load rises | *white-hot Masslines* is VISION's word for it |
| R-S6 | **the weak arc** | the arc drawn on the drone in `goal`, filling `you` when your bearing enters it | you see the flank open before you take it |
| R-S7 | **power budget** | the same reversing `routeBeam` as THE SHIP | one vocabulary, two screens |
| R-S8 | **contrast** | the failed attempt's path stays on screen as a ghost line in `calm` while the retry draws in `you` | the comparison is the lesson; making the player remember it is not |

## 2.9 Animation & interaction

| Animation | §5 row | Verb | Bound to | Duration |
|---|---|---|---|---|
| the whole box | *(this is the sim)* | — | the integrator | continuous while the rung runs |
| turn-radius arc | *Ripple radius* | SPOOL | live `yawRate`, `speed` | per frame |
| velocity trail | *(state-encoding)* | — | `speed × mass` | per frame |
| tether tension | *Beam dash velocity* | SPOOL | radial load | per frame |
| verdict label change | *Label scramble duration* | LATCH | verdict state change | 120 ms `createMorphLabel` |
| gate clear | — | LATCH | discrete | 90 ms + `ui_confirm` |
| gate clipped | — | LATCH | discrete | 90 ms + `ui_deny` |
| rung advance | — | LATCH | discrete | 180 ms |
| drawer slide | — | LATCH | — | 180 ms |
| camera shake on collision | *(drill.js precedent)* | — | impulse magnitude | ≤ 420 ms, amplitude curve `trauma²` |

**Techniques (grammar §9):** **8 — a playable inset** is this screen's whole idea; plus **1** (you
manipulate a real object — yourself), **3** (physics-consistent motion, because it *is* the physics),
**4** (state-encoding animation — the reversing beam, the tension line), **5** (hover-reveals-cause
on the drone), **7** (spatial hit-testing — you open the bestiary by pointing at the enemy), **9**
(earned reveal — rungs unlock in order), **10** (sound on every state change).

## 2.10 Progressive disclosure

| Tier | Trigger | Content |
|---|---|---|
| **1 — Decide** | always visible | the rule sentence; the instruction; live progress; the box and everything in it; the verdict; the verb row. |
| **2 — Why** | hover / focus, no click | *the drone label* → `behavior` + `preferredRange` (§2.7). *the turn-radius arc* → `Your circle is {n} m wide right now.` *the stop bar* → `{n} m to stop from {v}.` *the tether* → `{n} wu of line. Radial load {p}%.` *the verdict* → the full cause sentence with both numbers. *each rung in the rules rail* → its rule sentence. |
| **3 — Record** | one click → `sf-drawer` | `rules` pane (the full rung list with clear state) and `bestiary` pane (the full enemy record, §2.7). Never a second modal. |

## 2.11 Reduced motion & forced colors

**Reduced motion — scale, do not disable.** drill.js's own precedent is
`drillGasShakeOffset(remainingS, elapsedS, reducedMotion)` → amplitude **× 0.25**, not 0. A playable
screen that stops moving under reduced motion is broken, not accessible.

| Channel | Under `prefersReducedMotion()` |
|---|---|
| the integrator, the glyph, the box | **unchanged — the toy stays fully playable** |
| collision shake | amplitude × 0.25 |
| velocity trail | drawn as a single static line from the last 0.3 s of positions, not a fading spray |
| particle bursts / debris spray | suppressed; replaced by one static impact mark that persists 1 s |
| verdict scramble | the verdict prints directly, no morph |
| ghost path from the previous attempt | **kept** — it is information, not decoration |
| gate clear/clip flashes | replaced by a border-weight change (1 px → 3 px) |
| drawer slide | appears |

**Forced colors.**

| Element | Must survive by |
|---|---|
| the box boundary | `CanvasText` 2 px stroke |
| gates | `CanvasText` stroke, and **the cleared/failed state carries a glyph** (`✓` / `✕`) not just colour |
| the player glyph | filled `CanvasText` triangle |
| the drone | hollow `CanvasText` diamond + its printed name (shape is the second channel) |
| the weak arc | dashed stroke + the printed `label` |
| the tether | solid stroke + the printed `TETHERED` state word |
| the verdict | text, always |
| the drawer | class `sf-drawer` / `sf-drawer__deck` (§0.3) |
| trails, shake, glow | may vanish entirely — none of them carry unique information |

The canvas is the authored playfield and keeps its rendered content by policy; every *state* it shows
is duplicated in the CREST or APRON as text, so a forced-colors player who cannot read the canvas'
colour coding still has the full result in words.

## 2.12 Definition of done — THE RANGE

1. Silhouette (§2.1) distinguishable from every other screen with text removed.
2. Exactly one DISPLAY element (the rule sentence). Nothing below 12 px.
3. APRON holds ≥ 3 verbs on every rung, one of which flips exactly one variable (R2).
4. STAGE responds to pointer, keyboard **and** gamepad — the box is flown with the player's own
   bindings, resolved live from `state.settings.controls.bindings` the way `resolveDrillControlMap`
   does; a rebound key must work here without a code change.
5. Every animation maps to a §2.9 row.
6. Playable under reduced motion; legible under `forced-colors`.
7. Tier 2 wired for the drone, the arc, the stop bar, the tether, the verdict, and each rung row.
8. **Looked at** at 1440 × 900 and 1280 × 720, on at least a light hull and a loaded heavy hull —
   and the mass rung must actually be **failable** with the heavy hull and **passable** with the
   light one. If both pass, the integrator is not reading `flightModel` and the screen is a lie.
9. `check:ui-frame-sleep` cannot see compositor-side `infinite` CSS keyframes (grammar §11). This
   screen owns a real `rAF`: assert by hand that it is `cancelAnimationFrame`d in `onHide()` and that
   the loop self-parks in the verdict state.
10. No cyan (`#39d0ff`) pixel anywhere on the screen.
11. No credits, RP, or items awarded (SA-1) — and no placeholder standing in for them.

---

# 3 · Build order

| # | Step | Ships value on its own |
|---|---|---|
| 1 | Promote `shipworks.js` → `src/ui/ship/shipScreen.js` with `{host}`; register in the three places (§0.4); F2 opens it in flight. Dock rail untouched. | the best surface in the game stops being reachable only while docked |
| 2 | Restructure into CREST / STAGE / APRON with the `sf-*` vocabulary and the §0.1 palette. Adopt `shipEngineeringStage.js` for beams + gauges. | the screen stops being a three-column workbench and becomes an instrument |
| 3 | HANDLING deck from `handlingProfile.js`; CREST condition from the player entity; bank D + bank H. | *why does it fly like this* and *how hurt is it* — the two questions that had no answer at all |
| 4 | Scar callouts from `livingHull` (§0.6 / §0.7 conventions, `AUTHORED`/`APPROX`). | *"this is my fucking ship"* becomes visible for the first time |
| 5 | CAPABILITY deck: bank C predicates + the single `NEXT` chip from `describeTechNodeReadiness`; chooser moved into `sf-drawer`. | progression stops being a spreadsheet in another room |
| 6 | THE RANGE shell + the integrator (§2.5) + Group 1 rung 1 (`HEAVY HULLS TURN WIDE`). | the first rule this game has ever explained |
| 7 | Group 2 rung 1 (`SWING, DO NOT PULL`), Group 3 rung 1, Group 4 generated from `WEAK_POINTS_BY_CLASS`. | the signature mechanic and the combat ceiling become teachable |
| 8 | Bestiary pane; `help.js` gains one verb that opens THE RANGE. | 15 enemies, 48 encounters and 7 weak-point classes get their first UI reader |

**Must stay green throughout:** `check:ui-a11y`, `check:wcag-contrast`, `check:ui-identity`,
`check:ui-frame-sleep`, `check:ui:perf`, `check:ui-effects`, `check:one-voice`,
`check-station-tab-navigation-runtime`, `check-tech-tree-guidance`.

**A green check is not proof.** Both screens require visual confirmation against a captured frame
(grammar §11 / §12.8). For THE SHIP, confirm the callouts land on the mesh via
`canvas.__sfPreviewDiagnostics()` rather than trusting `previewReady`. For THE RANGE, confirm the
mass rung is failable with a heavy hull — a rung that always passes proves nothing and teaches
nothing.
