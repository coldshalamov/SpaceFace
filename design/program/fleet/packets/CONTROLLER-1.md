# CONTROLLER-1 — the whole game on a gamepad

**For:** a careful engineer. **Kind:** input. **One commit per part.**

## Why

A $40 game on Steam is played on a controller and on handhelds. The release list
(`design/overhaul/13_RELEASE_LIST.md`, "Shipping it"): "Full controller play, including aiming the
rope with a stick, rumble, and text that's readable on a handheld." The keyboard and mouse scheme
was rebuilt today (commit a289310ab0: the ship faces the cursor, A/D strafe, S and X brake, keys
1-5 are the five powers, RMB and F are the Line, E docks or flies to the berth, Q opens a wheel of
at most eight slices, Esc pauses, M opens the map). The controller has not been looked at since.

## Part A — audit, by playing the code

Read the gamepad path (`grep -rn "gamepad\|Gamepad" src/systems/input.js src/ui src/systems | head -60`;
the mobile and touch control catalog under `src/systems/mobile/` shows a second input surface
done properly) and write down, for a standard twin-stick pad, what every control does today in
flight, in menus, on the map, in the station, on the level-up cards and in the bag. List every
action that keyboard and mouse can do and a controller cannot.

## Part B — the scheme

The default a twin-stick player expects, with everything on the pad and nothing requiring a
mouse:
- Left stick moves the ship (thrust and strafe relative to the screen); right stick aims the nose
  and the cursor point (a reticle at a comfortable fixed distance that extends when the stick is
  held at full deflection; soft aim assist toward the nearest target within a small cone, visible
  and switchable under the "Flight assists" settings group).
- Right trigger fires guns; left trigger is the Line (tap to latch or throw, hold to reel:
  the same grammar as the keyboard).
- The five powers on the face buttons and a bumper, chosen so the three used most in a fight
  (measure from the design: Shove, Pull, Bomb) are under the right thumb, with a hold-bumper
  layer for the rest; never a radial during a fight for a power.
- Brake on a bumper or stick click; boost on the other.
- Dock / interact on one face button when a prompt is showing; the map and pause on the two
  centre buttons; the Q wheel on the D-pad or a held bumper, selected with the right stick.
- Every menu, the map (move a cursor, zoom, select, set course), the station doors, the market
  (quantity steppers), the level-up cards, the bag (move a cursor across slots, pick up, drop in
  space, split) and every pop-up work with the D-pad or left stick, A to confirm, B to go back,
  and show controller glyphs instead of key names when a controller is the last device used
  (the prompts already read live bindings: extend the same source).
- Rumble: light on firing a heavy gun, a thump on a hit taken, a long low rumble on the Line
  under strain, off by a setting. Respect the reduced-motion and flash settings.
- Rebinding for the pad in the same Controls page as the keyboard.

Build it where it is missing. Do not change the keyboard and mouse scheme.

## Part C — a handheld-sized screen

At 1280x800 on a 7-inch screen the flight HUD and the menus must still be readable: check the
smallest type against the 12 px floor scaled for that size (`scripts/check-type-floor.mjs`), and
add a "Large text" setting if one does not exist that scales HUD and menu type by about 1.25
without breaking layouts (shoot the flight HUD and three menus with
`node scripts/ui-bench.mjs --shot=flight,crucibleHud,settings,pause,station --viewports=1280x800`
at both scales).

## Prove

- A virtual-gamepad test harness (Playwright can drive the Gamepad API through an injected
  shim; the repo has had "gamepad walks": `grep -rn "gamepad" scripts | head`) that plays: title
  to Swarm round 1, fights with guns, three powers and the Line, takes a level-up card, pauses,
  opens the map, quits to title; and Adventure: new game, fly, dock with the pad, buy and sell,
  open the bag and drop a stack, undock. Run through the lock
  (`node scripts/fleet/game-lock.mjs run -- <harness>`). Every step passes without a mouse or key.
- Unit tests for the mapping and for glyph selection.
- `node scripts/ui-bench.mjs --shot=<menus> --walk` reports no unreachable control.
- In the receipt: the audit table (action, keyboard, controller before, controller after), the
  harness result, frames at 1280x800, files changed, what is still missing.

## Files

`src/systems/input.js` and the gamepad modules, the prompt and glyph sources, the Controls
settings page (logic; a designer restyles it), the menu focus/navigation layer, a new harness
under `scripts/`, tests. Shared files (`input.js`, `settings.js`, `profileSettings.js`, HUD
files): use `bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>`. A designer is working in the
flight HUD and the bag this evening: change input handling there, not layout.
