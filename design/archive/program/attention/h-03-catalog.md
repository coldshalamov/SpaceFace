# H-03 catalog — module/outfitting catalog

## What the player sees
`src/data/modules.js` defines ~40 stock modules (id, name, slotType, size, tier, mass, price,
sentence). Shop rows show stats + one `sentence`; deeper texture routes through codex
`MODULE_OVERLAYS` (codexPages.js:143) which carries `{ maker, casualty? }` — already the
parts-yard voice ("The part the yard puts in when you cannot afford the adjective").

## What is thin
Only unique/exotic modules and the three stock thrusters have overlays. The bread-and-butter
catalog — shields, engines, cargo, mining, utility, ~24 entries — has no maker marks.

## Additive seam
`MODULE_OVERLAYS` appends keyed to existing module ids. No schema change; codex page builder
already resolves `overlay` by id (codexPages.js:357).
