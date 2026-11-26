# DEMO-FRONT-2 — title, pause and loading: the follow-ups

**For:** a builder agent (code, exact instructions). **Kind:** fixes found by review. Verify each
against the code first, then fix it. Commit your own files.

1. **The Line row on the loading controls card looks like three keys.** src/ui/loadingPresenter.js
   `loadingControlRows` (~224-256) splits the label on spaces, so 'F / RMB' paints chips 'F', '/',
   'RMB'. Paint the slash as plain text between two chips (as Help's card does).
2. **title-save walk is incomplete:** `node scripts/ui-bench.mjs --shot=title-save --walk` reports
   'UNREACHABLE after Continue'. Find why the walk cannot reach the controls after Continue and fix
   the screen (or the bench step if the bench is wrong; say which).
3. **The title draws a hidden live scene under an opaque still.** src/ui/orrery/titleDoorsLayouts.js
   ~66 forces `.k-world--plate { opacity:1 !important }` for every live stage, so (a) the lab replay
   behind `?titleLab=1` can never be seen and (b) the live title scene keeps rendering every frame
   under an opaque picture (wasted GPU on the demo machine's title). Scope the override to the
   default scene (e.g. `:not([data-attract="1"])`), and pause or throttle the stage's rendering while
   the plate fully covers it, keeping only what warm-up needs (find the stage's render loop owner).
4. **Internal names on Pause and Load.** Pause and the Load list show 'Contract 47-A: Mass Variance
   Sample'. Show the player-facing objective/contract name ('Recover the 47-A sample' or the
   contract's display title) — find where the save/pause summary picks the line.
5. **Pause looks older than the title.** Pause still uses the old dial style while the title uses
   cards (`.devshots/demo/wave2/front-review*/pause.png`). If the pause dial can adopt the title's
   card kit with a small, contained change, do it; otherwise list exactly what it would take.

Shoot: `node scripts/ui-bench.mjs --shot=title,title-save,loading-swarm,pause,save-load --viewports=1280x720,390x844 --walk --out=.devshots/fleet/front2`
and list PNG paths; the report must print no CLIPPED / BANNED WORD / UNREACHABLE.

## You may edit
src/ui/loadingPresenter.js, src/ui/screens/mainMenu.js, src/ui/orrery/titleDoorsLayouts.js, the title
stage owner you find, src/ui/screens/pause.js, the save summary file you find, tools/ui-bench.js
(walk only), and tests. Before editing a file run `git diff -- <file>`; if it has changes you did
not make, use `bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>`
after. Never git add -A, reset, stash, restore or checkout.

## Receipt
Protocol headings; per item fixed (commit) / rejected (why); PNG paths.
