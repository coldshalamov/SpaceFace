```yaml
packet: P17
title: Motion library and sound cue set — spec, demo page, synth recipes (HTML/JS + JSON)
lane: CODE
tool: ChatGPT 6 Pro (scripting VM; no repository access needed)
dependsOn: [P01, P02, P03]
current: [title, station-market, flight]
inputs: [design/frontend/direction/approved/kit-notes.md, design/frontend/direction/approved/frame-title.png, design/frontend/direction/approved/frame-station-market.png, src/data/audioRecipes.js, src/audio/synth.js, src/ui/kit/motion.js, src/ui/kit/sound.js]
returns: P17-return.zip
turns: 1 (+1 correction)
```

# P17 — Motion and sound

## Objective

A dependency-free **motion library** for the three registers and a **sound cue set** for the
game's own synthesiser, delivered as a runnable demo page plus files the code packets drop into
the game. The game has no audio files: every sound is a WebAudio recipe (see `inputs/synth.js`
for the primitive set and `audioRecipes.js` for the recipe shape — reuse that shape exactly).

## Read

`_COMMON` → `02_ART_DIRECTION.md` §9 (motion) and §10 (sound) → `inputs/` (the existing tiny
`motion.js`/`sound.js` show the current API surface; replace, keep the names that exist).

## Deliverables

```
P17-return/
  motion/motion.js           ES module, no deps: reveal(el, {register, index, from}) · settle(el) ·
                             light(el, on) · press(el) · slide(el, {from, weight}) · drift(el, opts) ·
                             parallax(root, {max}) · setReducedMotion(bool) — every function is
                             driven by a state you pass in, never runs unasked, returns a cancel handle
  motion/motion.css          the keyframes and transition classes the library toggles
  motion/demo.html           one page showing every motion per register with the real timings,
                             a reduced-motion switch, and a frame-time readout
  motion/MOTION_SPEC.md      per register: the table of every motion, its trigger state, duration,
                             easing, reduced-motion equivalent, and the DOM it may touch
  sound/recipes.json         recipes in the game's shape for: ui_key_press · ui_plate_slide ·
                             ui_legend_on · ui_legend_off · ui_confirm · ui_deny · ui_open ·
                             ui_back · ui_tab · ui_dock · ui_undock · ui_wanted · ui_crucible_enter ·
                             ui_tick — low, mechanical, short; no beeps, no chirps
  sound/demo.html            plays each cue from the recipe with the synth primitives
  sound/SOUND_SPEC.md        the cue table: when each fires, its character, length, gain, and which
                             existing cue id it replaces
  NOTES.md · manifest.json
```

## Acceptance

1. The demo pages run from a local file with no network; every motion respects the numbers in
   `02_ART_DIRECTION.md` §9 and stops when its state ends; the reduced-motion switch turns every
   transition into a cut and stops all ambient motion.
2. No motion runs without a state argument; nothing loops except `drift` and `parallax`, which
   only run while enabled and never on EDGE.
3. Every recipe plays through the provided synth primitives unchanged; the whole set is under 30
   seconds of total audio and sounds like one instrument.

## The way this gets faked

A CSS animation library with bounce presets; `setInterval` loops; sounds that are sine beeps with
different pitches; a spec that restates the art direction instead of giving tables.
