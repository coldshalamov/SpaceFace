# Market BUY: bounded liveness evidence

## Observed gap, not a production diagnosis

PR459 head 7cdf38b8 failed the same Market BUY gate twice. Retained observations show both
transactions settled (credits and cargo changed), but they do not establish when the predicate
became true, when the browser could poll it, or whether the visible credit display updated.
The performance traces end before BUY and neither artifact has screenshots. This is not enough
to declare the UI working, a probe-only bug, or a particular production fix.

The original acceptance predicate remains `window.SF.state.player.credits !== prev`, with the
same 15-second timeout and the same failure message. Buying must still spend credits afterward.
No extra wait, trade, retry, screenshot, gameplay state mutation or acceptance condition is added.

## Evidence added

The existing read-only observation now records:
- Browser-relative timestamps for up to 32 scalar event rows, with bounded text and no retained
  mutable event payloads; snapshot state identity and visible purse text before/after BUY.
- Purse/toast DOM mutations and at most 16 optional browser long-task entries. These are observed,
  not scheduled. There are no timers, layout reads, requestAnimationFrame loops or production logs.
- Independent Node-relative click/wait stages, original credit baseline, outcome and bounded
  original Playwright error name/message. Browser and Node clock domains are explicitly separate.
- Cleanup on normal finish, snapshot failure and partially failed installation. Late callbacks
  cannot mutate a finished result. Optional timing support is not an acceptance prerequisite.

DOM text is not proof that a frame painted. These observations narrow timing, stale-state,
visible-state and execution-context explanations without choosing one in advance.

## Validation and reachability

Twelve portable VM/contract tests pass; independent review adds six adversarial checks for frozen
state, hostile payload getters, partial install, unsupported timing, late callbacks and actual
Playwright serialization compatibility. Installed JSHandle.evaluate serializes the callback and
its explicit argument, matching the implementation. No local browser execution is claimed.

The combined diagnostic, CI report and gate-reachability suite passes 66/66. Its first run was
64/66 because the sparse working tree lacked tracked .github/workflows/check.yml. The exact
unchanged HEAD blob ea472f463250011a3bf0f8b65d80c07867e54229 was materialized for those read-only
contract tests; no workflow content or permissions changed.

A new `check:market-buy-diagnostics` command runs once in the static group. The original Market
browser command retains its identity and 420,000 ms outer CI allowance; its internal BUY wait
remains 15,000 ms. Browser, feel and sim command objects/order are byte-equivalent before/after.
No unclassified commands, workflow changes, budget rewrites or golden updates.

## Next causal boundary

Publish the reviewed source-only increment and follow exact-head CI. If BUY fails again, read
both clock domains, original error and purse evidence before assigning cause. Do not retry until
evidence warrants it; do not convert a settled economy transaction into visual acceptance.
