# T-01 catalog — station screens / dockside content

## What the player sees
Dockside surfaces read from the flavor packs: `020-ad-board.js` (ad_pulse notices +
conflict-flip sets, ~330 entries, already carrying a foreign ATTENTION "S-01 Helios" block)
and `030-graffiti.js` (hand-tag sets keyed by set/sector/faction). Station screen code itself
is ORRERY-foreign — the sanctioned seam is pack entries only.

## What is thin
The ad rotation is deep but generic-sector; dockside micro-copy for trade_hub/fab/military
desk texture has room. Graffiti sets end at `exp_free`; ordinary-sector hand-tags (the
non-expansion day-to-day) are thin.

## Additive seams (used)
- `020-ad-board.js` +12 `ad_pulse_310..321` — notice-desk copy (appended after the foreign
  S-01 block, outside its hunks).
- `030-graffiti.js` +12 `tag_t01_dock_*` — dockside hand-tags (clean file).
