# Tally-3: one honest claim, one physical crate

Recommended next SF20-03 slice, 5 October 2026. Read-only intake complete; implementation has not started.

## The player experience

At Ceres' existing Abandoned Driller, one Tally assessor examines one finite crate. Within 420 WU, it introduces itself briefly. Select and inspect the crate to see Owned, Disputed or Unclaimed, the actual cited evidence, its value basis and the receiver.

The choices are concrete: return the same crate for payment; discover the site's real release record and correct a stale claim; or take it without consent after seeing the theft consequence. A disputed crate remains movable. No approach, scan, touch or tow automatically sells it. Delivery needs the body inside the correct receiver, relative speed below 8 WU/s and an explicit confirmation. Destroying Tally leaves Ceres Refinery as the ordinary fallback.

This is one complete, replay-safe encounter, not a new claims framework. It stays away from the active Second Measure machinery, traffic recovery and native Save work.

## What must be built

Tally currently exists only in the original reference pack; its review item is pending and unowned. Reuse the existing salvage owner, with Tally-specific data, behavior, evidence and transaction helpers. Keep the small character memory inside salvage's existing save entry. The durable source records title and permanent disposition; a 32-receipt display ring must not be the sole duplicate-payment defense.

New work can be isolated in `tally3` data/system/economy/UI/render helpers, focused tests and `tools/blender/forge/ships/tally_3.py`. Small explicit joins belong in salvage, economy, provenance, contact/hail and the existing prompt-deck lifecycle. The integration owner serializes renderer motion, Forge fleet and generated asset-manifest/package joins. Exact proposed paths and API findings are in [the technical intake](TECHNICAL_INTAKE.md).

Three integration traps matter:

- `claims.js` owns player bases, while salvage's `claimId` is a work claim; neither already provides complete crate title/adjudication
- `economy:grantCredits` is not receipt-idempotent; the return needs an owner-accepted, durable one-time settlement
- Generic owned freight currently reports theft when latched. Tally needs a narrowly scoped lawful-recovery interpretation so towing and taking ownership remain distinct

Current `scan:completed` also carries no target. Evidence must come from a verified source-bound scan/investigation, never a fabricated witness or unchecked UI submission.

## Art and acceptance

Retain the original long dark spine, unequal folding balance arms, open forward V cradle and large amber stern stamp. Use pale slate panels and one ochre band, with Forge's shared finishes and layered mechanical construction. Rebuild the coarse reference rather than shipping its blockout. Measure the actual asset before fixing scale, mass and collider; retain the silhouette in all LODs. The receipt stamp moves only after accepted settlement.

Prove all five original cases: no sale from tow, ten deliveries yield one payment, claimant change invalidates the old offer, tethered Continue preserves one body/owner/receiver, and assessor destruction preserves fallback. Also test full cargo, partial acceptance, stale evidence/UI, destroyed crate, transaction-tick saves, New Game and repeat visits. Show the actual normal Ceres route and top/chase/close working poses. Final browser/art acceptance remains with the existing local primary reviewer.

Thirty existing salvage, theft, receipt, scan-provenance and bounded-lookup tests passed during intake. They validate current seams only. PR221 remains draft/open at `6f4b1534`; master is `df1af22e`; local integration is `561c0435`. Publication remains paused. No shared source, claim board or remote state was changed.
