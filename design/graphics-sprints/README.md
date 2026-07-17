# Graphics Program — Start Here

> **Manual sprint kit — explicit activation required.** The files in this folder coordinate named
> concurrent graphics threads only when a user/lead launches them. They are not automatic authority
> for ordinary asset, renderer, UI, or integration work. Thread boundaries prevent simultaneous
> writers; they do not prohibit a coherent task from crossing seams after ownership is coordinated.

This folder coordinates the player-facing visual overhaul. It is not a taste bible and it does not
authorize quality cuts, arbitrary asset budgets, or process metrics as substitutes for judgment.

## Authority and routing

1. Root `AGENTS.md` owns repository safety, live-system routing, performance policy, and ownership.
2. [`TOP50_WONDER_BUILD_PLAN.md`](TOP50_WONDER_BUILD_PLAN.md) owns **priority and build order**: what
   produces the largest visible improvement first.
3. [`FULL_GRAPHICS_REVAMP_GOAL.md`](FULL_GRAPHICS_REVAMP_GOAL.md) owns **coverage and outcome bar**:
   which authored surfaces must ultimately reach a professional, coherent result.
4. [`design/revamp/BP-08_VISUAL_ASSET_SPEC.md`](../revamp/BP-08_VISUAL_ASSET_SPEC.md) supplies missing
   asset inventory and faction/role silhouette intent.
5. [`QUALITY_RITUAL.md`](QUALITY_RITUAL.md) is an **evidence template**, not a quota system. Screenshots,
   written critique, live-route proof, contract checks, and independent visual judgment matter; iteration
   counts and self-scores do not prove quality.
6. [`00_ORCHESTRATION.md`](00_ORCHESTRATION.md) routes concurrent lanes and single-writer integration.

`GOAL_FULL_PROFESSIONAL_GRAPHICS_REVAMP.md` is historical correction/evidence from the first revamp. It
documents why geometry-only claims were rejected, but it is not an active acceptance contract or current
status ledger. Handoffs are session evidence, not whole-program status.

Whole-program progress and remaining work live only in `design/program/`. Do not infer current completion
from dated counts in this folder; verify the current manifest, runtime maps, checks, and player-route
captures.

## Quality doctrine

- Judge the actual game camera first: silhouette, scale, materials, lighting, motion, context, and identity.
- Preserve authoring/export/runtime contracts, provenance, appropriate LOD/HLOD, batching, instancing, and
  reachability checks.
- Use references and techniques as a vocabulary, not a universal recipe. Choose the methods that serve the
  asset's role and avoid samey procedural sci-fi surfaces.
- A useful loop is inspect → render → critique → make the largest justified improvement → render again.
  Repeat until the visible result and technical evidence are convincing. No fixed loop count is required.
- Performance work removes invisible work and improves algorithms. It must not lower visible quality,
  disable authored assets, or impose fixed triangle/texture ceilings. Measured exceptions and asset-specific
  constraints belong in the live manifest/export contract with rationale.
- Acceptance requires the relevant automated checks plus current player-route screenshots (wide/context and
  useful close/detail views) reviewed by an agent or person who did not merely author the change.

## Working documents

| Document | Role |
|---|---|
| `TOP50_WONDER_BUILD_PLAN.md` | Ranked visual priority and slice exits |
| `FULL_GRAPHICS_REVAMP_GOAL.md` | Full authored-asset coverage and professional outcome bar |
| `CLI_ASSET_FOUNDRY_EXECUTION_PLAN.md` | Zero-cost CLI pipeline and six independently shippable checkpoints |
| `QUALITY_RITUAL.md` | Optional evidence/critique structure |
| `00_ORCHESTRATION.md` | Concurrent lanes, ownership, and lifecycle |
| `THREAD_A_...` through `THREAD_E_...` | Scoped lane briefs |
| `BLENDER_EXCLUSIVE_LOCK.md` | Exclusive authoring coordination |
| `HANDOFF_TEMPLATE.md` | Machine-readable handoff facts |
| `INTEGRATION_GATE.md` | Export/build/runtime integration checks |
| `GOAL_PROMPTS.md` | Copyable lane prompts; subordinate to this README |
