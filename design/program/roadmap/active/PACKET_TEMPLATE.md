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
- [ ] Baseline route/performance evidence captured when relevant.

## Live seams

| Domain | Current owner | Existing seam to reuse | New seam, only if required |
|---|---|---|---|
| state | `path#symbol` | event/API/serializer | explicit proposal |

Unknown owner contracts are blockers. Replace role names with exact current symbols before lifecycle becomes `ready`.

## Player route and state machine

Write the route beats and a small state/receipt model. Identify stable IDs, deterministic tie-breaking, save boundaries, failure/recovery, and exactly-once effects.

## Work breakdown

### Phase 0 — characterization

- [ ] focused failing characterization;
- [ ] owner/write map;
- [ ] baseline cost model.

### Phase 1 — pure contracts/data

- [ ] bounded data or pure state machine;
- [ ] deterministic/adversarial tests.

### Phase 2 — owner wiring

- [ ] owner-side seams and idempotent effects;
- [ ] save/Continue.

### Phase 3 — presentation and route

- [ ] normal-route visuals/controls/accessibility;
- [ ] Browser/Electron evidence;
- [ ] matched performance.

## Write set

List exact paths when known. Otherwise list bounded owner directories and require an exact path budget before implementation. Shared/global files require an integrator-owned change or explicit lease.

## Non-goals

List adjacent systems, later breadth, alternate implementations, and tempting redesigns excluded from this packet.

## Performance and quality budget

Declare expected maximum growth in entities, colliders, queries/candidates, allocations, DOM/listeners, draw calls/programs, texture/residency, asset admission, save bytes, and serializer blocking. Name the matched route/profile and structural mitigation.

Never use default quality reduction as the mitigation.

## Verification budget

```yaml
L0: []
L1: []
L2: []
L3BrokerManifest: <name or required new manifest>
maxAcceptanceLaunchesPerCandidateDigest: 1
maxIndependentReviewPasses: 2
```

Name exact commands. After an L3 failure, require a focused fail→fix→pass regression before another candidate claim.

## Review questions

A short list of architecture, player, visual, physics, accessibility, and performance questions specific to this outcome. Preferences unsupported by an invariant or observed defect are nonblocking advice.

## Stop conditions

List missing owner seams, semantic collisions, lease conflicts, unbounded work, route impossibility, nondeterminism, direct foreign-state writes, visual fallback, and performance failures that require `BLOCKED`/shared-change handling.

## Checkoff and receipt

- [ ] All entry conditions recorded.
- [ ] Diff stays inside approved write budget.
- [ ] L0–L2 receipt green at exact candidate.
- [ ] Independent discovery review complete.
- [ ] Validated findings repaired.
- [ ] Causal re-review terminal.
- [ ] Required L3/L4 evidence complete or honestly unproven.
- [ ] Active packet checklist and packet receipt updated.
- [ ] Integrator notified; no worker-owned global status promotion.

## References

Link only current authority and the few source plans/history items needed to understand intent.
