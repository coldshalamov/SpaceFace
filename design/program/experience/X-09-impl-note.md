# X-09 impl note — per-cause death lessons

`defeatRangeOffer(state, lethal, read)` gained a cause read; `DEFEAT_RUNG_ROWS` adds
arena-impact → `stopping_takes_room` and hull-ram → `slip_a_gap` (self/environment sources only —
contact-caused deaths stay silent). Per-rung gating: session `ui.deathRangeOfferedRung` +
durable `player.hints['deathRung:<id>']`. Snap offer unchanged and first.

Tests: 7 new cases in `infer-b-world-teach.test.mjs` — all pass; the TEACH-07 failure in the
file is pre-existing dockArrival drift, not this row. 49/49 keep-green green. No re-pins, no
draws, no save-schema change (hints ride the free-key bag). No sim digest change.
