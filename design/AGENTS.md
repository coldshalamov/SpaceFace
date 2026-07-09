# design/ — Agent Notes

> The design authority stack. **Do not read the whole folder** — it's 5,400+ lines across three
> spec suites plus 21 loose files, much of it historical.
>
> **START HERE for product direction & what to build next (2026-07-09):**
> **`design/vision/README.md`** — unified constitution, current state, asset truth, master build plan, goal prompts.
>
> **All claims in older paragraphs below were verified first-hand 2026-07-05; the vision pack supersedes them on product priority and PLAY-truth.**

## Authority chain (when docs disagree)

1. `ARCHITECTURE.md` (at repo root) — the technical contract. (The old `design/ARCHITECTURE.md` handoff blurb that collided with it has been archived to `design/_ARCHIVE/handoff_architecture.md`.)
2. `design/GDD_2_0.md` — the design authority (vision, pillars, all system designs).
3. `design/spec2/00_MASTER_TASTE.md` — the inherited taste constitution for ALL work, including vision/spec3/revamp work. Its Forbidden list rejects diffs; the clean non-diegetic HUD rule remains standing policy.
4. **`design/vision/00_CONSTITUTION.md`** — product sprint law for what to build next, interpreted within the technical + taste contracts above.
5. **`design/vision/03_MASTER_BUILD_PLAN.md`** — wave order / goal prompts.
6. **`design/vision/01_CURRENT_STATE.md`** — done/partial/missing with **PLAY** column (checks alone != done).
7. The specific `design/spec2/` / `design/spec3/` / `design/revamp/BP-*` slice a wave cites for implementation detail.
8. `design/CURRENT_BUILD_STATUS.md` / `design/revamp/PROGRESS.md` — historical maps; **drift**; prefer vision pack + live `check:*`.

Older docs (`V2_MASTER_PLAN.md`, `IMPROVEMENT_IDEAS.md`, `HUD_REVAMP_DESIGN.md`, `GRAPHICS_*`, `FLIGHT_*`, `SKILLS_*`, `design/specs/*`) are **legacy/reference** unless a current doc explicitly revives a section. `GDD_2_0.md` outranks all of them.

## The three spec folders — both spec2 and spec3 are LIVE

Per user direction 2026-07-05: **spec3 is being finished and is effectively the current state** even where incomplete. Both suites are sanctioned; the task decides which.

| Folder | Status | Use for |
|---|---|---|
| `design/spec2/` | **LIVE — polish & release bar.** `00_MASTER_TASTE.md` is the taste constitution for ALL work. Specs `01`-`08`: feel, flight/camera juice, first hour, world-alive, economy, UI identity, audio, release readiness. | Feel, readability, onboarding, UI, audio, release gates. **Always read `00_MASTER_TASTE.md` first whatever you're doing.** |
| `design/spec3/` | **LIVE — expansion/ambition layer** (currently being finished; assume current state). Thread files `SPEC3-F1..F10`. Each is a self-contained build plan. | The work your brief names if it says "implement SPEC3-XX". Read `_context/06_PLANNING_CONSTITUTION.md` first. spec3 *extends* the GDD; never contradicts its pillars. |
| `design/specs/` | **LEGACY reference only.** Original 12 subsystem specs (00-11). | Nothing actively. |

The earlier policy contradiction (old AGENTS.md said "spec2 only"; live briefs dispatched spec3) is resolved — both are sanctioned. `README.md:87` mentions only spec2 and is stale on this point.

**The dispatch brief template** (used by repo-root `brief.md` and `design/spec3/CODEX_ORCHESTRATION_PROMPT.md`):
> "Read `design/spec2/00_MASTER_TASTE.md` fully, [then `design/spec3/_context/06_PLANNING_CONSTITUTION.md`,] then implement `<SPEC-XX §N>` from `<spec file>` exactly. Acceptance = the spec's named check script green. Touch only files your spec names unless the spec is missing a required file; then stop and name the missing file/spec fix. `git add -N` every new file immediately. Never edit `test/*.expected.json`. No silent runtime deps: build-time/tooling deps are allowed when documented; runtime deps require lead sign-off with license, bundle/perf, determinism/save, and maintenance notes."

If your brief points at spec3, **spec3 is current for that task** — do not re-litigate it against spec2. The taste constitution (spec2/00) still applies on top.

## Key files

- `design/GDD_2_0.md` — design authority.
- `design/BUILD_PLAN_2_0.md` — execution plan + file-ownership map for parallel agents + LOCKED input contract + per-item acceptance criteria. (Note: line 42's ownership of `flight.js`+`flightDynamics.js` is stale — V3 is live; see root `AGENTS.md` §4.)
- `design/CURRENT_BUILD_STATUS.md` — what's built / needs proof / not built / reference-only.
- `design/spec2/INDEX.md` — spec2 dispatch map (waves, parallel-safe lanes).
- `design/spec2/AGENT_PROMPTS.md` — 8 ready-to-paste spec2 dispatch briefs + Blender asset-production brief.
- `design/spec3/INDEX.md` — spec3 thread/spec tracker.
- `design/spec3/_context/06_PLANNING_CONSTITUTION.md` — spec3 constitution (format, taste, guardrails).
- `design/spec3/CODEX_ORCHESTRATION_PROMPT.md` — the live codex lead-engineer prompt.
- `design/adr/` — Architecture Decision Records. **Note: ADR-0003 (flight physics) is stale** — it documents "custom controller, Rapier optional" which the V3 migration reversed (Rapier is now default).

## Loose `design/*.md` files — drift, not authority

These exist but are not actively managed unless a current doc revives them:
`ACCESSIBILITY.md`, `CONTENT_BIBLE.md`, `EVENT_TAXONOMY.md`, `FLIGHT_ENGINE_SELF_REVIEW.md`, `FLIGHT_PHYSICS_SPEC.md`, `GRAPHICS_MASTERPLAN.md`, `GRAPHICS_SPEC.md`, `GRAPHICS_UPGRADE_PLAN.md`, `HUD_REVAMP_DESIGN.md` (superseded where it asks for visor/cockpit motifs), `IMPROVEMENT_IDEAS.md`, `LOCATIONS.md`, `PERF_BUDGET.md`, `PLAYTEST_SCRIPT.md`, `QA_MATRIX.md`, `SKILLS_IMPROVEMENT_SPEC.md`, `STATION_MARKET_UI_REVAMP.md`, `V2_MASTER_PLAN.md`, `ARCHITECTURE.md` (a *different*, older ARCHITECTURE.md than the repo-root one — the repo-root one is authoritative).
