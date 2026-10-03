# PB-UI-A (build_map §1C row 147) — SF-242 + SF-251 capability comparison + draft fit projection, sim halves only

**Verdict: ALREADY SATISFIED — closed 2026-10-02. No production change needed; nothing rebuilt.**

The board row asked for two sim halves (data/computation a screen consumes; the UI surface stays
ORRERY's). Both already exist on master as pure consumers of the existing derived-stats owner, and
both packets are covered children of SHIPPED next-wave parents — which per build_map §1C G/H closes
them as already true with the parent's evidence, not implemented again.

## Per-packet verdicts

| Packet | Verdict | Parent evidence | Sim half on master |
|---|---|---|---|
| SF-242 (Shipworks explains a real capability tradeoff) | **already satisfied** | child of NXB-029, SHIPPED (build_map §1C H row 184, commit `104acd116`, 2026-10-02) | `src/ui/presenters/engineeringPreview.js` — `presentLoadoutDelta` (two fits, one hull), `presentHullCompare` (two hulls, stock basis), `presentShopModuleDelta` (gained/lost chips, honest tone via authored `higherIsBetter`); every number from `ships.getDerivedStats`; capability verbs via `shipCapabilities.shipCapabilityVerbs` + `shipBandModels.capabilityBandModel` |
| SF-251 (a draft choice explains what happens to the current fit) | **already satisfied** | child of NXB-018, SHIPPED (build_map §1C H row 181, commit `3e8f6f898` + `99da18af5`, 2026-10-01) | candidate projection without mutation: `presentModuleFitPreview` (install/replace modes, displaced fitting named, never touches the live array) + `ships.dryRunLoadoutPresetApply` (whole-loadout dry run, enumerated blockers); draft decision data: survivalDraft offers carry `replaces`/`replacesName` + `available`/`unavailableReason` ('No compatible slot'), rendered live by `src/ui/orrery/crucibleArmory.js` |

Live-consumer proof (wired, not orphan code): `src/ui/station/screens/shipworks.js:3762`
(`presentShopModuleDelta`), `:3991` (`presentModuleFitPreview` ghost), `:1145` + `:1231`
(capability band, `previewSource='ships.getDerivedStats'` pinned), `:1200`
(`dryRunLoadoutPresetApply`); `src/ui/station/outfittingGuidance.js:355`.

## Evidence artifact

`test/pb-ui-a-capability-projection.test.mjs` (new, `node --test`, 5/5 green, fixed seed 4242)
pins the three named properties against the EXISTING implementation:

1. comparison honest — row deltas equal `getDerivedStats(after) − getDerivedStats(before)` for
   every metric, tone follows each metric's authored `higherIsBetter`, and the SF-242 shape holds:
   one gained physical use (shield) and one lost capability (operational mass) from one candidate;
   identical fits read all-same/zero. Symmetric — A→B is the exact mirror of B→A (deltas negate,
   tones flip, before/after swap). Hull comparison reads the same owner and answers the active hull
   as `kind:'current'` instead of a fabricated versus; unknown hull answers null, not zeros.
2. projection does not mutate the live ship — install and replace projections plus the whole-loadout
   dry run leave the live fittings array (same identity), its contents, and the whole player object
   bit-for-bit unchanged; the projected fit is a copy.
3. fail-closed — unknown module → `unknown_module` with unchanged projected fit and zero rows;
   unknown hull → `unknown_ship`; type/size mismatch, out-of-range slot, empty removal all named;
   the dry run refuses unknown hardware (`unknown_module`), unowned hardware (`missing_modules`),
   and gated hardware (`research_required`) without phantom grants.

## Adjacent results

- Adjacent suites (pq-142-00-capability-verbs, shipworks-fit-from-hold, crucible-draft,
  pq-175-02-draft-verbs, nxb-018-draft-offers, next-wave-nxb-029, shipworks-dock-*): 52/54.
- `npm run check:baseline`: 25/26 green.
- Pre-existing reds NOT from this sitting (this sitting added one test file only; both reproduce in
  isolation on the untouched tree): (a) `test/shipworks-fit-from-hold.test.mjs` "chooser emits
  ui:fitModule for hold rows" — fails against foreign dirty `src/systems/ships.js` (+114 lines in
  the ships owner's protected write-set); (b) `check:massline:arc-render` "ordinary release owns
  exactly two admitted endpoint sprites (0 !== 2)" — foreign dirty
  `src/combat/masslineReleaseGeometry.js` / `src/ui/masslineHud.js` (massline lane). For the demo
  defect ledger if the owners do not clear them first.

## Residual (ORRERY lane, pure UI)

SF-251's full player-facing surface — composing the projection onto the armory card as a visible
before/after — is the pure-UI residual the triage assigns to ORRERY ("pure-UI residuals inside
SF-241–246/251; sim halves ARE on the board"). The sim half it consumes is complete and proven.
