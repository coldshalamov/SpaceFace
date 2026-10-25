# M-05 plan — starter jobs per hull

Tribunal synthesis (Drifter + Archivist + Accountant):

**Slice**: one epilogue `step: 3` per starter chain in `src/data/starterJobs.js`, reusing
existing step types and the employer-voice title field — gentle "they noticed you" close:

- Kestrel (`mining_quota`, cmdty_ore_iron ×2, 840 cr): "Cut the marker seam — the yard
  lead asked for your transponder" — the employer's name-on-file voice.
- Pelican (`tow_recovery`, 960 cr): "Tow the harbor-master's buoy home — thanks on the
  ticket" — small twist: the employer is the client.
- Wasp (`bounty_hunt`, runnerName 'Vex Tollcut', 920 cr): "Ram the third runner — she
  heard about you" — named mark, kin of the board's Tollcut line.

The `shipCarriesModule` scarred-ram foreign clause is untouched. Step types, module gates,
and reward path are all existing schema.

Verification: `test/lg-starter-jobs.test.mjs`.

Review: plan ✓3 — recorded.
