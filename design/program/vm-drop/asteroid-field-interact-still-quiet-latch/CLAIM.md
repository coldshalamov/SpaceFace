# CLAIM — asteroid-field-interact-still-quiet-latch

Quiet parked flight still paid `queryAsteroidField` on the near ram reach every
tick. Empty latch rarely arms on Ceres (near-disc often non-empty). Dormant
field rocks do not translate (vel 0), so a still-player latch safely skips the
grid walk while parked. Wake on `asteroidField.version` / player move / unpark /
0.5 s rescan. First probe still promotes touching rocks.

Primary KPI: portable microbench ≥1.5× (soft-GPU fps not claimed).
