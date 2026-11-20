# MAPS-1 — the minimap becomes the coolest instrument on the screen

**For:** a designer-builder with eyes. **Kind:** flight HUD instrument. **Commit when the frames
look right.** The director judges your frames.

## Why

The owner (2026-11-20): "the minimap looks really cool, I wish we could make it even cooler." It is
already the piece of the HUD he likes most. Make it the thing a stranger screenshots.

It also has a job the game now depends on. A fight in this game is a small cast of enemy kinds
whose abilities interact (ruling R19 in `design/overhaul/00_RULINGS.md`); the player wins by
reading the mix and by using the room (rocks to throw, walls to pin against). The minimap is where
that reading happens at a glance.

## Look first

Shoot it over stills (seconds, no game boot) and open every PNG:
`node scripts/ui-bench.mjs --shot=flight,flight-contacts,crucibleHud,swarm-play --viewports=1280x720,1920x1080 --out=.devshots/maps1/before`.
Then read how it is drawn: `src/ui/map/flightMinimap.js`, `src/ui/radar.js`,
`src/ui/map/tacticalMapGrammar.js`, `src/ui/map/contactVisibility.js`, the visor chart skin in
`src/ui/orrery/visorHudSkin.js` / `visorInstruments.js`. Adventure draws a clipped-corner chart
panel ("Scan 4.0 km", "200 u", labels like `Market`, `Wreck`, `BEACON`); Swarm draws a round radar
("RANGE 600"). What the director saw wrong in today's frames: labels are oversized and collide
with each other and with the scan readout; units read `u`; the two modes look like two different
instruments; in Swarm every enemy is the same red arrowhead, so the mix of kinds is unreadable.

## Build

One instrument, two ranges (a wide survey range for calm flight, a tight tactical range for a
fight), sharing one visual language. It should feel like a real sensor, alive but calm.

1. **A sweep that means something.** A slow sensor sweep (or expanding ping) refreshes contacts;
   each contact brightens as the sweep passes and decays to a steady dim state. New contacts arrive
   with a short ping ring. Nothing strobes; the sweep is subtle enough to ignore.
2. **Contacts are shapes, not dots.** A small glyph per role: light fighter, heavy, support/shield
   carrier, ranged/sniper, rammer, minelayer, boss, civilian, station, gate, loot/salvage, wreck.
   Hostile, neutral and friendly differ by colour **and** shape so it reads without colour. Each
   moving contact carries a short velocity tail showing where it is heading. Use the enemy role
   data that already exists (grep `role` in `src/data/` enemy and ship tables, and
   `src/data/packArchetypes.js`) so a new kind gets a glyph by its role, not a hand-made case.
3. **The room is drawn.** Rock fields appear as soft stippled patches or small outlines where the
   rocks really are, so a player can see ammunition and cover. Solid arena walls and stations are
   crisp lines. Hazards (mines, fields, a furnace) get a hatch.
4. **Rings that answer questions.** A faint ring at gun range and another at Line reach. The
   objective is a bright bearing notch on the rim with its distance; anything off the edge pins to
   the rim, sized by how close it is. When the hull is hit, the rim flashes on the side the hit came
   from.
5. **It breathes.** Range eases wider with speed and tighter when a fight starts (the HUD already
   knows: `data-hud-attention="teach|fight|calm"` from `src/ui/hudAttention.js`). The current range
   is printed once, small, in `m`/`km`. No `u`.
6. **Words only where needed.** Text appears for the objective and for the one contact under the
   cursor or selected; everything else is icon-only. Labels never overlap each other or the frame
   (solve collisions; drop the lower-priority label). Minimum 12 px type.
7. **One frame for both modes**, matched to the power bar and gauges beside it. Keep `M · Chart`
   under it.
8. **Cheap to draw.** One canvas, static layer (frame, rings, room) cached and redrawn only when
   range or sector changes; contacts drawn at 20 Hz from the snapshot the HUD already has; no
   per-frame DOM writes, no layout reads in the loop. State the measured cost per draw.

Keyboard, controller and touch reach whatever is interactive (range toggle, open chart). Respect
the reduced-motion setting (no sweep, contacts simply update).

## Prove

Before and after frames, both modes, 1280×720 and 1920×1080, in three states: calm with stations
and a rock field, a fight with at least four different enemy kinds, and an off-screen objective.
Add bench fixture hooks (as `tools/ui-bench.js` has for the HUD: `?hudState=`) so each state can be
shot without booting the game. One short run in the real game through the lock
(`node scripts/fleet/game-lock.mjs run -- <your probe>`) to confirm live contacts draw and to take
two live frames. Run the tests that touch the radar and minimap (`ls test | grep -i -E
"radar|minimap|contact"`), rewrite the ones that pin the old look. In the receipt: frame paths,
draw cost, files changed.

## Files

`src/ui/map/flightMinimap.js`, `src/ui/radar.js`, `src/ui/map/tacticalMapGrammar.js`,
`src/ui/map/contactVisibility.js`, the minimap parts of `src/ui/orrery/visorHudSkin.js` and
`visorInstruments.js`, their CSS sources (regenerate sidecars with
`node scripts/lib/buildUiCssSidecars.mjs`), `tools/ui-bench.js`, tests. Another agent is editing
player-facing strings across `src/ui/`: for a shared file use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>` so only your lines land.
