# design/ — Agent Notes

> The design authority stack. **Do not read the whole folder** — it contains several active suites,
> execution ledgers, research evidence, and archives with different authority.
>
> **START HERE for current position and what to build next:** `design/program/README.md`.
> It is the only whole-program status/pickup surface. Live checks, git state, and player-route evidence
> still outrank it.

## Authority chain (when docs disagree)

1. `ARCHITECTURE.md` (repo root) — technical contract.
2. `design/GDD_2_0.md` — game-design authority and pillars.
3. `design/program/README.md` plus its numbered pages — unified current status, acceptance, and pickup.
4. `design/vision/ALPHA_PROGRAM.md` — canonical Alpha scope and execution order.
5. The activated `spec2/`, `spec3/`, `revamp/`, `depth-program/`, graphics, or world-identity plan — task detail.
6. Code, live checks, and player-facing evidence — implementation and acceptance truth.
7. Historical ledgers, handoffs, transcripts, and `_ARCHIVE/` — context only.

`spec2/00_MASTER_TASTE.md` is historical taste context, not a mandatory visual system. Its clean
non-diegetic HUD rule remains standing policy; its palette, glow, radius, and surface recipes do not.

Older loose graphics/HUD plans and the legacy 1.x subsystem specs are under `design/_ARCHIVE/`.
Archived material never overrides the active hierarchy above. Do not infer that an absent or unwired
feature plan is stale: preserve valuable future intent and label its implementation state accurately.

## The three spec folders — both spec2 and spec3 are LIVE

Per user direction 2026-07-05: **spec3 is being finished and is effectively the current state** even where incomplete. Both suites are sanctioned; the task decides which.

| Folder | Status | Use for |
|---|---|---|
| `design/spec2/` | **LIVE — polish references and release bar.** `00_MASTER_TASTE.md` is historical taste context, not a mandatory visual system. Specs `01`-`08`: feel, flight/camera juice, first hour, world-alive, economy, UI identity, audio, release readiness. | Use the relevant slice for behavior and release intent; choose visual treatment from current evidence. |
| `design/spec3/` | **LIVE — expansion/ambition layer** (currently being finished; assume current state). Thread files `SPEC3-F1..F10`. Each is a self-contained build plan. | The work your brief names if it says "implement SPEC3-XX". Read `_context/06_PLANNING_CONSTITUTION.md` first. spec3 *extends* the GDD; never contradicts its pillars. |
| `design/specs/` → `design/_ARCHIVE/specs-1.x/` | **ARCHIVED 2026-07-13.** Original 12 subsystem specs (00-11); all implemented, superseded by spec2/spec3. | Nothing actively. |

The earlier policy contradiction (old AGENTS.md said "spec2 only"; live briefs dispatched spec3) is resolved — both are sanctioned.

**The dispatch brief template** (used by `design/spec3/CODEX_ORCHESTRATION_PROMPT.md`):
> "Read the task's relevant spec and implement the behavior and player-facing result it requires. Acceptance = the named check plus screenshot/evidence review. Touch the files needed for a coherent result, including integration files when required. `git add -N` every new file immediately. Never edit `test/*.expected.json`. Runtime and build-time dependencies are allowed when they materially improve quality and have documented license, bundle/perf, determinism/save, and maintenance impact."

If your brief points at spec3, **spec3 is current for that task** — do not re-litigate it against spec2. `spec2/00` may inform behavior and release intent, but it does not impose a palette, glow, radius, shell, texture, triangle, or other visual ceiling on top of current work.

## Key files

- `design/program/README.md` — only global status/pickup index; its numbered pages separate verified done, remaining work, acceptance, worktree integration, and resume/final review.
- `design/GDD_2_0.md` — design authority.
- `design/vision/ALPHA_PROGRAM.md` — Alpha M0-M6 scope and order.
- `design/BUILD_PLAN_2_0.md` / `design/CURRENT_BUILD_STATUS.md` — earlier implementation maps; useful detail, not global status authority. Cross-check live paths.
- `design/depth-program/BUILD_PLAN.md` — detailed Depth Program plan; `PROGRESS_LEDGER.md` is its subordinate evidence ledger.
- `design/spec2/INDEX.md` — spec2 dispatch map (waves, parallel-safe lanes).
- `design/spec2/AGENT_PROMPTS.md` — 8 ready-to-paste spec2 dispatch briefs + Blender asset-production brief.
- `design/spec3/INDEX.md` — spec3 thread/spec tracker.
- `design/spec3/_context/06_PLANNING_CONSTITUTION.md` — spec3 constitution (format, taste, guardrails).
- `design/spec3/CODEX_ORCHESTRATION_PROMPT.md` — orchestration procedure, not status authority.
- `design/adr/` — Architecture Decision Records. **Note: ADR-0003 (flight physics) is stale** — it documents "custom controller, Rapier optional" which the V3 migration reversed (Rapier is now default).

## Remaining loose `design/*.md` files

These still exist and are live references (cited by code, CI, or live specs); manage them in place:
`ACCESSIBILITY.md` (cited by `check-wcag-contrast.mjs`), `CONTENT_BIBLE.md` (balance authority referenced by `design/spec3/_context/02_SIM_ECONOMY_WORLD.md` — use for target economics, not live IDs), `EVENT_TAXONOMY.md` (cited by `src/systems/telemetry.js` + `scripts/build-code-index.mjs`), `PERF_BUDGET.md` (the frame-time contract; cited by `check:perf-budget`), `STATION_SHELL_CONTRACT.md` (cited by `check:station-shell`).

Archived under `design/_ARCHIVE/`: `HUD_REVAMP_DESIGN.md`, `STATION_MARKET_UI_REVAMP.md`, `GRAPHICS_SPEC.md`, `GRAPHICS_MASTERPLAN.md`, `GRAPHICS_UPGRADE_PLAN.md`, `handoff_architecture.md`, and the `specs-1.x/` suite.

Removed entirely (superseded, no live citations): `V2_MASTER_PLAN`, `IMPROVEMENT_IDEAS`, `FLIGHT_PHYSICS_SPEC`, `SKILLS_IMPROVEMENT_SPEC`, `WORLD_OVERHAUL_2_1`, `FLIGHT_ENGINE_SELF_REVIEW`, `PLAYTEST_SCRIPT`, `QA_MATRIX`, `LOCATIONS`.
