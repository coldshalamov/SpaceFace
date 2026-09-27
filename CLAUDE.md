# SpaceFace - Claude entry point

One front door for every agent brand: [`AGENTS.md`](AGENTS.md). Depth by need, not by default.

**The frontend is claimed (owner, 2026-09-26) by the ORRERY overhaul lane.** Unless the owner put you on
that lane, do not take frontend work; its authority is `design/frontend/ORRERY.md` +
`design/frontend/OVERHAUL_PLAN_2026-09-25.md`, its status `design/frontend/ORRERY_HANDOFF.md` §2.

Frontend work (any screen, menu, HUD, map, pause): follow
[`docs/UI_VISUAL_ITERATION.md`](docs/UI_VISUAL_ITERATION.md). Shoot the real screen over a still
(`node scripts/ui-bench.mjs --shot=<id>`, seconds, no game boot), open that PNG yourself, fix what
you see, and `--walk` every control on the screens you changed before you call them done.

@AGENTS.md
