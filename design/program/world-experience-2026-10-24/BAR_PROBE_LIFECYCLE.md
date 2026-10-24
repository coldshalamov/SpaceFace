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

Sole public parent29b08e55bd3d8354e1d82e960376e057c7cddfdd. This is a separate draft, not part of PR590, and contains no private ancestry, merge or deployment. Hosted validation is pending.
