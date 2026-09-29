# FB-104 — Export and import carry achievements and Crucible records, not only the world

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: saveSystem.js, seam: achievements.js, seam: survivalRecords.js
**Write-set:** `src/save/saveSystem.js`, `src/systems/achievements.js`, `src/systems/survivalRecords.js`, `test/fb-export-bundles-medals.test.mjs`

## The gap
Achievements (`sf.save.achievements`) and Crucible records (`sf.save.crucible_meta`) are profile-level side
bags outside the save envelope, by design. `importString` and its export twin therefore move the world and
lose every medal and record when a player changes machines. Imports also land only in the `quick` slot.

## Why this direction
The transport is done (`sharedPlayerStore.js`'s key pattern matches `sf.save.*`); only the file bundle is
missing. Letting the player choose the destination slot is one parameter.

## Mechanism
- Extend the export bundle with the two side bags under a `profile` section; import restores them additively
  (never lowering a best) after the envelope validates.
- Add a destination slot parameter to import, defaulting to the first empty slot, never silently overwriting
  quick.
- Pin round-trip equality for medals and records and the slot choice.

## Done when
`test/fb-export-bundles-medals.test.mjs`: export→wipe→import restores 20 achievement states and the crucible
history; import into slot 3 leaves quick untouched; `save-import-bounds.test.mjs` stays green.

## Do not
Do not move the bags into the envelope. Do not lower a record on import. Do not exceed the import limits.

## Focus test starting points
- `test/save-import-bounds.test.mjs`
- `test/save-import-html-safety.test.mjs`
- `test/player-save-store.test.mjs`
