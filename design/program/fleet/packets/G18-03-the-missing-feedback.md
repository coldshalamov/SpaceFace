# G18-03 — The feedback that is missing: kills and throws you feel, a boost that kicks

**Commission:** EC-G18 §3 (one feel). **Size:** medium. **Tier:** D (lead looks before DONE).
Slice 1 (Pull/Shove/contacts the same in both doors) landed in 21a3a741.

## What the player must feel — in BOTH doors (Adventure and Swarm)
1. **A small camera beat on every light kill** (a ship of 32 t or less dies): a 0.08 s nudge of
   about 2 world units along the kill direction, then settle. Today a light kill gives the camera
   nothing.
2. **A camera beat on every slingshot release** (the Line lets go of a swung body with real speed):
   a 0.12 s pull of about 3 units in the throw direction. It is deliberately switched off in Swarm
   today — find that switch (search for the release camera cue and a Swarm/survival gate near it)
   and remove the gate so both doors get it.
3. **Boost up toward twice cruise**: the starter ship's boost top speed today is about 1.5x its cruise;
   the design says 2x. Raise the boost multiplier for the player's ships to 2.0x (data, not code —
   find it with `grep -rn "boost" src/data/ships.js src/data/*flight*.js | head`). When boost lights,
   draw **one expanding ring behind the ship** (0.35 s, fades out; reuse an existing ring/shockwave
   VFX — search `src/render/vfx.js` for `ring` or `shockwave`).
4. **Engine feel set** (`design/bibles/FEEL.md` §2 if it exists; otherwise these four, in this order,
   ship what fits): a light screen shake while at full boost near top speed ("redline"); small
   thruster puffs at the hull's side on a hard turn; a single cough of exhaust when the engine lights
   from rest; engine sound pitch rising with thrust (reuse the existing engine audio; change its pitch
   parameter only).

**Rule from the brief:** feedback comes last. Do not change any physics in this packet except the
boost multiplier. If something here would need new physics, list it under Blocked.

**Reduced motion:** every camera beat and shake must respect the game's reduced-motion setting
(search `reducedMotion` / `motion` in `src/` to find it) — off when reduced motion is on.

## Read first
- `src/render/` camera code: `grep -rn "shake\|cameraKick\|camBeat\|hitStop" src/render/*.js | head -20`
- Kill and release events: `grep -rn "entity:killed\|line:released\|tether:release\|slingshot" src/systems/*.js | head`
- The existing heavy-kill hit-stop and shake that scale with mass (protect them; do not double them).

## Files you may edit
The camera/shake owner you find in `src/render/`, `src/render/vfx.js` (ring only), the ship data
file holding boost, the engine audio file (pitch only), one new test `test/feel-feedback.test.mjs`.
`git diff -- <file>` before each.

## Checks
- `node --test test/feel-feedback.test.mjs`: a light kill emits one camera beat of the stated size in
  both a Swarm and an Adventure state; a heavy kill keeps today's beat (no double); a release emits a
  beat in Swarm; reduced motion emits none; the starter ship's boost top speed / cruise = 2.0 ± 0.05.
- `node --test test/*shake*.test.mjs test/*camera*.test.mjs` — report failures honestly.

Commit: `fleet(G18-03): kills and throws move the camera, boost kicks to twice cruise`.
