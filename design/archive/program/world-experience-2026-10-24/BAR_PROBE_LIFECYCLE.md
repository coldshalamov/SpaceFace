# Bar probe lifecycle diagnostics

## Purpose and boundary
A prior browser command printed its functional success line but the command runner recorded a timeout. Untimestamped output cannot establish whether success preceded timeout or identify the cleanup phase. A bounded Node subprocess reproduction showed a child can print OK after its shell wrapper is killed while inherited pipes delay close; that demonstrates ambiguity, not the cause or timing of the historical Bar run.

This diagnostic-only increment adds seven one-shot fixture milestones: fixture start, assertions complete, browser close start/end, server stop request, server exit and server close. Each records independent wall-clock epoch and monotonic elapsed time, with only process/completion details. Duplicate/unknown milestones are ignored. Clock/output failures do not change the probe verdict. No per-frame telemetry, listeners on game simulation, or user-data recording is added.

## Unchanged behavior
The original Bar readiness assertions, success text,90000ms startup timeout, waits, server signals and cleanup ordering remain. Browser close remains the same awaited operation; its completion flag is diagnostic, not a timeout or success override. Server exit/close are observed, not awaited. No process-tree correction, browser-close deadline, gameplay/rendering repair or retrospective causal conclusion is included.

Shared scripts/check-ci-report.mjs and workflows are untouched. Open PR480/483 already have shared-runner work; this increment neither duplicates nor absorbs those changes. Fresh full open-PR path census found no overlap on the Bar fixture or the two new helper/test paths.

## Validation
The exact helper/test/source strings passed5 Node-only tests in RAM with fixture reads supplied as source and helper imported via a data URL. Tests cover seven-event bound/deduplication, independent clocks, detail allowlist, swallowed clock/sink failures, unavailable timing values and unchanged fixture ordering/assertions/timeouts/signals. Removing deduplication produces2 failures; substituting the wall clock for elapsed time also produces2 failures. All three files passed syntax checks.

No browser/game execution was performed for this change. This does not resolve the historical startup veil/material-admission issues, attribute a game regression, establish graceful cleanup or fix the Linux runner's shell-only kill behavior. The separate owned-process reproduction only establishes that post-timeout stdout and delayed close are possible.

[Sanitized exact evidence](BAR_PROBE_LIFECYCLE_PROOF.json) retains stdout and negative controls, with private environment paths replaced and tool metadata omitted as explicitly labeled.

## Publication
Three source/test paths plus package alias, this report and the evidence file. The additive check:bar-probe-milestones command runs only test/bar-probe-lifecycle.test.mjs (5 expected TAP tests), appended to the existing check chain without moving prior commands. Existing classification reaches static shard2/3; no unclassified leaf or workflow change. The existing browser Bar command is unchanged and will run through the normal hosted graph.

Sole public parent29b08e55bd3d8354e1d82e960376e057c7cddfdd. This is a separate draft, not part of PR590, and contains no private ancestry, merge or deployment. Historical initial-head validation is recorded below; successor validation remains pending.


## Initial hosted evidence and bounded boot-issue extension
At head 329d83958986f7499c9b633651545d6427913f8e, run [40119624351](https://github.com/coldshalamov/SpaceFace/actions/runs/40119624351) passed all five Node-only tests, but the full workflow failed. Actual synthetic checkout 9542e603aef5aa5b0247b34f7132e61dc110c715 had public master 29b08e55bd3d8354e1d82e960376e057c7cddfdd and that head as parents, with the same tree as the head.

The Bar command exited 1 after 92903 ms, without a runner timeout. Its existing initial 90000 ms page.waitForFunction rejected before assertions. Browser-close start/end markers were both printed, about 87.5 ms apart; this run does not demonstrate a browser-close hang. No server exit/close marker was present before process failure. These observations do not settle the older untimestamped runs.

The successor adds one bounded Node-side report on rejection of that same initial wait. It reads only already-collected browser issues, emits at most eight allowlisted technical summaries, omits URLs/arbitrary console text, and rethrows the identical original error. Collector, formatting or sink failure cannot replace that rejection. It adds no browser evaluation, wait, timer, signal, timeout extension or success override. The seven lifecycle milestones remain unchanged.

Exact successor helper/test/fixture strings passed nine Node-only tests; error-identity and bounded-output negative controls fail as expected. Three syntax checks passed. Negative-control excerpts are labeled as summaries, not complete raw output, in [the sanitized extension proof](BAR_PROBE_BOOT_ISSUES_PROOF.json). No local browser execution was performed, and this is observability rather than a boot or gameplay fix.

The existing named alias reaches all nine tests on static shard 2/3 without changing package commands, prior order, shared runner or workflows. Publication uses a public merge child of the initial diagnostic head and current master 8d2373447b187b4f476c7fba0268910af98b2106, preserving newer weapon-level and VFX-lab work. The historical initial proof is retained. Hosted successor results must be evaluated separately; no full-CI green claim is made.


## Landed startup repair reconciliation
The preceding diagnostic head completed run40121650020 with nine focused passes and a failed full workflow. Its initial readiness report counted four issues but omitted their unrecognized text shapes; it did not identify their cause itself.

External PR595 subsequently landed the missing caption export and resolver metadata on master4eb30c840accfdf20a2a696bfb2c2550aeac4769. This diagnostic branch now merges that public master to obtain new browser evidence beyond the already-fixed import boundary. It does not duplicate the external fix, change the nine tests, widen issue disclosure or claim the browser now starts. Other newer deep-field rendering and program work is preserved. Original package line endings are restored while retaining only the additive diagnostic alias/check-chain change. Successor CI remains pending.
