# Morrowlight: take the supply needed for the next departure

## Player result
The ordinary cargo decision at an accessible original locker now offers **one scrap, one salvage electronics or one fuel cell**, alongside the unchanged mixed-load transfer. A tight hold can recover an electronics unit for the claim instead of taking the first scrap in manifest order. Choices name the nearest physically accessible original and its remaining units. This is a finite inventory decision, not a new grant, salvage source, service rate or claim shortcut.

## Exact scope and baseline
- `src/features/salvageTender/runtime.js`: existing cargo decision and unload dispatch only.
- `src/features/salvageTender/physical.js`: optional selected commodity/count within the existing original-body transfer.
- `test/tender-selective-recovery.test.mjs`: six focused cases.
- This note.

Both source files were clean before editing. Before copies: `/tmp/tender-runtime.before-selective-recovery.js`, `/tmp/tender-physical.before-selective-recovery.js`. Primary shared checkout HEAD was `7dc248acec452df4afcd0a5b71ad0507cd6c17ec`; fresh `git ls-remote` reports master `f95de0eb1ba7560839209936afba48c7b96fe41a`. NOW and peer ownership checked; adventure_next is on Lio/Pelican, not these files. Prior published repair allocation in services.js is preserved and not part of this change. No economy, assets, render, registration or other feature writes.

## Conservation and interaction
The existing physical owner still requires original identity, native admission, at most 75 WU and matched speed. Selection validates an existing positive stock line and positive integer quantity. The selected amount is reserved before cargo callbacks, untouched stock remains in that body, and only actual accepted cargo leaves the manifest. Existing cargo authority handles capacity and provenance; sealed freight already in the hold remains sealed. The existing busy and revision guards reject reentrant and stale-card transfers. Mass is recomputed through the same native mass writer, so a subsequent transfer may wait until the next native body revision admission. Bulk transfer, empty-shell terminal state and rack release remain unchanged.

Review found and fixed a selection edge: the nearest nonempty locker may be inaccessible while a farther locker is accessible. The selective options now filter by the real transfer gate before choosing nearest. The regression sets a velocity fixture after native admission; the first attempt set it before admission and native initialization reset it. That failed test was corrected, not the gate.

## Verification and limits
- Author and independent reviewer: **6/6 focused pass**. Real promptDeck callback chooses one electronics with only one unit's volume available; no earlier scrap is taken. Sealed freight, full hold, source conservation, callback reentry, stale card, invalid selection and source identity tested.
- Actual save owner serializes a complete envelope; a fresh native simulation loads it and recovers the remaining original stock with no refill. This is `loadEnvelope`, not browser/disk Continue acceptance.
- Separate native starter-flight probe uses the production feature profile and actual Flight V3 input: **4.8 s, 75.007 WU travel**, then real cargo offer/public action selects one electronics, ten units remain. Initial tender/locker location is a fixture. No full-world discovery, collision-free route, rendered menu fit, input-device ergonomics or campaign completion claim.
- Combined **32/33**, exact-before existing suite **21/22**, with the identical sole map assertion failure. Combined command: `node --test test/tender-selective-recovery.test.mjs test/pro-experiences-salvageTender.test.mjs test/tender-live-repair-allocation.test.mjs`. The unchanged map test expects `jump` but gets `route`; it is not repaired here. Exact-before runtime/physical loader comparison is in `/tmp/tender-selective-before-loader.mjs` and logs `/tmp/tender-selective-{final,before}.log`.
- No publication performed. Source-only independent review found no remaining material defect.
