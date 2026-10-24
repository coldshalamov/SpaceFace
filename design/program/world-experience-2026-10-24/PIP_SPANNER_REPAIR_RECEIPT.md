# P19: exact committed Spanner repair quantities

## Scope
The existing accepted `svc_weld` service receipt now states the hull and armor actually restored. The presenter reads only `restoredHull` and `restoredArmor` already committed by survivalDraft, never current ship health or an inferred deficit. Both values must be finite and nonnegative, with at least one positive. Fractional quantities remain exact; zero components are shown honestly.

Legacy, malformed, unrelated-service, pending and denied receipts keep their prior wording. Price, campaign/run wallets, repair authority, offer availability, generation/selection guards, duplicate handling and cosmetic timing are unchanged. No new model, animation or simulation behavior is introduced.

## Qualification
Candidate presenter `7ebca0a240eb168ae7273c87544f1536bb3b94f4`; UI test `b77aea502fe68674af34aa36f895ff5e8beef1fb`. Baseline public master `3bf67c9617e285561330a413472bd11a94bf2f7b` had presenter `59cbb9bb9bbb8f403f5f6018c16f9d143335c4f1` and test `0f9e713efff20e34918db165f9b1c5610f0f2d4c`.

Local candidate: 9 UI + 6 unchanged purchase-receipt + 5 unchanged preview-lifecycle tests passed in separate processes. Baseline presenter with the candidate UI tests: 5 passed, 4 failed. Full stdout and module pins are retained in PIP_SPANNER_REPAIR_RECEIPT_PROOF.json.

Two real runSession/survivalDraft/ships/economy weld paths restore 40 hull/20 armor and 0.125 hull/2.75 armor respectively. Tests assert one run-wallet debit, unchanged campaign credits, exact committed receipt text after later damage, no animation replay on reopen, duplicate refusal and old-generation rejection. No mocked repair/payment/receipt is used; DOM is a minimal fixture without defaultView, so no renderer is created.

Local graph: 27 exact public/candidate overlays and 964 read-only transitive dependencies. This is not a complete current-master checkout. No browser/layout, GLB appearance, accessibility, performance, whole-game or full Save/load campaign-isolation acceptance is claimed.

## Hosted gate and recovery
`npm run check:pip-spanner-receipts` runs the three explicit files above, expected 20 TAP cases. The additive leaf is reachable on existing static shard 2/3 (zero-based static index 232), preserving all earlier command order and workflows. The full-checkout hosted result is pending at publication; local passes are not represented as hosted passes.

Recover source/tests from this commit and run the named gate in a normal dependency-installed checkout. The report and public-safe proof preserve the original failing negative control and final local qualification. No merge or deployment is part of this draft. P19 visual and whole-concept acceptance remain open.
