# DEMO-FIX-FRONT-1 — title, loading and New Game: the review's code-level bugs

**For:** a builder agent (code, exact instructions). **Kind:** bug fixes found by an independent
review, each with evidence. Verify each against the code first, then fix it. Commit your own files.

1. **Arrow keys trapped in the title footer.** src/ui/screens/mainMenu.js ~633 binds `onArrow` with
   `stage.addEventListener('keydown', onArrow, true)`, but the Credits / Achievements footer is
   appended to `rootEl`, not `stage` (~667), so ArrowDown walks into the footer and ArrowUp can't
   walk out. Fix: keep the handler like `_onTabKey` (this._onArrowKey) and bind it on `rootEl` in the
   capture phase; remove the previous one before re-binding on each mount and in dispose (rootEl
   survives remounts).
2. **The Swarm loading caption always says the Foundry.** src/ui/loadingPresenter.js ~62: the picture
   follows the picked arena (SWARM_ARENA_ART[arenaId]) but the line is fixed per kind
   (LOADING_SCENE_LINE['swarm'] = 'Round 1 · Madame Kiln’s Foundry'), also for a Gauntlet launch.
   Build the line from the launch: 'Round 1 · <arena display name from COMBAT_LAB_ARENAS>'; keep
   'Madame Kiln’s Foundry' only for helios_core; a Gauntlet ('scored' ruleset) says its own name.
3. **Continue renders as a full door card while saves sync.** mainMenu.js ~878: the
   `if (syncPending && !latest)` early-return branch never calls `bContinueRow(refs, false)` and never
   tags the Continue li with `of-title-row-item`, so a machine with no save (a demo machine) can show
   a fully dressed 'Checking saves...' door in the small row. Fix: in that branch, make Continue the
   plain small-row word (call bContinueRow(refs, false) or tag the li).
4. **The loading controls card teaches the rope as RMB only.** loadingPresenter.js ~67-73
   LOADING_CONTROLS is a frozen literal; Help and the opening teach the Line as F. Resolve the rows
   through `resolveActionLabel` the way Help's card does (src/ui/screens/help.js), so rebinds and the
   pad show; at minimum print 'F / RMB' for the Line.
5. **New Game sentence under the fade at 1280x720.** src/ui/screens/newGame.js ~618 and ~1039: the
   'Teach me' helper ('The full first flight: rope a rock, dock, then the raid and the drills.') runs
   into the scroll fade, and it over-promises: taking a job at the first berth retires the rail, so
   the raid and drills never come. Make it one line that is true: 'Rope a rock, throw it, dock, then
   take your first job.' and tighten the column at max-height:800px so it sits above the fade.
6. **Two red tests pinning old rules** (rewrite with the new rule in the message):
   test/input-contexts.test.mjs expects brake to have no key, but a289310ab0 bound it to X;
   test/fragment-time-effects-progress.test.mjs pins "hits punch the FOV", removed by 61736e012e
   (HARMONY-FIX 5). Rewrite only those asserts.

## Look
`node scripts/ui-bench.mjs --shot=title,new-game,loading-swarm --viewports=1280x720,390x844 --walk --out=.devshots/fleet/front1`
— the report must print no CLIPPED / BANNED WORD lines. List the PNG paths in your receipt.

## You may edit
src/ui/screens/mainMenu.js, src/ui/loadingPresenter.js, src/ui/screens/newGame.js, the two tests,
and other tests of those files. Before editing a file run `git diff -- <file>`; if it has changes
you did not make, use `bash scripts/fleet/own-commit.sh begin <file>` before and
`... commit "<msg>" <file>` after. Never git add -A, reset, stash, restore or checkout.
Plain-English commit messages saying what the player now gets.

## Receipt
Protocol headings; per item fixed (commit) / rejected (why); tests run; PNG paths.
