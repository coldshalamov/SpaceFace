# CLAIM — poi-scan-all-identified-quiet-latch

Fully-identified (or no proximity-scannable work) sectors still walked every
POI carrier + discovery record in `_tickPOIScan` each tick. Latch after a probe
finds zero proximity work; wake on `sectorId`, `pois.length`, or 0.5 s rescan
(covers newly admitted / investigated POIs). Identify path preserved when work
remains. Soft-GPU fps not claimed.

Primary KPI: portable microbench ≥1.5× (soft-GPU fps not claimed).
