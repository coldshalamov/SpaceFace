# HELP — builder brief (wave 2)

Screen: `src/ui/screens/help.js` (bench id `help`). Tabs: CONTROLS, LOOPS, SHIPS, COMMODITIES, ORES, FACTIONS.
Read first: design/frontend/review/BUILDER_BRIEF.md (rules, owner criteria, the MEASURED WEIGHT BAR), design/frontend/ORRERY.md,
design/frontend/OVERHAUL_PLAN_2026-09-25.md (Help row), src/ui/orrery/ (library — compose, never hand-roll boxes).

## What is there now (the pre-overhaul screen)
A generic key-binding TABLE in a sunk box: rows with 1 px rules, key caps as cut-corner chips, a tab list of tiny
caps on the left with a boxed "current" bar, a boxed CLOSE ESC. Every owner criterion fails: generic web table,
no instrument, no interaction beyond reading.

## The mini-app: THE CONTROLS RIG — "Press anything"
- The hero object: the player's hull (produced plan-view render `assets/ui/renders/hulls/ship_<id>.top.webp`, the
  current hull) standing on a berth, with its VERB STATIONS round it on leaders to the parts they act on: throttle
  and brake at the drive, steer at the bow, lateral thrusters at the flanks, fire at the hardpoints, massline at the
  winch, boost at the drive's bloom, countermeasure, draw-to-fly. Each station: the verb in label voice + its
  binding as a lit key glyph (not a chip) — the LIVE binding from Settings -> Controls (keep reading it as now).
- SIGNATURE — live input echo: while Help is open, pressing ANY key / mouse button / pad button lights the verb it
  drives: the key glyph flares, a beam of light runs along the leader into the ship part, and the part glows (the
  drive blooms for throttle, the flank lights for lateral, the bow swings a ghost arc for steer). Unbound keys show a
  small "not bound" whisper at the pointer. Gamepad: the pad's own layout (a produced controller silhouette or a
  drawn pad instrument) replaces the keyboard glyphs when the last input was a pad. Reduced motion: flare without
  the travelling beam. This must NOT fire game actions (Help is a modal; read input via the existing input layer's
  raw events without dispatching actions — check src/ui/input.js / src/systems/input.js contracts; do not edit
  src/systems/input.js).
- The other tabs are the same instrument grammar, each its own small mini-app:
  - LOOPS: the core loops as an orrery (fly -> mine -> trade -> fight -> upgrade), the chosen loop lit with its
    steps as stations.
  - SHIPS: the hull set on a ring (produced side/hero renders), the chosen one's stats as arc gauges.
  - COMMODITIES / ORES: produced tokens where they exist (assets/ui/generated/*), price bands as scales; search stays.
  - FACTIONS: crests (exist) on an orbit; chosen crest's reading.
- Tab rail: words on a spine with ticks, the Hand on the open tab. CLOSE ESC is a word with its key glyph.

## Must survive
Every tab, verb, bind, search and Close; the live keybinding read; `.sf-help-now`, `.sf-tab`, `.sf-lc__search`
hooks; keyboard and gamepad reach; the tests that import help.js (`grep -l "screens/help" test/*.mjs`).
There is a foreign 1-line dirty hunk in help.js right now — keep it, commit only your own hunks.

## Proof
Stills 1920/1280/2560 for every tab; a "press W" state (the drive lit and the leader beam mid-run), a pad-input
state, reduced motion. Walk every control with keyboard and gamepad. Tests; commit by exact pathspec; report.
