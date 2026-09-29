# FB-132 — A claim defense warning is a prompt with go, ignore or delegate, not only a headline

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: claims.js, seam: galaxyMap.js, seam: encounterChoicePrompt.js
**Write-set:** `src/systems/claims.js`, `src/ui/encounterChoicePrompt.js`, `test/fb-defense-warning-choice.test.mjs`
**Neighbours (extend, never restate):** NXB-035, NXI-139

## The gap
`claims.js` listens for `claim:defenseIgnore`, which nothing emits, and emits `claim:defenseWarning` with no
listener. The galaxy map shows a raid marker. The player has no explicit ignore verb and no delegate verb (a
supported depot already summons a patrol beat). NXB-035 makes the raid outcome identical whether the player
arrives or not; this is the decision before that outcome.

## Why this direction
The encounter choice prompt is the event-only prompt precedent; three doors, engine re-validates. Ignoring
explicitly settles the defense as ignored (the listener exists) instead of by timeout.

## Mechanism
- On `claim:defenseWarning`, open the choice prompt with go (waypoint set), ignore (emits
  `claim:defenseIgnore`), delegate (spends the depot's patrol rotation early if supported).
- Pin the three outcomes on seed 4242 and that delegate is refused without a supported depot, with the reason.

## Done when
`test/fb-defense-warning-choice.test.mjs`: three doors, refusal reason, one prompt per warning;
`claim-defense.test.mjs` stays green.

## Do not
Do not change raid odds. Do not add a claims panel. Do not let the prompt settle the raid itself.

## Focus test starting points
- `test/claim-defense.test.mjs`
- `test/belt-claim-jumpers.test.mjs`
