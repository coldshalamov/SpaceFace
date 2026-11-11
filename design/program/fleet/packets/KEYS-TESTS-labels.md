# KEYS-TESTS — Two UI tests still expect the old key labels

**Lane 4.** After the one-set-of-keys change (G18-02, commits b931aac8 and 321ab601), two tests fail on
key-label text, e.g. they expect `4` where the game now shows `4/Y` (keyboard key / controller button):
`test/arsenal-presentation-projection.test.mjs` and `test/crucible-combat-readout.test.mjs`.

## Job
1. Run both: `node --test test/arsenal-presentation-projection.test.mjs test/crucible-combat-readout.test.mjs`.
2. For each failing assertion, confirm the new text comes from the live binding labels (find where the label
   is built — search `src/ui` for the label function the test exercises). If the game's new label is the
   intended one (keyboard key plus controller button), update the test's expected text to it. If the label
   looks wrong (a doubled key, a missing key), do not change the test — report it as Blocked with the
   exact text.
3. Change nothing in `src/`. Commit: `test: key labels follow the one-set-of-keys layout`.
