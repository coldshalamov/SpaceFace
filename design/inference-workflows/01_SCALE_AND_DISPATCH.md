<!-- LIFETIME: STABLE -->
# Inference scale and dispatch — sequential production semantics

## 1. `N` is a production target

`INFERENCE N` accepts any positive integer. `N` means up to `N` independently useful production
slices completed sequentially.

It does not mean:

- `N` candidates;
- `N` files or commits;
- `N` review contexts;
- `N` route captures;
- `N` acceptance packets;
- `N` times more abstraction.

A production slice must change the shipped or live game. Support artifacts never count.

## 2. Unit lifecycle and verification

Lifecycle:

```text
selected -> mutating -> implemented
```

Verification:

```text
unproven -> focused_green -> route_accepted
```

The axes are independent. `implemented/focused_green` is a valid terminal unit. Route acceptance may
be obtained later without reopening implementation.

## 3. Sequential dispatch

Only one unit is active at a time:

1. choose the smallest coherent player-facing slice;
2. implement it through the live owner;
3. run focused checks;
4. self-review once;
5. commit and record;
6. choose the next.

Do not reserve all `N` units, generate a large candidate slate, or build shared acceptance machinery
before unit one exists.

## 4. Candidate selection

Compare at most three serious candidates for the current unit. Prefer:

- a visible player delta;
- reuse of current owners;
- a distinct verb/state/relation;
- a bounded write set;
- a result that remains useful even if route acceptance is deferred.

A candidate matrix, independent divergent subagents, reference rotation, and portfolio slotting are
optional tools, not entry gates.

## 5. Large batches

For `N > 5`, units remain independent. Every fifth completed production unit may trigger one existing
aggregate smoke check. The batch does not require a portfolio report, reel, or fresh review panel.

Diversity is judged after production exists. Do not build weak filler merely to span a taxonomy.

## 6. Support budget

Absent an explicit infrastructure request:

- the first commit contains production;
- no two support-only commits occur consecutively;
- support-only commits are capped at `max(1, ceil(production units / 5))`;
- a harness repair must be directly necessary for the current claim and bounded to one causal fix;
- an unchanged failed probe is never rerun.

## 7. Stop conditions

Terminate with an honest partial result when:

- `N` units are complete;
- the requested outcome is complete;
- only filler remains;
- the next action repeats an unchanged failure;
- a concrete external dependency or exact live collision prevents further production.

Do not substitute process completion for product completion.

## 8. Required final accounting

```text
Requested:
Completed production units:
Implemented / focused green:
Accepted / route accepted:
Route-unproven:
Support-only commits:
Remaining exact work:
```
