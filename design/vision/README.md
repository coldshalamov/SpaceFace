# SpaceFace Vision Pack — unified product truth

**Created:** 2026-07-09  
**Purpose:** One place that answers *what is this game*, *what is actually done*, *what assets exist*, and *what to build next* — without reading 5,400+ lines of drifting sprint docs.

---

## Start here (read in this order)

| # | Doc | What it is |
|---|---|---|
| 0 | [`00_CONSTITUTION.md`](./00_CONSTITUTION.md) | **Player product law.** Fun, open chart travel, massline toy, easy piloting, glass strategy UI, original identity, assist-first. **Outranks** `spec2/00_MASTER_TASTE.md` where they conflict. |
| 1 | [`01_CURRENT_STATE.md`](./01_CURRENT_STATE.md) | **Done / partial / missing / broken-in-play** across all sprint suites. Trust this + live `check:*` over older status docs. |
| 2 | [`02_RESEARCH_SYNTHESIS.md`](./02_RESEARCH_SYNTHESIS.md) | Genre research (professional space games + external agent research) → SpaceFace opportunity map. |
| 3 | [`03_MASTER_BUILD_PLAN.md`](./03_MASTER_BUILD_PLAN.md) | **The build plan you point agents at.** Ambitious, ordered waves, highest-value targets, goal-prompt ready. |
| 4 | [`04_ASSET_TRUTH.md`](./04_ASSET_TRUTH.md) | What GLBs exist, what is wired, blocked wholeships, queue, graphics sprint threads. |
| 5 | [`05_GOAL_PROMPTS.md`](./05_GOAL_PROMPTS.md) | Copy-paste goal prompts for autonomous agent sprints. |
| 6 | [`06_OPERATING_MODEL.md`](./06_OPERATING_MODEL.md) | **How to work:** tools (image/video/Blender/subagents), 10–20 iter quality ritual, weighted scores, must-have polish list, anti-derivative, sore thumbs. |
| 7 | [`07_AUTONOMOUS_PIPELINE.md`](./07_AUTONOMOUS_PIPELINE.md) | **Full overnight pipeline:** intake/triage → build loops → QA → review → wake report. |
| ★ soft | [`OVERNIGHT_GOAL.md`](./OVERNIGHT_GOAL.md) | Soft overnight: **allows partial** B1 + handoff (agents may stop early). |
| ★ strict | [`OVERNIGHT_GOAL_STRICT.md`](./OVERNIGHT_GOAL_STRICT.md) | **Strict overnight: forbids early stop** — fun ≥80, density, UI min, multi-agent review, live/compensated play. |
| — | [`SESSION_PLAN.md`](./SESSION_PLAN.md) | Live keep/skip + order for the current run. |
| — | [`WAKE_REPORT.md`](./WAKE_REPORT.md) | Morning handoff (filled at end of overnight). |

### Going to bed?

| You want… | Paste |
|---|---|
| Best-effort B1 + honest handoff if time runs out | `OVERNIGHT_GOAL.md` |
| **No early stop** until play/QA gates pass | **`OVERNIGHT_GOAL_STRICT.md`** |

Morning: open **`WAKE_REPORT.md`** first. If scores &lt; 80 or FAILED-STRICT → re-run STRICT.

---

## Authority when documents disagree

```
ARCHITECTURE.md (technical contract)
  > design/vision/00_CONSTITUTION.md          ← PLAYER PRODUCT LAW (new)
  > design/vision/06_OPERATING_MODEL.md       ← HOW agents execute (quality, tools, judgment)
  > design/vision/07_AUTONOMOUS_PIPELINE.md   ← FULL RUN PROCESS (overnight)
  > design/vision/03_MASTER_BUILD_PLAN.md     ← WHAT TO BUILD NEXT
  > design/vision/01_CURRENT_STATE.md         ← WHAT'S DONE (play-truth preferred over green checks alone)
  > design/GDD_2_0.md                         ← systems design (still valuable; experience layer may lag)
  > design/revamp/PROGRESS.md                 ← revamp task ledger (check-level DONE ≠ fun DONE)
  > design/spec2/* · design/spec3/* · design/revamp/BP-*   ← detailed implementation specs (use when a wave cites them)
  > design/spec2/00_MASTER_TASTE.md           ← SUPERSEDED on UI minimalism / anti-glass where constitution conflicts
  > design/CURRENT_BUILD_STATUS.md · BUILD_PLAN_2_0.md · V2_MASTER_PLAN.md · graphics-sprints/*  ← historical / lane ops
```

**Hard rule:** Green `check:*` is necessary for merge hygiene, **not** sufficient for “done.”  
Done requires **playtest + quality ritual scores** (constitution §7, operating model §4–10).

---

## How older folders relate (do not delete; deprioritize)

| Folder | Role after this pack |
|---|---|
| `design/spec2/` | Implementation detail for polish systems already built; acceptance scripts still useful |
| `design/spec3/` | Expansion specs; pull slices when a wave names them |
| `design/revamp/` | Wave 1.5–4 task history + BP detail packets; ledger in `PROGRESS.md` |
| `design/graphics-sprints/` | Parallel asset thread orchestration (still use for Blender lock) |
| `design/world-identity/` | Sector identity notes for world/content density work |
| `design/specs/` | Legacy 1.x subsystem specs — reference only |
| `design/_ARCHIVE/` | Dead graphics/HUD plans |

---

## One-line product pitch (locked 2026-07-09)

**Freelancer’s open chart and living systems, top-down, with massline physics as the signature toy — easy to play, dense strategy UI (data not prose), beautiful glass frontend, and places that feel full.**
