<!-- LIFETIME: STABLE -->
# Agentic Game Development OS

This document is the durable architecture for using large amounts of agent inference to improve SpaceFace without letting local task completion substitute for a coherent game. It is the deep design behind the compact operator surface in `design/program/CENTRAL_BRAIN.md`.

It does **not** create another queue, another acceptance system, or a permanent hierarchy of agents. `CANONICAL_BUILD_MAP.md`, `program-queue.json`, active PQ packets, current code ownership, and the user's current direction remain authoritative. The Development OS is a quality-control and allocation layer over work that already exists or is explicitly generated through the existing INFERENCE process.

## 1. The problem

SpaceFace is already large enough that a collection of competent local agents can make the project worse while every individual task report sounds successful. The failure modes are portfolio-level:

- a high-cost asset family absorbs weeks while flight, AI or route smoothness remains visibly weak;
- many plans exist but no mechanism asks which player-visible defect has the highest leverage **now**;
- checks prove source invariants while missing temporal failures such as oscillation, sluggish response, frozen presentation, target churn or partial asset publication;
- several agents independently invent overlapping infrastructure because they do not know what already exists;
- support work, review, plans and harnesses recursively generate more support work rather than finished player outcomes;
- breadth is produced as low-information variants rather than distinct roles, counterplay and authored identity;
- one part of the game reaches hero quality while adjacent frequently seen surfaces remain placeholders;
- the human owner becomes the only integration test capable of saying "this still feels wrong."

The Development OS therefore optimizes **measured player experience per unit of agent effort**, not number of completed tasks or number of reviews.

## 2. Authority model

When sources disagree, use the existing repository order. The Development OS adds no authority above it.

1. Current user direction.
2. `ARCHITECTURE.md`, `design/VISION.md`, `design/GDD_2_0.md`.
3. `CANONICAL_BUILD_MAP.md` and `design/PLAN_REGISTRY.md`.
4. The admitted PQ queue and selected active packet.
5. Live code, tests, deterministic evidence, normal-route captures.
6. Supporting research, experiment banks and historical receipts.

The Central Brain may **rank** dependency-ready work. It may not silently admit an outcome, mutate the queue, redefine a product decision, or mark acceptance.

## 3. The control loop

The bounded loop is:

```text
OBSERVE
  ↓
REDUCE TO FINDINGS
  ↓
RANK QUALITY DEBT
  ↓
SELECT ADMITTED WORK OR ONE BOUNDED INFERENCE CANDIDATE
  ↓
ASSIGN EXACT OUTCOME + WRITE BUDGET
  ↓
IMPLEMENT ONE CAUSAL CHANGE
  ↓
REPLAY SAME SCENARIO / SEED / INPUT POLICY
  ↓
COMPARE
  ↓
KEEP | REVERT | LEARN_ONLY
  ↓
RETURN TO PORTFOLIO
```

Every phase has an exit. A phase that cannot terminate is a bug in the control plane.

## 4. Manager responsibilities

A manager/orchestrator is useful only for work that is genuinely cross-system or parallel. Its responsibilities are deliberately narrow:

- refresh the live queue and plan family map;
- consume current evidence rather than stale prose snapshots;
- identify the weakest frequently exposed player experience;
- decompose it into disjoint executable units;
- use scouts only to remove uncertainty;
- dispatch implementation to exact paths/outcomes;
- use the cheapest proof capable of falsifying the claim;
- integrate returned work and update the normal PQ/receipt truth;
- stop when the requested campaign budget or outcome is complete.

The manager does **not** become a second project manager database. It should be reconstructible from the repository plus fresh evidence.

## 5. Agent roles

Roles describe one invocation, not permanent identities.

### Scout

Read-only. Answers one concrete uncertainty: owner seam, existing implementation, causal hypothesis, reproduction, or plan conflict. A scout returns evidence and a recommendation, never a new architecture unless architecture was the question.

Default scout fan-out is 0–2. Maximum is 4. More scouts require a stated reason that the hypotheses are independent.

### Synthesizer

Used only after genuine parallel reconnaissance. Deduplicates findings into one table:

```text
finding | evidence | owner | confidence | player impact | next falsifiable action
```

A synthesizer is not another reviewer pass.

### Worker

Receives one player outcome, one bounded write set, a scenario/proof requirement, non-goals, and a stop condition. It changes the game.

### Specialist worker

Same as a worker, but selected for a tool/domain: Blender, frontend, deterministic simulation, performance, VFX/audio, data/content, etc. Specialization never grants authority over adjacent systems.

### Reviewer

Invoked only where independent judgment adds information: subjective visual quality, ambiguous architecture, high-risk shared ownership, or a packet that explicitly requires it. Default is **one** fresh reviewer, not a panel. Mechanical claims belong to checks/replays.

### Integrator

Owns the final diff, conflict resolution, current-base verification and publication. Jules/cloud PRs are candidates until a local integrator rebases and proves them.

## 6. Dispatch law

For broad requests such as `NEXT`, `develop the game`, `overnight`, or `make it professional`, do not equate "default work" with one historic campaign. Rank dependency-ready PQ units through the quality plane.

The default ranking factors are:

```text
player exposure × severity × recurrence × evidence confidence × leverage
--------------------------------------------------------------------------
                   implementation + coordination cost
```

This is a prioritization model, not a fake-precision KPI. Use coarse buckets and show the factors that drove the result.

Hard precedence normally applies to:

1. crash, save corruption, determinism break, required entity with no visual;
2. controls/flight/combat failures on primary routes;
3. multi-second or repeated presentation hitches;
4. severe normal-camera quality discontinuity;
5. primary actions with missing/incorrect feedback;
6. strategic UI failures that hide or misstate game state;
7. breadth holes and repetition;
8. premium art polish.

An explicit user request overrides this order.

## 7. Campaign composition

A broad campaign is a portfolio, not an infinite loop on the first eligible family.

While a core quality floor is red or unknown, most capacity should attack core quality. A practical default for a large campaign is:

- 50–70% primary experience: integrity, flight, combat/AI, frame pacing, route correctness;
- 15–25% presentation: VFX, visual consistency, UI, audio feedback;
- 10–25% breadth/content/reuse and low-collision cleanup.

These are allocation heuristics, never acceptance law. The manager may choose 100% of one lane when a severe blocker justifies it.

A single prestige-art family must not consume an entire unnamed campaign merely because it has many unfinished leaves.

## 8. Exact-task versus broad-task behavior

If the user names an exact PQ, file, bug or outcome, do that work. The Central Brain must not second-guess the assignment.

If the user asks for one unnamed next task, select the highest-leverage dependency-ready unit and stop after it.

If the user asks for a campaign, repeatedly re-evaluate after each integrated unit. Do not lock the whole campaign to the first family selected at time zero.

If no admitted unit represents the highest-confidence quality debt, emit one bounded INFERENCE candidate using `design/vision/INFERENCE_CONVERGENCE_METHOD.md`. Do not invent a PQ ID. The resulting implementation is admitted through normal mechanisms.

## 9. Anti-recursion law

Agent inference is cheap enough that process can expand without bound unless explicitly constrained.

- Research/scouting cannot exceed roughly 20% of a bounded implementation unit unless the user asked for research.
- A support-only artifact cannot satisfy a production unit.
- Never re-run the same candidate/harness/environment/failure fingerprint unchanged.
- For one causal model, two unsuccessful repair iterations are enough. Record the model as falsified and change the hypothesis or owner.
- Review findings outside the task become ranked debt. They do not reopen the current task.
- Fixed counts of candidates, reviewers, screenshots or passes are heuristics only. Evidence determines whether another iteration has value.
- No "until perfect", "until no faults", "until all agents agree", or unbounded adversarial-review condition.
- Build new tooling only when the existing lab, observer, witness, broker, content schema, asset pipeline or test framework cannot express the required claim.

## 10. Quality plane and maturity

The queue says what is admitted. The quality plane says where the player experience is weak.

Use qualitative states with evidence freshness:

- `BLOCKED`: route cannot be meaningfully evaluated because a prerequisite is broken.
- `RED`: severe current player-visible defect.
- `YELLOW`: works, but material quality/clarity/consistency debt is demonstrated.
- `GREEN`: representative current evidence meets the named bar.
- `UNKNOWN`: no fresh evidence; never treat unknown as green.

For visible assets/surfaces, use maturity separately:

- L0 — absent, invisible, fallback, partial or obviously broken;
- L1 — complete and readable at shipping camera;
- L2 — coherent production quality;
- L3 — premium hero treatment.

L3 is not a universal requirement. Frequently exposed L0/L1 debt normally outranks L3 micro-detail.

## 11. Evidence economy

Use the cheapest falsifiable evidence first:

1. pure/unit characterization;
2. deterministic lab scenario;
3. replay/differential comparison;
4. bounded live browser/Electron route;
5. media capture or subjective review.

Do not require headed capture for a state invariant. Do not use a headless test as proof of WebGL appearance. Do not ask an LLM to decide a numeric deterministic fact the engine can emit directly.

Every player-facing before/after should preserve, when applicable:

- same seed;
- same scenario version;
- same input tape/policy;
- same settings/profile;
- same camera contract;
- candidate digest and baseline digest.

## 12. Integration with Jules/cloud inference

The Jules bank is a directed candidate bank, not the PQ queue. Keep its existing collision-key discipline and one-task-per-cloud-branch model.

Use Jules heavily for work that is:

- low collision;
- characterizable by repository tests/static analysis;
- easy for a local integrator to validate;
- useful in parallel: test hardening, bug hunts, determinism checks, bounded data/content authoring, docs/tooling cleanup, isolated UI fixes.

Do not use Jules as acceptance authority or let it edit the queue, `NOW.md`, the task bank, root authority or expected goldens. A Central Brain campaign may reserve a small number of support candidates that unlock or de-risk the selected PQ work, but production progress must not be replaced by hundreds of auxiliary PRs.

Before dispatching a cloud batch, compare collision keys and exact path ownership. Parallelism is bounded by integration bandwidth, not account quota.

## 13. Integration with INFERENCE

INFERENCE is the generative expansion engine. The Central Brain is the allocation/convergence engine.

Use INFERENCE when the desired player outcome has no admitted implementation or when the manager needs deliberate divergence across product alternatives. Use it in bounded production units: inventory, hypotheses, transfer mechanisms, candidates, cut/sequence, implement, cold evidence, terminate.

Do not create a second INFERENCE queue. Successful outputs either become ordinary code changes under an existing packet or are admitted through normal program planning.

## 14. Definition of professional convergence

A professional build is not one where every object is maximally detailed. It is one where the quality surface is controlled:

- the primary route always renders complete authored identity;
- controls and combat respond intentionally;
- enemy motion reads as tactics rather than numerical steering noise;
- common-density routes are smooth and first-use stalls are named;
- VFX communicate cause under saturation;
- UI exposes the simulation without becoming its own disconnected web app;
- content breadth creates distinct decisions rather than duplicated stats;
- presentation families do not differ by multiple maturity tiers without an authored reason;
- agents can replay representative player behavior and produce evidence without a human manually watching every run.

The manager has succeeded when successive cycles find smaller, less severe defects on the same representative scenario matrix. "No remaining tasks" is not the objective.