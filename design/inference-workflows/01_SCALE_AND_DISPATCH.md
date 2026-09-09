<!-- LIFETIME: STABLE -->
# Inference scale and dispatch — sequential production semantics

## 1. `N` is a production target

`INFERENCE N` accepts any positive integer. `N` means `N` independently useful production slices
completed sequentially, unless the user stops the task or every remaining eligible slice is
concretely blocked.

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

Only one unit is active at a time. Choose a coherent player-facing slice, implement it through the
live owner, perform sufficient direct verification for its claim, commit and record it, then choose
the next.

Do not reserve all `N` units, generate a large candidate slate, or build shared acceptance machinery
before unit one exists.

## 4. Candidate selection

Compare alternatives only when the choice contains a material uncertainty. Prefer:

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

## 6. Support boundary

Support work beyond required direct verification needs a named load-bearing uncertainty and a
possible material delta. A failed harness is not automatically in scope. Repair infrastructure only
when explicitly requested or when the narrowest necessary repair is required to state the current
production claim honestly. Support-only work never counts as a unit, and an unchanged failed probe is
never rerun.

## 7. Stop conditions

Terminate when `N` units are complete, the user stops or changes the task, the environment ends, or
every remaining eligible unit has a concrete external dependency or exact live collision. Skip an
individual blocked or filler candidate while useful eligible units remain.

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
