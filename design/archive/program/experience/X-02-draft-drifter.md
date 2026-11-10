# X-02 draft — Drifter: the Lookout, a broke pirate with one bad gun

Persona: The Drifter. Row §1P 559/560. Audit: `X-02-audit.md`.

## Ground

The Claim Jumper stays a dead hulk (arming it cancels the tow, `onboarding.js:3254`). But jumpers
never work alone. Someone watches the lane, and he's as broke as you: one patched gun, no shields,
no wish to die for a partner who owes him money.

## What the player gets

- A separate staged actor, **"Lookout"**: a `wasp_swarmer`, light hull, so it's ammunition too. It
  sits ~420 wu past the throw rock and holds fire until the first `raid:latched`, then opens up. It's
  a real AI and never part of the tow lesson.
- Spawn hail (comms, Reach salvage math): *"Put him down easy. He owes me forty."*
- Rail followup on first shot: *"Lookout's shooting. Keep swinging."*
- At ≤30 % hull: `ai.forceFlee = true`. The existing Reach flee line plays, and `egressExit` despawns
  it at 960 wu. Followup: *"He's running. Let him tell them."* Comms: *"Keep him. Forty ain't worth it."*

## Teeth, not a wall (its own spawn spec only)

Shield 0, hull 70, mass 40, `weapons:[{id:'wpn_pulse_laser_s', dmgOverride:2}]`. Target ≤5 effective
dps against the Hitch's 7/s shield regen. A pilot who keeps swinging keeps the shield. One who parks
takes hull bites after ~40 s. No archetype, player, or global weapon number changes.

## Lands in

- `onboarding.js` `_spawnRaidCast`: one more `makeEnemySpawnSpec('wasp_swarmer', …)`. Set
  `raid.ids.lookout`; `_removeRaidActors` already sweeps every slot on restage. Flip ROE on
  `raid:latched`. In the raid tick, hand-roll the ≤30 % check as `1207-the-witnessed-price.js:322-327`
  does. Emit `raid:lookoutOpen` / `raid:lookoutFled` for two followups on the raid beat (`:307-311`).
- Completion paths unchanged. The Lookout never gates the rail.
- Pins: `inf-061-raid-discovery`, `pq-163-03/04`, `wave-b10-throw-determinism`. **`rc-458-round1-budget`
  `{raider:2}`** decides whether the Lookout takes a raider slot. Raise that pin deliberately.

## Working life

The first person who shoots at you is doing it for forty credits, and he quits when it stops paying.
