# PQ-146: retain proved contact ancestry across a native receipt gap

Status: implemented locally and independently reviewed; publication pending. Larger game and acceptance goals remain open.

## Player-facing correction

A released player-towed hull can push another hull over several separated native contact receipts. The first player-authored push must not become the second hull's supposedly natural motion when the same pair touches again. The journal now retains that first counterfactual for a bounded same-root, directed same-life-pair, same-depth transfer when its retained net motion still matches the next native pre-contact velocity. This restores player attribution on the subsequent wingman strike without changing physics, damage, friendly fire, materiality, or scoring gates.

Only `src/combat/stuntEvidence.js` changes production behavior. There is no new save field or revision, no timing extension, and no replay payment. Existing consecutive-contact behavior is preserved. Extended retention excludes attached ropes so their episode-local interception proof is unchanged. A recorded independent net impulse or unmatched motion starts the existing conservative new-contact baseline. The 1e-3 motion tolerance is the existing evidence-restore matching tolerance; 1e-8 is the existing journal observable-impulse minimum. This is a bounded net-motion model, not a claim to reconstruct arbitrary intervening trajectories or net-zero force histories.

## Reproduction and separate stale test assumption

Unchanged original native scene: body1 hits body2 at tick71, transferring velocity approximately(-40,0) with origin.before=(0,0). Receipts resume at74 after a two-tick gap. Previously the new transfer overwrote that origin with the earlier player-authored(-40,0). At tick114 body2 hits body3, but its counterfactual incorrectly already approaches the victim; the journal rejects the path and ordinary NPC friendly-fire policy rejects damage to body3.

After repair the first origin remains tick71, the tick114 path has root5/edges2, and body3 receives real player-attributed damage. The original healthy wingman's hull3 nevertheless does NOT qualify for an amendment: uninterrupted damage is approximately0.5927/3 with no helm loss, not a kill or quarter-hull-plus-one-second loss. The old test conflated lost attribution with a stale lethality assumption. Its geometry, masses, speed and full-hull case are retained, now asserting correct no-unearned-amendment behavior.

Separately named wounded variants use the same native scene with current hull0.5 and unchanged hullMax3. Actual routed damage kills this legitimately wounded target and yields one same-root amendment. Saves at45(before impact),72(between first and resumed contact), and90(after first payoff) retain causal identity; settled receipts replayed after another save cannot add acts or points. No synthetic receipt creates a success: only the negative replay check deliberately resends already-observed real receipts.

## Explicit physical-restoration limitation

This is NOT a general physics Save/Continue equivalence repair. Recreating a native world inside a hot contact changes its solve: at save72 the healthy wingman takes approximately2.4851/3 damage and0.3167 seconds helm loss, versus0.5927/0 uninterrupted. Save90 gives approximately0.6239 damage. All remain nonlethal and below the existing conjunction of quarter-hull loss AND one second helm loss, and keep root5/edges2. Tests compare causal identity and material/gameplay outcome, not identical trajectories or damage magnitudes. No claim of final visual/player acceptance is made.

## Checks and ownership

- `node --test test/pq146-contact-lineage.test.mjs test/pq146-save-roundtrip.test.mjs`:19/19 pass.
- Existing `check:pq146-stunt-proofs` gains only the new lineage leaf; 58/58 pass.
- `check:sim:dynamic`: uninterrupted/reload hashEqual=true, no divergent tick. The expected golden hash differs (actual b50c0751…, expected ad18c68b…); original HEAD evidence-module replay produces the identical actual hash and mismatch. No golden edited.
- Adjacent82 tests:78 pass,4 failures. A read-only loader substituting the original HEAD evidence module reproduces the same four failures: three `pq146-collateral-razor-route` tuned-materiality assertions and one `weapon-impulse-consequence` tumble retrigger/expiry assertion. No claim that adjacent suites are all green.
- Focused adversarial coverage includes independent/unknown/opposing motion, epsilon boundary, different root, body lifetime replacement, reset/expiry, signed deceleration, duplicate receipts, saturated edge budget, and another source within the same root.
- Exact owned paths: production evidence module, new lineage test, existing save-roundtrip test, existing package check leaf, this handoff. No combat damage/kernel/tumble/persistence writer changes.

Next: verify current upstream, reconstruct only these tested public deltas, publish draft PR and verify remote SHA/CI. Keep hot-contact native restoration difference and unrelated baseline failures explicit.
