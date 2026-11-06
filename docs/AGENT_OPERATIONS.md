<!-- LIFETIME: STABLE -->
# Agent operations

This note explains how to finish assigned work. Root [`AGENTS.md`](../AGENTS.md) owns authority,
shared-tree and Git safety, and the verification router. During the Finish Program, its
[`README.md`](../design/program/finish/README.md) §2 owns current lane rulings; §5.1 and §5.5 own
model/tool fit and the shared work loop. [`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md) owns
validation choices.
Do not copy those procedures into another checklist.

## Finish the assigned outcome

Work from the user's request and its done condition. Follow the project authority order in root
`AGENTS.md` §4 and the active program rulings. Resolve uncertainty with the smallest interpretation
that fulfills the request; a process document or evidence artifact is not the outcome.

Choose the smallest implementation that completes the player-visible or technical result. Inspect
the live owner and its relevant callers, preserve single-writer and save/input contracts, and fix
confirmed defects in the assigned path. Do not add parallel implementations, placeholder systems,
unneeded documentation, or review steps that cannot change the result.

Verify directly at the layer that can answer the claim. A focused behavior check is usually enough
for an owner invariant; a public route is needed when the claim is about an ordinary user route; a
matched measurement is needed for a performance comparison. Add further checks only when the request,
governing spec, failed/conflicting result, material risk, or honest claim requires them. Follow the
cost ladder and route rules in [`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md).

An independent look is useful when an unresolved question could materially change the fix, result,
or risk, or when the active program requires it. Do not repeat completed reviews, duplicate an active
investigation, require agreement between models, or treat reports as approval quotas. Finish Program
review cadence is in its README §2; work outside that program follows root `AGENTS.md` §3.

Complete authorized work without waiting for a user playtest or verdict. Only an explicit external
action the user requested can remain deferred; report any unresolved dependency and keep unrelated
work moving.

## Shared checkout

Inspect current ownership and the exact diff before editing. Preserve concurrent changes; stage,
commit, and publish only the paths the active instructions assign to you. Root `AGENTS.md` §3 owns
all Git, checkpoint, worktree, fetch/merge, and publication rules. A checkpoint is coordination
metadata, not a lease or permission gate. This file creates no additional Git ceremony.

When code and documentation disagree, follow the authority order in root `AGENTS.md` §4 and use the
live owner to establish current behavior. Correct the specific stale instruction when it would cause
the next agent to make the wrong change or run unnecessary work.

## Reporting

State whether the assigned outcome is done. Describe what changed, the direct check and its result,
and any material limitation or unresolved risk. Keep `PASS`, `UNKNOWN`, and `INCOMPLETE` distinct.
Do not present focused evidence as a public-route result, or a diagnostic measurement as acceptance.
