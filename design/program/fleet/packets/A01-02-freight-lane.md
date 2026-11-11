# A01-02 — The freight lane: a container string crosses the Foundry on a timetable

**Lane 2.** **Design:** `design/game/12_SWARM_THE_PIT.md` "Traffic — the reason speed is fun" and
`design/game/15_ARENA_FLOORS.md` §1 Ricochet Foundry, row "The lane". **Size:** large; this packet is
slice 1 (the Foundry only, no riders, no Rush Hour).

## What the player must see and feel (exact numbers — tune only if play proves them wrong)
- **The lane:** a straight line west → east through the centre of the Ricochet Foundry (arena id
  `helios_core`), spanning the arena's playable diameter.
- **Timetable:** a string passes every **40 s of sim time**, first one 20 s after the round starts.
  Deterministic: same seed, same times.
- **Warning, 3 s before:** a row of **amber lane lights** along the whole lane switches on (blinking at
  2 Hz) and a **horn** sounds at the west end — reuse the existing cue `sfx_hauler_foghorn`
  (`src/data/audioRecipes.js`). Lights go off when the last container has passed.
- **The string:** **5 containers**, 30 WU apart, moving at **140 WU/s**, mass **400 t each**. It does
  not stop or turn for anything.
- **It crushes:** any ship a string container touches takes a crush hit — light enemies (≤ 32 t) die;
  heavier enemies take 60 % of max hull and are shoved out of the lane (perpendicular, ~120 WU/s);
  **the player takes 40 % of max hull** and is shoved out. Loose bodies (rocks, debris) are shoved out.
  Kills by the string count as environment kills (credit the player when a body the player threw or
  shoved within the last 4 s is the one crushed — reuse the throw-provenance window in
  `src/data/swarmFeelProfile.js` `contact.thrownProvenanceS`).
- **Ride it:** a container on the string can be latched with the Line; the player is towed with it.
- **Cut it loose:** if the player latches a container and **reels or swings it** (Line tension above the
  hold threshold for 0.5 s), that container leaves the string and becomes an ordinary heavy dynamic body —
  the heaviest throwable in the arena. The rest of the string carries on.

## Code facts (start here)
- Arena "law" files: one per arena, e.g. `src/systems/asteroidMillArena.js` (read its header comment and
  how it plugs in). Registration: `src/data/survivalArenas.js` (rows per arena id),
  `src/data/arenaModuleLibrary.js`, `src/systems/survivalArena.js` (exports the law ids, ~line 154).
  The Foundry is `helios_core` (`src/data/swarmEvents.js` line ~52 describes it). Put the lane in a new
  `src/systems/freightLane.js` and wire it for `helios_core` the way the Mill's law is wired.
- Spawning bodies: copy the entity-spec shape used for Swarm debris in `src/systems/swarmArena.js`
  (search `SWARM_DEBRIS_TAG`) and the cargo container shape in `src/systems/faction_meridian.js` ~1216
  (`type: 'container'`). Tag string containers (e.g. `data.freightString = <stringId>`) so they are
  identifiable, tetherable, and despawned at the east end.
- Moving them: drive each container's velocity each fixed tick toward its timetable position (so physics
  contacts are real), in sim time (`state.simTime`), never wall time. Look at how the dynamic body owner
  accepts velocity/impulse intents (`src/core/sg02DynamicBodyOwner.js`) — do not write positions
  directly if the owner forbids it.
- Lane lights: a presentation cue. Emit an event (e.g. `freight:warning` / `freight:clear` with the lane
  endpoints) and draw the lights in `src/render/` by reusing an existing beacon/marker mesh or VFX — find
  one with `grep -rn "beacon\|laneLight\|marker" src/render/vfx.js src/render/*.js | head`.
- The Line: latch/tension events live in the tether system (`grep -rn "tether:latched\|line:latched\|tension" src/systems/*.js | head`).

## Files you may edit
New `src/systems/freightLane.js`, new `test/freight-lane.test.mjs`, the arena registration rows for
`helios_core` (`src/data/survivalArenas.js` / `src/data/arenaModuleLibrary.js` / `src/systems/survivalArena.js`
— the smallest set), one render file for the lights. `git diff -- <file>` before each.

## Checks
- `node --test test/freight-lane.test.mjs`: timetable times for a seed; warning 3 s before; a light
  enemy in the lane dies on contact, a heavy one loses 60 % and leaves the lane; the player takes 40 %;
  a latched container under tension for 0.5 s leaves the string; the string despawns at the east end;
  identical results for the same seed.
- `node --test test/swarm*.test.mjs test/survival*.test.mjs` — only the 30 known reds may fail.
- One look (through the lock): `node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=3 --rounds=1 --out=.devshots/fleet/freight`
  and describe in your receipt whether the contact sheet shows the lane lights or a container string.

Commit: `fleet(A01-02): a freight string crosses the Foundry on a timetable`.
