# DEMO-PILE-LAND-1 — land the old uncommitted work the owner's game already runs

**For:** Devin SWE-2 Max. **Kind:** finish, test, commit. The owner launches the game from this
working tree, so these edits are already what he plays; your job is to make them finished,
tested and committed, and to fix the one unexplained bug.

A read-only review classified every older uncommitted change. Read its receipt first:
`.devshots/fleet/runs/DEMO-PILE-1.glm.*/RECEIPT.md` (newest). Its table is your work list.

## Do, in this order

1. **Bug first — a station mutates during a plain tick** (review row 2): `test/world-streaming.test.mjs`
   ~284 reports `unexpected self-driven entity 229 (station)`; green at HEAD, red with the pile.
   Bisect which uncommitted edit in `src/systems/world.js` (residency / retiredBag / continuous
   enter, the sliced-enters change) writes a station during `world.update`, and fix the cause.
2. **Sliced sector enters** (rows 3 and 8): intentional new behaviour (continuous corridor crossing
   flips membership after a settle, not synchronously). Migrate the three asserts in
   `test/sector-membership-hysteresis.test.mjs` (~96-104) to the new rule with the reason
   "sliced sector enters (owner freeze bug 2026-11-21): membership flips after the settle".
3. **Deferred kill decorations** (row 1): production code complete; migrate the tests that read a
   wreck/pod before any drain (e.g. `test/honest-response.test.mjs` ~355, and the others the
   review names) to drain the lane first (step the sim once or call the drain), with the reason
   "kill decorations mint on the next step's lane (owe, never drop)".
4. **Swarm floor plain voice** (row 10): rewrite the two pinned asserts in
   `test/swarm-forge-taps.test.mjs` to the new labels.
5. **Commit the complete changes as-is**, grouped by change, each with its focused tests passing:
   spawn/destroy batch coalescing (row 6), pooling/scratch on hot emit paths (row 7), sliced
   enters (row 8), CONTROLLER-1 (row 9, plus its stale pins), counted() word pass (11), commodity
   stack column (12), onboarding waypoint ids (13), castAnnounced adapter (14), run-state cache
   (15: renormalize line endings to the file's original so the diff is only real lines), census
   tooling (16), resting-contact coalescing (row 4, default ON; it is deterministic and
   check:sim passes). Each commit message says in plain English what the player gets.
6. Run `npm run check:sim` after the world.js and physics changes are committed: it must still
   pass with the golden unmoved (the review ran it green on the pile). If it moves, stop and
   report which commit moved it.

## Rules
- Before committing a file, `git diff -- <file>`: commit ONLY hunks that belong to the change
  you are landing. If a file mixes changes (e.g. `src/core/coreSystem.js`, `src/systems/world.js`,
  `src/systems/weapons.js` are also being edited by a live agent right now), use
  `bash scripts/fleet/own-commit.sh` or stage exact hunks via a patch file (`git apply --cached`),
  never `git add -A`.
- Never revert someone else's work. Never edit golden/expected files to pass.
- Do not boot the game; focused `node --test` only.

## Receipt
Protocol headings + per review row: landed (commit) / migrated tests (files) / fixed (commit) /
left (why).

## AMENDMENT (director, 2026-11-23 15:20) — read before step 5

Much of the pile has landed since this packet was written. Run `git log --since="2026-11-23 13:00" --stat`
first and skip every row that is already committed: deferred kill decorations (6deaab422c), spawn
batch (36ac3f5531, recycled-id fix adc1599228), hot-path pooling incl. the alert pill pool
(710c2fe117, its recycled-node fix 030a53d4dd), resting-contact coalescing (cb8708cea9).
Land-together rules from the wave-2 reviews (committing one of these alone breaks HEAD or a test):
- `src/ui/threatHalo.js` never without the untracked `src/ui/contactCensus.js` it imports (or keep
  the collectHostiles hunk out). Its pack-plural hunk is being redone by another worker: leave
  threatHalo.js uncommitted if in doubt.
- `index.html`: the early boot-film-skip head script lands with `src/ui/bootEntry.js` and
  `styles/intro.css`; add `if (window.__SF_BOOT_FILM_SKIPPED__) return blob;` before the src/play in
  the movie-mint `.then` (~line 1682). The movie-mint hunks land ONLY with `src/ui/bootMediaPlayback.js`.
- `src/ui/screens/help.js` cargo-bag pad row lands only with `src/systems/gamepad.js`,
  `src/ui/screens/settings.js` and `test/help-gamepad-rebind.test.mjs` (CONTROLLER-1).
- `src/render/spaceBackground.js` (PaintedPlanets(null, {renderer})) only with `src/render/paintedPlanets.js`.
- `src/ui/masslineHud.js` ('TARGET TURNING') only with `test/inf-078-collateral-cue.test.mjs`.
- Row 13 (onboarding waypoint ids) and `src/ui/berthOffer.js`: SKIP — DEMO-FIX-ADV-1 owns them.
- `src/render/camera.js` zoom-step change: commit as-is (reviewed complete).
