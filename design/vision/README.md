# SpaceFace Vision Pack — unified product truth

**Created:** 2026-07-09  
**Purpose:** One place that answers *what is this game*, *what is actually done*, *what assets exist*, and *what to build next* — without reading 5,400+ lines of drifting sprint docs.

---

## Start here (read in this order)

| # | Doc | What it is |
|---|---|---|
| ★ status | [`../program/README.md`](../program/README.md) | **Unified pickup index.** Verified done, remaining Alpha + Depth work, live acceptance matrix, dirty-tree inventory, and final-review procedure. |
| ★ current | [`ALPHA_PROGRAM.md`](./ALPHA_PROGRAM.md) | **Current product-sprint scope/order authority.** Locked solo-alpha scope, milestone order, file leases, and evidence contract. `design/program/**` alone owns cross-program status. |
| 0 | [`00_CONSTITUTION.md`](./00_CONSTITUTION.md) | Product framing for fun, open chart travel, massline, easy piloting, data-dense strategy UI, original identity, and assist-first play. |
| 1 | [`01_CURRENT_STATE.md`](./01_CURRENT_STATE.md) | Compatibility checkpoint retained for historical pickup context. Use `design/program/**` for current status. |
| 2 | [`02_RESEARCH_SYNTHESIS.md`](./02_RESEARCH_SYNTHESIS.md) | Genre research (professional space games + external agent research) → SpaceFace opportunity map. |
| 3 | [`03_MASTER_BUILD_PLAN.md`](./03_MASTER_BUILD_PLAN.md) | Supporting pre-alpha roadmap and wave history; use only where `ALPHA_PROGRAM.md` activates it. |
| 4 | [`04_ASSET_TRUTH.md`](./04_ASSET_TRUTH.md) | What GLBs exist, what is wired, blocked wholeships, queue, graphics sprint threads. |
| 5 | [`05_GOAL_PROMPTS.md`](./05_GOAL_PROMPTS.md) | Copy-paste goal prompts for autonomous agent sprints. |
| 6 | [`06_OPERATING_MODEL.md`](./06_OPERATING_MODEL.md) | **How to work:** tools, defect-driven capture/play loops, independent review, must-have polish, anti-derivative, sore thumbs. |
| 7 | [`07_AUTONOMOUS_PIPELINE.md`](./07_AUTONOMOUS_PIPELINE.md) | **Full overnight pipeline:** intake/triage → build loops → QA → review → wake report. |
| ★ soft | [`OVERNIGHT_GOAL.md`](./OVERNIGHT_GOAL.md) | Soft overnight: **allows partial** B1 + handoff (agents may stop early). |
| ★ strict | [`OVERNIGHT_GOAL_STRICT.md`](./OVERNIGHT_GOAL_STRICT.md) | **Strict overnight: forbids early stop** — independent feel acceptance, density, UI minimum, multi-agent review, live/compensated play. |
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
  > design/spec2/00_MASTER_TASTE.md           ← HISTORICAL TASTE REFERENCE; VISUAL TOKENS NOT BINDING
  > design/vision/ALPHA_PROGRAM.md            ← CURRENT ALPHA SCOPE / ORDER AUTHORITY
  > specific spec2/spec3 task spec            ← IMPLEMENTATION DETAIL WHEN THE LEDGER CITES IT
  > design/vision/00_CONSTITUTION.md           ← PRODUCT FRAMING
  > design/vision/06_OPERATING_MODEL.md        ← SUPPORTING AGENT PRACTICE
  > design/vision/07_AUTONOMOUS_PIPELINE.md    ← HISTORICAL OVERNIGHT PROCESS
  > design/vision/03_MASTER_BUILD_PLAN.md      ← SUPPORTING ROADMAP
  > design/program/*                          ← SOLE CROSS-PROGRAM STATUS ROLL-UP
  > design/vision/01_CURRENT_STATE.md          ← HISTORICAL COMPATIBILITY SNAPSHOT
  > design/revamp/PROGRESS.md                 ← SUBORDINATE revamp evidence ledger
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
| `design/revamp/` | Wave 1.5–4 task history + BP detail packets; `PROGRESS.md` is subordinate check evidence, not global status |
| `design/graphics-sprints/` | Parallel asset thread orchestration (still use for Blender lock) |
| `design/world-identity/` | Sector identity notes for world/content density work |
| `design/_ARCHIVE/specs-1.x/` | Archived 1.x subsystem specs — do not implement |
| `design/_ARCHIVE/` | Dead graphics/HUD plans |

---

## One-line product pitch (locked 2026-07-09)

**Freelancer’s open chart and living systems, top-down, with massline physics as the signature toy — easy to play, dense strategy UI (data not prose), clean professional frontend, and places that feel full.**
