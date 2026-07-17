# Orchestration Status Board

**Updated:** 2026-07-17 (cycle: recovery green + driver skeleton)

## Active lanes (≥5)

| # | Lane | Work |
|---|---|---|
| 1 | Codex recovery2 | orch-codex-recovery (partial; spine integrated) |
| 2 | Codex Helios | orch-codex-helios dispatched |
| 3 | OpenCode Kimi | NAV-HUD taste slot 1 |
| 4 | Subagent Helios fix | spine autopilot diagnose/fix |
| 5 | Subagent V2/D1 | residual depth producers |
| 6 | Grok spine | integrate, gates, packets |

## Spine commits

| SHA | Summary |
|---|---|
| `38de4306` | natural D10 multi-seed + F1 architecture |
| *(pending)* | recovery settle + naturalRoute skeleton |

## Done this cycle

- **W1 recovery REAL:** `popAncestorsUntilGameOverResolves` + `check:m3:recovery` GREEN
- **W2 driver skeleton:** `scripts/lib/naturalRoute.mjs` + seeds; D10 still GREEN 5/5
- D10 `check:depth-program:r2:natural-d10` exit 0

## Residual vs Steam bar

| Item | Status |
|---|---|
| Recovery settle | DONE (headless production path) |
| Helios dock hold | IN FLIGHT |
| NAV-HUD hierarchy | Kimi dispatched |
| R2/E1 natural multi-seed | residual after driver |
| V2/D1 carriers | subagent |
| Expansion ~30% | pending after W1 close |
| Graphics fence | held (no thrusters/assets) |

## Non-goals

Graphics assets, menu/input thrash, station shell, mining rewrite, B0–B7 full story
