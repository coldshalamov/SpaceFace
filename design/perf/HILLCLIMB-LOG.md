<!-- LIFETIME: DURABLE --><!-- Append-only. One line per experiment. Numbers, not prose. -->
# SpaceFace performance hill-climb log

Scoreboard, measured with `npm run probe:runtime-witness` at `SPACEFACE_WITNESS_MS=60000
--no-sample-shots` and `npm run probe:shader-timeline --headed`:

| | metric | start | target |
|---|---|---|---|
| A | frames delivered per 60 s flight | ~3050 | 3400+ |
| B | DRAW-TIME-MISS shader links | 36 | 0 |
| C | long-task blocks >=2.5 s per 60 s | ~3 | 0 |
| D | JS heap floor after forced GC | ~486 MB | report only |
| E | excess ms per 1000 frames | ~559 | 300 |

Rules: one falsifiable hypothesis per experiment; smallest change that tests it; keep only if the
predicted number moved; a revert is a completed experiment, not a stop.

| # | hypothesis | change | A | B | C | D | E | verdict |
|---|---|---|---:|---:|---:|---:|---:|---|
