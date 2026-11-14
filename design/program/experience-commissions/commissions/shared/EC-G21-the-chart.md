# EC-G21 — The Chart — a navigation instrument, not a radar mock-up

**Direct execution commission · Shared system**
**Commissioned by the lead designer, 2026-11-10.** Components: EC-G16. World content: the sector cards and [13 — Jobs and heists](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/13_JOBS_AND_HEISTS.md).
**Replaces:** the galaxy, star and local map screens (`src/ui/galaxyMap.js`, `src/ui/screens/starmap.js`, `src/ui/screens/localmap.js`, `src/ui/map/`) and gathers the separate map layers (rumours, chatter, caches, wrecks, sites, racing) into one.

## The owner's verdict on today's map

Small, scant, hard to read. It does not orient you or tell you anything about the world. It feels like a mock-up of a submarine radar, not the navigation system of a real ship.

## What it becomes

**One full-screen chart with one continuous zoom**, from the whole system down to the rocks beside you. The same chart feeds the radar in the corner during flight; the radar is just the Chart at its closest zoom.

### Three depths, one motion

| Zoom | What you see | What it answers |
|---|---|---|
| **System** | every sector as a *place*, drawn by its landmark — the Rock with its nine mouths, the Candle Fleet's crescent, the capsized hull at Kepler — never as a dot. Lanes between them with traffic actually moving along them. Where the bus is. Where Juno is. | Where am I in the world? What is out there? |
| **Sector** | the town: its street, its named berths, its toy, its freight lanes, hazards drawn as what they *do* (a plume as an arrow, the Sweep as a moving cone) | What is this place, and who is here? |
| **Local** | every body near you, tinted by weight: what you can throw now, what you cannot yet | What can I do right here? |

Scroll to zoom toward the cursor. Drag to move. It never loads, never pops, never pauses the world: **the Chart is live.** Things move on it.

### Five layers, one key each

Never more than five, never more than two on at once by default.

| Layer | Shows |
|---|---|
| **Work** | who wants something, with a face and one line; your one "next" |
| **Trade** | for what is in your hold: where it sells best, as arrows whose thickness is the profit |
| **Law** | patrols and their routes, search zones, who saw you |
| **Weight** | the things you cannot move yet, and the class that will move them |
| **Yours** | your lamp, your marks, your berths, your wreck if you left one |

### The instrument features

- **Plot a course.** Pick a destination: the route is drawn through the gates with a time, and what you will meet on it. A second route is offered when there is one — the **slingshot route**, round the heavy bodies, faster and harder.
- **The timetable.** A strip of what happens when: the next Noon Train, the next Pour, the next Plume, Lamps-Up, where the bus will be. *"Bus leaves Dione in 0:40."* The world keeps shifts; the Chart is where you read them.
- **Three pins**, yours to place.
- **Find.** Type a name — a person, a town, a thing — and the Chart goes there.
- **Hover anything** for its card: a picture, a name, one line, what it wants.
- **A legend that is always visible.**
- **Places you have not been are pencil sketches** from rumour. Visiting inks them in. Rumours you hear add pencil marks.

### It must feel like part of the ship

The same line weight, type and colour as the flight display. It opens in a tenth of a second from one key and closes with the same key. Nothing on it is smaller than a player can read on a small laptop.

## How to build this and check your own work

1. **System depth first, with landmarks.** If the sectors are still dots, stop.
2. **Then make it live:** traffic on the lanes, the bus, your own position at speed.
3. **Then the three depths as one zoom.** No screen change between them.
4. **Layers one at a time**, each proved by a still (`node scripts/ui-bench.mjs --shot=<id> --walk`) at three sizes.
5. **The orientation test.** Put a stranger at a place they have never seen, give them only the Chart, and time them. Inside twenty seconds they must be able to say: where they are, which town is nearest, one thing worth doing nearby, and how to get there.

**Ways this gets faked.**
- *A bigger version of the old map.* Dots with labels are the old map.
- *A snapshot.* If nothing on it is moving, it is not live.
- *Twelve layers.* Five.
- *A route that is a straight line to a marker.*
- *Landmarks as icons from a set.* Each is that place.

## Finish line

- The three old map screens and the separate layer files are gone.
- Every sector on the system view is recognisable by its drawing.
- The timetable shows at least one real, moving thing for each of the five towns.
- The orientation test passes for three strangers.
- The corner radar and the Chart never disagree.

## Explicitly reject

A fog-of-war grid. A list view as the default. A minimap that is a different thing from the map. Decorative scan lines, sweeps or static that make it harder to read.
