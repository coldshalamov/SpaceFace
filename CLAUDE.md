# SpaceFace - Claude entry point

One front door for every agent brand: [`AGENTS.md`](AGENTS.md). Depth by need, not by default.

**Current program (owner, 2026-11-11): [`design/program/fleet/README.md`](design/program/fleet/README.md).**
Work comes only from [`design/program/fleet/QUEUE.md`](design/program/fleet/QUEUE.md) — four lanes; an agent told
"you are Agent N" works only Lane N. The design authority is [`design/game/`](design/game/README.md).
Every older plan bank (`build_map.md`, `design/program/*.md`, `design/program/finish/**`, the INFERENCE
lanes, the EC PR descriptions) is history unless a queue row links it.

Frontend work (any screen, menu, HUD, map, pause): follow
[`docs/UI_VISUAL_ITERATION.md`](docs/UI_VISUAL_ITERATION.md). Shoot the real screen over a still
(`node scripts/ui-bench.mjs --shot=<id>`, seconds, no game boot), open that PNG yourself, fix what
you see, and `--walk` every control on the screens you changed before you call them done.

@AGENTS.md
