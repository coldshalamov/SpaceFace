# Graphics assessment — what holds the picture back (2026-09-28)

An independent review of every live model and the running game against the intended style
(`design/VISION.md` "The visual fantasy", "Colorful without becoming cartoonish", "Everything important
should have a silhouette"; `tools/blender/forge/FORGE.md` "The look"; `docs/visual-assets/COLOR_LIGHTING_STANDARD.md`).

Evidence: 18 labelled contact sheets and in-game sequences under `.devshots/assess/` (index:
`.devshots/assess/INDEX.md`, data: `.devshots/assess/facts.md`). Models were rendered through the live
renderer; in-game shots are the real game with post. All captures ran on a software renderer on a loaded
machine, so this judges the picture, not speed.

## The short answer

The models are no longer the main problem. About 97 % of bodies are now one kit and the fleet reads as
one game. What holds the picture back, in order:

1. **Lighting and surface: everything is evenly lit and pastel, so nothing has weight.**
2. **The world does not move.** No station, prop or machine animates.
3. **Composition: the backdrop fights the action, and near-camera objects bury the ship.**
4. **Effects are thin at the gameplay camera** (mining beam, tether, arrival; combat did not read in our captures).
5. **A leftover set of blockout-grade props and wreck pieces**, plus a few weak Forge bodies.
6. **Visual bugs**, one of them severe on weak hardware.

Variety of models is *not* a top problem: the Helios opening showed about 13 distinct ship designs in
three minutes. `facts.md` §5 reports "8", but that counted gameplay ship types, not the models drawn:
traffic roles map to their own hulls. Variety has two smaller issues, listed in §5.

## 1. Lighting and surface — the biggest single problem

What the pictures show (opening z58/z144, hub z330, Ceres, fleet sheets):
- Hulls and stations are lit almost evenly from the camera side. There are no cast shadows, little form
  shading and weak rim separation, so solid 3D bodies read like flat printed cut-outs.
- Paint reads pastel: large areas of ivory, mint, teal and bright yellow. With few dark recesses, the
  stations read as "toy plastic", which is exactly what VISION says the game must not be.
- Lit windows read as pale paint rectangles, not as light. Stations do not glow against the dark.
- At close zoom the shared panel texture reads as a regular grid of square tiles ("bathroom tiles").
- Nothing looks used. VISION asks for "dirty and worn and believable" geometry with luminous action;
  today the geometry is clean and the action is dim.

What to do (cheapest first; none adds runtime lights):
- **Bake ambient occlusion and cavity darkening into every Forge body at export** (vertex colour or a
  per-body AO channel). This gives depth in recesses, between modules and under overhangs at zero
  runtime cost, and is the largest win per hour.
- **Re-tune the six sector light rigs toward more contrast**: lower ambient/fill, keep the key, raise the
  rim within the standard's bounds (ambient 0.12–0.25, rim 0.9–1.8). Review with `fleet-look --fleet`
  and `flight-look`.
- **Make lit windows, beacons and dock lights true emissive above the bloom threshold** so stations
  glow. Today many sit below it and read as paint.
- **A Forge "wear" pass**: modelled grime bands, darker panel variation, scorched nozzles, patched
  plates. Wear is geometry and paint value, never texture noise. Also darken default ivory one step on
  large surfaces so dark reaches the ≥35 % share the look bar asks for.
- **Break up the panel-tile grid**: larger-scale panel variation and per-part UV rotation/offset
  (the per-part UV scale already exists).
- Option with a cost: one shadow-casting sun limited to the player's neighbourhood for big bodies
  (stations over ships). It is the most "real" fix but costs frame time; test on the owner's machine
  before adopting.

## 2. The world does not move — the biggest gap against the vision

VISION's A-list minute opens with "Miners are visibly working. Machinery moves." and asks for "spinning
machinery" and "a distant mining site [that] reads as activity through rhythmic light and motion".

Today:
- **Every Forge station and prop is static at runtime.** The motion code (`src/render/infrastructureMotion.js`)
  animates habitat rings, dishes, radar and antennas by node name. The Forge station files carry none
  of those names and no animations, so only the old procedural stations ever moved. The only motion on
  a Forge station is the dock berthing pulse.
- Ships animate a little (drive fans, plume shaders, nav blinks). Industry props, claim outposts, cranes,
  mining rigs and gates are frozen.

What to do (all cheap: node rotations or shader time, no allocation):
- Add a Forge animation tag (`s.anim = 'spin:z:0.4'`, `sweep`, `blink`, `chase`) exported as node extras,
  and drive it from `infrastructureMotion.js`. Tag, by priority:
  1. Trade hub: chasing dock-approach lights and blinking nav beacons (these make docking readable).
  2. Rotating habitat and radar parts on every station; the refinery stack flare; the mining rig's drill.
  3. Jump gate ring spin-up (the code exists; the Forge gate lacks the node names).
  4. Cranes that traverse, claim-outpost dishes that sweep, conveyor belts that scroll.
- Parked shuttles that occasionally undock at the hub (traffic already exists; give the hub berths).

## 3. Composition — the backdrop fights the action, and near objects bury the ship

- **The same ringed planet appears in Helios, the Ceres belt and elsewhere.** It is a clip-art style that
  differs from the models, it sits at the same visual weight as the stations, and in the hub shot it
  overlaps the station with no depth cue. It flattens sector identity.
- The painted nebula and the photographic galaxy are bright and saturated, so they compete with gameplay
  objects. Sector arrival shows only a blurry brown nebula.
- **Near-camera objects loom and hide the player.** In the mining and boost sequences rocks between the
  camera and the play plane are drawn 5–10× the ship's size and cover it. In the tether sequence the
  latched container fills half the screen. The optic crystals read as flat white paper diamonds.

What to do:
- Give each sector its own sky body (or none) and lower the backdrop's brightness and saturation by
  roughly a third so it sits behind play. Carry sector mood in the key-light colour (Vesta hot, Pallas
  cold, Sker sodium; GRAPHICS_PROGRAM §5.4).
- Keep gameplay bodies in a narrow height band around the play plane, and fade or ghost any body between
  the camera and the player.
- Rebuild the optic crystal cells as faceted glass bodies with a lit core, not flat cards.

## 4. Effects — thin at the gameplay camera

What we could see:
- Boost: a clear blue velocity streak. Good.
- Massline: a thin cyan line. It reads, but VISION wants "white-hot Masslines".
- Mining beam: a thin white line with no contact spray, sparks or heat at the rock. It reads like a laser
  pointer.
- Sector arrival: no arrival effect, only a fade.
- Braking: no visible retro jet in the stills.
- Combat: in a staged fight with a kill, no muzzle flash, tracer, impact or explosion read across eight
  frames at chase zoom. This may be a capture problem, so treat it as unproven either way. It is the
  first thing to check.

What to do:
- Record one real fight at chase zoom (not stills) and confirm every weapon's flash, tracer, impact and
  death burst reads at 144 WU. Scale effect size to the camera where it doesn't.
- Mining: a beam with body (core plus sheath), a contact spray cone and a heat glow on the rock.
- Massline: a white-hot core with a coloured sheath and stress pulses that are visible at chase zoom.
- An arrival wake/flash on sector jump; make the retro jet visible when braking.
- Keep VISION's rule: shaped effects (cones, sheets, rings, ribbons), never glowing discs.

## 5. Leftover weak models

- **29 "everyday space kit" props are blockout grade** (flat pale boxes and capsules): habitat pods,
  customs pylon, observation blister, parts rack, passenger and inspection platforms, shuttle dock, hull
  rack, comms array, traffic signal, construction frame, crusher, ore sorter, power skids, repair
  scaffolds, salvage clamp, solar array, tanker coupling, utility module, welding drone and others.
  They are live world dressing (PQ-136), so they appear next to Forge bodies. This is the biggest
  remaining model gap.
- **Wreck pieces**: some fragments have pieces floating apart (radiator panel, armour belt, drive bell);
  "fresh" wrecks read clean and ivory rather than burnt; cable and pipe fragments read like wooden planks.
- **Weak Forge bodies**: claim outposts are thin and small in frame; the transponder gate is a sliver from
  above; rocks read lumpy; the three dock interiors look nearly identical.
- **Older pipeline**: the Wreck Cathedral (253k triangles, drawn ~30× too large, see §6) and the 21
  mining-board pieces.
- **Variety**: faction variants of the Span and the Wasp are recolours of one hull (VISION: "Do not solve
  identity by recoloring the same hull"). About eight civilian hulls share the same ivory-and-orange
  scheme; all stations lean beige.

## 6. Visual bugs

- **Severe on weak hardware: low-quality mode draws the picture into the bottom-left of the screen.**
  When dynamic resolution drops below 1 the scene is squeezed into a corner (0.5 → the bottom-left
  quarter, 0.34 → a ninth) with black elsewhere. Cause: the bloom scene pass sets a sub-rect viewport
  that three.js keeps as the default-framebuffer viewport, and the final blit inherits it
  (`src/render/bloom.js:1746-1748`, `1878-1882`; `src/render/renderer.js:16055-16059`). Every
  software-rendered player gets it (the emergency profile pins 0.34), and so does integrated-GPU players
  whenever adaptive quality lowers resolution. A second bug on the same lines: on high-DPI screens the
  sub-rect is doubled and clamps to full, so dynamic resolution saves nothing there. Evidence:
  `.devshots/assess/sheet-dynres.png`, `.devshots/assess/dynres-notes.md`.
- **A soft purple glow disc sits under the player ship at all times** (opening, mining, jump stills). It
  looks like the shield bubble drawn at rest. It is the camera-facing soft disc the visual standard bans.
  Show it only on shield events.
- **The Wreck Cathedral draws about 30× its size** as giant flat slabs across the frame (ledger D54).
- **Loaded machines can keep procedural placeholders after a sector jump** ("sector authored prewarm
  failed", ledger D61/D84).
- ~~Texture upload warning after the texture-sharing change~~ — fixed with this report: package CPU
  detach emptied a texture's mip list while a dedupe sibling still shared the same records, so a later
  fresh upload read an empty list. Detach now waits for the last live user.
- Ledger D72 (Pelican blockout) looks stale: the Pelican model on the fleet sheets is a finished Forge
  hull. Check its menu posters, then delete or update the row.

## 7. Performance notes for the style

- Heaviest bodies: Wreck Cathedral 253k, stations up to 133k, Quiessence freighters 41–65k each
  (seventeen in one ring), faction hulls up to 62k. Bring the freighters to ~15–20k (they are distant
  becalmed dressing) and rebuild the Cathedral to the 40–100k landmark budget.
- Texture memory is already down by about 42 % from sharing identical images.
- Everything in §1–§2 above is near-free at runtime (baked AO, emissive values, node rotations). The
  only costly option is real-time shadows.

## Recommended order

1. Fix the low-quality corner bug (a bug players can hit today).
2. Baked AO + contrast re-tune + glowing windows (§1) — changes every frame of the game.
3. Station and machine animation via Forge tags (§2).
4. Backdrop per sector + near-camera fading (§3).
5. Rebuild the 29 everyday-kit props; fix wreck fragments and the optic crystals (§5).
6. Effect pass at chase zoom: combat proof, mining, massline, arrival, retro (§4).
7. Freighter and Cathedral budgets; faction silhouettes; civilian palette spread (§5, §7).
