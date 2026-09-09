<!-- LIFETIME: STABLE -->
# Plan Convergence Protocol

SpaceFace has many useful plans, experiment banks, packets, handoffs, receipts and historical campaigns. The control problem is not to flatten them into one giant checklist. It is to make agents reliably find the **current authority and smallest executable outcome** without reviving stale work or duplicating an existing system.

This protocol gives the Central Brain a way to reason across plan families while leaving dispatch and acceptance where they already live.

## 1. Never create a second backlog

The canonical sources remain:

- `CANONICAL_BUILD_MAP.md` — front door and route law;
- `design/PLAN_REGISTRY.md` — plan-family index/status;
- `design/program/roadmap/program-queue.json` — admitted machine index and dependency graph;
- `design/program/roadmap/active/` — executable packets;
- receipts/acceptance pages — exact evidence;
- `design/program/NOW.md` — short-lived current mutation collisions.

The Central Brain may build an **ephemeral inventory/report** from them. It must not create a durable parallel queue of its own.

## 2. Classification

Every discovered planning artifact is classified by role, not just filename:

- `FRONT_DOOR` — canonical routing/authority.
- `REGISTRY` — index of families/ownership.
- `ADMITTED_PARENT` — PQ-level outcome in the queue.
- `ACTIVE_PACKET` — executable current packet.
- `EXPERIMENT_BANK` — useful ideas/candidates without dispatch authority.
- `DURABLE_METHOD` — reusable process/research law.
- `EVIDENCE` — receipt, benchmark, acceptance record, test transcript.
- `HANDOFF` — current only when explicitly named/activated.
- `VOLATILE_STATUS` — expires quickly and must be refreshed.
- `HISTORICAL` — archaeology; never direct implementation authority unless reactivated.
- `GENERATED` — code-derived reference, never product priority.

A plan can be valuable without being executable.

## 3. Reconciliation questions

Before a manager creates or selects work, answer:

1. Is this player outcome already admitted under a PQ parent?
2. Does an active packet already own the same normal route/owner seam?
3. Is the proposed work actually a remaining leaf, an acceptance gap, a regression, or a new outcome?
4. Does a newer owner decision or live implementation make the old plan premise stale?
5. Is there an existing system/tool that already solves the supposed infrastructure gap?
6. Would this work duplicate INFERENCE, Jules, the lab, observatory, validation broker, graphics pipeline, content factory or frontend grammar?
7. If the plan contains many unchecked items, which one is the smallest coherent player result rather than treating the whole document as blocked work?

## 4. Plan conflict resolution

When two plans appear to conflict:

- current user direction wins;
- higher repository authority wins on architecture/product law;
- admitted packet wins on current execution scope;
- newer verified player-route evidence can invalidate an implementation premise without silently rewriting product intent;
- a historical fixed quota or technique cannot override a newer durable convergence rule merely because it is more prescriptive.

Record the conflict and chosen authority in the packet/PR when it materially changes behavior. Do not leave two contradictory "mandatory" paths active.

## 5. Stale premise detection

The repo has repeatedly demonstrated that prose snapshots age faster than implementation. Before acting on a concrete absence/defect claim from a large plan:

- re-check the exact code/data owner;
- re-check current queue state;
- re-check current route evidence if the claim is visual/temporal;
- prefer semantic owner lookups to filename grep where assets/manifests/registries are involved.

A stale row should be corrected or marked historical; it should not be used to rebuild something that already exists.

## 6. Parent versus leaf truth

Large umbrella plans are allowed. Execution happens at leaves.

A parent may remain broadly `ready` while some leaves are integrated/done, or may describe an entire creative program whose engineering is already largely landed. The manager must inspect exact dispatch units and live packets rather than infer status from the parent's prose title.

Likewise, a finished leaf does not prove the whole player experience is good forever. New quality debt is a new finding, not retroactive falsification of a truthful receipt.

## 7. Inventory output

`tools/agentic/inventory_plans.py` should produce a disposable JSON/Markdown report with, where available:

```text
path
lifetime / classification
family / PQ ids mentioned
status markers
links to active packets
links to canonical routes
possible duplicate/overlap signals
staleness indicators
```

It is a navigation aid. It must never rewrite plan status automatically.

Useful warnings include:

- active packet referenced by no canonical/registry path;
- `STABLE` document containing obviously volatile branch/lease/snapshot facts;
- historical handoff being used as default routing;
- contradictory mandatory iteration/reviewer quotas;
- admitted PQ with no executable packet;
- an agentic/control-plane file describing a second queue or acceptance vocabulary;
- a broad plan whose claimed missing feature now exists in current code.

Warnings are prompts for inspection, not automatic deletion.

## 8. Converging redundant plans

When multiple active/durable files truly duplicate the same law:

1. select the smallest authoritative home;
2. preserve unique rationale/evidence in a durable reference or receipt;
3. change redundant files to point to the authority;
4. remove contradictory instructions;
5. do not delete useful future/experimental material solely because it is not implemented.

Prefer links over copy-pasted policy. Duplicated policy drifts.

## 9. Relationship to Central Brain

The Central Brain's ranking input is **not all prose plans**. Its primary candidate set is dependency-ready admitted dispatch units plus one bounded INFERENCE candidate when demonstrated quality debt has no admitted representation.

The plan inventory is used to:

- classify candidate work;
- find existing owner packets;
- prevent duplicate planning;
- find a dormant implementation spec worth activating;
- understand dependencies/constraints;
- identify stale default-routing rules.

It does not turn every idea in every experiment bank into pending work.

## 10. Relationship to INFERENCE

`INFERENCE_CONVERGENCE_METHOD.md` is a method, not a backlog. An inference pass can read experiment banks and plan inventories to generate alternatives, but must end in bounded production or an explicit cut/defer result.

A successful INFERENCE output that needs durable implementation becomes ordinary admitted work. Do not maintain a parallel "inference backlog".

## 11. Relationship to Jules

The Jules 1000-task bank is a candidate bank optimized for cloud execution and collision avoidance. It is intentionally separate from live PQ authority.

The plan converger may map a selected quality problem to existing Jules candidates for scouting, tests, isolated fixes or content support, but must never count "Jules tasks dispatched" as delivery of an admitted player outcome.

Keep collision keys, one-task-per-branch behavior and local integration authority intact.

## 12. Canonical routing regression test

Because front-door prose can silently undo months of convergence, the agentic control-plane self-test should assert at least these semantics:

- broad unnamed development routes through the Central Brain quality selector;
- exact user/PQ assignments can still call `program-dispatch --id` directly;
- `PQ-050` is a valid explicit graphics campaign but is not privileged as the universal unnamed campaign;
- `INFERENCE` remains explicitly invoked/bounded and is not auto-run for every task;
- Jules remains a candidate bank, not the queue;
- graphics fixed pass/reviewer counts are not universal gates.

This is a small test with enormous leverage: it prevents the old portfolio pathology from returning through documentation drift.