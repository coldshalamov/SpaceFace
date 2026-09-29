# FB-105 — Difficulty changes confirm, and Ironman locks once a run has playtime

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: settings.js, seam: combat.js, seam: saveSystem.js
**Write-set:** `src/ui/screens/settings.js`, `src/save/saveSystem.js`, `src/systems/combat.js`, `test/fb-ironman-one-way.test.mjs`
**Neighbours (extend, never restate):** SFQ-B207

## The gap
The Difficulty select includes `ironman` and a live run can be switched into or out of it mid-flight with no
confirmation, though `combat.js` makes Ironman death unrecoverable and the profile snapshot deliberately keeps
difficulty per save. Run integrity has a precedent: `_campaignSaveSuppressed` refuses an arena write over a
campaign slot.

## Why this direction
A separate mode screen was rejected. A confirm and a one-way latch on the save record, mirroring the existing
suppression, is enough.

## Mechanism
- Wrap the difficulty row in `confirm()` naming the consequence; once a save has playtime, Ironman cannot be
  unselected and non-Ironman cannot become Ironman (lock stored on the save record).
- Pin both directions and that a new game can still choose either.

## Done when
`test/fb-ironman-one-way.test.mjs`: mid-run switch refused both ways with a reason, new-game choice free;
`check-save-load-slot-trust` passes.

## Do not
Do not change Ironman death rules. Do not persist difficulty in the profile.

## Focus test starting points
- Run `node scripts/check-save-load-slot-trust.mjs`; locate difficulty suites with `rg ironman test/`.
