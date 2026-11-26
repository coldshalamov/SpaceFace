# HARMONY-AUDIT — who else has a hand on the player's ship, the camera and the keys

**For:** a careful reader of code. **Kind:** read-only audit. **No source edits. No commit.**
Write one report file and stop.

## Why

The owner (2026-11-20): "there's too many triggers and weird things happening watching for events
that my ship would be swinging weird ways and the camera would move weird sometimes, things like
that, just sloppy game systems in general." Ruling R23 in `design/overhaul/00_RULINGS.md` says the
player's ship moves only for the player's input, visible physics, or a scripted moment the player
started; the camera has one owner that other systems ask; triggers never stack or take input away
silently. This audit finds every place the code breaks that today, so an engineer can fix each one.

## Find, with file and line for each

1. **Every writer to the player's motion.** Any code outside the flight controller and the physics
   step that sets or adds to the player ship's velocity, angular velocity, heading, position,
   thrust, throttle, or "assist" values; or that applies a force, impulse or torque to the player's
   body. Include aim assists, stabilisers, auto-brake, auto-level, path followers (draw-to-fly),
   docking and gate pulls, tutorials, cutscenes, "nudges", recoil, tether/rope helpers, power
   helpers, arena laws, sector fences and boundary pushes, respawn/teleport, catch-up or rescue
   code. For each: what triggers it, whether the player can see why, whether a setting disables
   it, and whether two of them can be active at once.
2. **Every writer to the camera.** Any code that sets camera position, target, offset, zoom,
   field of view, shake, roll, lead/look-ahead, or framing; any "focus", "cinematic", "kill cam",
   "establishing", "dock" or "boss intro" camera; any zoom that reacts to speed, combat, powers or
   proximity. For each: who calls it, how it hands control back, what happens if two fire in the
   same second.
3. **Every input thief.** Any code that changes the input context, swallows or remaps keys or mouse
   buttons, disables controls, opens a modal or radial during flight, pauses or slows time, or
   auto-fires an action for the player. Note which give a visible reason.
4. **Proximity and timer triggers near the player.** Systems that watch the player's position or a
   clock and then spawn, hail, pop a prompt, start a scripted beat, change music or change the
   camera. Count how many can fire inside the first five minutes of a new Adventure game and inside
   one Swarm round, and which can overlap.
5. **Per-tick economy, traffic and job work** is covered by another packet. Skip it.

Start points: `src/systems/input.js`, `src/ui/input.js`, the flight controller (grep
`applyImpulse|setLinvel|setAngvel|applyForce|applyTorque|vx\s*[+\-*]?=|heading\s*=` under `src/`),
the camera code in `src/render/` (grep `camera\.(position|zoom|fov)|cameraTarget|setCamera|shake|
cameraRig|frameTarget`), `src/systems/` files with `tutorial`, `director`, `cinematic`, `dock`,
`gate`, `assist`, `autopilot`, `draw`, `arena`, `fence`. Follow callers; do not stop at the first
layer.

## Report

Write `.devshots/director/fable/harmony/AUDIT.md` (create the folder). Sections:

- **A. Ship writers**: a table (system, file:line, what it changes, trigger, visible?, can be
  switched off?, can overlap with).
- **B. Camera writers**: same shape.
- **C. Input thieves**: same shape.
- **D. Triggers**: a timeline of what can fire in the first five minutes of Adventure and in one
  Swarm round.
- **E. The ten worst clashes**: the cases most likely to make the ship swing or the camera move
  for no reason the player can see, ranked, each with the smallest fix (route it through one
  arbiter, delete it, make it visible, or make it wait its turn).
- **F. Proposed single owners**: which existing module should become the one arbiter for ship
  assists, and which for camera requests, and what its request API should look like in five lines.

Facts with file and line only. If you are unsure whether something reaches the player's ship, say
so and say what you would run to find out. Your receipt is a pointer to the report plus the three
most important findings in plain words.
