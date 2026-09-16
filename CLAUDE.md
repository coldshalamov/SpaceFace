# SpaceFace - Claude entry point

One front door for every agent brand: [`AGENTS.md`](AGENTS.md). Depth by need, not by default.

Frontend work (any screen, menu, HUD, map, pause): you are expected to **look at it**, not just edit
it. Start with `src/ui/AGENTS.md` §Seeing the UI — the bench (`node scripts/ui-bench.mjs`, any 2D
screen over a still, in seconds) shows the screen, and `node scripts/ui-look.mjs --only=<id>` opens
it in the live game and clicks every control to report what each one actually did. The loop, the
judgment tests and the review step: [`docs/UI_VISUAL_ITERATION.md`](docs/UI_VISUAL_ITERATION.md).

@AGENTS.md
