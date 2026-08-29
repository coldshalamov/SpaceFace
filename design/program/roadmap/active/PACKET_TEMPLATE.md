<!-- LIFETIME: ACTIVE_PACKET -->
# PQ-XXX — outcome title

```yaml
queueId: PQ-XXX
lifecycle: planned
acceptance: unproven
packetRevision: 1
owner: unclaimed
baseRequirement: re-read at claim time
```

## Outcome

One paragraph describing the player-visible result and the ordinary route that proves it. Name what makes it enjoyable or strategically meaningful, not only what data exists.

## Entry conditions

- [ ] Dependencies integrated at the candidate base.
- [ ] Current owner modules/events/APIs re-read and recorded below.
- [ ] Required leases/mutexes free.
- [ ] Existing behavior characterized by a seconds-scale test.
- [ ] `npm run check:baseline` run at the candidate base before the first edit; any entry red is noted (so a red at exit is attributable). Repair inherited reds when bounded; record them when not.
- [ ] Baseline route/performance evidence captured when relevant.

## Live seams

| Domain | Current owner | Existing seam to reuse | New seam, only if required |
|---|---|---|---|
| state | `path#symbol` | event/API/serializer | explicit proposal |

Unknown owner contracts are blockers. Replace role names with exact current symbols before lifecycle becomes `ready`.

## Player route and state machine

Write the route beats and a small state/receipt model. Identify stable IDs, deterministic tie-breaking, save boundaries, failure/recovery, and exactly-once effects.

## Agent-observable scenario

For any gameplay-feel, visual-continuity, combat, AI, or performance claim, name the smallest repeatable scenario that lets another agent observe the defect through time. Prefer a scenario in [`tools/agentic/scenarios.json`](../../../../tools/agentic/scenarios.json) and reuse `src/testing/lab/`, `src/core/runtimeWitness.js`, and `src/observability/` before creating another recorder.

Record:

- scenario ID and fixed seed;
- public input policy or input tape;
- semantic checkpoints (for example `reverse-command`, `first-hit`, `first-visible`), not arbitrary screenshot timestamps;
- telemetry fields needed to distinguish competing causes;
- the before/after metrics that can actually change the verdict;
- shipping-camera captures when the claim is visual;
- the exact evidence gap when the behavior cannot yet be represented headlessly.

A still can prove appearance. It cannot by itself prove oscillation, control latency, target churn, a hitch, or a trail that retracts over time. Temporal claims need temporal evidence.

## Work breakdown

### Phase 0 — characterization

- [ ] focused failing characterization;
- [ ] owner/write map;
- [ ] baseline cost model;
- [ ] one causal hypothesis for a feel/performance defect rather than several simultaneous guesses.

### Phase 1 — pure contracts/data

- [ ] bounded data or pure state machine;
- [ ] deterministic/adversarial tests.

### Phase 2 — owner wiring

- [ ] owner-side seams and idempotent effects;
- [ ] save/Continue.

### Phase 3 — presentation and route

- [ ] normal-route visuals/controls/accessibility;
- [ ] Browser/Electron evidence;
- [ ] matched performance;
- [ ] replay the same scenario/seed/input policy after mutation and compare against Phase 0.

## Write set

List exact paths when known. Otherwise list bounded owner directories and require an exact path budget before implementation. Shared/global files require an integrator-owned change or explicit lease.

## Non-goals

List adjacent systems, later breadth, alternate implementations, and tempting redesigns excluded from this packet.

## Performance and quality budget

Declare expected maximum growth in entities, colliders, queries/candidates, allocations, DOM/listeners, draw calls/programs, texture/residency, asset admission, save bytes, and serializer blocking. Name the matched route/profile and structural mitigation.

Never use default quality reduction as the mitigation.

> “Do not gain performance by reducing content, population, effects, draw distance, render quality, or default visual quality.”

## Verification budget

Run `npm run check:baseline` before and after edits — that's the default gate. Beyond that, choose
the checks proportionate to the change: a focused owner test for a small fix, broader checks for
render/sim/save work, and route-level evidence only when the change actually warrants it. The point
is to be *right*, not to fill out a verification matrix.

If you need the full validation ladder or broker-managed Browser/Electron route evidence, see
[`docs/VALIDATION_WORKFLOW.md`](../../../../docs/VALIDATION_WORKFLOW.md). Use the deterministic lab
(`src/testing/lab/`) for gameplay claims it can represent; reach for headed route evidence only when
a claim genuinely can't be proven headlessly.

For subjective player-feel or cross-system work, use the Central Brain loop in
[`design/program/CENTRAL_BRAIN.md`](../../CENTRAL_BRAIN.md): observe → reduce → make one intervention
→ replay identical conditions → compare → keep/revert. Do not run a fresh broad audit after every
repair.

List any packet-specific checks here (exact commands are fine when you know them), but don't treat
this as a mandatory inventory — an empty list just means "the default gate covers it."

## Review questions

A short list of architecture, player, visual, physics, accessibility, and performance questions specific to this outcome. Preferences unsupported by an invariant or observed defect are nonblocking advice.

## Stop conditions

List missing owner seams, semantic collisions, lease conflicts, unbounded work, route impossibility, nondeterminism, direct foreign-state writes, visual fallback, and performance failures that require `BLOCKED`/shared-change handling.

For iterative debugging, add this finite rule when applicable: after two failed repair cycles with the same causal model, do not run a third ornamental variation. Record the falsified assumption and reduce the problem to a narrower scenario or choose a different causal model.

## Checkoff and receipt

- [ ] All entry conditions recorded.
- [ ] Diff stays inside approved write budget.
- [ ] L0–L2 receipt green at exact candidate.
- [ ] Exit `npm run check:baseline` passes; nothing green at entry is now red.
- [ ] Independent discovery review complete when it can materially change the verdict.
- [ ] Validated findings repaired.
- [ ] Causal re-review terminal; no recursive fresh audit.
- [ ] Required L3/L4 evidence complete or honestly unproven.
- [ ] Active packet checklist and packet receipt updated.
- [ ] Integrator notified; no worker-owned global status promotion.

## References

Link only current authority and the few source plans/history items needed to understand intent.
