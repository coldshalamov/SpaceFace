# SpaceFace — Claude entry point

One front door for every agent brand: [`AGENTS.md`](AGENTS.md). Its one rule: **make a good game.**

Frontend work (any screen, menu, HUD, map, pause): shoot the real screen over a still
(`node scripts/ui-bench.mjs --shot=<id>`, seconds, no game boot), open that PNG yourself, fix what
you see, and `--walk` every control on the screens you changed before you call them done. Details:
[`docs/UI_VISUAL_ITERATION.md`](docs/UI_VISUAL_ITERATION.md).

@AGENTS.md
