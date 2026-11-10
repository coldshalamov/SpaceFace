# X-03 audit — first purchase staged

Row: build_map §1P 561. Authored by read-only catalog agent (bfca75eb), recorded by devin-lanea 2026-10-24.

## What exists

- `FIT_FEEL_DEFS` (`onboarding.js:154-157`, rows `src/onboarding/fitFeel.js:15-84`) — verb-changing modules only.
- `_fitOfferCandidate`/`_maybeSpeakFitOffer` (`onboarding.js:1205-1286`) speak "Your credits cover the yard's
  <name>." once per profile when docked and credits cover a hull-compatible rack offer. First chance on the normal
  route: the B0 payout / first sale at Helios during B4/B5 (`:584-593`, pinned by
  `test/starter-progression-fit-offer.test.mjs:119-138`).
- Helios rack verb fits: `mod_veil_step` 4,200 (`modules.js:521`), `mod_swing_drive_s` 5,100 (`:512`),
  `mod_swing_drive_m` / `mod_gravity_bumper_s` 12,000. At 5,000 cr → Veil Step; at 5,400 → Swing Drive S.
- The row's named module `mod_thruster_stripped_s` is **not** a verb-adding fit (it removes turn/slide/brake,
  `modules.js:98,878`) and has no `shopOffers` entry — the row's premise is superseded by the live rack.

## Missing

- **Carry-through after the line.** Nothing reads `hints.fitOffer`; the existing ranker
  `recommendOutfittingPurchase` (`src/ui/station/outfittingGuidance.js:259`) has no UI caller. The player hears
  the name, opens Outfitting, and must find the row unaided — no badge, no preselect.

## Approvals

- audit-gate reviewer 27464a4d — APPROVE (2026-10-24)
- audit-gate reviewer 98e62e20 — APPROVE (2026-10-24)
- audit-gate reviewer 03b56769 — APPROVE (2026-10-24) — audit✓3
