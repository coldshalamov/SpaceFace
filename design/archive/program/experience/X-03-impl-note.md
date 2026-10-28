# X-03 impl note — named module wears its chip

`hints.fitOfferDefId` stamped when the fit-offer line speaks (`_maybeSpeakFitOffer`);
`module:purchased` clears only the id (boolean stays once-ever). `fitOfferChipHtml` (exported,
shipworks.js) renders `Named at the berth` / `… · short N cr` in the existing chip strip —
no new class/token. Bench fixture `?fitOfferDefId=` added for visual proof.

Tests: starter-progression-fit-offer 14/14, x03-fit-offer-chip 4/4; outfitting/shipworks
49/50 — the composition raycast miss (14/18000) is pre-existing 3D drift, unrelated to the
DOM chip. ui-bench before/after+walk PNGs under .devshots/ui-bench/x03*. SAVE_SCHEMA.md
regenerated (free-key hints bag); en-US catalog regenerated.

Complete-with-evidence (devin-expu audit 2026-10-25): landed ecb17f9a96 (+14cc4e76c3 review
fix — chip rides the always-visible metrics line). `x03-fit-offer-chip` 4/4 green today.
Audit residual (nothing reads `hints.fitOffer`) closed by `fitOfferDefId` + `fitOfferChipHtml`
(verified `onboarding.js:1343`, `shipworks.js:185-197`). Rejected draft scope (preselect, sort,
rewritten spoken line, `recommendOutfittingPurchase`) was adjudicated at plan time — no
remaining named sub-scope.
