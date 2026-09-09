<!-- LIFETIME: STABLE -->
# Bounded INFERENCE Protocol

SpaceFace already has `design/vision/INFERENCE_CONVERGENCE_METHOD.md` and `design/program/INFERENCE_LANES.md`. They contain the correct core idea: inference is valuable when it produces bounded production, and fixed reviewer/candidate/iteration counts are heuristics rather than universal gates.

This document defines how the Central Brain invokes that machinery without turning INFERENCE into an infinite side institution.

## 1. When to use INFERENCE

Use INFERENCE when:

- demonstrated player-facing quality debt has no admitted implementation path;
- several substantially different product mechanisms are plausible and selection matters;
- a content family needs deliberate divergence before production;
- a weak experience is real but the owning mechanism is unclear after bounded characterization;
- the user explicitly requests creative expansion/research.

Do **not** invoke INFERENCE merely because an agent does not want to read the current packet or because ordinary implementation is difficult.

## 2. The production unit

An INFERENCE unit is not "think about X." It has:

```text
player problem / opportunity
ordinary-player evidence
current owners and vocabulary
scope and non-goals
N production outputs or one explicit decision
exploration budget
selection criteria
implementation/proof requirement
termination condition
```

`N` counts production outcomes, not scouts, reports, prompts, review rounds or tooling.

## 3. The loop

### A. Diagnose ordinary-player truth

Start from current route evidence, not the most ambitious plan prose. What does the player actually experience now?

### B. Define the target experience

Describe a player decision, sensation, tactical possibility or strategic understanding. Avoid implementation adjectives such as "advanced" or "AAA" without a behavioral target.

### C. Inventory existing mechanisms

Find current owners, schemas, events, tools, art vocabulary and related systems. The highest-leverage idea is often a transfer/composition of something that already exists.

### D. Diverge

Use several independent mechanism hypotheses. Parallel scouts are useful only if the hypotheses genuinely differ.

A useful candidate statement includes:

```text
mechanism
why it should change the player experience
existing systems reused
new seam required
failure/counterplay
cost/performance risk
smallest experiment
```

### E. Select, cut and sequence

Reject ideas that are redundant, non-causal, expensive relative to player value, architecturally duplicative, or impossible to observe.

Prefer a small vertical slice that can falsify the idea.

### F. Implement

Inference that ends before implementation is research, not production. If the user's request is production, at least the selected bounded output must change the game or explicitly prove no-change is correct.

### G. Cold evidence

Replay the scenario/route. Use one cold reviewer when subjective judgment is genuinely needed. Mechanical claims use deterministic evidence.

### H. Terminate

Commit the production result, update its normal plan/receipt truth, record cut ideas only when they have durable value, and stop at the requested `N`.

## 4. Composition before multiplication

Before generating ten new mechanics, ask whether current mechanics can combine more deeply.

Examples:

- existing attack grammar + arena material interaction;
- existing traffic/jobs + authored unused craft;
- existing faction/law state + strategic UI surfacing;
- existing motion/formation + role-specific encounter composition;
- existing structural VFX primitives + new causal grammar mapping;
- existing physics verbs + content doctrines that force different use.

Composition usually creates more depth per line of code than parallel bespoke systems.

## 5. Mechanism transfer

Deliberately search neighboring systems for proven mechanisms.

A transfer prompt asks:

```text
What already works elsewhere in SpaceFace that could solve this experience without copying its theme?
```

Examples:
- Combat Lab's deterministic launch/restart can become an agent playtest surface.
- Frontend capture matrices can inspire cross-system visual consistency reports.
- Performance's same-picture A/B discipline applies to flight-feel tuning.
- Attack causal lineage can power VFX explanation instead of decorative effect selection.
- Asset reachability can inform a reuse-first content factory.

Transfer the mechanism, not accidental constraints from the donor system.

## 6. No recursive review institution

The following are forbidden as default INFERENCE behavior:

- candidate reviewers reviewing other candidate reviewers;
- mandatory three-model consensus;
- "continue until all reviewers agree";
- unlimited red-team loops;
- a new standing queue of inferred ideas;
- creating tooling in place of the requested production count.

A review should answer an uncertainty and then disappear.

## 7. Scale shorthand

If `1x`, `3x`, `5x` or similar shorthand is used, it scales useful production effort, not bureaucracy.

For example, a 5x content expansion might use more independent candidate generation and deliver more implemented variants, but it does not require five times the reviewers, documents or screenshots.

## 8. Failure handling

If an experiment fails:

- retain the causal finding;
- do not rerun unchanged;
- decide whether the mechanism is falsified, the implementation is defective, or the scenario could not observe the claim;
- at most one focused repair follows from an obvious implementation defect;
- otherwise select the next hypothesis.

Two failed repair cycles under the same causal model are enough for a manager to change models.

## 9. Relationship to quality debt

The Central Brain can emit one bounded inference candidate when the highest-ranked demonstrated quality debt has no admitted unit. The candidate should already contain the scorecard factors and scenario evidence that justify spending inference on it.

The Central Brain must not use INFERENCE to evade an admitted but difficult core defect. If the queue already owns the player outcome, execute that owner.

## 10. Relationship to content generation

Large content batches should use `CONTENT_FACTORY_AND_COMPLETENESS.md`. INFERENCE generates and selects meaningful archetypes/compositions. Data validators and scenario tests then carry production at scale.

Do not ask a language model to hand-author hundreds of unstructured rows without a coverage grammar.

## 11. Relationship to visual work

Visual inference should generate/converge on normal-camera form, identity and VFX language before detail. The screen-space marginal-value rule still applies. More inference is not evidence that more Blender passes are useful.

## 12. Relationship to planning

Durable plans should preserve:

- selected product/mechanism decisions;
- disconfirmed high-cost hypotheses likely to be retried;
- reusable workflow knowledge;
- dependencies/owner seams.

Do not preserve every generated candidate. An experiment bank is a quarry, not a graveyard of mandatory future work.

## 13. Termination test

An INFERENCE invocation is complete when:

- the requested production count/outcome is delivered or explicitly cut;
- the same representative route can demonstrate the result;
- no support work is being counted as a substitute for production;
- unresolved ideas are either deliberately discarded or reduced to a small ranked follow-up;
- the manager can return to the normal admitted-work portfolio.

The point of inference is leverage. The moment the inference process becomes harder to terminate than the problem it was solving, it has failed.