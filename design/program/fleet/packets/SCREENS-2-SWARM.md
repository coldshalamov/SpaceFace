# SCREENS-2 — every Swarm screen in one look, with one obvious button

**For:** a designer-builder with eyes. **Kind:** the Swarm mode's menus. **One commit per screen
group.** The director judges your frames.

## Why

Swarm is the shop window: the fast mode a new player tries first. An audit of every screen
(`.devshots/director/fable/screens/AUDIT.md`: read sections B, D and E; frames under
`.devshots/screens-audit/`) found that the Swarm menus are the biggest style break in the game.
The game has one good menu language, the large near-black "Deckplate" screens (title, settings,
save, codex, tech tree, pilot cards, the Manifest card table: open those frames, they are the
standard). The Swarm door, draft, fortify and refit screens are a second family: boxed teal
panels on hex grids, walls of small grey text, four equal buttons. A stranger sees two games.

What the audit and the director saw, screen by screen:
- **The door** (`crucible`, `crucible-door`): rows of mode, difficulty and arena options with
  "0 SCRAP" labels, locked arenas listed one by one, and internal names ("Crucible", "Lagrange
  Crucible", "Lagrange Arena", "The Pit").
- **The draft / shop** (`crucible-draft`, `crucible-rearm`): "Ship equipment" opens empty with
  every filter at 0; it reads as broken.
- **Refit** exists twice (`crucible-refit` blueprint view and `crucible-refit-swarm` list view):
  the list is a wall of small text with a paragraph in the header and four competing buttons.
- **Fortify** (`crucible-fortify`): same family, same faults.
- **Results** (`crucible-results`, `crucible-results-win`): a plain grey ledger with "Build code
  W2:Volume", a clipped Seed row; winning looks like an invoice.
- Currency is printed three ways (SCRAP, cr, CR).

Rulings that apply (`design/overhaul/00_RULINGS.md`): R18 plain words (the mode is **Swarm**, never
Crucible; the rope is **the Line**), R17 power names, R19 a round is a named cast of enemy kinds.
Swarm's money is **Scrap** and only Scrap (`design/overhaul/04_SWARM.md` §5).

## Look first

`node scripts/ui-bench.mjs --shot=crucible,crucible-door,crucible-draft,crucible-rearm,crucible-fortify,crucible-refit,crucible-refit-swarm,crucible-results,crucible-results-win,pilot-cards,pilot-cards-two,pilot-cards-capstone --viewports=1280x720,1366x768,1920x1080 --out=.devshots/screens2/before`
and the standard: `--shot=title,settings,tech-tree,manifest`. Open every PNG.

## Build

1. **One look.** Every Swarm screen moves into the Deckplate language: its type scale, spacing,
   near-black ground, one accent, the same Back position and the same button styles. Delete the
   hex-grid panel styles these screens used once nothing uses them.
2. **The door is three choices and a button.** Arena, difficulty, and (only if more than one
   exists for the player) mode, one row each, with the current choice large and the others a
   click away. Locked arenas collapse into "4 more arenas unlock as you play". No "0 SCRAP"
   labels. One primary button: **Start run**. Another agent is wiring a true one-press start from
   the title; this screen is the "change the setup" path and must also start in one press.
3. **Between rounds is one screen with one primary button**: "Start round N". What can be bought
   is shown as a few large cards the player can afford or nearly afford (a relatively limited set
   of decisions at any one point: the owner's words), not a filtered catalogue. An empty shop
   never renders: if there is nothing to offer, the screen says so in one line and the primary
   button is all there is. Fortify, Bank and Extract are secondary, each with one line saying
   what it does.
4. **One refit screen.** Keep the blueprint view (the ship drawn with its hardpoints); delete the
   list version and route everything to the blueprint. Fitting is choosing a hardpoint and
   picking from what you own; stats change in place, in plain words ("Fires faster, kicks less").
5. **Results sell the next run.** Losing: what killed you (the enemy kind and its job), how far
   you got against your best, your build's path through the skill tree lit up, and two buttons:
   **Run again** (primary) and Back to title. Winning gets a poster: the run's name, the ship,
   the build, the numbers that matter (rounds, best chain, time), large. "Build code" and "Seed"
   go behind a small "Details / share" link.
6. **One currency word and mark** for Scrap on every Swarm screen. Plain names for arenas (the
   director's rule: a name says what the place is, for example "The Foundry"; remove "Lagrange
   Crucible" and "The Pit" unless the place really is a pit, in which case keep it and drop
   "Crucible").

## Prove

Before and after frames of every screen at the three sizes. `node scripts/ui-bench.mjs
--shot=<the swarm shots> --walk` reports no findings. The Swarm screen tests (`ls test | grep -i -E
"crucible|swarm|refit|draft|results"`) pass, with those that pin the deleted list refit or old
names rewritten. One live run through the lock (`node scripts/fleet/game-lock.mjs run -- <probe>`):
title → Swarm → start → die → results → run again, with a frame of each screen. In the receipt:
frame paths, what was deleted, files changed.

## Files

The Swarm screens under `src/ui/` (grep the bench ids in `tools/ui-bench.js` to find each
screen's module: `crucible*`, `swarm*`, `src/ui/orrery/crucible*`), their CSS sources (regenerate
sidecars with `node scripts/lib/buildUiCssSidecars.mjs`), `tools/ui-bench.js`, tests. Do not
change what a purchase or a fitting does in the simulation, and leave `src/ui/pilotCards.js`
alone (another agent is editing the level-up cards). For a shared file use
`bash scripts/fleet/own-commit.sh begin <file>` and `… commit "<message>" <files>`.
