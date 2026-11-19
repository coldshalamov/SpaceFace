# 07 — Look and light: every glow has a source, and every light lands

**Director, 2026-11-18.** `design/program/finish/bible/LOOK.md` (2026-11-06) already prescribes the
right pipeline — AgX or Khronos Neutral tone mapping, an energy-conserving mip-chain bloom at a low mix,
HDR emissive sources, light that lands, a value hierarchy, rim light on every body. It stands. This
page adds what it missed, which is why the game still looks cheap at 301d3fb074: **light needs surfaces
to land on, haze needs matter to exist in, and effects need force underneath them.**

## 1. The three references, in words

The owner's frames (kept local at `.devshots/director/references/`; third-party, never committed):

1. **Fable — blue braziers on a stone stair in the rain.** Six small flames, each with a tight bright
   core and a modest halo. Their light pools on the wet stone steps around them and catches the rain
   streaks; everything beyond the pools falls into cool blue-black. *Lesson: a glow is a small hot
   source plus the light it throws onto real surfaces nearby.*
2. **Freelancer — a station before an emerald nebula.** A saturated green-teal sky with a blazing sun;
   a hard-surfaced grey station with bays painted 1 2 3 4; a freighter with orange-yellow cargo pods.
   Sunlit faces, shadowed faces, crisp silhouettes. *Lesson: a sky with colour and a sun gives every
   object a lit side, a shadow side and a place; bold paint makes function readable.*
3. **Dead Space (remake) — a hospital corridor.** A shaft of cold light through a window, cut into
   bands by the corridor's ribs, visible in the dust and landing on the wheelchairs and floor grating;
   a cyan health spine on the suit. *Lesson: volumetric light is real when it is shaped by geometry and
   lands somewhere; a small diegetic light (the spine) reads instantly.*

**What none of them do:** a glow without a source, a fog blob in clear air, a halo with nothing lit
under it, a sprite standing in for an effect, a dark frame with no light anywhere.

## 2. The light recipe (technique, lineage, cost gate)

Every item reports its frame cost on the owner's laptop at preset low before it lands (`10` §4).

1. **One sun per place, with a real shadow.** A directional key from the sector's star (or the arena's
   shop lamp) with **one shadow map fitted to the visible play area** — a single cascade, texel-snapped
   so it does not shimmer, 2048 px on desktop and 1024 on integrated, updated every frame for moving
   bodies (the standard fitted-cascade technique). Today Nocturne runs one shadow light at 256 px and
   10 Hz on integrated (`src/render/nocturne/runtime.js` `NOCTURNE_QUALITY`) — too coarse and too slow
   for hard sun shadows. Hulls and rocks cast shadows onto each other and onto the surfaces below the
   fight (§4).
2. **Local lights that land.** Engines, muzzle flashes, explosions, furnaces, dock floodlights and
   hull lamps light the hulls, rock faces and decks near them through Nocturne's pooled point lights
   (exists). One light per *source*, never per particle. The station floodlight fix (7ee4360bc4) and the
   headlight pool (e161b2bb9b) are this rule; extend it to every hot source.
3. **Tight emissive cores, honest bloom.** Hot things are small and bright (HDR values well above 1 on
   small areas); the existing mip-chain bloom (dc79142a) spreads only those, at the bible's low mix. No
   flat radial halo sprite anywhere — they read as "cheap web game" (the owner's words).
4. **Tone mapping:** finish the bible's A/B (AgX vs Khronos Neutral vs today's ACES blend) on the
   golden frames; pick the one that keeps saturated emissives and lifts the toe.
5. **Air only where there is matter, and shaped by what blocks the light.** Participating media exist
   inside dust fields, nebula pockets, gas vents, hangars and docks — and the shadow map cuts them into
   shafts (Dead Space). **In clear space there is no medium at all.** Far depth cues (the bible's
   parallax haze layers) stay as distance colour, never as a local blob.
6. **A sky that lights the place.** Each region gets a painted HDR panorama (generated with Codex
   image generation, delivered as KTX2) whose colours drive the fill and the reflection environment, so
   metal reflects the sky it is under (`src/render/spaceBackground.js`,
   `spaceReflectionEnvironment.js` are the owners). Recognisable from one screenshot, like Freelancer's
   emerald field.
7. **Materials that take light:** metal reads by reflection and rim; paint, decals and wear on every
   hull; rocks keep the triplanar surfacing (d01d4b44) and get their real big-rock bodies.

## 3. Remove — cheap techniques on screen at HEAD

| What | Where seen | Replace with |
|---|---|---|
| Brown fog cone in front of every ship | `02` B3; `LOOK_HEADLIGHT.beam` (`src/data/lookMoods.js:143`, density 0.0005) | **Beam medium off in clear space.** The headlight spot stays and lands on what it hits; the beam is visible only inside dust or gas, where the shadow map shapes it. |
| White smear for Pull, orange crescents for Shove | `02` B5, B6 | Force + light + matter (§7, `03` §4) |
| Red rings as the way to find enemies | `02` B19 | Silhouette and paint (G08); a ring only on the current target and on bosses |
| Flat blue "paper cut-out" ships behind the player | `02` C1 | Real distant hulls at LOD with the sector's light, or nothing |
| 2D threat plates over 3D enemies (Swarm `syncSwarmThreatPlate`, `src/render/visualFactory.js`) | reported by the previous agent; verify | Hulls that read on their own (§6) |
| A blown-out white boulder | `02` B20 (LOOK-03, on hold) | Find and fix at its owner when it recurs |
| Near-black boot film frame; murky title with a placeholder rock | `02` A1, A3 | `08` §2; §5 here |

## 4. Give the light something to land on

Fighting over empty black space is why light has nowhere to go and why the picture reads flat even
with a 60° camera (`src/render/camera.js`). **Every place where fights happen gets surfaces below and
around the play plane**, 40–120 WU down, as scenery (no collision unless the design says so):

| Place | Surface |
|---|---|
| **Swarm arenas** | The arena set: the Foundry's deck, conveyors, furnace, trusses and banks (`04` §6.2) — the PLAY-screen render is the target. Each arena its own (doc 15). |
| **Helios harbour** | Station decks and gantries the approach passes over; dock aprons lit by floodlights; a ring segment below the lane. |
| **Asteroid fields** | A floor of big, slow, sunlit rocks below the play plane: parallax, shadows from the rocks you fight among, the sense of flying *through* a field rather than over a void. |
| **Planets and stars** | A planet's limb below the fight with its terminator and city lights; a star's corona at the edge of a sector. |
| **Wrecks** | The hull of a dead capital ship as the ground of a salvage site. |
| **The asteroid interior** | The rock itself, lit by the rover's lamp (`05` §3.1). |

Parallax of these layers gives speed without speed lines. Shadows of the fight fall on them. Every
explosion and lamp lights them.

## 5. Places that read in one frame

- **Helios — the busy harbour at golden hour** (README ruling 2). Concept A
  (`design/game/look/concepts/A-golden-harbour.png`) sets the grade: warm key, deep blue shadow, warm
  rock. It does not set the composition — it is still a void with rocks. The composition target is the
  Freelancer frame: big readable architecture, painted bay numbers, colourful cargo, a coloured sky and
  a sun.
- **Big readable markings on geometry:** bay numbers, hazard stripes, company paint on containers,
  lit signs at docks. Function readable before any label (VISION "everything important should have a
  silhouette").
- **The title** is one of these places at its best moment (`08` §2).

## 6. Readable at any density

The bible's value table (§3 there) is law: background darkest, terrain mid, ships brighter than the
rocks they pass, gameplay lights brightest. Added:

- **The player's ship is the easiest thing to find:** the strongest rim, running lights, an outline
  nothing draws over (doc 19), at least 3 % of frame width in Swarm (`04` §6.3).
- **Enemies sort by silhouette and paint** (G08: the fifteen kinds were authored with their own
  colour, shape and size and drawn as one template — `design/game/09` §9).
- **Enemy fire is one colour family, yours another** (doc 19); telegraphs ≥ 0.6 s; danger draws above
  every effect.
- **Nothing important is dark-on-dark:** a dark boulder against space gets a cool limb light (ROCK-04
  9ff604082a claims this; verify).

## 7. Effects: force + light + matter

Every effect has three parts, and switching the effect off leaves the bodies' motion identical:

1. **A shape** that shows the force — cone, sheet, ring, arc, trail, spray (VISION "not glowing spheres").
2. **A light** that lands on what the force touches.
3. **Matter** that moves because of it — debris, sparks, dust shed from surfaces, the bodies themselves.

Rebuild list (`03` §4, §6, §7 have the physics):

| Effect | The look |
|---|---|
| Pull | refracting lens, hot core light on the pulled hulls, inward streaks |
| Shove | refracting pressure front, dust shed from surfaces, accelerated bodies with streaks |
| Pin | landing flash, taut glowing cable to space, the victim's thrusters fighting |
| Bomb | blinking lamp lighting its hull; a room-lighting flash; ring; debris |
| Rig (plough) | arcs from bow prongs to each captured rock; grinding sparks; refracting leading edge |
| The Line | the rope as a diagram (doc 18 §2.3): thickness by class, colour by tension, taut or slack, a fray before a catastrophic break |
| Guns | Hose: instanced gold threads, one muzzle light per stream; Thump: a fat slug with a shock ring; Needle: a white line that lingers; Burn: metal goes orange then white |
| Hits | the target-local flash, spark spray and shield ripple of `03` §6.1 |
| Explosions | a fireball 2–4× the hull (VFX LOOK-05C) that **lights the room for a quarter second**, a ring, debris that keeps momentum, soot capped per VFX-02 |
| Engines | plumes that light the hull behind them and the surface below |
| Tumble | the corkscrew trail of `03` §7 |

## 8. The asteroid interior

The board (`05` §3) is the purest case of this page: darkness, a lamp, and materials that answer light
differently — wet-looking ore veins catch it, ice refracts it, gas pockets glint, basalt drinks it,
machines throw their own coloured light into the tunnels. Strata are drawn as geology (bands following
the rock's curve, branching veins), not a repeated photographic tile with grid seams (`02` C6).

## 9. Who builds what

- **3D assets are Codex's lane** (owner's split, 2026-11-13/14): new or rebuilt models — arena sets, big
  rock bodies, station decks, enemy silhouettes — are requested through
  `design/program/fleet/drafts/asset-findings-for-codex.md`, one entry per need with the frame that
  shows the gap.
- Lighting, materials, VFX, sky and composition are this program's (Lane 1 direction, Sonnet/Devin
  packets), through the existing owners: `src/render/nocturne/`, `src/render/bloom.js`,
  `src/render/spaceBackground.js`, `src/data/lookMoods.js`, `src/render/vfx/`.

## 10. Done when

1. Golden frames (the bible's twelve, plus Swarm r1/r3/r10, Helios approach, the board) show light
   landing on surfaces in every frame, and no medium in clear space.
2. Each frame survives a side-by-side with the three references on the question "does every glow
   have a source and land somewhere?", judged by a fresh reviewer.
3. A stranger finds the player's ship in under a second in Swarm r10 and names five enemy kinds by
   sight.
4. Total look cost (shadow + bloom + media + light pools) ≤ 4 ms per frame on the owner's laptop at
   preset low, and 60 fps holds in Swarm r20.
5. The owner looks at the golden frames and says it looks like a real game.
