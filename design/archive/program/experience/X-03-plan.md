# X-03 plan — P2/P3 first purchase: the named module wears its chip

Row §1P 561. Audit `X-03-audit.md` (audit✓3). Tribunal judge, 2026-10-24.

## Scores

| draft | crit-path | authentic | specific | cost | non-redundant | total |
|---|---|---|---|---|---|---|
| Skeptic (chip on the named row) | 4 | 4 | 5 | 5 | 5 | **23** |
| Accountant (advice line + sort + clear) | 4 | 3 | 4 | 4 | 4 | **19** |
| Drifter (price/remainder line + preselect) | 4 | 5 | 4 | 2 | 3 | **18** |

The Drifter rewrites the spoken line, which is pinned as `SWING_LINE`/`VEIL_LINE` (`test/starter-progression-fit-offer.test.mjs:17-18`). It also preselects inside the ORRERY lane's screen, so the draft is invalid as written. The Accountant's sort reorders a lane-owned list. Its clear-on-purchase is spliced in. All three correctly drop `mod_thruster_stripped_s`: it removes verbs and has no `shopOffers` row. The live rack is the authority.

## Design

The voice names a module. The yard row for that module then carries one chip in the row's existing chip strip. Nothing moves by itself.

- `onboarding.js` `_maybeSpeakFitOffer` (:1277). Directly after `player.hints.fitOffer = true`, write `player.hints.fitOfferDefId = def.id`. The spoken line `Your credits cover the yard's ${def.name}.` (:1282) stays byte-identical, and the boolean stays `true`.
- `onboarding.js`: add one listener, `bus.on('module:purchased', p => { if (p?.defId && this.state.player.hints?.fitOfferDefId === p.defId) delete this.state.player.hints.fitOfferDefId; })`. `ships.js:2339` emits this after the `economy:chargeCredits` charge, so the single writers are untouched.
- `src/ui/station/screens/shipworks.js`:
  - Add an exported pure helper `fitOfferChipHtml(d, hints, purchase, equipped, credits)`. It returns `''` unless all of these hold: `hints?.fitOfferDefId === d.id`, `!equipped`, and `purchase.state` is `'fit'`, `'inventory'` or `'funding'` (the live states in `outfittingGuidance.js:87-215`).
  - It returns `<span class="sx-modrow__chip is-up">Named at the berth</span>`.
  - In the funding state it returns `<span class="sx-modrow__chip">Named at the berth · short ${fmt(price − credits)} cr</span>` instead, so a promise the purse can no longer keep says so.
  - Prepend the result to `${chips}` in the shop row at :4284.
  - No new class, token or layout. `sx-modrow__chip`/`is-up` already render the delta chips (:4105).
- No sort, no preselect, no auto-open. `recommendOutfittingPurchase` stays uncalled: a second ranker could contradict the voice.

## Copy

- `Named at the berth` (4 words; it is a label, not a rail line).
- `Named at the berth · short 300 cr` when funding.

## Numbers

No prices change. The candidates are Veil Step 4,200 (`modules.js:521`) and Swing Drive S 5,100 (`:512`), and `_fitOfferCandidate` (:1209) already ranks them. The pinned route proves the line speaks inside the hour (`fit-offer.test:119-138`).

## Save / determinism

`player.hints` gains one optional string. `hints` is a save-owned bag with no default that shallow-merges on load (`saveSystem.js:7444`). That means no version bump and no migration, and old saves simply show no chip. No sim system reads the key, so there is no digest impact. Run `npm run check:save-schema` to confirm the bag is still typed as free keys.

## Tests to add

- **In `test/starter-progression-fit-offer.test.mjs`** (extend):
  1. After the line speaks, `hints.fitOffer === true` and `hints.fitOfferDefId === <spoken def id>`. Check both the Veil and Swing cases.
  2. Emitting `module:purchased {defId: <same>}` deletes `fitOfferDefId`, and `fitOffer` stays `true`.
  3. A different `defId` leaves the key in place.
  4. A legacy save with `{fitOffer:true}` and no id loads without throwing and renders no chip.
- **New `test/x03-fit-offer-chip.test.mjs`**, covering `fitOfferChipHtml`:
  1. A matching unequipped row gets the `is-up` chip.
  2. Funding gives the shortfall copy with the exact cr.
  3. An equipped row, a non-matching id, or missing hints give `''`.
- **Visual:** run `node scripts/ui-bench.mjs --shot=station-shipworks --walk` with a fixture that sets `hints.fitOfferDefId='mod_veil_step'`. Open the PNG and confirm the chip sits in the existing chip strip.

## Must stay green

`starter-progression-fit-offer` (all cases), the `outfittingSpendConfirm`/purchase tests, `check:player-facing-labels`, `check:ui-a11y`, `check:type-floor` (`scripts/check-type-floor.mjs`), `check:save-schema`, and `localization-reachability`. After adding the label, run `node scripts/extract-localization.mjs --write`.

## Non-goals

- No new module and no `mod_thruster_stripped_s` offer.
- No price or line change.
- No preselect, no sorting, no new class or token.
- No wiring of `recommendOutfittingPurchase`.

## Approvals

- plan-gate reviewer 4964e62b — APPROVE (2026-10-24)
- plan-gate reviewer fb54441e — APPROVE (2026-10-24)
- plan-gate reviewer 53f3e19e — APPROVE (2026-10-24) — plan✓3
