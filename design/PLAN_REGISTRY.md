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
| [`program/`](./program/README.md) | Unified Alpha + Depth pickup, verified done, remaining work, acceptance, integration | **ACTIVE — sole global status** | The finishing agent updates only its exact unit and affected roll-up rows |
| [`program/PROGRAM_MAP.md`](./program/PROGRAM_MAP.md) and [`program/roadmap/program-queue.json`](./program/roadmap/program-queue.json) | Cross-plan routing, explicit priority, dependencies, and safe dispatch grouping | **ACTIVE DISPATCH FRONT DOOR — no completion authority** | Any finishing agent may maintain its exact row with a documented rationale; proof still projects into `program/01–05` |
| [`program/roadmap/`](./program/roadmap/README.md) | Stable execution packet identities, dependencies, agent workflow, and collision-safe work order | **ACTIVE WORK ORDER — no completion authority** | A mutating thread records and releases its own short `NOW.md` row; proof projects into `program/01–05` |
| [`program/06_RETAINED_FUTURE_BACKLOG.md`](./program/06_RETAINED_FUTURE_BACKLOG.md) | Reservoir only for valuable outcomes not yet mapped to an active roadmap packet | **RETAINED — not a second queue** | The agent shaping the bounded task assigns the stable roadmap ID and updates the milestone roll-up |
| [`program/07_HISTORICAL_BUILDS.md`](./program/07_HISTORICAL_BUILDS.md) | Finished handoffs, recent build provenance, and deferred verification | **HISTORY — verification queue only** | Lead reopens defects through stable roadmap IDs |
| [`vision/ALPHA_PROGRAM.md`](./vision/ALPHA_PROGRAM.md) | M0–M6 Alpha scope, order, task boundaries, evidence contract | **ACTIVE SCOPE** | Alpha design authority; completion projected into `program/` |
| [`vision/GAME_DIRECTION_EXPANSION.md`](./vision/GAME_DIRECTION_EXPANSION.md) | Durable cross-system product promises, thirty design axes, five launch-coherence frames, research transfers/refusals, and slice-shaping rules | **DURABLE DIRECTION — not admitted work, gate, or status** | Product/GDD authority adopts decisions; future implementation enters only through an admitted program packet |
| [`vision/INFERENCE_CONVERGENCE_METHOD.md`](./vision/INFERENCE_CONVERGENCE_METHOD.md) | Selective PR #92 synthesis: ordinary-player diagnosis, mechanism transfer, candidate selection, causal critique, composition, and propagation learning | **DURABLE SUPPORTING METHOD — not dispatch, status, proof, or acceptance** | Design curates the method; an admitted queue leaf and active packet separately own paths, checks, evidence, and promotion |
| [`depth-program/`](./depth-program/README.md) | 31-chunk Depth scope, sequencing, research provenance, and worked actualization pipelines | **ACTIVE SCOPE** | Depth design lead; detail in `PROGRESS_LEDGER.md`, roll-up in `program/` |
| [`production/`](./production/README.md) | Production controller, evidence, capability, observatory, and hard-gate machinery | **PARTIAL / FUTURE CONTROL PLANE** | Packet evidence only; `08_IMPLEMENTATION_BACKLOG.md` is subordinate |
| [`PERFORMANCE_MODERNIZATION_EXECUTION_PLAN.md`](./PERFORMANCE_MODERNIZATION_EXECUTION_PLAN.md) and [`PERFORMANCE_OPTIMIZATION_CONSTELLATION.md`](./PERFORMANCE_OPTIMIZATION_CONSTELLATION.md) | Selected performance modernization sequence plus supporting option/research appendix | **ACTIVE SOURCE PLAN via PQ-034–PQ-044; conditional continuations remain deferred** | Queue/active packets own lifecycle and proof; the plan does not self-claim files |
| [`PERF_OPTION_SPACE.md`](./PERF_OPTION_SPACE.md) | Exhaustive same-picture performance option space: investigations, tabletop-correct cuts, admission, sim/WASM/Worker, and native/WebGPU/Rust leaves (`PQ-061`–`PQ-094`) | **RESERVED CATALOG — not admitted work** | Map §8.2 owns the identity list; admit a leaf into the queue before implementation |
| [`spec2/`](./spec2/INDEX.md) | Shipped-system polish/release intent and behavioral reference | **ACTIVE REFERENCE / PARTIAL** | Activated task spec; never a global ledger |
| [`spec3/`](./spec3/INDEX.md) | Ambition and expansion plans F1–F10 | **ACTIVE FUTURE / PARTIAL** | Activated task spec; reconcile stale cited paths before work |
| [`revamp/`](./revamp/README.md) | Revamp outcome packets, detail quarry, focused UX/physics references, and historical implementation receipts | **ACTIVE DETAIL + HISTORY** | `PROGRESS.md` is subordinate check evidence |
| [`graphics-sprints/`](./graphics-sprints/README.md) | Visual priority, outcome coverage, optional evidence ritual, and explicitly activated concurrent execution | **ACTIVE DETAIL; OPS ON ACTIVATION** | README selects the relevant document; quality/status rolls into `program/` |
| [`needed-assets.md`](../needed-assets.md), [`assets/QUEUE.md`](../assets/QUEUE.md), live manifests, and [`production/asset-classifications/`](./production/asset-classifications/) | Asset-production coverage, authoring queue, runtime declarations, and acceptance candidates | **PARTIAL / FUTURE ASSET PRODUCTION** | Graphics/asset owner under active locks; acceptance and status roll into `program/` |
| [`world-identity/`](./world-identity/PIPELINE.md) | Sector identity, navigation, place specs, and asset/content pipeline | **ACTIVE CONTENT AUTHORITY** | World-content owner; implementation proof required |
| [`worldbuilding/`](../docs/worldbuilding/) | Narrative canon, sheets, discovery indexes, and future story branches | **ACTIVE CANON + FUTURE** | Canon files own prose; runtime code owns implementation truth |
| [`ASTEROID_OPS_VISION.md`](./ASTEROID_OPS_VISION.md), [`ASTEROID_OPS_UI_BRIEF.md`](./ASTEROID_OPS_UI_BRIEF.md), [`ASTEROID_SITES_BRIEF.md`](./ASTEROID_SITES_BRIEF.md) | Active Asteroid Ops mechanics roadmap, implemented shell contract, and retained original contact-ring design | **ACTIVE DETAIL / RETAINED REFERENCE** | Roadmap `A01–A20` owns order/status; these documents own design detail only |
| [`MAP_UX_PLAN.md`](./MAP_UX_PLAN.md), [`MAP_DATA_HANDOFF.md`](./MAP_DATA_HANDOFF.md), [`MAP_OVERHAUL_BRIEF.md`](./MAP_OVERHAUL_BRIEF.md) | Occupied map implementation, remaining content/data packet, and research dossier | **ACTIVE LEASE / ACTIVE DETAIL / RESEARCH** | Current map owner; status rolls into `program/` |
| [`PHYSICAL_PLAY_GRAMMAR.md`](./PHYSICAL_PLAY_GRAMMAR.md) | Mechanics-level design for physical play: the primitive/state/outcome grammar, input models, presentation language, and the record of approaches set aside with their reasons | **ACTIVE DESIGN PROPOSAL — not admitted work** | Design owner; §10 is append-only. Where it disagrees with `GDD_2_0.md` §4–§6 it is the more recent intent and the GDD should be corrected in the same pass |
| [`PHYSICAL_PLAY_BUILD_PLAN.md`](./PHYSICAL_PLAY_BUILD_PLAN.md) | Seam map, contradictions, missing foundations, order of operations, and process changes required to implement the grammar | **ACTIVE BUILD PROPOSAL — not admitted work** | The agent shaping an assigned bounded slice gives it a roadmap ID; dated `file:line` claims must be re-verified before acting |
| [`AGENT_EXECUTION_GUIDE.md`](./AGENT_EXECUTION_GUIDE.md) | How to staff work against the physical-play plan: context class, model class, vision needs, parallelism and mutex reality, loop-avoidance, and what agents can produce in the art/generated-media pipelines | **ACTIVE DISPATCH REFERENCE** | Dispatcher; complements `00_EXECUTION_PROTOCOL.md` (which owns proof) rather than replacing it |
| [`sequential-build-plan/`](./sequential-build-plan/) | SF-00…SF-32 critical path, the user's own design words, and the PQ↔T↔SF collision/flag map | **RETAINED SOURCE — previously unregistered** | Contains material not represented elsewhere (including swarm rebalance and the cross-namespace overlap analysis). Dedupe against `program/roadmap/**` before admitting anything from it |
| [`HUD_FLIGHT_ATTENTION.md`](./HUD_FLIGHT_ATTENTION.md) | Flight HUD attention pass: jobs-by-verb, ink-on-vacuum instruments, receipts instead of toast cards, no windshield key laundry | **ACTIVE EXECUTION PLAN — user-authorized 2026-08-13** | Implements GDD §8 / §9.4 on the live flight route; operator prompt is `HUD_FLIGHT_ATTENTION_GOAL.txt`. Does not replace VISION/GDD. Cleanup of process artifacts is part of done. |
| [`POLISH_BRIEFING.md`](./POLISH_BRIEFING.md) | Code-derived 2026-07-16 findings | **RETAINED RESEARCH — not build order** | Map valid outcomes to roadmap IDs before execution |
| [`revamp/_history/`](./revamp/_history/) and [`_ARCHIVE/`](./_ARCHIVE/README.md) | Superseded plans, reviews, and historical handoffs | **HISTORY — DO NOT IMPLEMENT BY DEFAULT** | None |

## Frequently mistaken standalone documents

| Document | Classification | Correct use |
|---|---|---|
| [`BUILD_PLAN_2_0.md`](./BUILD_PLAN_2_0.md) | **HISTORY / OWNERSHIP REFERENCE** | Useful for lane/ownership archaeology only. It is not current status or implementation authority; route any still-valuable outcome through [`program/06_RETAINED_FUTURE_BACKLOG.md`](./program/06_RETAINED_FUTURE_BACKLOG.md) before admission. |
| [`revamp/HUD_THREE_ANCHOR.md`](./revamp/HUD_THREE_ANCHOR.md), [`revamp/GEMINI_HUD_BRIEF.md`](./revamp/GEMINI_HUD_BRIEF.md) | **DATED HUD RECEIPTS** | Useful for why the command bar left flight. They are not current layout law. Execute [`HUD_FLIGHT_ATTENTION.md`](./HUD_FLIGHT_ATTENTION.md). |
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
   update that packet. If unmapped, retain it in `program/06_RETAINED_FUTURE_BACKLOG.md` until a
   bounded task is shaped with a stable roadmap ID and projected into `program/02_REMAINING_WORK.md`.
2. Select one bounded READY packet. Add a short `program/NOW.md` row only when mutation starts, with
   exact paths, focused commands, and terminal proof; remove it when mutation stops.
3. Update the owning feature/packet/chunk ledger with exact code, check, public-route, evidence, and
   git identity.
4. Write the exact packet receipt and a plain `DONE` or `NOT DONE` result.
5. The finishing agent updates `program/01_VERIFIED_DONE.md`, `program/02_REMAINING_WORK.md`, and
   `program/03_LIVE_ACCEPTANCE_MATRIX.md` together.
6. Update `program/04_WORKTREE_AND_INTEGRATION.md` if recoverability changed.
7. Treat clean-wave counts as conditional unless a controller record explicitly adopts
   `production/01_BUILD_PROGRAM.md` for the named release run.

This registry describes document roles, not implementation truth. When it disagrees with current
checks, runtime routes, or git, fix the registry in the same pass.
