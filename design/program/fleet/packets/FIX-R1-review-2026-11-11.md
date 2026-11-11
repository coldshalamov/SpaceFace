# FIX-R1 — Fix five verified findings from the 2026-11-11 senior review

**Lane 3.** Source: `design/program/fleet/reviews/2026-11-11-aac2108d.md` (read each finding in full —
it names the file, line, failure and fix). The lead verified these. **Read PROTOCOL rule 8 first**: every
test you write must use the payload the real emitter sends.

Do each as its own commit, in this order:

1. **Rubberneckers never start** (`src/systems/rubberneckers.js:126`). `entity:killed` is emitted by
   `src/systems/combat.js:~819` as `{ id, killerId, type, pos, ... }`. Resolve the victim from
   `payload.id` (fall back to `payload.type`/`payload.pos` if the entity is already gone). Rewrite the
   test to emit exactly that shape. Commit: `fix(PL-03): rubberneckers hear real kills`.
2. **One sustained Shove counts as two** (`src/systems/roadRage.js:127`). `src/systems/fields.js:~2258`
   publishes accumulated repulsor hitstun every 0.25 s from the same field. Count one shove per distinct
   field deployment (carry the field/deployment id the receipt has; if it has none, treat receipts from the
   same attacker within 1.0 s as one shove). Test with the real 0.25 s cadence: one deployment held for 2 s
   = one shove. Commit: `fix(PL-05): a held Shove is one shove`.
3. **The release camera pull never fires** (`src/render/camera.js:594`). It requires `bonusDv > 0`, but the
   real producer `src/systems/masslineThrow.js:~648` always emits `bonusDv: 0` (zero free energy by design).
   Gate the pull on the release's real exit speed (the receipt's exit velocity/speed field — read the
   producer) above 60 WU/s, and keep the zero-free-energy rule. Also check `src/render/renderer.js:~19563`
   subscribes to the event a swung-body release actually emits. Test with the producer's real receipt.
   Commit: `fix(G18-03): the camera pulls on a real slingshot release`.
4. **Near-miss lamps never flash** (`src/systems/nearMissPlant.js:266`). The flag `lampsFlashing` /
   event `traffic:nearMissFlash` has no consumer. Wire it to the existing ship-light presentation (find
   who draws NPC running lights/trims in `src/render`), two flashes, respecting reduced flash.
   Commit: `fix(PL-01): the buzzed ship really flashes its lamps`.
5. **Two seed tests expect obsolete errors** (`test/seed-sw-36-splitter-4242.test.mjs:80`,
   `test/seed-sw-37-brood-mother-4242.test.mjs:93`). `swarmBroodLateIssues()` now returns `[]` with the deep
   course restored: change both expected arrays to `[]`, keep every other assertion, run both files.
   Commit: `test: splitter and brood-mother seeds expect the restored course`.

## Checks
For each fix, its focused test plus `node --test test/<the system's existing tests>`. Report each fix's
before/after in the receipt.
