# CLASS: counts and plurals

Player-facing defect: a raw number glued to a noun, plus six-plus per-screen copies of
the same singular/plural chooser.

## Before

- `src/ui/shipLedgerPanel.js` wrote `${model.total} entries.` unconditionally —
  a one-entry ship ledger read **"1 entries. Archive page 1 of 1."**, and a downstream
  screen patched the DOM string after the fact.
- `${units} unit${units === 1 ? '' : 's'}`-style glue in ~120 places across src/ui,
  src/systems, src/data, src/story and friends.
- Local chooser copies: `counted()` in recoveryEncounterPrompt.js, `plural()` in
  arsenalWords.js + footprint.js, `countPhrase()` in saveLoad.js.

## After

- One chooser in `src/core/numberFormat.js`: `pluralWord(n, singular, plural)` and
  `counted(n, singular, plural)` ("2,500 units", locale-grouped via formatCount).
- The ship ledger now reads **"1 entry. Archive page 1 of 1."** / **"3 entries. …"**
  at the shared writer; the downstream patch is moot.
- ~120 call sites across ~85 files route through the helper; the four per-screen
  chooser copies are deleted or delegated.
- Guard: `test/player-counts.test.mjs` fails on the glue pattern or a new chooser
  copy; runs in `npm run test:fast` (40/40 green).

Notes: six sites inside foreign-claimed files (hud.js, missionPreflight.js,
missionObjectiveOps.js, missions.js, missionShared.js, missionStoryOps.js) were
fixed in the working tree and ship with their owners' commits — not staged here.
