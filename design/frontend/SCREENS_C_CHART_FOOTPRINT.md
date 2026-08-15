<!-- LIFETIME: DURABLE -->
# Screens C — THE CHART and THE FOOTPRINT

**Status:** executable per-screen specification. Subordinate to
[`design/frontend/INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md) (type, colour roles, motion
contract, CREST/STAGE/APRON/DRAWER, disclosure tiers, naming rules, technique catalogue) and to
[`design/VISION.md`](../VISION.md). Nothing here restates the grammar; where this document says
"§5" or "§9.6" it means that file.

**Scope:** two surfaces.

| # | Screen | Status | File |
|---|---|---|---|
| 1 | **THE CHART** | **sharpen** — `src/ui/galaxyMap.js` (10,109 lines) is the strongest asset in the repo | `src/ui/galaxyMap.js` |
| 2 | **THE FOOTPRINT** | **new screen** | `src/ui/screens/footprint.js` + `src/systems/provenanceLedger.js` |

---

## §0 — Rulings that bind both screens

### 0.1 The empire-manager guardrail (hard)

`design/VISION.md` forbids collapsing into an X4-style empire manager. Both screens surface a great
deal of simulation. The rule that keeps them honest:

> **Every quantity surfaced on either screen must terminate in a verb the player's own ship
> performs.** If a number cannot be answered by flying somewhere, shooting something, hauling
> something, paying something, or plotting a course, it does not go on the glass.

Concrete consequences, non-negotiable:

- **No dispatch verb exists on either screen.** Not for wingmen, not for drones, not for claim
  garrisons, not for NPC jobs. Wingman/fleet commands are HUD-only by owner decision and are out of
  scope here.
- **Claims are READ + GO on the Chart.** `claims.js` ships 15 sites, 6 modules, 3 specializations.
  The Chart may show a claim's identity, specialization, defence rating and raid pressure. It may
  **not** build, fit, specialize, upgrade, set policy, or manage stock. Those verbs stay where they
  already live.
- **NPC jobs and traffic are read-only weather.** You may see that a hauler will be at the Kestrel
  seam in 90 s. You may not tell it anything. The verb is "go be there."
- **Economic pressure is a prediction, not a console.** Pressure exists so the player knows where to
  point their own hull. There is no "set trade policy", no route automation, no market order.

### 0.2 The invention ban (hard)

Grammar §1.3 promotes `src/ui/causeLedger.js`'s discipline to house law: an unknown tag renders
**nothing**, never a guess. Both screens obey it. Specifically:

| Surface | Phrase bank | Unknown key behaviour |
|---|---|---|
| Chart, route/sector danger | `CAUSE_PHRASES.danger[tag]` in `src/data/causePhrases.js`, tag from `sectorSignalFor(...).driver.danger` | the risk ladder still renders; the sentence renders **nothing** |
| Chart, price pressure | `CAUSE_PHRASES.pricePressure[tag]`, tag from `.driver.pricePressure` | as above |
| Chart, traffic composition | fixed labels from `TRAFFIC_ROLES[role].label` in `src/systems/traffic.js` | role with no entry is **omitted from the pip row**, not labelled `?` |
| Footprint, standing change | `REP_REASON_LABELS` (see §3.6) | the **edge renders**, the phrase renders nothing |
| Footprint, incident | the receipt's own authored `text` field | node renders, no text line |

### 0.3 Shared reuse (grammar §10 — building a second one of these is a review failure)

| Need | Use | Notes |
|---|---|---|
| Pan / zoom / hit-test | `src/ui/map/mapCamera.js`, `pickMapTargetAt` | **Nothing inside `mapCamera.js` moves.** `zoomAt` is cursor-anchored and correct under span clamp. |
| Directed-edge march | `src/ui/effects/supplyTree.js` | Chart pressure threads **and** Footprint causal edges. Do not author a new marcher. |
| Route thread | `src/ui/effects/routeBeam.js` | |
| Heat glyph field | `src/ui/effects/glyphMatrix.js` | §5 row "Glyph-field density ← `heat`" |
| Staleness scramble | `src/ui/effects/morphLabel.js` | §5 row "Label scramble duration ← map knowledge staleness" |
| Ring / arc gauge | `src/ui/effects/circularGauge.js` | Footprint rep arcs |
| DOM vocabulary | `src/ui/uiPrimitives.js` + primitive block at end of `styles/ui.css` | **Adopt in all new work.** Currently imported by one dead file. |
| Gamepad nav | `spatialFocusTarget` in `src/ui/input.js` | works on **any** DOM, no registration — this is why the Footprint board is DOM, §2.5 |
| Cause tooltip | `src/ui/causeLedger.js` pattern → `[data-why]` | tier 2 on both screens |

A new effect primitive requires **three** registrations including the `DRIVERS` table in
`scripts/check-ui-effects.mjs`. Neither screen adds one.

### 0.4 Green checks are not proof (grammar §11)

Both screens require a captured frame at **1440×900 and 1280×720** before they are called done.
`check:ui-frame-sleep` inspects `rAF` and **cannot see compositor-side `infinite` CSS keyframes** —
so neither screen may "solve" its idle problem by moving motion into CSS. Canvas 2D silently ignores
`var()` in `ctx.font`; every canvas font on the Chart must be built through the existing
`FONT_MONO` / `FONT_UI` / `FONT_DISPLAY` helpers in `galaxyMap.js`, never a `var()` string.

---

# §1 — THE CHART

## 1.1 Concept, archetype, verb, silhouette

**Archetype:** a table you lean over. **Primary manipulation:** PUSH (drag the slab, wheel to close
in) / PLOT (drop a course).

**The idea, in one line:** the Chart stops being a place-finder and becomes a **prediction
instrument** — it shows you where cargo will need to be, who will be flying it, and what will be
waiting on the way.

**Silhouette with all text removed:**

> A wide, dark, near-full-bleed slab. A dense irregular field of small marks with a single bright
> thread crossing it. A **solid horizontal band across the bottom quarter with a repeating row
> rhythm** (the cargo deck) — the only regular geometry on the screen. Two thin vertical spines at
> the extreme left and right edges (collapsed drawers).

Distinguishable from the Footprint (§2.1: sparse, mostly empty, one thick left-to-right path, no
repeating rows) and from THE SHIP (a single lit centred object).

## 1.2 What is shown — exhaustive, by source

### 1.2.a Kept as-is (do not redesign)

Three zoom-resolved levels via `levelForZoom(zoom)` (`GALAXY` / `SYSTEM` / `LOCAL`, thresholds
`LEVEL_SYSTEM_AT = 1.6`, `LEVEL_LOCAL_AT = 2.8`); `buildGalaxyModel` / `buildSystemModel` /
`buildLocalModel`; the knowledge model (`mapConfidenceForSector`, `MAP_CONFIDENCE_STALE_DAYS = 7`,
`localMemoryBand`, `LOCAL_MEMORY_MIN_CONFIDENCE = 0.06`); route plot / preview / engage
(`resolveGalaxyMapPrimaryAction`, `resolveGalaxyMapPlotAction`, `computePreviewRoute`,
`resolveRouteEngageAction`); search with distance ranking (`getSearchTargets`,
`compareMapSearchTargetDistance`); camera bookmarks (`_bookmarks`, screen-owned, never sim state);
the 8 inspector tabs (`MAP_INSPECTOR_TABS`) with stated reasons (`resolveInspectorTabAvailability`);
`pickMapTargetAt` against the per-draw `_clickTargets[]`.

### 1.2.b New reads — all pure, all read-only, all already in the repo

| Reader | Module | Returns | Used for |
|---|---|---|---|
| `sectorSignalFor(state, sectorId)` | `src/systems/sectorSim.js` | `{ ownerId, danger, pricePressure, influence, dominantFactionId, dominantInfluence, contestMargin, trend:{danger,pricePressure,influence}, driver:{danger,pricePressure,influence}, encounterLoad, marketFlowUnitsPerDay }`, or `null` for an unknown sector | route risk, FILL gradient, tier-2 why |
| `effectiveDangerTierFor(state, sectorId)` | `src/systems/sectorSim.js` | integer tier | static/forced-colors risk word |
| `economyEquilibriumForListing(info, cmdtyId, role, baseEq)` | `src/systems/economy.js` | equilibrium stock | model beacons (§1.6) |
| `economyStockTargetForRole(role, baseEq)` | `src/systems/economy.js` | role stock target | model beacons |
| `economyBaseEqForSize(size)` | `src/systems/economy.js` | base equilibrium | model beacons |
| `economySpotPriceForRole(def, role, side, opts)` | `src/systems/economy.js` | modelled buy/sell/mid | model beacons |
| `priceMult(stock, baseEq, elasticity)` | `src/systems/economy.js` | price multiplier | pressure sign + magnitude |
| `trafficRoleMixForSector(sector, state)` | `src/systems/traffic.js` | `{ [role]: weight }` over `TRAFFIC_ROLES` (hauler, courier, miner, patrol, escort, smuggler, pirate, rescue, express, surveyor, salvor, tender, ore_carrier) | traffic PIPS |
| `regionalTrafficRoleWeights(state, sectorId, base)` | `src/systems/regionalEcology.js` | ecology-adjusted weights | traffic PIPS |
| `regionalTrafficDensityMultiplier(state, sectorId)` | `src/systems/regionalEcology.js` | scalar | traffic thread dash velocity |
| `routeAdjustedTrafficMix(state, sectorId, zoneId, weights)` | `src/systems/pirateRumor.js` | rumor-adjusted weights | traffic PIPS at LOCAL |
| `summarizeJob(job)` over `state.npcJobs.byId` | `src/systems/npcJobs.js` | `{ jobId, kind, phase, status, routeIndex, progress, loopCount, pos:{x,z}, heading, materialized, interrupted, resumable, payload }` | LOCAL work marks |
| `state.traffic.freighters[]` | `src/systems/traffic.js` | live freighter records | LOCAL live traffic marks |
| `state.encounterDirector` | `src/systems/encounterDirector.js` | `{ pressure:{combat,civilian}, noise:{mining}, pending, live, cooldowns, named, receipts, stats, lastMajorAt }` — `POOL_MAX = 140` | the WEATHER readout (§1.2.d) |
| `conflictPairsForSector(sectorId)` / `CONTESTED_SECTOR_BY_PAIR` | `src/data/conflictZones.js` | 5 authored pairs | contested double-ring |
| `state.conflicts[pairKey]` | written by `src/systems/factions.js` | `{ tension, state:'cold'\|'tense'\|'war', playerLean, momentum }` — `TENSE_THRESHOLD = 40`, `WAR_THRESHOLD = 75` | contested double-ring |
| `state.claims.bodies[]` + `claimDefenseRating(body, bodies)`, `repelChance(rating)`, `raidTripChance(danger)` | `src/systems/claims.js` | claim identity, defence, raid odds | holdings marks |
| `BODY_SPECIALIZATIONS` (`spec_refinery` / `spec_relay` / `spec_bastion`) | `src/data/claimableBodies.js` | `{ id, name, short }` | claim silhouette |
| `getRegionalEcologyProfile(sectorId)`, `regionalEcologyReadout(state, sectorId)` | `src/data/regionalEcology.js`, `src/systems/regionalEcology.js` | 24 profiles; `.danger.effective`, `.danger.baseline` | dossier tab |
| `REGIONAL_ECONOMY_PROFILES` | `src/data/regionalEconomyProfiles.js` | 24 profiles: `{ primaryRole, secondaryRoles, produces[], consumes[], pressureBias }` | dossier tab, pressure explanation |
| `zonesForSector(sectorId)`, `zoneAt`, `zoneThreat`, `ZONE_TYPES` | `src/data/sectorZones.js` | named zones per sector | LOCAL zone wash |
| `fieldMemoryReadout(state, fieldId)`, `fieldMemoryBand(depletion)` | `src/systems/fieldDepletion.js` | belt health band | dossier tab, LOCAL seam marks |
| `rumorReadoutForZone(state, sectorId, zoneId)`, `pirateBaseCandidates(state, sectorId)` | `src/systems/pirateRumor.js` | zone reputation; `PIRATE_RUMOR_THRESHOLD = 3` | TROUBLE bank |
| `lossesFor(state, sectorId)`, `latestLossLine(state, sectorId)` | `src/systems/lossLedger.js` | `MAX_PER_SECTOR = 8` provenance entries | history substrate + dossier |

### 1.2.c The layer reorganisation — channels first, banks second

**Do not rename any of the 8 existing `_layers` keys.** They are read at ~20 sites in `galaxyMap.js`.
Only the on-glass `name` in `LAYER_DEFS` changes where noted.

Three new ids are added: `traffic`, `events`, `holdings`. Total 11 toggles.
`history` is **not** a toggle — it becomes the chart's permanent substrate (§1.2.e).

**The channel table.** Each sector cell has exactly six encoding channels. Every layer claims exactly
one. This is the conflict-resolution law; an implementer never has to guess what happens when two
layers want the same paint.

| Channel | Geometry | Claimed by | Exclusivity |
|---|---|---|---|
| **SUBSTRATE** | the table under everything | `history` (permanent, non-toggleable) | n/a |
| **FILL** | the sector cell's interior wash | `market` (pressure) · `security` · `discovery` | **RADIO — one at a time.** Enabling one demotes the others to their RING or MARK fallback. Default `market`. |
| **RING** | ring(s) around the sector sigil | `faction` (owner colour, inner) · `events` (contested / live-encounter, outer, dashed) | additive, max 2 concentric |
| **PIPS** | the fixed pip row under the sigil | `market` (multi-commodity, §1.4) · `traffic` (role mix, §1.5) | **RADIO — one at a time.** Default `market`. |
| **MARKS** | glyphs at the sigil | `services` · `holdings` · `hazard` | additive, max 6 glyphs, priority `hazard > holdings > services` |
| **THREADS** | lines between sectors | `route` · `mission` · `market` (pressure flow arrows) · `traffic` (lane dash) | additive |

**The banks** (presentation grouping inside the existing `<details data-rail-sec="lenses">`, three
sub-groups with MICRO labels):

| Bank | Layers | Question it answers |
|---|---|---|
| **PLACE** | `services`, `faction`, `discovery`, `holdings` *(new)* | what is there and whose is it |
| **FLOW** | `market` *(on-glass label → **Pressure***)*, `traffic` *(new)*, `route`, `mission` | what moves and where it is going |
| **TROUBLE** | `security`, `hazard`, `events` *(new)* | what will bite |

New `LAYER_DEFS` entries (icons are stroke-only, 24×24, `stroke-width 1.8`, matching the shipped set):

```js
{ id: 'traffic',  name: 'Traffic',  icon: '<path d="M5 20V9M12 20V4M19 20v-7"/><path d="M3 20h18"/>' },
{ id: 'events',   name: 'Events',   icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M6.5 6.5 9 9M17.5 6.5 15 9M6.5 17.5 9 15M17.5 17.5 15 15"/>' },
{ id: 'holdings', name: 'Holdings', icon: '<path d="M12 3 4 7v10l8 4 8-4V7Z"/><path d="M12 12v9M4 7l8 5 8-5"/>' },
```

Default `_layers` state adds `traffic: false, events: true, holdings: true`. Traffic defaults off
because it claims the PIPS channel from `market`, and pressure is the default reading.

### 1.2.d The WEATHER readout — `encounterDirector` made legible

`encounterDirector.js` (124 KB) decides what jumps you and when. It is currently invisible. It is
surfaced in exactly one place — the CREST's live state line — and in exactly one form:

- `state.encounterDirector.pressure.combat` and `.civilian`, each `0..POOL_MAX (140)`.
- Rendered as a **two-segment bar**, combat above civilian, printed as `84 / 140` in DATA 13 beside
  it. Never a percentage — the pool is the pool.
- Tier 2 `[data-why]` enumerates the accrual inputs that are currently non-zero, from
  `_accrue`'s own terms, each as a fixed phrase:
  `zone threat` · `low security` · `cargo value` · `WANTED` · `mining noise` · `standing bounty` ·
  `regional ecology`. No invented sentence; a term at zero is omitted.
- Below the bar, one word from a fixed bank describing time-since-last: `QUIET` (no fire in
  `WINDOW_S`), `WORKING`, `HOT` (a major fired within 120 s, from `dir.lastMajorAt`).

**Why this is not empire management:** it tells the player how likely they are to be interrupted. It
gives them no control over it. The verb it terminates in is "leave, or stay and be ready."

`dir.named[captainId] = { alive, tier, escapes, kills, lastSeenSector }` is **not** shown on the
Chart — named captains belong to the Footprint (§2), and the Chart shows only
`lastSeenSector` as a MARK when the `events` layer is on.

### 1.2.e The history substrate — "where I have been"

**No new visit log is created.** The substrate is derived, per draw, from records that already
persist:

| Band | Condition | Rendering |
|---|---|---|
| `UNTOUCHED` | `mapConfidenceForSector(state, sector) <= 0` | bare table, no wash, sigil at 40 % opacity, label scrambled by `morphLabel` |
| `CHARTED` | confidence > 0, no station in `state.economy.marketIntel` for this sector | faint hatch, sigil full opacity |
| `WORKED` | ≥1 station of this sector present in `state.economy.marketIntel` | hatch + a worn patch under the sigil, opacity ∝ `min(1, stationsSeen / stationsInSector)` |
| `LIVED IN` | `WORKED` **and** (`state.claims.bodies` has an entry with this `sectorId`, **or** `lossesFor(state, sectorId).length > 0`) | worn patch + a scored edge ring |

Staleness is orthogonal and already modelled: `mapConfidenceForSector` decays over
`MAP_CONFIDENCE_STALE_DAYS = 7`; the label's `morphLabel` scramble duration is driven by
`1 - confidence` (§5 row "Label scramble duration ← map knowledge staleness"). Static equivalent:
`STALE · {n}d` printed under the label, per grammar §5's reduced-motion table.

This is the answer to "where I have been": **the chart is worn where you have worked it.** It is
material, not a switch.

## 1.3 Fix list — the verified defects, with the fix

| # | Defect | Fix | Where |
|---|---|---|---|
| **D1** | `riskEstimator: () => 0` — route ranking throws danger away | see §1.3.1 | `galaxyMap.js:3980` |
| **D2** | `trade: bothCharted` — "trade lanes" are graph adjacency relabelled | the `trade` flag on a galaxy edge is **deleted from the model** and replaced by a real thread source (§1.4). Charted-to-charted is a *navigability* fact, so keep `charted` and rename the consumer accordingly. Nothing may be labelled "trade lane" that has no commodity behind it. | `galaxyMap.js:1338-1343` |
| **D3** | price gradient shows one commodity, no direction | multi-commodity pip row + signed direction (§1.4) | `_selectedCommodity` |
| **D4** | Economy tab empty until 2 stations personally priced | model beacons (§1.6) fill it everywhere; memory sharpens where it exists | `buildTradeLanesModel` |
| **D5** | no traffic layer | `traffic` layer from `trafficRoleMixForSector` (§1.5) | new |
| **D6** | no events-in-progress | `events` layer from `state.conflicts` + `encounterDirector.live` (§1.2.b) | new |
| **D7** | no "where I have been" | history substrate (§1.2.e) | new |
| **D8** | rAF never self-parks | park conditions + wake list (§1.8) | `onShow` loop |

### 1.3.1 D1 — wiring real risk (the single highest-value change on this screen)

`rankTradeRoutes` (`src/ui/navigation/localSpaceMapModel.js:231`) already consumes risk:

```
expected        = grossProfit * reliability * (1 - risk * 0.65)
profitPerMinute = expected / max(1, travel.timeS) * 60
routes.sort((a,b) => b.profitPerMinute - a.profitPerMinute || b.expectedProfit - a.expectedProfit)
```

So supplying a real `riskEstimator` **re-ranks the entire deck** with no other change. Implementation:

```js
riskEstimator: (originStationId, destStationId) => {
  const a = stationSectorIdById(state, originStationId);
  const b = stationSectorIdById(state, destStationId);
  const path = computePreviewRoute(state, a, b);              // existing, memoised
  const ids = (path && path.sectorIds) || [a, b].filter(Boolean);
  let worst = null;
  for (const sid of ids) {
    const sig = sectorSignalFor(state, sid);
    if (!sig) continue;                                        // unknown sector: contributes nothing
    if (worst == null || sig.danger > worst.danger) worst = sig;
  }
  if (worst == null) return RISK_UNKNOWN;                      // 0.5 — see below
  return clamp(worst.danger, 0, 1);
}
```

**Fallbacks, stated so nobody invents one:**

- `sectorSignalFor` returns `null` only for a sector id not in `SECTOR_BY_ID`. That is a data fault,
  not an unknown route. Such a sector contributes nothing to the max.
- If **every** sector on the path returns `null`, the estimator returns
  `RISK_UNKNOWN = 0.5` and the deck row's risk mark renders as **`?` over 5 empty segments** with
  the printed word `UNSURVEYED`. It is never rendered as safe. A route whose risk cannot be
  established must not out-rank a route whose risk is known-low.
- `sectorSignalFor` returns a *modelled* danger for sectors the player has never visited. That is
  correct and intended: the field is a world fact, not a memory. Confidence gating applies to
  *prices*, not to danger.

**Free tier-2 why.** `sectorSignalFor(...).driver.danger` is an enumerated tag with an existing entry
in `CAUSE_PHRASES.danger`. The deck row's `[data-why]` renders
`driverPhrase(CAUSE_PHRASES.danger[tag], { dir, sector })` where `dir` comes from
`DIRECTION_WORDS.danger` keyed by `sign(trend.danger)` against `TREND_EPSILON`. **Zero new text.**

The same estimator is passed to `src/ui/screens/localmap.js:294`, which has the identical
`riskEstimator: () => 0` bug.

## 1.4 Economic pressure — the multi-commodity surface

`marketFlowUnitsPerDay` exists on `sectorSignalFor` but **inter-sector cargo volume does not exist**
and is not invented. The Chart shows **pressure**: distance from equilibrium, signed.

**Definition (pure, per station listing):**

```
eq       = economyEquilibriumForListing(stationInfo, cmdtyId, role, economyBaseEqForSize(size))
stock    = memory ? rememberedStock : eq        // model beacons sit AT equilibrium by construction
pressure = clamp((eq - stock) / eq, -1, +1)     // >0 = deficit (they want it) ; <0 = surplus
```

Sector pressure for a commodity = the max-magnitude station pressure in that sector, sign preserved.
The regional identity (`REGIONAL_ECONOMY_PROFILES[sectorId].produces / .consumes / .pressureBias`)
supplies the *reason*, not the value.

### The pip row (PIPS channel)

**Six fixed slots. Never more.** A commodity occupies a slot by being **pinned**; slot order is the
pin order and does not reflow. Unfilled slots render as an empty tick so the row's width is constant
and the eye learns slot positions.

| Encoding | Channel | Value |
|---|---|---|
| pip **direction** | shape (a triangle) | ▲ deficit (they buy) · ▼ surplus (they sell) · ▬ at equilibrium (\|pressure\| < 0.08) |
| pip **height** | shape | 3 steps: `\|p\| < 0.30` · `< 0.65` · `>= 0.65` |
| pip **tint** | colour | `--sf-goal` for deficit, `--sf-calm` for surplus, `--sf-calm` at equilibrium |
| pip **outline** | shape | solid = memory-backed · hollow = modelled |

Direction and magnitude are carried by **shape** before colour, satisfying grammar §4's
"never encode by colour alone." Under `forced-colors` the tint drops and the row is still complete.

**Default pinned set on a new save:** `cmdty_ore_iron` (the existing `_selectedCommodity` default),
plus the top-weighted `produces[0]` and `consumes[0]` of the player's current sector's
`REGIONAL_ECONOMY_PROFILES` entry. Three pinned, three empty. The player pins the rest.

**Pin verb:** the commodity `<select>` at `#gm-commodity-select` becomes a **pin list** — the select
stays (it is the search affordance) and gains a `PIN` button beside it; pinned commodities appear as
removable chips under it. Cap 6, enforced; attempting a 7th disables the button with the reason
`"Six commodities is the pip row. Unpin one."`.

**FILL channel** still shows exactly one commodity (the **focus** commodity — the first pinned, or
the one whose chip is selected), as a diverging wash: `--sf-goal` at deficit, `--sf-calm` at surplus,
neutral mid. This preserves the existing single-commodity gradient, which is correct at a glance;
the pip row is what makes it multi-commodity without stacking six tints on one cell.

**THREADS: the pressure flow arrow.** For the focus commodity, draw a marching edge from the
strongest-surplus sector to the strongest-deficit sector among **adjacent, charted** sectors, using
`supplyTree`'s edge marcher. March direction = surplus → deficit. **This is the only honest thing
that can be drawn on a "trade lane"**: not observed volume, but the direction a freighter would be
paid to travel. Max 4 such arrows on screen, chosen by `|Δpressure|`.

## 1.5 The traffic layer — composition, forecast, honestly labelled

`trafficRoleMixForSector(sector, state)` is pure and returns **weights, not ships**. Offscreen
sectors contain no entities to count. Therefore:

- **The traffic layer is a forecast and says so.** The pip row's MICRO label reads `TRAFFIC · FORECAST`
  whenever the displayed sector is not the player's current sector. In the current sector at LOCAL
  level, it reads `TRAFFIC · OBSERVED` and the counts come from live entities
  (`state.traffic.freighters` + materialized `state.npcJobs.byId` entries) instead of weights.
- **Gated by the same confidence model as everything else.** Where
  `mapConfidenceForSector(state, sector) < 0.25` the traffic pips render as **outlines only** with
  the label `TRAFFIC · UNSURVEYED`. The layer never quietly lies at galaxy zoom.
- Weight pipeline, in order: `trafficRoleMixForSector(sector, state)` →
  `regionalTrafficRoleWeights(state, sectorId, weights)` →
  (LOCAL only, per zone) `routeAdjustedTrafficMix(state, sectorId, zoneId, weights)`.
- Weights are normalised to a share and bucketed into **five roles** for the pip row, because 13
  roles do not fit six slots and the player does not need them separated:

| Bucket | Roles folded in | Glyph |
|---|---|---|
| **FREIGHT** | `hauler`, `courier`, `ore_carrier`, `express` | filled bar |
| **WORK** | `miner`, `surveyor`, `salvor`, `tender` | notched bar |
| **LAW** | `patrol`, `escort`, `rescue` | shield bar |
| **GREY** | `smuggler` | half bar |
| **HOSTILE** | `pirate` | inverted bar |

Five buckets in five fixed slots; slot six shows the density multiplier
(`regionalTrafficDensityMultiplier(state, sectorId)`) as a 3-step tick.

**THREADS: traffic lane dash.** When `traffic` is on, sector-to-sector edges that are `charted`
carry a dashed marching line whose **dash velocity ∝ FREIGHT share × density multiplier**
(§5 row "Beam dash velocity ← a named value"). Static form: the printed FREIGHT share bar.

**At LOCAL level only**, the live world becomes marks. For each `state.npcJobs.byId` entry with
`summarizeJob(job).materialized === true` and a resolvable `pos`, draw a small role glyph with a
**phase ring**: the ring's filled arc = `progress`, and the phase word is available on hover from the
fixed `NPC_JOB_PHASE` vocabulary (`commission`, `depart`, `transit`, `approach`, `work`, `load`,
`unload`, `return`, `hold`, `flee`, `complete`). A job in `flee` draws with a broken ring.
`interrupted === true` draws a bar through the glyph.

**This is the whole payoff of the layer**: you can see that the miner at the seam is 70 % through
`work` and will be in `load` shortly, which means a hauler is inbound, which means there is something
to intercept, escort, or beat to the buyer. That is a physical decision for the player's own ship.

## 1.6 Model beacons — the fix that makes the deck exist on turn one

`buildTradeLanesModel` builds `beacons` only from `state.economy.marketIntel`, which needs two
personally-priced stations. That is why the Economy tab is empty. The fix is a **second beacon
class**, not a second ranking system.

| | MEMORY beacon | MODEL beacon |
|---|---|---|
| Source | `state.economy.marketIntel[stationId] = { snapshot, seenAtT }` | `economySpotPriceForRole(def, role, side, { baseEq, stock })` per station listing |
| Exists for | stations the player has priced | every station in a sector with `mapConfidenceForSector > 0` |
| `capturedAtS` | `entry.seenAtT` | **`nowS`** — the model is not stale, it is imprecise |
| `reliability` | `1.0` | `0.55 * mapConfidenceForSector(state, sector)` — **strictly below any memory beacon** |
| `quotes[cid].stock` | remembered stock | `economyEquilibriumForListing(...)` (at rest by construction) |
| Deck row mark | solid dot, `MEMORY` | hollow dot, `MODEL` |

Because `rankTradeRoutes` multiplies by `reliability`, a remembered quote **always** outranks a
modelled one at equal gross margin, without any special-casing. Imprecision is carried by
reliability; staleness is carried by `ageS` (`reliability * exp(-ageS/1800)`). The two are not
conflated.

**Honesty rule on the glass:** the deck's SOURCE column is not decoration. A MODEL row is a
prediction of what a market *should* pay given its authored role, not a price anyone quoted. The
`[data-why]` on a MODEL row prints the enumerated regional reason from
`REGIONAL_ECONOMY_PROFILES[sectorId]` (`"{sector} is a {primaryRole}; it consumes {commodity}"`) —
those are data fields, not invented sentences.

## 1.7 THE CARGO DECK — the 15-second answer

> **"Where should I take this cargo, and is that route survivable?"** — answered in under 15 seconds,
> with no query, no typing, and two decisions.

The deck is the APRON's left 62 %. It is **populated before the first paint of the screen** — built
in `onShow` prior to the first `_draw()`, memoised on
`(floor(simTime/5), cargoCapVolume, pinnedCommoditySetKey, currentSectorId)`.

### Columns, left to right

| # | Column | Field | Type (grammar §3) | Width |
|---|---|---|---|---|
| 1 | **SOURCE** | MEMORY / MODEL | glyph only (solid / hollow dot) | 20 px |
| 2 | **COMMODITY** | `COMMODITY_NAME_BY_ID.get(route.commodityId)` | BODY 14 | 15 % |
| 3 | **LANE** | `originName → destinationName` | SUBHEAD 15 | 30 % |
| 4 | **LOAD** | `route.units` | DATA 13 | 8 % |
| 5 | **PRESSURE** | two signed pips: origin (▼ surplus expected) and destination (▲ deficit expected) | shape | 10 % |
| 6 | **MARGIN** | `route.profitPerMinute`, rounded, `cr/min` | **DATA 20 — the largest DATA on the screen** | 17 % |
| 7 | **RISK** | the survivability mark, below | shape + colour | 20 % |

**The RISK mark:** a 5-segment ladder. Filled segments = `ceil(route.risk * 5)`, clamped `0..5`.
Fill colour ramps `--sf-calm → --sf-foe`. Under the ladder, in BODY 13, the printed tier word from
`effectiveDangerTierFor(state, worstSectorId)` mapped through a fixed 5-word bank:
`CALM` · `WATCHED` · `ROUGH` · `HOSTILE` · `LETHAL`. The word is the second channel (grammar §4) and
is also the reduced-motion and `forced-colors` form. `RISK_UNKNOWN` renders `?` + `UNSURVEYED`.

**Rows:** 6 visible; scrolls to 12 (`rankTradeRoutes` is truncated at 12 for the deck). Each row is a
real `<button class="gm-deck-row">` so `spatialFocusTarget` gives gamepad navigation for free.

### Sort — an APRON verb, two states

| State | Comparator | Label |
|---|---|---|
| **BEST** (default) | existing: `profitPerMinute` desc, `expectedProfit` desc | `SORT · BEST` |
| **SAFEST** | `risk` asc, then `profitPerMinute` desc | `SORT · SAFEST` |

Toggling is a LATCH (~90 ms, `ui_confirm`). Rows re-order with a SETTLE (grammar §5) — they slide,
they do not cut.

### The literal 15-second trace

| t | What happens | Mechanism |
|---|---|---|
| **0.0 s** | screen opens; deck already full, 6 rows, sorted BEST | memo built in `onShow` before first `_draw` |
| **0.0 – 2.5 s** | player reads row 1's **MARGIN** (DATA 20 — largest DATA present) and its **RISK ladder**. Two glances, no reading. | column widths above |
| **2.5 – 5.0 s** | eye runs down column 7 for a shorter ladder at an acceptable margin. Rows 2–3 evaluated. | ladder is a shape, scannable vertically |
| **5.0 – 8.0 s** | hover the chosen row. Tier 2 fires with **no click**: the enumerated danger phrase for the worst leg, plus the MODEL/MEMORY reason. | `[data-why]`, `CAUSE_PHRASES.danger[driver]` |
| **8.0 – 8.1 s** | hovering already **ghost-previews** the route thread on the slab (§9.6) — the decision is visible before commitment | `computePreviewRoute`, drawn at 40 % opacity, never assigned to `nav.route` |
| **8.1 – 9.0 s** | click the row. LATCH. The slab PUSHes to frame origin + destination (reuses the `#gm-frame-both-btn` path); the thread lights to full. | `tradeLaneTarget(state, route.destinationId)` → `resolveGalaxyMapPlotAction` |
| **9.0 – 13.0 s** | the ribbon legs, now in the APRON centre, show a **per-leg RISK ladder** — where on the route the danger actually is | per-leg `sectorSignalFor` |
| **13.0 – 15.0 s** | press **ENGAGE** in the APRON verb column | existing `#gm-engage-route-btn`, relocated |

Two decisions (which row; engage or not), zero navigation, zero typing.

**If the trace cannot be walked in a captured frame, the screen is not done.**

## 1.8 Animation, interaction, and the rAF park

### Grammar §9 techniques used

| § | Technique | Where |
|---|---|---|
| **9.1** | direct manipulation of a real object | PUSH the slab (existing drag), wheel through GALAXY→SYSTEM→LOCAL |
| **9.5** | hover-reveals-cause | every deck row, every sector cell, every pip |
| **9.6** | ghost-preview on hover | deck row hover ghosts the route thread before commitment |
| **9.7** | spatial hit-testing over lists | existing `pickMapTargetAt` / `_clickTargets[]` |
| **9.9** | earned reveal | a sector's pip row *arrives* when confidence first crosses 0.25; a claim MARK arrives on `claim:claimed` |
| **9.10** | sound on state change | `ui_hover` on deck row (rate-limited ~40 ms), `ui_confirm` on plot, `lock_acquired` on engage |

### Grammar §5 motion rows used — every animation maps to one

| Motion | Named state variable | Static equivalent (authored, not fallback) |
|---|---|---|
| Label scramble duration | `1 - mapConfidenceForSector(...)` | `STALE · {n}d` under the label |
| Grid coverage | history substrate band (§1.2.e) | the printed band word: `UNTOUCHED` / `CHARTED` / `WORKED` / `LIVED IN` |
| Tree edge march (direction) | pressure flow: surplus → deficit | a printed direction glyph `→` plus signed `Δp` in DATA 13 |
| Beam dash **velocity** | FREIGHT share × `regionalTrafficDensityMultiplier` | the printed FREIGHT share bar + `×{n.n}` density |
| Gauge snap-back rate | *not used on this screen* | — |
| Rail magnify | scale rail focus (existing) | none needed — the single atmospheric allowance |

Nothing exceeds **180 ms**. Deck re-sort SETTLE ≤ 160 ms; plot LATCH ~90 ms.

**What makes it a small game:** the pressure lens is a *prediction instrument*. Pinning a commodity
and pushing the slab lets the player see where a freighter will be paid to go before it goes, and the
traffic layer's phase rings let them see how far along that chain already is. The game is arriving
first. That is the Vision's chain —
*miner → cargo → hauler → route → pirates → patrol* — made readable at the scale where the player
chooses which link to touch.

### The rAF park (D8) — with the live-sim caveat

**`'galaxyMap'` is deliberately NOT in `PAUSING_SCREENS`.** The sim runs underneath. A naive park
freezes live contact positions. Therefore:

**Park (cancel the rAF entirely) only when ALL of these hold:**

1. `|_zoom - _targetZoom| <= 0.0005`
2. `_scanRings.length === 0`
3. `_iris === null`
4. `levelForZoom(_zoom) !== 'local'` **or** the LOCAL scan sweep has completed a full period since
   the last user input
5. **no live contact is inside the current view** — i.e. no `_localIntel` track with
   `confidence >= LOCAL_MEMORY_MIN_CONFIDENCE` whose projected position falls inside the camera span
6. no pointer or key event on the root in the last **250 ms**
7. the deck memo key is unchanged
8. no route executor is running (`readRouteExecutorForMap(state.nav.executor)` is falsy)

**Whenever a live contact is visible, keep the existing ~15 Hz gate** (the `now - _lastDrawTime >= 64`
tick). Do not throttle below that with the sim running — the chart would show ghosts.

**Wake events** — each calls `_wake()`, which re-arms `requestAnimationFrame` if `_animFrame == null`
and `_visible`:

`pointerdown` · `pointermove` · `pointerup` · `wheel` on `.gm-viewport` · `keydown` on root ·
layer toggle · inspector tab change · commodity pin/unpin · deck sort toggle · search input ·
bookmark activate · `<details>` toggle on the left rail · and bus events
`nav:routeChanged` · `nav:executorChanged` · `sector:enter` · `entity:killed` (already subscribed via
`_subscribeKills`) · `encounter:fired` · `claim:raidWarning` · `faction:aggro`.

`onHide()` remains the only teardown (grammar §11: **there is no `dispose` hook**, and `onHide()`
takes no arguments). It must `cancelAnimationFrame`, null `_animFrame`, and release every new bus
subscription added above, in the same pattern as the existing `_unsubscribeKills()`.

**Do not park by moving motion into CSS.** `check:ui-frame-sleep` cannot see compositor-side
`infinite` keyframes; a CSS-driven idle animation is an invisible regression.

## 1.9 Progressive disclosure — exactly three tiers

| Tier | Trigger | Chart contents |
|---|---|---|
| **1 — Decide** | always visible | the slab with the active FILL/PIPS/RING/MARKS/THREADS; the cargo deck's 6 rows (source, commodity, lane, load, pressure, margin, risk); the CREST live line (sector, confidence band, wanted word, director pressure, credits); the APRON verb column |
| **2 — Why** | hover / focus, **no click** | `[data-why]` on: every deck row (enumerated danger phrase + MODEL/MEMORY reason) · every pip (commodity, signed pressure, the regional reason from `REGIONAL_ECONOMY_PROFILES`) · every sector cell (`CAUSE_PHRASES.danger` + `.pricePressure` for its drivers) · the director pressure bar (non-zero accrual terms) · every traffic bucket (`TRAFFIC_ROLES[...].label` list + FORECAST/OBSERVED/UNSURVEYED) · every claim MARK (specialization `short`, `claimDefenseRating`, `repelChance`) |
| **3 — Record** | one click → DRAWER (the right inspector, already a drawer) | the 8 existing inspector tabs, plus the **Dossier** contents folded into `overview`/`economy`/`threat`/`discovery` as described in §1.10. Never opens a second modal. |

## 1.10 The sector dossier — where the 24+24+14 profiles land

No new tab. The existing 8 tabs absorb it, and `resolveInspectorTabAvailability` gains real reasons
where it currently has none:

| Tab | Gains |
|---|---|
| `overview` | regional identity: `REGIONAL_ECONOMY_PROFILES[sectorId].primaryRole` + `secondaryRoles`; the ecology family from `getRegionalEcologyProfile(sectorId)`; the history band word |
| `economy` | **now never empty** — model beacons (§1.6). Adds the region's `produces` / `consumes` lines with weights, and the per-pinned-commodity pressure table. `available: true` with reason `'Modelled pressure everywhere; remembered quotes where you have traded'` |
| `threat` | `sectorSignalFor` danger + `driver.danger` phrase + `trend.danger`; `effectiveDangerTierFor`; the zones from `zonesForSector(sectorId)` with `zoneThreat`; `rumorReadoutForZone` per zone (`PIRATE_RUMOR_THRESHOLD = 3`); `pirateBaseCandidates(state, sectorId)`; `state.conflicts[pairKey]` for every `conflictPairsForSector(sectorId)` with its `tension` and `state` word |
| `discovery` | existing confidence + **belt health**: `fieldMemoryReadout(state, fieldId)` / `fieldMemoryBand(depletion)` per authored field in the sector |
| `history` | availability broadened: currently only World Sites with a ledger. Add `lossesFor(state, sectorId)` (`MAX_PER_SECTOR = 8`) rendered as `latestLossLine`-style rows, and the history band. New reason: `'{n} recorded losses in this sector'` / `'Nothing has been lost here that you know of'` |
| `services` | unchanged |
| `travel` | per-leg RISK ladders added to the existing leg list |
| `missions` | unchanged |

**Claims (`holdings` layer) inspector block** — READ + GO only:
identity, `BODY_SPECIALIZATION_BY_ID.get(specId).short`, fitted `modules[]` names from
`BODY_MODULE_BY_ID`, `claimDefenseRating(body, bodies)`, `repelChance(rating)` as a percentage,
raid exposure from `raidTripChance(danger)` gated by `RAID_SECURITY_FLOOR = 0.5`, and the last
`claim:receipt`. Verbs: **Plot course to it** and **Show its sector**. Nothing else.

Subscribe the Chart to `claim:claimed`, `claim:raidWarning`, `claim:raided`, `claim:raidRepelled`,
`claim:defenseResolved` — currently **zero** `claim:*` events are subscribed by any UI file. A live
`claim:raidWarning` promotes that claim's MARK to `--live` and wakes the rAF.

## 1.11 Reduced motion + forced-colors

`prefersReducedMotion()` from `src/ui/effects/effectRuntime.js` must be called by the screen —
the global blanket only neutralises CSS, not canvas or WAAPI. The Chart already samples this into
`_reduceMotion` at show time; extend it to the new channels.

| Channel | Reduced motion | `forced-colors` |
|---|---|---|
| Label scramble | not animated; prints `STALE · {n}d` immediately | unchanged (text) |
| Pressure thread march | static arrowheads at fixed intervals along the edge + printed `→ Δp 0.42` | arrowheads survive (stroke); tint drops |
| Traffic dash velocity | static dash pattern; the FREIGHT bar and `×{n.n}` density print instead | dashes survive |
| Deck re-sort SETTLE | rows swap instantly | n/a |
| Risk ladder ramp | no colour ramp animation | ladder is **segment count** (shape) + the printed word — fully legible with no colour |
| Pips | no arrival animation | direction is a **triangle**, magnitude is **height** — colour is decoration |
| Director pressure bar | no fill animation | prints `84 / 140` |
| Claim `--live` promotion | no motion; the MARK gains a printed `RAID` tag | tag survives |
| Ghost-preview thread | drawn immediately, no fade | drawn as a dashed stroke |

**A reduced-motion Chart is never a blank Chart.** Every static form above is authored, not a
degradation.

## 1.12 Layout — CREST / STAGE / APRON / DRAWER

The current DOM is **four** regions (`.gm-head`, `.gm-left-rail`, `.gm-viewport`,
`.gm-right-inspector`). Mapping to the skeleton without a rebuild:

```
┌──────────────────────────────────────────────────────────────────────┐
│ CREST  .gm-head                                             ~11%     │
│   MICRO "STAR CHART"                                                 │
│   DISPLAY  {current sector name}      ← the ONE display element      │
│   live line: {history band} · {confidence} · WANTED T{n} ·           │
│              pressure 84/140 · {credits} cr                          │
│   [search] [scale rail Local|System|Galaxy] [?] [Close]              │
├──┬────────────────────────────────────────────────────────────┬──────┤
│D │                                                            │  D   │
│R │ STAGE  .gm-viewport  <canvas>                     ~63%     │  R   │
│A │        PUSH / PLOT. All 6 channels paint here.             │  A   │
│W │                                                            │  W   │
│E │                                                            │  E   │
│R │                                                            │  R   │
├──┴────────────────────────────────────────────────────────────┴──────┤
│ APRON  .gm-apron                                            ~26%     │
│  ┌──────────────────────────┬───────────────┬────────────────────┐   │
│  │ .gm-deck        62%      │ ribbon  20%   │ verbs        18%   │   │
│  │ 6 rows × 7 columns       │ legs + per-   │ SORT BEST/SAFEST   │   │
│  │ scroll to 12             │ leg risk      │ PLOT COURSE        │   │
│  │                          │ ladders       │ ENGAGE ROUTE       │   │
│  │                          │               │ PIN COMMODITY      │   │
│  └──────────────────────────┴───────────────┴────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

**DRAWER left** (`.gm-left-rail`): the lens banks (PLACE / FLOW / TROUBLE), missions, bookmarks,
route alternatives, chart key. Already `<details>` sections — keyboard-operable and
`forced-colors`-safe with no JS of ours. Collapses to a **44 px spine** of layer icons.

**DRAWER right** (`.gm-right-inspector`): the 8 tabs + tier-3 record. Collapses to a **44 px spine**.

### The APRON's one hard implementation rule

`.gm-ribbon` is currently an **absolute overlay inside the viewport, not a flex child** — the comment
at `galaxyMap.js:~4961` explains exactly why: a flex child resizes the canvas whenever a route arms,
which fires the `ResizeObserver` and re-projects the chart. At Tethys, whose frames are 12,288 WU
apart, that jump is indistinguishable from a projection defect.

> **Therefore: the APRON reserves its height at mount and never toggles it.**
> `--gm-apron-h: 232px` is set on `#sf-galaxymap` in `injectStyle()`'s CSS at mount time. The APRON
> is a permanent flex child of `.gm-body-container`'s column. Its *contents* change; its *height*
> never does. The ResizeObserver fires **once**, at mount.
> Route ribbon content moves **into** the APRON's centre column. It is no longer positioned
> absolutely and no longer toggles `hidden` — when no route exists it renders the empty-state line
> `No course laid — pick a row on the left, or double-click a mark.`

This also repairs a live grammar §6 violation: **"the APRON must always contain at least one verb."**
Today the ribbon (the only verb-bearing band) is `hidden` whenever no route exists. With the deck and
the sort toggle permanently resident, the APRON always holds ≥1 verb.

### Type assignments (grammar §3, no fifth role, 12 px floor)

| Element | Role | Face / size |
|---|---|---|
| current sector name (CREST) | **DISPLAY — the one per screen** | Saira SemiCondensed 700 / 28 px |
| `STAR CHART` above it | MICRO | Saira 600, uppercase, `.18em`, **12 px** |
| lane, column heads, bank labels, verb buttons | SUBHEAD | Saira 600 / 15 px |
| commodity name, risk word, all prose, `[data-why]` | BODY | IBM Plex Sans 400/500 / 13–14 px |
| **MARGIN** | DATA | IBM Plex Mono 500 / **20 px**, `tabular-nums` |
| load, Δp, pressure numbers, `84 / 140`, ETA | DATA | IBM Plex Mono 500 / 13 px, `tabular-nums` |

`.gm-title`'s current 'Star Chart' string demotes to the MICRO label. Nothing on this screen renders
below 12 px. Canvas text uses the existing `FONT_*` helpers only.

### Class names (grammar §8 — load-bearing)

New: `gm-apron`, `gm-deck`, `gm-deck-row`, `gm-deck-risk`, `gm-deck-seg`, `gm-pip-row`, `gm-pip`,
`gm-bank`, `gm-weather`, `gm-spine`. **None** contains `pulse` / `blink` / `flash` (which
`sf-reduce-flash` blanket-kills) or `panel` / `card` / `menu` / `modal` (which `forced-colors` strips
of `background-image`, `box-shadow` and `filter`). State suffixes use the approved set:
`--latch` `--spool` `--settle` `--live` `--spent` `--locked`.

Do not rename the five `screenManager` functions (`syncHudAccessibility`, `_isRestorableOpener`,
`_restoreFocus`, `_ensureFocusIn`, and the `hud.inert` line) — `check-ui-a11y` asserts them as
literal source substrings.

---

# §2 — THE FOOTPRINT

## 2.1 Concept, archetype, verb, silhouette

**Archetype:** a board you trace. **Primary manipulation:** TRACE — grab a node and walk an edge from
cause to consequence.

**The gap it fills.** Verified: crime leaves **no record** (`state.player.heat` is a 0..1 scalar that
*decays*; there is no crime log, rap sheet, or bounty history anywhere). Faction standing leaves **no
record** (scalar overwrite, shown as a deliberately numberless dial). `state.player.bounty` appears
in **zero** UI files. So the world reacts to the player and the player cannot see why.

**The causal chain is already emitted with its payload.**
`collision → law:incidentReceipt → faction:repChanged {reason} → faction:repSpillover {srcFaction}
→ faction:aggro → hostile patrol` is fully reconstructible from events that already fire. The
Footprint is a **listener**, never a second writer.

**Silhouette with all text removed:**

> A mostly **empty** dark board. A sparse left-to-right directed graph: a handful of small glyphs at
> four unlabelled vertical stations, joined by hairlines. **One thick, bright path** runs from a
> single left-edge glyph to two or three right-edge glyphs; everything not on that path is recessed
> to ~22 % opacity. A faint field of tiny characters behind everything, denser at the top. A shallow
> band at the bottom with four wide buttons.
>
> **No repeating rows. No dense point field. Nothing rectangular tiles.**

Swap-test against the Chart: the Chart is dense-and-regular, the Footprint is sparse-and-directed.
The two descriptions cannot be exchanged.

## 2.2 The graph — structure

**Four columns, fixed. Columns are causal depth, not time.**

| Col | Name | Node type | Glyph | Source event |
|---|---|---|---|---|
| **0** | **ACT** | what you did | filled triangle | `entity:killed` (player attacker), `combat:nonlethalResolution`, `massline:tumbled`, `surrender:option` |
| **1** | **INCIDENT** | what the law recorded | square with a corner notch | `law:incidentReceipt` row `{ incidentId, cause, outcome, attackerId, targetId, stationId, text, t, tick }` |
| **2** | **STANDING** | which faction moved | ring segment | `faction:repChanged { factionId, delta, reason, newRep, newTier, tierChanged }` |
| **2s** | **SPILLOVER** | a faction you never touched | ring segment, **dashed, hollow** | `faction:repSpillover { factionId, delta, srcFaction }` |
| **3** | **CONSEQUENCE** | what now hunts, blocks, or costs you | outward chevron | `faction:aggro`, bounty delta, `namedAce:appeared`, `dockAccess` transition, `claim:raidWarning` |

Vertical order within a column is recency, newest at top. Node horizontal position is its column;
nothing floats.

**A chain** is a connected component spanning columns 0→3 (or any prefix of it). At most **48** chains
persist (§3.2). The board shows the newest 12; older chains are reachable from the DRAWER's chain
index.

### 2.2.1 The join key — specified, because nothing correlates these events structurally

`law:incidentReceipt` carries `incidentId` and `tick`. `faction:repChanged` carries `reason` but
**no incident id and no tick**. The ledger therefore joins as follows, and an implementer must not
invent anything else:

1. **The listener stamps `state.tick` and `state.simTime` at receive time.** The bus is synchronous,
   so a `repChanged` emitted inside the same frame as its incident carries the same tick.
2. **Open-incident window.** On `law:incidentReceipt`, record
   `openIncidents[incidentId] = { tick, cause, stationId, factionId, chainId }`.
   An entry expires after `JOIN_WINDOW_TICKS = 2` ticks or when 16 entries are open (oldest evicted).
3. **`faction:repChanged` joins** to an open incident when **both**:
   - `receivedTick - incident.tick <= JOIN_WINDOW_TICKS`, **and**
   - `REASON_TO_CAUSE[reason]` includes `incident.cause` (a small, enumerated map — see §3.6).
4. **`faction:repSpillover` joins to its parent** by `srcFaction` + same tick. The spillover path also
   emits a **second `repChanged`** with `` reason: `spillover:${reason}` `` when the tier changed —
   **dedupe against it.** A spillover contributes exactly **one** edge, never two. Detection: a
   `repChanged` whose `reason` starts with `spillover:` and whose `factionId` already has a
   spillover node on this chain at this tick is dropped.
5. **A failed join renders as a ROOT NODE in its own column — never dropped, never guessed.**
   A `repChanged` with no matching incident becomes a chain whose `rootKind` is `'orphan'` and whose
   column-0 slot is empty. On the board it draws with a **short stub edge into nothing** on its left.
   That stub is the visible honesty mark: *"your standing moved and the board does not know why."*
   It is not an error state and it is not hidden.

This rule is the difference between a traceable ledger and a silent data loss nobody notices.

## 2.3 Outcome types — surrender becomes visible

**Verified gap:** the player currently cannot tell a mercy outcome from a kill. `surrenderRecovery.js`
(53 KB) runs non-lethal capture, tethered prisoners, custody handoff and escape, and none of it
reaches the UI. Every ACT / INCIDENT node therefore carries exactly one **outcome badge** from this
closed set:

| # | `outcome` | Badge | Emitted by |
|---|---|---|---|
| 1 | `destroyed` | solid disc | `entity:killed` |
| 2 | `surrendered_secured` | disc with an inward tick | `surrender:secured` → `law:custodyTransfer` |
| 3 | `surrendered_escaped` | broken disc | `surrender:escaped` (`SURRENDER_ESCAPE_S = 45`) |
| 4 | `surrendered_lost` | hollow disc | `surrender:recoveryLost` |
| 5 | `disengaged` | open crescent | receipt `outcome: 'sanctuary_withdrawal'` / `'protected_withdrawal'` |
| 6 | `recovered` | disc with an outward tick | `freight:recovery` |
| 7 | `abandoned` | crossed disc | `freight:recoveryAbandoned` |
| 8 | `repelled` / `raided` | shield / cracked shield | `claim:raidRepelled` / `claim:raided` |
| 9 | `witnessed_only` | ring only | receipt `outcome: 'distress_received'` / `'dispatch_unavailable'` with no joined rep edge |

Badge shape is the primary channel; colour is secondary (grammar §4). Under `forced-colors` the badge
is still a distinct outline shape, and the DRAWER prints the outcome word.

**Mercy is legible at a glance:** a chain ending in `surrendered_secured` reads structurally
different from one ending in `destroyed`, from across the board, with no text.

## 2.4 What is shown — exhaustive

### Tier 1 — always on the board

| Element | Source |
|---|---|
| the graph (12 newest chains), 4 columns | `state.provenance.chains` (§3) |
| per-node: type glyph, faction colour ring, outcome badge, age hairline | node record |
| **`CLEAN` / `WANTED`** — the one DISPLAY element | `isPlayerWanted(state)` (`state.player.heat >= THRESHOLD`) |
| standing bounty, in credits | `state.player.bounty` — **appears in zero UI files today** |
| heat level `T{n}` + clear time | `heatLevelFor(state.player.heat)`, `heatClearSecondsForLevel(level)`, `heatRadiusForLevel(level)` |
| open-chain count | chains with `open === true` |
| the heat glyph field behind the board | `glyphMatrix`, density = `state.player.heat` (§5 row) |

**`heat` and `bounty` are different quantities and are never merged.** Heat is `0..1`, decays, and
governs *who is currently looking for you within a radius*. Bounty is standing credits, does not
decay, and governs *whether a bounty-hunter script can exist at all*
(`encounterScripts.js:2421` — "only exists while `state.player.bounty` stands"; `encounterDirector.js:400`
adds `0.25` to combat pressure while it is non-zero). Two readouts, two verbs, one screen.

### Tier 2 — hover / focus, no click

| Node type | `[data-why]` content | Bank |
|---|---|---|
| ACT | the outcome word + the target's faction short name | fixed |
| INCIDENT | **the receipt's own `text` field**, authored inside `lawSecurity.js` (e.g. `"PLAYER FIRED FIRST — self-defense authorized; break contact to disengage."`) | authored at source, not invented here |
| STANDING | `repReasonLabel(reason)` + signed delta + `newTier`; if `tierChanged`, the tier-crossing line | `REP_REASON_LABELS` (§3.6) |
| SPILLOVER | `"ally/rival spillover ({base reason}) — {srcFaction short}"` — this exact wrapper already exists in `src/ui/screens/factions.js:76-79` | same |
| CONSEQUENCE | `factionRiskText(rep)` and `factionNextTierText(rep)` — **already exported** from `src/ui/screens/factions.js` | same |
| named ace node | `{name} · {crew} · {gimmickTag}` from `src/data/namedAces.js`; `returnTier` chevrons | authored data |
| bounty readout | the fixed line naming the two consumers: bounty-hunter script availability and director pressure | fixed |

**Unknown `reason` → the edge renders, the phrase renders nothing.** (Grammar §1.3; the precedent is
`causeLedger.js`.)

### Tier 3 — one click → DRAWER (never a second modal)

The selected chain, in full, as rows. This is where the spreadsheet is allowed to live:

- every node with `t` (via `formatLedgerCycle(t)` from `shipLedger.js`), `tick`, `delta`, `newRep`,
  `newTier`, `stationId`, `sectorId`
- the linked `shipLedger` prose entry — `buildShipLedger(state, { page, pageSize })`,
  `SHIP_LEDGER_PAGE_SIZE = 12`, `SHIP_LEDGER_MAX_ENTRIES = 240`. **The ship ledger is currently a
  live prose diary that is not queryable, filterable, or sortable.** In the DRAWER it becomes all
  three: filter by `outcome` (the 9 types), by faction, by sector; sort by time or by `|delta|`.
- the `lossLedger` provenance line for the sector (`latestLossLine(state, sectorId)`), plus the
  wreck-class label if `aftermathWrecks` placed one for this `lossId`
- the `aceMemory` record if a named ace is on the chain:
  `{ name, crew, gimmickTag, encountered, fled, defeated, encounterCount, fleeCount, flungCount, returnTier, returnsBigger }`
  from `state.aceMemory[aceId]`
- held titles from `state.titles` (`TITLES` currently has one, `title_thunderchild`;
  `TITLE_HISTORY_LIMIT = 32`) shown as chain terminals when the chain earned one
- the chain's `open` reason (unpaid bounty / active aggro / outstanding amends)

### The named-ace surface — enemies who remember, finally named

`aceMemory.js` tracks 12 authored named aces and `hunterTricks.js` ships 10 tricks. **Nothing anywhere
names them.** On the Footprint:

- A CONSEQUENCE node of type `ace` wears the ace's name in SUBHEAD and `returnTier` as 0–3 chevrons
  (`PIRATE_PROMOTION_MAX_TIER = 3`).
- `rec.fled === true && rec.returnScheduled === true` renders the node in `--live` with the static
  word `RETURNING`. `rec.returnsBigger` adds `· BIGGER`.
- `rec.flungCount > 0` — the ace you threw with the Massline — prints `FLUNG ×{n}`. This is the
  Vision's *"the world remembers what you did"* in one field.
- Tricks the ace has used against the player are listed in tier 3 from `HUNTER_TRICKS[id].name`
  (`tether-cutter`, `mine-dropper`, `phase-jammer`, `shield-turtle`, `ram-plate`, `decoy-clone`,
  `emergency-jump-spool`, `wake-mines`, `pd-curtain`, `sensor-ghost`). Enumerated data; never invented.

## 2.5 The board is DOM + SVG, not canvas — a binding implementation call

| Reason | Detail |
|---|---|
| gamepad | `spatialFocusTarget` (`src/ui/input.js`) works on **any** DOM with no registration. A canvas board would need a bespoke focus model. |
| `forced-colors` | DOM/SVG survives it; canvas does not participate at all. |
| screen readers | nodes become real `<button>`s with labels; a canvas board needs a parallel DOM mirror. |
| the font trap | Canvas 2D silently ignores `var()` in `ctx.font`. That defect is *live in this repo* — the tech tree renders in the wrong font at the wrong size on every frame with nothing reporting it (grammar §11). DOM text cannot have this bug. |
| size | ≤48 chains × ≤12 nodes = ≤576 elements worst case, and only 12 chains are on the board. Trivially DOM-sized. |

Nodes are `<button class="fp-node">` absolutely positioned in a CSS grid of 4 columns. Edges are a
single `<svg class="fp-edges">` of `<path class="fp-edge">` behind them, `pointer-events: none` except
on a widened invisible hit stroke. The heat field behind everything is `glyphMatrix`.

## 2.6 Actions — the APRON always holds ≥1 verb

Five verbs. Each ships **disabled-with-a-spoken-reason**, never a silent no-op — the same contract
`galaxyMap.js` already uses for `#gm-engage-route-btn`.

| Verb | Enabled when | Cost / effect | Disabled reasons (enumerated) |
|---|---|---|---|
| **PAY BOUNTY** | `state.player.bounty > 0` and credits ≥ bounty | clears `state.player.bounty` via an economy **intent**; the Footprint never writes credits | `"No bounty stands against you."` · `"{n} cr short."` |
| **BRIBE** | a STANDING node is selected and `bribeCost(factionId)` is finite and > 0 | pays `bribeCost`; raises rep to the `-29` floor via the faction system's own path | `"Not hostile — nothing to clear."` (cost 0) · `"Too hated to bribe."` (`Infinity`, i.e. `rep <= -400`) · `"{n} cr short."` |
| **FIND THE ACCUSER** | the selected chain has an INCIDENT node with a `stationId` | sets a nav waypoint to that station and closes the screen | `"This chain has no recorded jurisdiction."` |
| **TAKE THE AMENDS CONTRACT** | the selected faction is below `-30` and offers one | reveals and accepts a restitution contract through the existing missions offer path | `"{faction} is not owed anything you can repay."` · `"No amends contract on offer — dock with {faction} to ask."` |
| **SHOW ON CHART** | the selected chain has a `sectorId` | opens the Chart via `resolveMapOpenTarget(state, intent)` + `applyMapOpenIntentToView(view, intent, state)`, framed on that sector | `"This chain is not tied to a place."` |

Every verb terminates in something the player's own ship does or pays. **There is no verb here that
commands another vessel** (§0.1).

**Producer-side note for TAKE THE AMENDS CONTRACT** — the only verb that is not purely a listener +
existing consumer. Minimum shape, to be produced by the missions/contracts side, not by this screen:
`{ id, factionId, sourceChainId, kind: 'amends', repReward, creditCost, objective }`. Until that
producer exists the verb renders permanently disabled with the second reason above. **It must not be
faked.**

## 2.7 Symbolic, not numeric — and why each reads

| Quantity | Symbol | Why it reads intuitively |
|---|---|---|
| rep **magnitude** | ring **arc length** on the STANDING node | matches the numberless coloured dial already shipped in `src/ui/screens/factions.js`; the Footprint's arc is that dial's *increment*, so the two agree by construction |
| rep **direction** | arc grows clockwise (gain) / counter-clockwise (loss) | a needle going the wrong way is understood without a legend |
| **spillover** | dashed edge + **hollow** ring segment | "this one wasn't aimed at you" is literally a lighter mark |
| **causal direction** | edge march, col N → col N+1 | grammar §5 "Tree edge march ← dependency direction" — the same verb the Chart uses for pressure. **Learn it once, read it everywhere** (§1.1 of the grammar). |
| **age** | edge hairline thickness decays with `simTime` distance | old chains recede without a date on them |
| **heat** | `glyphMatrix` field density behind the board | grammar §5 "Glyph-field density ← `heat`" |
| **mercy vs kill** | outcome badge shape (§2.3) | shape, at a glance, from across the board |
| **an ace's grudge** | `returnTier` chevrons, 0–3 | more chevrons, more trouble; no scale to learn |
| **an unexplained standing change** | a stub edge into nothing | the board admitting it does not know, visibly |
| **bounty** | *not symbolic* — a number | bounty is credits you can pay; abstracting it would be dishonest |

## 2.8 Animation and interaction — TRACE as a small game

### The interaction

- **Pointer:** press a node → LATCH (~90 ms, `ui_confirm`). Drag along an edge → the traversed path
  lights (`fp-edge--march`, `--live`); everything off-path drops to 22 % opacity. Release keeps the
  path lit. `Esc` clears.
- **Keyboard:** `←/→` walk columns along the current chain; `↑/↓` change node within a column;
  `Enter` opens tier 3; `Esc` clears the trace. Roving `tabindex` across nodes.
- **Gamepad:** free via `spatialFocusTarget` because nodes are real DOM buttons (§2.5).

**Why it is a small game and not a log.** There is **no list of incidents at tier 1**. The only way to
reach a record is to walk to it. The board rewards walking: tracing to the end of a chain is how you
discover that the corvette you shot at Helios is why a faction you have never met has a patrol looking
for you. The lit path is a *drawing you made*, and it persists while you read the APRON. That is the
TRACE verb doing real work, not decoration.

### Grammar §9 techniques used

| § | Technique | Where |
|---|---|---|
| **9.1** | direct manipulation of a real object | you grab an edge and walk it |
| **9.4** | state-encoding animation | the edge marches in the direction causation actually flowed |
| **9.5** | hover-reveals-cause | `[data-why]` on every node |
| **9.7** | spatial hit-testing over lists | the graph *replaces* the list — this is the whole design |
| **9.9** | earned reveal | a CONSEQUENCE node **arrives** the moment it becomes true (`faction:aggro` fires and a chevron appears on a chain you already traced) |
| **9.10** | sound on state change | `ui_hover` on node (rate-limited ~40 ms), `ui_confirm` on select, `ui_alert` on a chain gaining a CONSEQUENCE while open |

### Grammar §5 motion rows used

| Motion | Named state variable | Static equivalent (authored) |
|---|---|---|
| Tree edge march | causal direction (col N → N+1) | a printed `→` arrowhead at the edge midpoint |
| Glyph-field density | `state.player.heat` | `WANTED · TIER {heatLevelFor(h)}` printed in the CREST |
| Gauge snap-back / SETTLE | the rep arc arriving at `newRep` | the printed signed delta and `newTier` |
| Overshoot amplitude | *not used* — the Footprint has no hull on it | — |

The bounty figure **counts** to its new value; it never snaps (grammar §5: "Numbers count; they do
not snap"). Text never overshoots. Nothing exceeds **180 ms**.

**When nothing is traced, the board is completely still.** No idle animation, no ambient drift. The
Footprint moves only when you move along it — which is also how its rAF parks (§2.11).

## 2.9 Progressive disclosure

| Tier | Trigger | Contents |
|---|---|---|
| **1 — Decide** | always visible | the graph; column headers; the `CLEAN`/`WANTED` DISPLAY word; bounty in credits; heat tier + clear time; open-chain count; the APRON's five verbs |
| **2 — Why** | hover / focus, **no click** | the `[data-why]` table in §2.4 |
| **3 — Record** | one click → DRAWER from the right edge | the full chain record in §2.4, the queryable/filterable/sortable ship ledger, the loss-ledger provenance, the ace record, held titles. **Never opens a second modal.** |

## 2.10 Reduced motion + forced-colors

| Channel | Reduced motion | `forced-colors` |
|---|---|---|
| Edge march | no march; a static `→` arrowhead at each edge midpoint | arrowhead is a stroke — survives |
| Trace lighting | path lights instantly, no travel | off-path recession uses opacity, which survives; the traced path additionally gains a **thicker stroke** so it is distinguishable with no colour at all |
| Heat glyph field | static field at the correct density (still encodes heat) | field is hidden; `WANTED · TIER {n}` prints in the CREST |
| Rep arc SETTLE | arc appears at final value | arc is a stroked path — survives; delta prints beside it |
| Bounty count-up | prints final value immediately | unaffected (text) |
| Node arrival (earned reveal) | node appears, no scale-in | unaffected |
| Outcome badges | n/a | badges are **outline shapes**, not fills — all 9 remain distinguishable |
| Faction identity | n/a | ring colour drops; the faction **short name** is printed on the node — never colour-alone |

`prefersReducedMotion()` from `src/ui/effects/effectRuntime.js` must be called by the screen; the
global blanket only neutralises CSS.

## 2.11 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ CREST  .sf-crest                                            ~12%     │
│   MICRO "FOOTPRINT"                                                  │
│   DISPLAY   WANTED            ← the ONE display element              │
│   live line: 2,400 cr standing · HEAT T3 · clears in 4:10 ·          │
│              radius 3,200 wu · 4 open chains                         │
├──────────────────────────────────────────────────────────────────────┤
│ STAGE  .sf-stage   the board                                ~60%     │
│                                                                      │
│   ACT ──────── INCIDENT ─────── STANDING ─────── CONSEQUENCE         │
│    ▲               ▣               ◜                  ❯              │
│                     ╲              ◜ (dashed = spillover)            │
│                      ▣ ─────────── ◜ ──────────────── ❯              │
│                                                                      │
│   (glyphMatrix heat field behind, density = state.player.heat)       │
├──────────────────────────────────────────────────────────────────────┤
│ APRON  .sf-apron                                            ~28%     │
│  ┌────────────────────────────────────┬───────────────────────────┐  │
│  │ selected chain readout      64%    │  verbs             36%    │  │
│  │ root act · outcome badge · the     │  PAY BOUNTY               │  │
│  │ enumerated reason line · factions  │  BRIBE {faction}          │  │
│  │ moved · what it cost you           │  FIND THE ACCUSER         │  │
│  │                                    │  TAKE THE AMENDS CONTRACT │  │
│  │                                    │  SHOW ON CHART            │  │
│  └────────────────────────────────────┴───────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                    DRAWER ──▶ slides from the RIGHT
```

**Full-bleed.** No centred card over a background image (grammar §6 — that single pattern is most of
the current "cheap web game" read).

**Its own opaque backdrop.** `#screens` carries a permanent background JPG that every screen
inherits; without a per-screen backdrop the Ship bay and the Footprint read as the same room. The
Footprint's backdrop is a flat near-black plate with a faint horizontal grain — a **board**, not a
window. It must not be a starfield; the Chart owns space.

### Type

| Element | Role | Face / size |
|---|---|---|
| `WANTED` / `CLEAN` | **DISPLAY — the one per screen** | Saira SemiCondensed 700 / 40 px |
| `FOOTPRINT` above it | MICRO | Saira 600, uppercase, `.18em`, **12 px** |
| column headers, node names, verb buttons, the chain readout headline | SUBHEAD | Saira 600 / 15–19 px |
| all reasons, `[data-why]`, DRAWER prose | BODY | IBM Plex Sans 400/500 / 13–14 px |
| bounty credits, deltas, `newRep`, tick, clear time | DATA | IBM Plex Mono 500 / 13–20 px, `tabular-nums` |

**The verb outranks the number** (grammar §3): *"Tows a 40-tonne hauler"* pattern applies —
`"Pays off the Concord warrant"` at SUBHEAD 19 above `2,400 cr` at DATA 13, never the reverse.

### Class names

`fp-board`, `fp-col`, `fp-node`, `fp-edge`, `fp-edges`, `fp-chain`, `fp-badge`, `fp-arc`,
`fp-readout`, `fp-verb`, `fp-heat`, plus the skeleton classes `sf-crest`, `sf-stage`, `sf-apron`,
`sf-drawer`. **None** contains `pulse` / `blink` / `flash` / `panel` / `card` / `menu` / `modal`.
State suffixes: `--latch` `--live` `--settle` `--spent` `--locked`.

Adopt `src/ui/uiPrimitives.js` for the APRON buttons and DRAWER rows (grammar §10 — it currently
ships in zero live screens). Do **not** add a private style injector.

### Registration

1. `src/ui/uiRoot.js` — add to `SCREEN_MODULES`:
   `{ path: './screens/footprint.js', load: () => import('./screens/footprint.js'), name: 'footprintScreen' }`
2. `src/ui/screenManager.js` — add `'footprint'` to `PAUSING_SCREENS`. It is a records screen; it
   pauses. (The Chart deliberately does not, which is why §1.8's park rules are more complicated.)
3. **Entry points:** the pause screen, the Codex shelf, and a tier-3 link from the Chart's `threat`
   and `history` inspector tabs.
   **Do not add an 8th station-dock destination** — `check-station-tab-navigation-runtime` pins the
   dock's 7 destinations, their roles, and the roving `tabindex`. Adding one without updating that
   check turns it red.

### The rAF park

The Footprint's board is static DOM. **It has no rAF loop at all** except while a trace is being
dragged or a rep arc is settling. Both are bounded by `180 ms` and are WAAPI/`requestAnimationFrame`
one-shots that self-cancel. `onHide()` cancels any outstanding handle and releases every bus
subscription. There is no `dispose` hook and `onHide()` takes no arguments.

The heat glyph field re-renders **on `heat` change only** — subscribe to whatever `heat.js` emits on
`player.heat` transitions, or poll at 1 Hz with a `setInterval` cleared in `onHide()`. It must not be
an `infinite` CSS keyframe (`check:ui-frame-sleep` cannot see those).

---

# §3 — The provenance ledger — data contract

`src/systems/provenanceLedger.js`. **A listener. Nothing else.**

## 3.1 Subscriptions — the complete, closed list

```
law:incidentReceipt              faction:repChanged            faction:repSpillover
faction:aggro                    law:custodyTransfer           combat:nonlethalResolution
surrender:secured                surrender:escaped             surrender:recoveryLost
freight:recovery                 freight:recoveryAbandoned     claim:raided
claim:raidRepelled               claim:defenseResolved         lossLedger:recorded
namedAce:appeared                namedAce:fled                 namedAce:defeated
encounter:namedCaptainDefeated   massline:tumbled              entity:killed
```

> **It touches neither `lawSecurity`'s ring buffer (`state.lawSecurity.receipts`, `RECEIPT_CAP = 24`)
> nor `factions.applyRep`'s mutation point.** It writes only `state.provenance`. It never writes
> credits, rep, cargo, or entities — the APRON's PAY BOUNTY and BRIBE verbs route through the existing
> economy and faction intents exactly as every other consumer does.

Note the existing stores actively discard history: `RECEIPT_CAP = 24`, `TRADE_LEDGER_MAX = 10`,
`lossLedger` `MAX_PER_SECTOR = 8` / `MAX_TOTAL = 64`. The ledger exists because those caps are
correct for their owners and wrong for a rap sheet.

## 3.2 Shape

```js
state.provenance = {
  v: 1,
  chains: [ChainRecord],   // cap PROVENANCE_CHAIN_CAP = 48
  openIncidents: {},       // { [incidentId]: { tick, cause, stationId, factionId, chainId } }, cap 16
  nextSeq: 0,              // monotonic, for stable ids across a session
};

ChainRecord = {
  id,            // `pv:${hash32(seed, rootTick, rootKind, rootActorId).toString(16)}` — stable across reload
  t, tick,       // simTime + tick of the ROOT node
  sectorId,
  rootKind,      // 'act' | 'incident' | 'orphan' | 'merged'
  outcome,       // one of the 9 types in §2.3
  nodes: [Node], // cap PROVENANCE_NODE_CAP = 12
  edges: [[fromIdx, toIdx, edgeKind]],   // edgeKind: 'caused' | 'spillover' | 'stub'
  open: false,
  settledAt: null,
};

Node = {
  k,             // 'act' | 'incident' | 'standing' | 'spillover' | 'consequence'
  t, tick,
  factionId?, delta?, newRep?, newTier?, tierChanged?, reason?, srcFaction?,
  stationId?, targetId?, aceId?, bodyId?, lossId?, outcome?, text?,
};
```

**JSON-safe only.** Ids and names, never live entity references. The precedent is `isJSONSafe` in
`src/systems/npcJobs.js`; the same discipline applies.

## 3.3 Cap and eviction — declared, and deliberately not FIFO

| Constant | Value | Calibration |
|---|---|---|
| `PROVENANCE_CHAIN_CAP` | **48** | above `RECEIPT_CAP` (24) so it outlives the ring buffer it observes; comparable to `TITLE_HISTORY_LIMIT` (32); far below `SHIP_LEDGER_MAX_ENTRIES` (240), which is a page-built derivation rather than a persisted store |
| `PROVENANCE_NODE_CAP` | **12** | four columns, at most three nodes per column on a real chain |
| `PROVENANCE_OPEN_INCIDENT_CAP` | **16** | join window only; two ticks' worth of concurrent incidents |
| `JOIN_WINDOW_TICKS` | **2** | the bus is synchronous; anything further apart is not the same event |

**Eviction rule:**

1. A chain is evictable **only when `open === false`.**
2. `open` is `true` while **any** of:
   - the chain contributed to the current `state.player.bounty > 0` and no bounty-cleared event has
     been seen for it;
   - any faction on the chain currently has `aggro === true`;
   - an amends contract sourced from `chain.id` is active.
3. Evict **oldest settled first** (`settledAt` ascending), never plain FIFO.
4. **If all 48 are open, do not drop.** Merge the two oldest open chains that share `sectorId` and
   root faction into one chain with `rootKind: 'merged'`, preserving the **earliest root node** and
   the **latest consequence node**, clamped to `PROVENANCE_NODE_CAP`. Record the merge as a node with
   `k: 'consequence'` and the fixed text `"Older incidents in this sector folded together."`
   **Nothing is ever silently discarded.**

## 3.4 Save

- `src/data/saveVersion.js`: `CURRENT_VERSION = 13`, with the comment line in the existing
  convention:
  `// v13: append-only crime/standing provenance chains persist under data.provenance (Footprint).`
- The system implements `serialize()` / `deserialize(data)` in the same shape as `aceMemory` and
  `lossLedger`, and a `newGame()` that resets to `{ v: 1, chains: [], openIncidents: {}, nextSeq: 0 }`.
- `deserialize` must **normalise, not trust**: clamp to the caps, drop nodes with an unknown `k`,
  drop edges whose indices are out of range, and rebuild `open` from live state rather than trusting
  the saved flag.
- `MIGRATIONS` in `src/save/migrations.js` gains a v12→v13 entry that seeds the empty shape. No
  existing save can contain chains, so the migration is a default-fill.
- **Run `node scripts/generate-save-schema.mjs --write`** — `SAVE_SCHEMA.md` is generated and
  `--check` will fail the build otherwise. (The generator emits LF deliberately; a CRLF checkout is
  normalised inside `--check`.)

## 3.5 Determinism and headless safety

- `hash32(seed, …)` from `src/core/rng.js` for chain ids — the same events produce the same ids on
  every load, matching the `lossId` discipline in `lossLedger.js`.
- The ledger performs **no rolls**. It is purely event-sourced. If the events never fire (the 47-A
  golden slice), `state.provenance.chains` stays empty and nothing leaks — the same structural
  guarantee `lossLedger` documents.
- No `three` import, no DOM, no `typeof window` gate.

## 3.6 The phrase bank and its bidirectional pin

`REP_REASON_LABELS` currently has **11 entries** and lives inside a screen file
(`src/ui/screens/factions.js:28-40`): `init`, `complete_faction_mission`, `fail_faction_mission`,
`trade_at_faction_station`, `caught_contraband`, `rescue_faction_distress`, `kill_faction_ship`,
`kill_faction_enemy_ship`, `war_won`, `war_lost`, `decay`.

**Implementation step:** promote it to `src/data/repReasons.js` and re-export it from
`src/ui/screens/factions.js` so nothing existing breaks. The Footprint imports from the data module.
A screen file is not a phrase bank.

Add, in the same file, the enumerated join map used by §2.2.1 step 3:

```js
export const REASON_TO_CAUSE = Object.freeze({
  kill_faction_ship:       ['player_attack', 'player_kill'],
  kill_faction_enemy_ship: ['player_attack', 'player_kill'],
  caught_contraband:       ['contraband_scan'],
  rescue_faction_distress: ['distress'],
  // …one row per reason that a lawSecurity cause can produce
});
```

**Pin it in both directions.** Add `scripts/check-provenance-phrases.mjs`, modelled directly on
`scripts/check-cause-ledger.mjs` (which already pins `CAUSE_PHRASES` to
`dangerModel.classifyDrivers`'s literal tag set in both directions). It must assert:

1. every `reason` string passed to `factions.applyRep(...)` anywhere under `src/systems/**` has an
   entry in `REP_REASON_LABELS`;
2. every entry in `REP_REASON_LABELS` is producible by at least one `applyRep` call site;
3. every `cause` string passed to `_recordReceipt(...)` in `lawSecurity.js` appears in at least one
   `REASON_TO_CAUSE` value, or is explicitly listed in a `CAUSES_WITHOUT_REP` allowlist.

A `spillover:` prefix is stripped before lookup (the wrapper already exists at
`src/ui/screens/factions.js:76-79`).

---

# §4 — Build order

| # | Step | Screen | Ships value alone? |
|---|---|---|---|
| 1 | Wire `riskEstimator` from `sectorSignalFor` in `buildTradeLanesModel` **and** in `src/ui/screens/localmap.js:294` | Chart | **Yes** — route ranking stops being blind on the existing surface |
| 2 | Model beacons (§1.6) | Chart | **Yes** — the Economy tab is never empty again |
| 3 | The APRON: reserve `--gm-apron-h` at mount, move the ribbon in, build the cargo deck | Chart | **Yes** — the 15-second answer, and the APRON gains its required verb |
| 4 | Multi-commodity pip row + pin verb; delete the `trade: bothCharted` label | Chart | Yes |
| 5 | The `traffic` layer + LOCAL job phase rings | Chart | Yes |
| 6 | History substrate + `events` + `holdings` layers + `claim:*` subscriptions | Chart | Yes |
| 7 | rAF park + wake list | Chart | Yes (perf) |
| 8 | Dossier fold-ins across the 8 existing tabs | Chart | Yes |
| 9 | `src/data/repReasons.js` + `REASON_TO_CAUSE` + `check-provenance-phrases.mjs` | Footprint | Yes (correctness) |
| 10 | `src/systems/provenanceLedger.js` + save v13 + `generate-save-schema.mjs --write` | Footprint | No UI yet — but the ledger starts recording, so the first Footprint build has history in it |
| 11 | `src/ui/screens/footprint.js` — board, TRACE, tiers 1–3 | Footprint | **Yes** |
| 12 | APRON verbs; amends contract producer last (it is the only non-listener dependency) | Footprint | Yes |

## Definition of done (grammar §12), per screen

| # | Criterion | Chart | Footprint |
|---|---|---|---|
| 1 | silhouette distinguishable, text removed | §1.1 | §2.1 |
| 2 | exactly one DISPLAY element; nothing below 12 px | current sector name, 28 px | `WANTED`/`CLEAN`, 40 px |
| 3 | APRON contains ≥1 verb | SORT / PLOT / ENGAGE / PIN — permanently resident (§1.12) | five verbs (§2.6) |
| 4 | STAGE responds to pointer, keyboard **and** gamepad | existing pointer + keys; deck rows and marks are focusable DOM | DOM nodes + `spatialFocusTarget` (§2.5) |
| 5 | every animation maps to a §5 row | §1.8 table | §2.8 table |
| 6 | legible + complete under reduced-motion **and** `forced-colors` | §1.11 | §2.10 |
| 7 | tier 2 "why" wired for every questionable value | §1.9 | §2.4 |
| 8 | **looked at** in a captured frame at 1440×900 **and** 1280×720 | required | required |

Must stay green: `check:ui-a11y`, `check:wcag-contrast`, `check:ui-identity`, `check:ui-frame-sleep`,
`check:ui:perf`, `check:ui-effects`, `check:one-voice`, `check-station-tab-navigation-runtime`,
`check:map-information-depth` (it drives `resolveInspectorTabAvailability` directly — §1.10 changes
its reasons, so update the expectations in the same commit).

**Known conditions that are not regressions:** `check:assets:live` fails on any dirty tree or when
`HEAD` is ahead of `origin/master`; `check-helios-sky-kit.mjs` fails on `cycle 10: core fog density`.
