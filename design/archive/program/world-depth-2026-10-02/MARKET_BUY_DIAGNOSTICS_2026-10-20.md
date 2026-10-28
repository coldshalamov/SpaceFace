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

## Exact-head result and BUY trace follow-up (2026-10-20)

PR463 head e325c80a3b59e2b0ddb745880e82460c28d722af passed the original Market
browser check: model credits5000→4962 and visible purse5,000→4,962, same state object.
The click returned after about4.199s and the original wait fulfilled after about12.749s.
Six long tasks were recorded, five around4.16–4.25s. This successful run does not
explain earlier failures or establish painted-frame timing. Overall CI remains failed.

The follow-up adds a separately named bounded CPU trace immediately before BUY and
closes it after the unchanged observer/wait. Existing dock traces end before BUY.
Unique sanitized labels plus UUID filenames and exclusive writes preserve prior traces.
Outer cleanup is idempotent. Trace start/stop overhead is diagnostic latency, not a
performance improvement or hardware/FPS benchmark. Original15s acceptance and420s
browser command allowance are unchanged. The existing static diagnostic leaf also
runs the station-handoff trace helper tests; no new browser command is introduced.

Local helper suite35/35 and independent adversarial review6/6 pass. Next: publish
this exact follow-up and inspect actual BUY CPU stacks before choosing production fixes.

## Observed trace loss and bounded reduction (2026-10-20)

Successor 22a7dba passed BUY again, but the wait consumed 14.858 s of its unchanged
15 s allowance. This is not stable-liveness or performance acceptance. Its distinct
BUY trace retained three roughly 4.8–5.0 s Chromium Commit spans, each overlapping a
similarly long GPU-process task. Launch metadata identifies headless SwiftShader.
No retained shader/compile/residency counter identifies the responsible game operation.

The 8 MiB ring wrote 11,939,840 bytes and overwrote 3,551,232 bytes (867 chunks).
The main CPU profile lost its start and 90,817 of 91,801 sample-node references.
Surviving autosave samples must not be blamed for those native spans. The trace is
useful native-task evidence but incomplete source-attribution evidence.

Only the BUY trace now omits the redundant `toplevel` category. In that retained
trace, `toplevel` and `toplevel,mojom` contributed 28,528 events; their serialized
JSON was about 8.71 MB. Actual Commit, GPUTask and RunTask events belong to
`disabled-by-default-devtools.timeline`, which remains enabled alongside function,
stack and CPU sampling categories. Original dock trace categories are unchanged.

No buffer, storage, actor, or acceptance budget increases. Compact traces report
buffer overwrite statistics, missing profile starts, missing node/parent references,
cycles, sample/timing coverage and parser invalidity after capture. Profile status
reports structural completeness only, never source causality. Parent traversal is
iterative and memoized within the node cap. Gzip inflation is capped at 16 MiB; analysis caps
events, profiles, nodes and samples and reports unavailable rather than silently
claiming integrity. Clean JSON alone is not complete evidence. The retained failing
integrity case is reproduced locally; another exact-head capture must establish
whether this measured reduction preserves definitions before any production fix.


## Final targeted capture correction (2026-10-20)

Head9bba686 failed the unchanged BUY gate with original Playwright TimeoutError.
Trade/DOM updated to4965 at browser6223ms, state identity stayed stable, but host
wait rejected after19361ms wall time. Four retained Commit spans6.17–6.44s overlap
GPU-process work. There is no enclosing long FunctionCall or compile/residency mark.
This is stalled responsive acceptance, not evidence of a failed transaction or paint.

BUY-only category reduction still lost1417216bytes/346chunks. Main profile lost its
start and142352/143918 sample node refs. No source cause is established. Therefore
BUY now replaces trace CPU sampling with a main-page CDP Profiler snapshot sampled
at4000µs; original dock profiling and bounded native task/GPU timelines remain.
The snapshot is not worker/GPU evidence and profiling overhead is not performance
acceptance. This is the final targeted capture correction, not an indefinite loop.

Page profiler setup is bounded2s, capture ceiling60s, stop15s and detach2s. Ceiling
capture is marked temporal partial regardless of structural completeness. Snapshot
analysis/storage occurs only after the existing actor boundary, with100k node/sample
caps, iterative graph validation, bounded strings and16MiB artifact cap. Artifacts
are exclusive unique files. Closed sessions, timeouts and late replies preserve
the original actor result; no gameplay predicate,15s wait or420s command changes.
