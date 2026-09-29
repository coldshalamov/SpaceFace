# FB-116 — Charge throw, bullet time, cloak, beacon, skim collector and jettison are each spoken once and rebindable

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: missingThree.js, seam: hudAttention.js, seam: settings.js
**Write-set:** `src/onboarding/missingThree.js`, `src/ui/hudAttention.js`, `src/ui/screens/settings.js`, `test/fb-every-verb-spoken.test.mjs`
**Neighbours (extend, never restate):** SFQ-B063, SFQ-I026

## The gap
`chargeThrow` (the verb that makes enemies ammunition) is never named by onboarding and is absent from
`TAUGHT_FLIGHT_ACTIONS`. `deployBeacon`, `toggleSkimCollector` and `jettisonLot` are bound, live, untaught and
not in `REBINDABLE`, so they cannot be remapped. `bulletTime` and `cloak` hints fire only after the player
already found the key.

## Why this direction
Teaching is spoken once, in play; `MISSING_THREE_BEATS` and `firstUseLine` are the two existing rails. Rebind
rows are data.

## Mechanism
- Add beats for `chargeThrow` (first hostile inside 300 WU with a charge racked), `bulletTime` and `cloak`
  (first module fit) to `MISSING_THREE_BEATS` with lines in `MISSING_THREE_BEAT_LINES`.
- Add `firstUseLine` keys and `REBINDABLE`/`REBIND_LABELS` rows for beacon, skim collector and jettison.
- Pin one line per verb per profile and rebind capture for the three new rows.

## Done when
`test/fb-every-verb-spoken.test.mjs`: six verbs, six single lines on seed 4242, three new rebindable rows
conflict-checked; existing onboarding suites stay green.

## Do not
Do not add a tutorial screen. Do not fire a line during combat. Do not change default codes.

## Focus test starting points
- Locate onboarding suites with `rg missingThree test/`; `test/pq-164-01-glyphs-remap.test.mjs`.
