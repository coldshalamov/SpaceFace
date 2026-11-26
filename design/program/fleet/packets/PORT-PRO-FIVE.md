# PORT-PRO-FIVE — five finished expeditions reach the game

**For:** a careful engineer. **Kind:** porting finished features onto today's code. **One commit
per expedition.** Not a merge.

## Why

Five complete Adventure expeditions, about 19,000 lines with tests, sit on a local branch that was
never merged: `codex/pro-five-integration` (commit `939c2c1669`). A player has never seen them.

- **TOWJAW** — a physical armoured predator with counterplay (`src/features/towjaw`).
- **SWITCHBACK** — a coupled freight-train heist (`src/features/convoyRaid`).
- **BLACKBOX RUNS** — a derelict expedition (`src/features/derelictExpedition`).
- **GLASSWAKE** — a moving storm chase with a forecast (`src/features/stormChase`).
- **Kinetic Catalysts** — fit-able catalyst builds and a field trial (`src/features/kineticCatalysts`).

They are exactly what the game's design now asks for (ruling R19 in
`design/overhaul/00_RULINGS.md`: a fight is a composed episode with its own character; R21: if you
could really do it out there and it is fun, it belongs). Four sibling features from the same
author already landed through `src/features/proExperienceSystems.js`: that registry is the pattern.

## Do

The branch is thousands of commits behind `master`. **Do not merge, rebase or check it out** (this
checkout is shared; never switch branches here). Read files from it with
`git show codex/pro-five-integration:<path>` and `git diff master...codex/pro-five-integration --stat`.

For each expedition, in this order: SWITCHBACK, TOWJAW, BLACKBOX RUNS, GLASSWAKE, Kinetic Catalysts.

1. Read its `INTEGRATION.md` on the branch: it lists what the feature needs.
2. Copy its self-contained folder under `src/features/`, its encounter data
   (`src/data/encounters/810x-*.js`) and its tests (`test/pro-five-*.test.mjs`) onto the working
   tree (write the files from `git show`).
3. Redo the shared hunks **by hand against today's shapes**, never by copying the old file over the
   new one: the registry line in `proExperienceSystems.js`, `authoritativeSystemManifest`,
   `nodeSystemFactoryTable`, `mainToSimEventSurface`, run reset, save version and migration, and
   any `ships.js` / `modules.js` / `lineProgression.js` rows it adds. Several of these files are
   being edited by other agents: use `bash scripts/fleet/own-commit.sh begin <file>` before editing
   a shared file and `bash scripts/fleet/own-commit.sh commit "<message>" <files>` to land only
   your lines.
4. Bring its wording up to today's rules (ruling R18): "Line" not "Massline", `m`/`km`/`m/s`, plain
   words. Run `npm run check:plain-words` if it exists.
5. **Make it reachable by a player on the ordinary route.** Each expedition is offered as a job on
   a station's job board or as a marked place on the chart, in a sector beyond the first one (the
   opening sector stays calm: ruling R16). Say in the receipt exactly how a player finds each.
6. Prove it runs: its own tests (`node --test test/pro-five-<name>.test.mjs`), `npm run check:sim`
   (the recorded flight must be unchanged: these features must not alter a flight that never
   visits them), and one headless or browser run that starts the expedition by the ordinary route
   and plays its first two minutes, through the lock
   (`node scripts/fleet/game-lock.mjs run -- <probe>`), with three frames saved.
7. Commit that expedition, then start the next. If one cannot be made to work in a reasonable
   time, land the others and write down exactly where it fails.

Old saves must keep loading: add the migration the feature's save fields need, and run the save
tests the branch added.

## Prove

In the receipt, per expedition: how a player reaches it, tests run and results, the frame paths,
what you changed from the branch version and why, and anything about it that looks or plays wrong
(the director will judge the frames; say what you saw).

## Files

`src/features/{convoyRaid,towjaw,derelictExpedition,stormChase,kineticCatalysts}/**`,
`src/data/encounters/810*.js`, `test/pro-five-*.test.mjs`, and the shared registries listed above.
