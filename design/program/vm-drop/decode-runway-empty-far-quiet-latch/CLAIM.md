# CLAIM — decode-runway-empty-far-quiet-latch

Quiet `requestDecodeRunwayPromote` still paid `authoredPrefetchRadius` + wide
`queryFarActors` empty-grid walk every tick after #132 latched `tickFarActors`.
Empty-row early-return in `queryFarActors`; quiet-latch decode promote; wake on
`farActors.version` / player move / 0.5 s rescan. Promote preserved when rows
exist.

Primary KPI: portable microbench ≥1.5× (soft-GPU fps not claimed).
