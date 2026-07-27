<!-- LIFETIME: STABLE -->
# Execution protocol: bounded implementation and convergent proof

This protocol applies to every autonomous implementation handoff. Its purpose is to produce a useful feature and a trustworthy terminal receipt without allowing planning, review, or live-probe activity to expand forever.

## 1. Terminal outcomes

Every run ends in exactly one disposition:

| Outcome | Meaning | Required artifact |
|---|---|---|
| `PASS` | packet outcome implemented; required focused proof and declared route evidence pass at the exact revision; **and the exit check set is a superset of the entry baseline's green set** | completed packet checklist + receipt |
| `FAIL` | an in-scope product defect remains after the packet's repair/review budget, **or a check green at the entry baseline is red at exit** | failing regression, failure class, owner, minimal next action |
| `BLOCKED` | an entry condition, owner seam, lease, asset, environment, or dependency is absent | blocker evidence and requested upstream change |
| `DEFERRED` | user/integrator deliberately stops or reschedules valid work | preserved branch/diff and explicit resume point |

“Still verifying,” “probably green,” “needs more review,” and “tests mostly pass” are not terminal states.

## 2. Two state axes

Lifecycle and acceptance are independent.

```text
lifecycle: planned -> ready -> claimed -> implemented -> integrated
            |          |          |
          blocked    deferred   historical

acceptance: unproven -> focused_green -> route_accepted -> milestone_accepted
```

A feature agent may report `implemented/focused_green`; only the integrator promotes shared lifecycle/acceptance after exact-revision review. Integrated code may honestly remain `unproven` or `focused_green` on the route axis.

## 3. Packet entry gate

Do not implement until the selected active packet answers all of these with current evidence:

- What player-visible outcome is being built?
- What ordinary route reaches it?
- Which current modules own the state and mutations?
- Which owner APIs/events already exist, and which new seams are explicitly required?
- Are all dependencies integrated at the candidate base?
- Are the named path/mutex owners free?
- Is the write set bounded enough to review?
- What deterministic focused test can fail before a live probe is needed?
- What new entities, queries, allocations, DOM, materials, textures, save bytes, or draw work are expected?
- What is explicitly not being built?

If any answer is unknown and material, classify the packet `BLOCKED` or perform a planning-only seam audit. Do not invent an owner contract while implementing a consumer.

## 4. Phase A — preflight and characterization

1. Record exact branch, HEAD, dirty paths, worktrees, and active leases.
2. **Record the entry baseline.** Run the packet's declared L0–L2 commands plus the repository fast
   baseline gate at the candidate base, before any edit, and persist the pass/fail result alongside
   the fast-gate receipt. This is what makes a red check attributable at exit; without it, every red
   is unattributable and §7's `INHERITED_RED` disposition cannot be claimed honestly.
3. Read the packet, the cited architecture/GDD sections, the queue row, and only the owner modules/checks it names.
4. Confirm the live public route and current behavior. Old handoffs are hypotheses, not facts.
5. Add or identify a seconds-scale characterization test at the owning seam.
6. Reproduce the missing behavior or defect before the implementation change.
7. Record an initial performance/cost baseline when the packet can affect a hot path or visible composition.

Characterization must observe public owner behavior. Source-string assertions are allowed only for a narrow structural invariant that cannot be exercised behaviorally and has an explicit failure history.

## 5. Phase B — implementation

Implement the smallest coherent slice that satisfies the packet outcome.

- Keep mutation in the existing owner or add one narrow owner-side seam.
- Keep pure arbitration, normalization, or projection logic separate from side effects.
- Use stable IDs, simulation ticks/time, deterministic ordering, and idempotent receipts.
- Treat save/Continue and replay boundaries as part of the state machine, not postscript tests.
- Reuse input, modal, renderer, asset, mission, economy, cargo, law, AI, and world routes rather than adding feature-specific duplicates.
- Preserve exact authored visual identity; use appropriate LOD/HLOD, pooling, batching, culling, and bounded admission.
- Add accessibility semantics at the same time as the visible cue.
- Keep the packet's non-goals out of the diff.

When an unforeseen shared edit is necessary, stop. Return a shared-change request containing the owner, required contract, why existing seams are insufficient, and the smallest proposed change.

## 6. Phase C — validation ladder

Run gates in ascending cost. A higher layer never substitutes for a lower one.

| Layer | Purpose | Examples | Rerun rule |
|---|---|---|---|
| L0 | syntax, schema, imports, data shape, changed-doc links | `node --check`, focused validators, `git diff --check` | rerun after relevant edits |
| L1 | seconds-scale owner behavior | direct unit/contract/simulation tests | rerun until deterministic green |
| L2 | ownership, determinism, save, adjacent systems | focused aggregate, compare/reload, owner invariants | rerun only after relevant source/test change |
| L3 | ordinary player route and visual/accessibility judgment | broker-managed Browser/Electron route | one attempt per predeclared acceptance cell and candidate digest |
| L4 | matched performance and release qualification | target/floor capture, soak, held-out matrix | only when entry profile and lower layers pass |

The active packet lists the canonical commands. Do not treat `package.json` as a menu from which more checks always means more confidence.

Before L3, the packet names a lab scenario and its owning executor, or records the exact claim that
cannot be represented headlessly and the smallest missing scenario/schema seam. When an eligible
scenario exists, the broker manifest declares `requiresScenario`; the broker executes it freshly and
binds its pass to the current candidate digest before issuing the live claim.

Fail-fast remains correct for certifying gates. A diagnostic driver may collect multiple independent
recoverable assertion failures in one expensive run, with phase/expected/actual detail, but it must
abort when boot, route reachability, actor authority, or observer integrity is lost. Aggregated
diagnostics are non-promoting and do not relax the one-attempt acceptance budget.

### Fast-gate receipt

Before an expensive L3/L4 run, persist a receipt containing:

- candidate source digest and exact commit/dirty-state fingerprint;
- commands and results for the required L0–L2 gates;
- deterministic seed/profile/route identity;
- changed owner surfaces;
- whether the run is diagnostic or acceptance;
- the expected evidence and timeout/cleanup policy.

A changed source digest invalidates the old claim. A documentation-only or evidence-only edit may reuse a source digest only when the broker manifest declares those paths non-production.

## 7. Expensive-probe launch policy

Default convergence rules unless a packet declares a stricter evidence-driven policy:

```yaml
acceptanceAttemptsPerCellPerCandidateDigest: 1
unchangedFailureRetries: 0
broadGateEscalationsWithoutNewEvidence: 0
reviewClosure: discovery -> repair -> causal re-review when repairs affect the claim
```

A broker campaign may contain several distinct predeclared cells. The cell identity includes route,
runtime, seed/save, profile, scenario, and harness digest; changing a label after observation does not
create a new cell.

Use `scripts/validation-broker-cli.mjs` and a packet manifest for expensive Browser/Electron routes. Direct probe execution is diagnostic and cannot promote acceptance unless the packet explicitly documents why no broker is possible and the integrator records a one-use equivalent claim.

After an expensive probe fails, classify it first. For `PRODUCT`, `HARNESS`, or `NONDETERMINISM`:

1. retain the failure fingerprint and artifacts;
2. reproduce the product/harness defect or nondeterministic leak at a seconds-scale owner seam;
3. observe that regression fail;
4. repair it and observe pass;
5. obtain a new claim only after production source, harness source, or the owning fast-gate evidence changes.

Environment replacement, stale-baseline correction, out-of-scope follow-up, and unknown attribution
follow their class-specific dispositions below. An unchanged cell and failure fingerprint still block
an identical rerun. Repetition is not investigation.

### Failure classes

| Class | Meaning | Disposition |
|---|---|---|
| `PRODUCT` | live game behavior violates the packet | focused failing regression, fix in owner, new source digest |
| `HARNESS` | actor/observer/probe incorrectly drives or judges the route | repair harness; invalidate only affected evidence; new harness digest |
| `ENVIRONMENT` | independently evidenced GPU/process/OS/port/profile failure | retain attempt; one replacement on a clean isolated environment |
| `NONDETERMINISM` | equal candidate/seed/input can diverge | hard stop; reduce to deterministic regression before any route rerun |
| `STALE_BASELINE` | expected data or prose no longer describes live code | update packet/check deliberately; never rewrite a golden blindly |
| `OUT_OF_SCOPE` | valid defect outside the selected outcome/write budget, **and not a red check** | record follow-up; do not reopen current acceptance unless it invalidates the route |
| `INHERITED_RED` | a declared check was already red at the recorded entry baseline | repair it, or obtain an integrator-signed inheritance token naming the owner and the reason. Never a self-issued follow-up |
| `UNKNOWN` | evidence cannot support attribution | fail closed; collect one discriminating diagnostic, not another identical run |

### Red checks are never out of scope

A failing check is a defect in the repository, not a note about it. Whether the test or the code is
wrong is the agent's call to make and justify — but leaving it red is not an outcome.

- A check **green at the recorded entry baseline and red at exit** is `PRODUCT`, regardless of whether
  the cause lies inside the packet's write budget. The packet made it red; the packet owns it.
- A check **red at the entry baseline** is `INHERITED_RED`. Repair it in the same run when the repair
  is bounded, or return `BLOCKED` with the integrator's inheritance token. "Preexisting, therefore not
  mine" is not a disposition.
- `OUT_OF_SCOPE` covers observed defects with no failing check behind them. It does not cover a red
  check.

This rule exists because scope was previously defined only against the packet outcome, which made
inheriting a red tree the protocol-compliant ending. The game is expected to be working and robust at
every checkpoint, so the check set is a floor that runs may raise and may not lower.

## 8. Independent review that terminates

Review is adversarial but finite.

### Discovery

One independent reviewer reads the packet, diff, focused evidence, and relevant owner contracts. Findings must include:

- severity: P0/P1/P2/P3;
- exact path/symbol or observed route beat;
- violated packet/architecture invariant;
- reproduction or counterexample;
- whether it is in scope, shared-owner, or follow-up.

A preference without an invariant or observed player defect is advice, not a blocking finding.

### Repair

Repair all validated P0/P1 findings and in-scope P2 findings. Shared-owner findings become explicit requests. P3 polish can land when cheap and coherent or be retained as a follow-up.

### Causal re-review

The reviewer verifies the repairs and checks for regressions caused by them. This pass does not restart a general audit. A newly discovered unrelated issue is recorded separately unless it invalidates the packet's core claim.

After causal re-review, the reviewer returns `APPROVE`, `REJECT`, or `BLOCKED` with exact reasons.
Further review requires a material redesign, a new candidate after rejection, or explicit integrator
direction; this is a causal boundary, not an iteration quota.

Do not ask successive agents to “find more issues” until one eventually invents a new local doctrine. Do not convert reviewer taste into automatic repository instructions.

## 9. Player-route and fun review

Automation proves contracts. Human/independent visual review decides whether the feature is readable, discoverable, coherent, and enjoyable.

A route receipt identifies:

- the ordinary entry path and controls used;
- seed/save/ship/settings/runtime/profile;
- required beats and observed owner receipts;
- screenshots/video at normal camera and any detail view needed for diagnosis;
- accessibility variants relevant to the feature;
- exact Browser/Electron parity claim;
- performance sample identity;
- explicit visual/fun verdict and concrete defects.

A technically loaded asset or green screenshot script is not visual acceptance. A human verdict cannot override deterministic, ownership, save, accessibility, or performance failures.

For tuning-heavy physics, use a small predeclared matrix of candidate parameters and player outcomes. Keep seeds/routes fixed, record quantitative state and qualitative judgment, select once, then freeze the chosen values in focused tests. Do not tune by repeatedly editing and replaying an unrecorded route.

## 10. Performance proof

Before implementation, each packet declares expected growth and likely cost centers. At acceptance, compare the same route, settings, viewport, seed/save, and hardware profile before/after.

Report at least the relevant subset of:

- frame p50/p95/p99/max and hitch/missed-vsync/multi-step data;
- sim/render/VFX/UI phase cost;
- entities/colliders/spatial queries/candidates;
- draw calls/triangles/material programs/textures/residency/admission time;
- DOM nodes/listeners/observers/image requests for UI;
- save payload and maximum synchronous blocking slice;
- baseline/peak/end high-water values for long-lived resources.

A performance failure is repaired structurally. Lowering default quality, omitting accepted imagery, reducing required feature breadth, or disabling authored effects is not closure.

## 11. Checkoff and receipt

The feature agent updates the active packet checklist and creates or updates its receipt. The receipt should be concise and machine-readable where practical:

```yaml
packet: PQ-XXX
candidateCommit: <sha>
lifecycleClaim: implemented
acceptanceClaim: focused_green | route_accepted | unproven
disposition: PASS | FAIL | BLOCKED | DEFERRED
changedPaths: []
focusedGates: []
routeEvidence: []
performanceEvidence: []
review:
  discovery: APPROVE | REJECT | BLOCKED
  causalRereview: APPROVE | REJECT | NOT_REQUIRED
residuals: []
followUps: []
```

When the receipt satisfies another queue row's `evidenceDependencies`, use the
`PROGRAM_EVIDENCE_RECEIPT` header defined in [`README.md`](./README.md), commit the receipt, and
record its Git blob only after the integrator verifies the metadata and candidate revision.

The integrator verifies the exact candidate and then updates queue/global status atomically. Never make a global completion claim from a worker report, old artifact, or different commit.
