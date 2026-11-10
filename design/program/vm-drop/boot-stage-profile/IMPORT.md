## What it is

Cold-boot stage profile: three cold Chromium runs from navigation to first playable frame, with per-stage ms tables on current master.

## Live path that would receive it later

None. Optional paste into `design/perf/` boot notes. Compare to older `boot-times/` if desired.

## What was not wired

- No loader or `src/` edits.
- No merge to master.
- Did not replace `boot-times/` (keeps historical SwiftShader baseline on older SHA).
