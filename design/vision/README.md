# SpaceFace Vision Pack — unified product truth

**Created:** 2026-07-09  
**Purpose:** One place that answers *what is this game*, *what is actually done*, *what assets exist*, and *what to build next* — without reading 5,400+ lines of drifting sprint docs.

---

## Start here (read in this order)

| # | Doc | What it is |
|---|---|---|
| ★ current | [`ALPHA_PROGRAM.md`](./ALPHA_PROGRAM.md) | **Current product-sprint execution authority.** Locked solo-alpha scope, milestone order, file leases, evidence contract, and acceptance ledger. |
| 0 | [`00_CONSTITUTION.md`](./00_CONSTITUTION.md) | Product framing for fun, open chart travel, massline, easy piloting, glass strategy UI, original identity, and assist-first play. |
| 1 | [`01_CURRENT_STATE.md`](./01_CURRENT_STATE.md) | **Done / partial / missing / broken-in-play** across all sprint suites. Trust this + live `check:*` over older status docs. |
| 2 | [`02_RESEARCH_SYNTHESIS.md`](./02_RESEARCH_SYNTHESIS.md) | Genre research (professional space games + external agent research) → SpaceFace opportunity map. |
| 3 | [`03_MASTER_BUILD_PLAN.md`](./03_MASTER_BUILD_PLAN.md) | Supporting pre-alpha roadmap and wave history; use only where `ALPHA_PROGRAM.md` activates it. |
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
  > design/GDD_2_0.md                         ← DESIGN AUTHORITY
  > design/spec2/00_MASTER_TASTE.md           ← INHERITED TASTE / REJECTION BAR
  > design/vision/ALPHA_PROGRAM.md            ← CURRENT PRODUCT-SPRINT EXECUTION AUTHORITY
  > specific spec2/spec3 task spec            ← IMPLEMENTATION DETAIL WHEN THE LEDGER CITES IT
  > design/vision/00_CONSTITUTION.md           ← PRODUCT FRAMING
  > design/vision/06_OPERATING_MODEL.md        ← SUPPORTING AGENT PRACTICE
  > design/vision/07_AUTONOMOUS_PIPELINE.md    ← HISTORICAL OVERNIGHT PROCESS
  > design/vision/03_MASTER_BUILD_PLAN.md      ← SUPPORTING ROADMAP
  > design/vision/01_CURRENT_STATE.md          ← STATUS SNAPSHOT; LIVE PROOF WINS
  > design/revamp/PROGRESS.md                 ← revamp task ledger (check-level DONE ≠ fun DONE)
  > uncited specs/revamp packets              ← REFERENCE ONLY UNTIL ACTIVATED
  > design/CURRENT_BUILD_STATUS.md · BUILD_PLAN_2_0.md · V2_MASTER_PLAN.md · graphics-sprints/*  ← historical / lane ops
```

**Hard rule:** Green `check:*` is necessary for merge hygiene, **not** sufficient for “done.”  
Done requires the live player-visible proof and independent acceptance named by `ALPHA_PROGRAM.md`.

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
