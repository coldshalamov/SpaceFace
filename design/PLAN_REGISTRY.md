# SpaceFace Plan Registry

**Purpose:** route agents to the right plan without turning every plan, handoff, or evidence ledger
into a competing authority. This is a family-level registry; detailed file inventories belong in the
folder indexes.

## Status and authority rules

1. `ARCHITECTURE.md` owns technical contracts; `design/GDD_2_0.md` owns game design.
2. Repo-root [`../CANONICAL_BUILD_MAP.md`](../CANONICAL_BUILD_MAP.md) is the **agent program front door**
   (workflow + routing). [`program/PROGRAM_MAP.md`](./program/PROGRAM_MAP.md) is the expanded family map
   and [`program/roadmap/program-queue.json`](./program/roadmap/program-queue.json) is the explicit
   priority overlay. `program/roadmap/**` retains stable packet identity while `program/01–05` retain
   verified/remaining/acceptance/integration truth.
3. `design/vision/ALPHA_PROGRAM.md` and `design/depth-program/BUILD_PLAN.md` own scope/order for their
   programs. They do not override live implementation evidence.
4. A task's activated spec owns detailed intent. Code, current checks, public routes, evidence, and
   git identity decide whether that intent is actually implemented and accepted.
5. Ledgers outside `design/program/**` are subordinate evidence indexes. Prompts, handoffs, reviews,
   terminal transcripts, and archived plans never establish completion.
6. Preserve valuable future work. Mark it `FUTURE` or `PARTIAL`; do not delete it merely because no
   implementation exists yet.

## Plan-family map

| Family | Canonical role | Current disposition | Status owner |
|---|---|---|---|
| [`program/`](./program/README.md) | Unified Alpha + Depth pickup, verified done, remaining work, acceptance, integration | **ACTIVE — sole global status** | Lead/status integrator only |
| [`program/PROGRAM_MAP.md`](./program/PROGRAM_MAP.md) and [`program/roadmap/program-queue.json`](./program/roadmap/program-queue.json) | Cross-plan routing, explicit priority, dependencies, and safe dispatch grouping | **ACTIVE DISPATCH FRONT DOOR — no completion authority** | Lead may reorder with a documented rationale; proof still projects into `program/01–05` |
| [`program/roadmap/`](./program/roadmap/README.md) | 113 stable execution packets, dependencies, agent workflow, and collision-safe work order | **ACTIVE WORK ORDER — no completion authority** | Lead activates leases in `program/NOW.md`; proof projects into `program/01–05` |
| [`program/06_RETAINED_FUTURE_BACKLOG.md`](./program/06_RETAINED_FUTURE_BACKLOG.md) | Reservoir only for valuable outcomes not yet mapped to an active roadmap packet | **RETAINED — not a second queue** | Lead assigns a roadmap ID before execution and updates milestone roll-up |
| [`program/07_HISTORICAL_BUILDS.md`](./program/07_HISTORICAL_BUILDS.md) | Finished handoffs, recent build provenance, and deferred verification | **HISTORY — verification queue only** | Lead reopens defects through stable roadmap IDs |
| [`vision/ALPHA_PROGRAM.md`](./vision/ALPHA_PROGRAM.md) | M0–M6 Alpha scope, order, leases, evidence contract | **ACTIVE SCOPE** | Alpha design lead; completion projected into `program/` |
| [`depth-program/`](./depth-program/README.md) | 31-chunk Depth scope, sequencing, research provenance, and worked actualization pipelines | **ACTIVE SCOPE** | Depth design lead; detail in `PROGRESS_LEDGER.md`, roll-up in `program/` |
| [`production/`](./production/README.md) | Production controller, evidence, capability, observatory, and hard-gate machinery | **PARTIAL / FUTURE CONTROL PLANE** | Packet evidence only; `08_IMPLEMENTATION_BACKLOG.md` is subordinate |
| [`spec2/`](./spec2/INDEX.md) | Shipped-system polish/release intent and behavioral reference | **ACTIVE REFERENCE / PARTIAL** | Activated task spec; never a global ledger |
| [`spec3/`](./spec3/INDEX.md) | Ambition and expansion plans F1–F10 | **ACTIVE FUTURE / PARTIAL** | Activated task spec; reconcile stale cited paths before work |
| [`revamp/`](./revamp/README.md) | Revamp outcome packets, detail quarry, focused UX/physics references, and historical implementation receipts | **ACTIVE DETAIL + HISTORY** | `PROGRESS.md` is subordinate check evidence |
| [`graphics-sprints/`](./graphics-sprints/README.md) | Visual priority, outcome coverage, optional evidence ritual, and explicitly activated concurrent execution | **ACTIVE DETAIL; OPS ON ACTIVATION** | README selects the relevant document; quality/status rolls into `program/` |
| [`needed-assets.md`](../needed-assets.md), [`assets/QUEUE.md`](../assets/QUEUE.md), live manifests, and [`production/asset-classifications/`](./production/asset-classifications/) | Asset-production coverage, authoring queue, runtime declarations, and acceptance candidates | **PARTIAL / FUTURE ASSET PRODUCTION** | Graphics/asset owner under active locks; acceptance and status roll into `program/` |
| [`world-identity/`](./world-identity/PIPELINE.md) | Sector identity, navigation, place specs, and asset/content pipeline | **ACTIVE CONTENT AUTHORITY** | World-content owner; implementation proof required |
| [`worldbuilding/`](../docs/worldbuilding/) | Narrative canon, sheets, discovery indexes, and future story branches | **ACTIVE CANON + FUTURE** | Canon files own prose; runtime code owns implementation truth |
| [`ASTEROID_OPS_VISION.md`](./ASTEROID_OPS_VISION.md), [`ASTEROID_OPS_UI_BRIEF.md`](./ASTEROID_OPS_UI_BRIEF.md), [`ASTEROID_SITES_BRIEF.md`](./ASTEROID_SITES_BRIEF.md) | Active Asteroid Ops mechanics roadmap, implemented shell contract, and retained original contact-ring design | **ACTIVE DETAIL / RETAINED REFERENCE** | Roadmap `A01–A20` owns order/status; these documents own design detail only |
| [`MAP_UX_PLAN.md`](./MAP_UX_PLAN.md), [`MAP_DATA_HANDOFF.md`](./MAP_DATA_HANDOFF.md), [`MAP_OVERHAUL_BRIEF.md`](./MAP_OVERHAUL_BRIEF.md) | Occupied map implementation, remaining content/data packet, and research dossier | **ACTIVE LEASE / ACTIVE DETAIL / RESEARCH** | Current map owner; status rolls into `program/` |
| [`POLISH_BRIEFING.md`](./POLISH_BRIEFING.md) | Code-derived 2026-07-16 findings | **RETAINED RESEARCH — not build order** | Map valid outcomes to roadmap IDs before execution |
| [`revamp/_history/`](./revamp/_history/) and [`_ARCHIVE/`](./_ARCHIVE/README.md) | Superseded plans, reviews, and historical handoffs | **HISTORY — DO NOT IMPLEMENT BY DEFAULT** | None |

## Frequently mistaken standalone documents

| Document | Classification | Correct use |
|---|---|---|
| [`BUILD_PLAN_2_0.md`](./BUILD_PLAN_2_0.md) | **HISTORY / OWNERSHIP REFERENCE** | Useful for lane/ownership archaeology only. It is not current status or implementation authority; route any still-valuable outcome through [`program/06_RETAINED_FUTURE_BACKLOG.md`](./program/06_RETAINED_FUTURE_BACKLOG.md) before admission. |
| [`CURRENT_BUILD_STATUS.md`](./CURRENT_BUILD_STATUS.md) | **HISTORICAL SPEC2 CHECK SNAPSHOT** | A dated check map, not current status or authority. Re-run live checks and retain any uncovered outcome through the retained backlog. |
| [`vision/ASSET_DEPTH_AND_PIPELINE_PLAN.md`](./vision/ASSET_DEPTH_AND_PIPELINE_PLAN.md) | **LEGACY ASSET-DEPTH REFERENCE** | Preserve useful asset-depth reasoning only; it is not the active asset plan, status surface, budget, or quality authority. Route viable outcomes through the retained backlog. |
| [`VISUAL_ASSET_PLAN.md`](../VISUAL_ASSET_PLAN.md) | **HISTORICAL GENERATION LEDGER** | Generation history and provenance clues only. It does not prove a runtime asset is current or accepted; route useful unbuilt outcomes through the retained backlog. |
| [`docs/Spec/MASTER_MAKEOVER_PLAN.md`](../docs/Spec/MASTER_MAKEOVER_PLAN.md) | **HISTORICAL MAKEOVER PLAN** | Historical makeover intent, not current design/status authority. Deduplicate worthwhile outcomes against live plans and route them through the retained backlog. |
| [`production/ORCHESTRATOR_GOAL.md`](./production/ORCHESTRATOR_GOAL.md) | **PROCEDURE** | A campaign/orchestration procedure, not product status, scope authority, or evidence of completion. Preserve any unscheduled product outcome through the retained backlog. |

## Status vocabulary

| Label | Meaning |
|---|---|
| `ACTIVE SCOPE` | Defines required outcomes/order; does not prove implementation. |
| `ACTIVE DETAIL` | Applies when a current program row activates it. |
| `PARTIAL` | Some implementation exists; exact remaining work must stay explicit. |
| `FUTURE` | Valuable unimplemented intent intentionally retained. |
| `RETAINED` | Preserved outcome with a stable ID, but not committed work until admitted to `program/02_REMAINING_WORK.md`. |
| `SUBORDINATE EVIDENCE` | Detailed receipts/check history; cannot promote global completion. |
| `HISTORY` | Useful provenance or superseded reasoning; not an implementation instruction. |

## Updating status without drift

1. Deduplicate an outcome against live code, Alpha/Depth scope, and `program/roadmap/**`. If mapped,
   update that packet. If unmapped, retain it in `program/06_RETAINED_FUTURE_BACKLOG.md` until the lead
   assigns a stable roadmap ID and projects it into the milestone-level `program/02_REMAINING_WORK.md`.
2. Activate only a bounded READY packet through `program/NOW.md` with dependencies, exact path lease,
   focused commands, and terminal proof.
3. Update the owning feature/packet/chunk ledger with exact code, check, public-route, evidence, and
   git identity.
4. Return the packet receipt to the lead/status integrator.
5. Update `program/01_VERIFIED_DONE.md`, `program/02_REMAINING_WORK.md`, and
   `program/03_LIVE_ACCEPTANCE_MATRIX.md` together.
6. Update `program/04_WORKTREE_AND_INTEGRATION.md` if recoverability changed.
7. Treat clean-wave counts as conditional unless a controller record explicitly adopts
   `production/01_BUILD_PROGRAM.md` for the named release run.

This registry describes document roles, not implementation truth. When it disagrees with current
checks, runtime routes, or git, fix the registry in the same pass.
