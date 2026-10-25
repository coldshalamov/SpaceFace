# X-09 impl note — per-cause death lessons

`defeatRangeOffer(state, lethal, read)` gained a cause read; `DEFEAT_RUNG_ROWS` adds
arena-impact → `stopping_takes_room` and hull-ram → `slip_a_gap` (self/environment sources only —
contact-caused deaths stay silent). Per-rung gating: session `ui.deathRangeOfferedRung` +
durable `player.hints['deathRung:<id>']`. Snap offer unchanged and first.

Tests: 7 new cases in `infer-b-world-teach.test.mjs` — all pass; the TEACH-07 failure in the
file is pre-existing dockArrival drift, not this row. 49/49 keep-green green. No re-pins, no
draws, no save-schema change (hints ride the free-key bag). No sim digest change.

v3 update: the v1 physicalLabel rows (arena impact → stopping_takes_room, hull ram → slip_a_gap)
are correct but DORMANT — the player takes no impact damage yet; the DEFEAT_RUNG_ROWS comment
says so. Live rows added: dry-cap (source.kind 'contact', finite capMax>0, cap ≤ 5% →
you_can_run_dry 'Ran the cap dry.') and dock-collar (origin/context 'dock_collar' + environment
→ stopping_takes_room 'Came in hot.'). Order: snap → dry-cap → rows. cap/capMax and
origin/context ride the read bag at buildDefeatReceipt. TEACH-08 pins green; 19/19.
