# FB-141 — The heap-leak, main-thread and Crucible CPU probes get npm doors and a one-line index

**Kind:** polish · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: package.json, seam: probe-heap-verify.mjs
**Write-set:** `package.json`, `scripts/probe-heap-verify.mjs`, `scripts/probe-main-thread-profile.mjs`, `scripts/probe-crucible-cpu-profile.mjs`, `docs/VALIDATION_WORKFLOW.md`, `test/fb-probe-doors.test.mjs`
**Neighbours (extend, never restate):** SFQ-B211, SFQ-B217

## The gap
77 of 99 `scripts/probe-*.mjs` have no npm script. The only forced-GC leak instrument
(`probe-heap-verify.mjs`), the main-thread profiler and the Crucible CPU profile are unreachable by name, so
an agent asked "is it leaking" reinvents the probe. SFQ-B211 and SFQ-B217 diagnose a hitch and a leak; these
are the doors they would use.

## Why this direction
Doors, not new probes: three npm scripts, a bounded default case count, and one paragraph in the validation
ladder.

## Mechanism
- Add `+probe:heap-verify`, `+probe:main-thread` and `+probe:crucible-cpu` npm scripts with bounded defaults;
  document them in the validation ladder's router table.
- Pin with a test that every `probe:*` npm script points at an existing file.

## Done when
`test/fb-probe-doors.test.mjs`: every probe script resolves; the three doors run to completion in under a
minute with their default bounds on the play machine.

## Do not
Do not wire all 77. Do not put a probe in the baseline gate. Do not change probe defaults beyond bounding.

## Focus test starting points
- Locate probe contract suites with `rg "probe-" test/ -l | head`.
