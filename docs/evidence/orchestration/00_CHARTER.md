# SpaceFace Multi-Agent Polish Orchestration Charter

**Role of this folder:** dispatch contracts, live truth, and agent packets.  
**Orchestrator:** Grok (this session).  
**Advisor first:** Claude Fable (extra-high effort).  
**Builders:** Codex (backend volume), Kimi K3 (2–3 high-taste), Grok (grunt + integrate).  
**Graphics peer lane:** `SpaceFace-graphics-overhaul` — do not merge or rewrite.

## Doctrine

1. **Plans are starting points, not law.** July program ledgers are progress-agnostic and often stale.
2. **Live code + checks + player route decide truth.** If a test fails, classify:
   - **REAL** — product broken for players
   - **STALE** — contract/string/golden out of date with intentional design
   - **HARNESS** — test boot/coords/injection wrong (e.g. M2 global-coord soaks)
3. **Never “fix” by weakening goldens** without a written re-record decision.
4. **Creativity required** — sew existing systems; don’t rebuild from old recipes.
5. **Graphics fence** — no `assets/**` thruster/material remasters, no heavy `src/render` presentation work in this orchestration.
6. **Fable judgment first** on architecture taste and expansion priority after context is gathered.
7. **Limit agent grep** — orchestrator packs context; agents implement from packets.
8. **Quality bar** — modern 2020s Steam space games (composite): Endless Sky / Naev depth of systems, Freelancer/Rebel Galaxy readability of world activity, Starsector faction/ecology density, No Man’s Sky wonder/presentation *as aspirational framing only* (not copy). SpaceFace must feel intentional, causal, and professionally finished — not a tech demo.

## Agent budgets

| Agent | Budget | Role |
|---|---|---|
| Claude Fable | ~5–7 tasks | Advisor, architecture, taste, hard cross-cuts |
| Kimi K3 (opencode) | 2–3 tasks | Taste/UI/story/3D-adjacent *presentation code* only |
| Codex GPT | many | Backend, harnesses, sim, save, determinism |
| Grok | continuous | Context, dispatch, gates, grunt, integration |

## Worktrees

| Path | Branch | Purpose |
|---|---|---|
| `SpaceFace-depth-actualization` | `grok/depth-player-route-actualization` | Integration spine + Grok work |
| `SpaceFace-graphics-overhaul` | `codex/graphics-overhaul` | **PEER — leave alone** |
| `SpaceFace-orch-*` | per-task branches | Codex/Fable/Kimi isolation |

## Return format (every agent)

```
LIVE AUDIT
DIFF SUMMARY
GATES (command + exit)
FAILURE CLASS (REAL | STALE | HARNESS | N/A)
PLAN DRIFT
RESIDUAL
```
