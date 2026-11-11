# G08-01 — Swarm enemies wear their own size and colour

**Commission:** EC-G08 Enemies you can tell apart. **Size:** medium. **Tier:** Devin (SWE-2 Max) or better.

## Why
A stranger must be able to sort Swarm enemies into kinds by sight. The game already has a
character sheet for all fifteen Swarm enemies — `src/data/swarmCharacter.js`,
`SWARM_CHARACTER_SHEET` — with a `scale` and a `hue` per enemy. At spawn,
`src/systems/waveMaterialization.js` (~line 240–258) copies them onto the entity as
`entity.data.swarmCharacter = { silhouette, scale, hue, tier, abilityId, tellId }`.
**Nothing draws them.** Every enemy is drawn at its hull's normal size in its normal colours.

## What the player must see
In a Swarm run, every enemy that has `data.swarmCharacter`:
1. is drawn at `scale` × its normal size (Wasp 1.0, Bulwark 1.35, the wall-type 1.6, …);
2. has its **accent / trim / emissive lights** in its sheet `hue` (a 24-bit RGB number, e.g.
   `0xffb42a`), so a Wasp glows amber and a Reaver glows red. Keep the hull body colours as they
   are; colour only the accent/trim/emissive parts, so the ship still looks like the same ship.
3. Enemies **without** `data.swarmCharacter` (all Adventure ships) look exactly as before.

Do not touch the simulation's radius/mass — those are already set from the sheet. This is drawing only.

## Read first
- `src/data/swarmCharacter.js` (the sheet; the comment at the top explains the fields)
- `src/systems/waveMaterialization.js` lines 230–270 (where the stamp is written)
- Find where the renderer builds or tints an NPC ship. Start points:
  `grep -n "palette.hull\|accentTint\|hullTint" src/render/partsLibrary.js` (around line 17861 there is
  a palette tint path with a hull tint and an accent tint, cached by key) and
  `grep -rn "entity.data" src/render/renderer.js | grep -i -E "tint|palette|scale"`.
  Follow how an entity's palette reaches that function. Your job is to make the sheet hue become the
  accent tint and the sheet scale multiply the drawn scale, for stamped entities only.
- The entity's data reaches the renderer through the render snapshot. If `data.swarmCharacter` is
  not available on the render side, find how other `entity.data` fields are passed (grep the
  snapshot/packaging code for an existing field such as `factionId`) and pass `swarmCharacter`
  the same way.

## Files you may edit
- `src/render/partsLibrary.js`, `src/render/renderer.js`, and whichever render-snapshot/packaging
  file must carry the field (name it in your receipt). Before each: `git diff -- <file>`; if it has
  changes you did not make, stop and report Blocked for that file.
- one new test `test/swarm-character-drawn.test.mjs`

## Checks
1. `node --test test/swarm-character-drawn.test.mjs` — test the pure part of your change: a
   function (export it) that, given an entity-like object with `data.swarmCharacter`, returns the
   `{ scale, accentHex }` to draw with, and returns the unchanged defaults for an entity without it.
2. `node --test test/swarm-character*.test.mjs` (existing sheet tests) still pass.
3. Say in the receipt exactly which function now applies scale and which applies the hue, with
   file and line numbers. If you could not see it on screen, say so.

## Done when
A stamped enemy's draw path uses its sheet scale and hue; unstamped ships are unchanged; checks
pass. Commit message: `fleet(G08-01): Swarm enemies are drawn at their sheet size and colour`.
