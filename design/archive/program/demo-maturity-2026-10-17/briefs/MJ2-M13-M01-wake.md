# Task MJ2 — board rows 349 + 350: M13 "Pay back the wake" and M01 "The opening raid, made whole" (aftermath custody)

Read first: `_constraints-codex.md`, briefs `design/finish-expansion-2026-09/missions/M13.md` and
`M01.md`, and the disposition rows for M13/M01 in `design/program/admit-sfq-m/DISPOSITIONS.md`.

## The residuals

- **M13 (row 349):** restitution is billed only by `src/systems/custodyConsequences.js` (the
  single writer). The missing piece is the **restitution offer**: the damaged party offers a
  recovery job (recover the remaining lots or supply legitimate replacements) instead of only a
  fine. The wake chain exists (`test/cr-chain-1-the-wake.test.mjs`); SFQ-B120 (landed) already
  guarantees a named restitution returns only the standing its own cause took — build on that law.
  Candidate route: current restitution offer + tow_recovery. Preserve decline/abort; a partial
  outcome clears only the named portion.
- **M01 (row 350):** encounter 344/367 own the opening raid; the missing piece is the
  **aftermath/custody** leg in `src/systems/aftermathWrecks.js` + `custodyConsequences.js`:
  what the field offers after the raid (rescue, salvage, pursuit, escape from what is actually
  there — SFQ-B119 landed that offer law) must carry custody consequences for the raid's
  scattered freight and survivors, so the opening incident has a tail the player can still feel
  and settle. Do not duplicate 344/367; extend the aftermath owner.

## Done when

- One focused test per row on seed 4242: `test/m13-pay-back-the-wake.test.mjs` (restitution offer
  appears from a real billed incident; recover vs replace approaches; partial clearance; decline
  leaves the fine path intact) and `test/m01-opening-raid-aftermath.test.mjs` (post-raid field
  offers custody consequence for scattered freight; settle and unsettled outcomes both persist).
