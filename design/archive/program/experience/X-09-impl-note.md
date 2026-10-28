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

Complete-with-evidence (devin-expu audit 2026-10-25): landed 94909073cd + v3 ab3bab5eba
(+d33947c520, 82a1112916, 58fa09c9e5 review closes — null-cause silence, dry-cap line, TEACH-07
fixture repair). `infer-b-world-teach` 19/19 green today. Audit residual (no cause→rung map)
closed: dry-cap and dock-collar rows fire live; the v1 arena-impact/hull-ram rows are documented
dormant pending player impact damage (a separate gameplay contract, not this row). Rejected
draft scope (weapon→boost_keep_speed, hazard→slip_a_gap, five-row map, ui-array gate) was
adjudicated at plan time — no remaining named sub-scope.
