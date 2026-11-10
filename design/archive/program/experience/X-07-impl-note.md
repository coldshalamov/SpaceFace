# X-07 impl note — the peg stops banking

`_beamPegged`/`_pulsePeggedS` in mining.js: pegged pulse ore stops ACCRUING while extraction
stays full-rate and banked ore is never forfeited (owner ruling holds — no-lockout suite green).
`clean`/`peggedS` ride `mining:ventBonus`; CLEAN CUT speaks in the existing word slot for 1.2 s;
two one-time hints (`miningCleanCut`, `miningPegged`).

Tests: `x07-peg-stops-banking` 5/5; keep-green 32/32 (incl. all three no-lockout cases).
Digests: `inf-mine-heat-4242` and `first-hour-economy-floor` UNCHANGED (no scripted pilot was
holding a pegged beam); `rc-458` fails two flight-verb pins ('stroke' verb, drill fold count) —
foreign drift outside mining/vent domains, verified unrelated.

Complete-with-evidence (devin-expu audit 2026-10-25): landed f903289329 (+a42a16b753,
a8894bc895, 90f852699d review fixes — vent fraction carry, single-commodity carry, CLEAN CUT
across the release edge). `x07-peg-stops-banking` 8/8 green today. Audit residuals (overheat
costs nothing, clean vent unnamed) closed by `_beamPegged`/`_pulsePeggedS` + `clean`/`peggedS`
on `mining:ventBonus` + the two hints (verified `mining.js:855-856,917`, `onboarding.js:805-807`).
Rejected draft scope (cook decay — owner-ruling-forbidden; PEGGED·NOT BANKING word) was
adjudicated at plan time — no remaining named sub-scope.
