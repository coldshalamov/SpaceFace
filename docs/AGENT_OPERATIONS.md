<!-- LIFETIME: STABLE -->
# Agent operations

This note explains how to finish assigned work. Root [`AGENTS.md`](../AGENTS.md) owns authority,
shared-tree and Git safety, and the verification router. The live board is
[`design/overhaul/12_PIPELINE.md`](../design/overhaul/12_PIPELINE.md).
[`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md)
describes the available verification tools.
Do not copy those procedures into another checklist.

## Finish the assigned outcome

Work from the user's request and its done condition. Resolve uncertainty with the smallest
interpretation that fulfills the request; a process document or evidence artifact is not the outcome.

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
or risk. Do not repeat completed reviews, duplicate an active
investigation, require agreement between models, or treat reports as approval quotas.

Complete authorized work without waiting for a user playtest or verdict. Only an explicit external
action the user requested can remain deferred; report any unresolved dependency and keep unrelated
work moving.

## Shared checkout

Inspect current ownership and the exact diff before editing. Preserve concurrent changes; stage,
commit, and publish only the paths the active instructions assign to you. Root `AGENTS.md` owns
Git and worktree rules. Keep one checkout and use its existing objects for historical comparisons.
Follow [artifact retention](./ARTIFACT_RETENTION.md) when a workflow needs to stage a runnable baseline.

When code and documentation disagree, follow the authority order in root `AGENTS.md` and use the
live owner to establish current behavior. Correct the specific stale instruction when it would cause
the next agent to make the wrong change or run unnecessary work.

## Reporting

State whether the assigned outcome is done. Describe what changed, the direct check and its result,
and any material limitation or unresolved risk. Keep `PASS`, `UNKNOWN`, and `INCOMPLETE` distinct.
Do not present focused evidence as a public-route result, or a diagnostic measurement as acceptance.
