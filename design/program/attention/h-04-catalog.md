# H-04 catalog — weapons & gear

## What the player sees
`src/data/weapons.js` ~20 weapons with name/slot/tier/stats; codex `WEAPON_OVERLAYS`
(codexPages.js:197) carries `{ maker, casualty? }` — but had exactly ONE entry
(`wpn_saucer_death_ray`). `src/data/arsenalIdentity.js` (clean) holds recoil/read names.

## What is thin
Every player-buyable weapon lacks maker marks and wear lore; the industrial register
("Belt-fed, drum-cooled, honest") exists only for the one exotic.

## Additive seam
`WEAPON_OVERLAYS` +17 entries keyed to existing weapon ids; codex resolves by id (line ~384).
