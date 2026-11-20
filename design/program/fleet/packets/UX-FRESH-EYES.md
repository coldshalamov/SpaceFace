# UX-FRESH-EYES — play the stranger: where does this game confuse a new player?

**For:** a designer with eyes (you can open images). **Kind:** look, judge, propose. Read-only: do
not edit tracked files. Do not commit.

## Why

The owner: "The game is confusing: my actions don't do what I'd expect, it's hard to do things and
make them work the way I want, I can't tell what any of the powers do, and the UI is often filled
with gibberish language." The bar: a polished Steam game a stranger can pick up without a manual.

The game: a top-down physics dogfighter. You fly, shoot, rope things (swing around heavy bodies, tow
light ones, throw bodies into enemies) and use five powers on keys 1–5 (Pull, Shove, Pin, Bomb,
Rig). Two doors: **Swarm** (fast horde rounds) and **Adventure** (a persistent world). The owner's
description is in `design/overhaul/01_THE_GAME.md`; the interface intent is
`design/overhaul/08_INTERFACE.md`.

## Look at the real screens

1. Shoot every screen the UI bench knows, over a still, without booting the game (seconds each):
   `node scripts/ui-bench.mjs --list` to see ids, then `node scripts/ui-bench.mjs --shot=<id>` for
   each (flags are in `docs/UI_VISUAL_ITERATION.md`). Open every PNG.
2. Open the newest real-flight frames already on disk: `.devshots/director/fable/baseline/travel/`
   (an Adventure new game and flight, today), `.devshots/director/swarm-r3-head/`,
   `.devshots/director/hits-proof/`, `.devshots/fleet/accept07/`.
3. Read the code that decides what the HUD says: `src/ui/hud.js`, the power bar and its labels
   (search `src/ui` for "power" and `src/data/powerPreview.js`), `src/ui/promptDeck.js`, the
   onboarding hints (`src/onboarding/`), key bindings (`src/data/inputContexts.js`,
   `src/data/swarmControls.js`), and the English text catalogue (find it under `src/localization/`).

## Deliver (write to `.devshots/director/fable/ux/FRESH-EYES.md`)

1. **The stranger's walkthrough**, both doors, minute by minute for the first ten minutes: what is
   on screen, what the stranger thinks it means, what they press, what happens, where they are lost.
   Name every moment where the screen gives no answer to "what do I press?", "what did that do?" or
   "what is that thing?".
2. **The powers.** For each of the five powers and the rope: how does the game tell the player what
   it does before, during and after use (icon, name, tooltip, preview, world effect, result)? Rate
   each from "a stranger would know" to "nobody could know". Propose how each should teach itself in
   one glance: icon idea, a three-word name or verb, the hold-to-preview, the first-use moment.
3. **Gibberish list.** Every word or phrase a player sees that is internal jargon, a code name, an
   abbreviation, or a sentence only its author understands, with the file and a plain replacement.
   Sweep the catalogue; aim for completeness.
4. **Controls.** Where does a key do something different from what its label or a genre convention
   promises? Where do two inputs fight, or does one input do two things depending on a mode the
   player cannot see?
5. **The redesign you would make**, in priority order: the ten changes that would most reduce
   confusion, each concrete enough to build (which element, where on screen, what it says, when it
   appears and disappears). Include a sketch of the flight HUD you would ship, as a labelled layout
   in text.

Be blunt and specific. Cite a frame path or file for every claim. Your final message: the ten
changes, one line each.
