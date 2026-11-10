# X-03 draft — The Accountant

## Rejected

`mod_thruster_stripped_s` is rejected. It removes turn, slide and brake (`modules.js:98,878`) and
has no `shopOffers` entry. The live rack decides instead: **Veil Step 4,200** (`modules.js:521`)
or **Swing Drive S 5,100** (`:512`). `_fitOfferCandidate` (`onboarding.js:1208`) already ranks
them. No new module and no price change.

## The hole

`_maybeSpeakFitOffer` (`:1258`) writes `hints.fitOffer = true`, and nothing reads it.

## Proposal

1. **Save one string.** Next to `hints.fitOffer = true`, also write
   `player.hints.fitOfferDefId = def.id`. Keep the boolean, because
   `starter-progression-fit-offer.test.mjs:59` asserts `=== true`. `hints` shallow-merges on load
   (`saveSystem.js:7444`), so it needs no default and no migration.
2. **Outfitting reads it.** In the shop-row builder of `src/ui/station/screens/shipworks.js`
   (`:4235-4290`), when `d.id === hints.fitOfferDefId` and the module is not equipped:
   - add one sub-line in the row's existing classes:
     `<span class="k-row__sub sx-modrow__role sx-modrow__advice">Named at the berth — your
     credits cover it.</span>`;
   - sort that row first in `compat`.

   No new class, token or CSS root, so it stays ORRERY-consistent.
3. **Clear on purchase.** Onboarding listens to `module:purchased`, which `ships.js:2339` emits
   after `economy:chargeCredits {reason:'buyModule:<id>'}`. On a match it deletes the key.
   Ships stays the only writer of fittings and derived stats.

## Numbers

B0 pays +400 and B1–B3 pay +600/+800/+1,000. A berth covering 4,200 lands inside the hour
(pinned `fit-offer.test:119-138`). Swing Drive leads at ≥5,100 because it extends the taught latch.

## Determinism and save

One saved string is added, and nothing in the sim reads it. The UI stays read-only.

## Tests

- Extend `starter-progression-fit-offer.test.mjs`:
  - the id is written;
  - the id clears on buy;
  - a legacy save works without the key.
- Shoot `node scripts/ui-bench.mjs --shot=<shipworks> --walk`.
- Keep green: `check:player-facing-labels`, `check:save-schema`, `check:type-floor`.

**Verdict: shippable, S.**
