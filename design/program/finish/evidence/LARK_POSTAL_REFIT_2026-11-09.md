# LARK postal sorting refit: an optional return lot

## Scope and player route

Owned clean source paths: `src/features/shipbreakingYard/layouts.js` and `model.js`.
New test: `test/shipbreaking-lark-refit.test.mjs`. No runtime, economy, renderer,
asset, global mass-class, or other candidate writes.

After finishing or relinquishing a LARK claim, the existing inspection decision's
**BRING THE NEXT WRECK TO THIS BERTH** requests a new physical lot. Odd subsequent
LARK cycles now offer a postal sorting refit: an 18t sorting motor using the existing
machine package, and a 16t relay cassette using the existing cargo package. The
heavy frame (240t) and saddle (80t) remain heavy. Each lighter original still needs
its real clamp released and its own physical receiving-scale handover. No free
inventory, automatic delivery, or lighter whole-wreck claim.

The unchanged 80CR claim buys the lot. Motor/cassette base intact values are lower
(160/110 rather than 260/150). Condition still determines the actual payout.
Even subsequent cycles return to the ordinary LARK assembly. No fourth berth or
extra bodies are introduced. This is a return-visit activity, not a replacement
for the first LARK claim or a new mandatory first-mission step. Relinquishing a
claim still forfeits remaining originals and does not refund the claim price.

## Compatibility and conservation

Historical variants 0–5 are unchanged; new variants 6–11 encode only fresh odd
LARK cycles. Existing paid jobs retain their stored variant even if their cycle
counter is odd. Existing layouts and berth positions remain unchanged. No live
body is resized/retyped by selecting the next lot: the old terminal lot is retired
by its existing owner before the new lot is created.

The owner normalizer recognizes the new bounded integer variants for LARK only.
The existing save-plan restore hydrates the corresponding physical originals,
retains paid claims and released clamps, and does not recreate a delivered cassette.
Malformed/out-of-range values retain the pre-existing conservative clamp behavior.

## Evidence

Final combined command:

```
node --test test/shipbreaking-lark-refit.test.mjs test/pro-experiences-shipbreakingYard.test.mjs test/ceres-shipbreak-route.test.mjs test/ceres-shipbreak-binding-provenance.test.mjs test/ceres-shipbreak-presentation.test.mjs
```

50/50 pass; log `/tmp/yard-refit-final.log`. Four new tests exercise:
- actual next-lot owner request, original native 18t body, normal MassLine input,
  service release, flight/steering/braking, and one real physical paid handover;
- paid legacy lot snapshot preservation and new variant ledger roundtrip;
- actual inspection decision adapter, stale duplicate request refusal, and the
  next even cycle restoring the ordinary 65t motor;
- fresh native world/owner save-plan hydration: the 18t released motor remains,
  the 80CR claim remains paid, the delivered cassette remains absent and cannot pay again.

The native route takes 15.0833 simulated seconds from the prepared local fixture
through settlement. Actual Rapier body mass is 18t. The moved original travels
more than 100WU, retains its hull, and yields one 124CR condition-adjusted receipt.
The exact original identity is retained throughout; repeat delivery is refused.
The fixture starts a Kestrel near the berth, funds it, and closes the prior claim;
these are setup, not a claimed full campaign or first-time acquisition route.

Independent review checked all 18 historical layouts (three layouts × variants
0–5) against the before snapshot byte-equivalent object content and found no
historical layout changes. Final independent focused rerun passed 4/4, including the decision adapter and
fresh native owner hydration. Parent-level independent review remains separate.

## Limits

No new rendered asset-fit, visual/readability, full-world arrival, starter-Pelican,
collision-free, or disk/UI Continue acceptance. The native test checks intact motor
hull, not a global contact census. The fresh restore test uses the real yard save
plan and fresh native body hydration, not the full application's load screen.
Existing packaged assets are reused; no asset production or renderer edits.

Before snapshots: `/tmp/yard-layouts.before-refit.js`, `/tmp/yard-model.before-refit.js`.
Remote master inspected before work: `f95de0eb1ba7560839209936afba48c7b96fe41a`.
No publication performed.
