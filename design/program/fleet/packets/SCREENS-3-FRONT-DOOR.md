# SCREENS-3 — the front door: title, new game, settings, save and load, help, credits, pause

**For:** a designer-builder with eyes. **Kind:** the menus a player meets before playing. **One
commit per screen group.** The director judges your frames.

## Why

These are the first thirty seconds of a $40 game. An audit of every screen
(`.devshots/director/fable/screens/AUDIT.md`: read sections A to E; frames under
`.devshots/screens-audit/`) rates the title and the load screen among the best in the game, so
this is a tightening pass, not a rebuild. What it found:

- **The title offers too many equal doors**: Continue, New Game, Swarm, Load, Settings, plus
  Archive, Circuits, Physics Challenges, Sandbox, Help, Credits, Achievements at similar weight.
- **First-run and empty states look unfinished**: the motion question is not phrased as a
  question; an empty save screen still shows "18,400 CR"; the lower fields of New Game are faded
  to low contrast and use an unexplained S / M / L.
- **Credits** say "Made by SPACEFACE", show "0% of reel", and the orrery art is cut off at the
  edge.
- **Help** uses internal words ("Rig"), mixes key notations, and its list is clipped by a "MORE"
  pill and a fade.
- **Settings and pause** carry many small equal-weight controls; a "MORE" pill clips rows.
- **Page titles** range from a tiny eyebrow to a 100 px headline and the Back control moves
  between corners from screen to screen.

Rulings that apply (`design/overhaul/00_RULINGS.md`): R17 (Esc never starts a round; no blank or
"unbound" prompts), R18 plain words.

## Look first

`node scripts/ui-bench.mjs --shot=title,title-save,mainMenu,motionAsk,new-game,pause,settings,save-load,save-load-empty,save-load-live,help,credits,loading,game-over,gameOver-empty --viewports=1280x720,1366x768,1920x1080 --out=.devshots/screens3/before`
and open every PNG.

## Build

1. **The title has five doors and a More.** Continue (only when a save exists, and then it is the
   primary), New Game, **Swarm**, Load, Settings. Everything else (Records, Circuits, Physics
   Challenges, Help, Credits) lives under one **More** that opens a second calm row or page.
   Sandbox is a developer tool: it appears only when the game runs with its dev flag. Under each
   of the two mode doors, one line says what it is ("Swarm: fast runs against waves. Ten minutes."
   / "Adventure: your ship, your business, a living sector."). The best thing on the title today
   stays.
2. **A consistent frame for every menu page**: one title size, one position for Back (and Esc
   always goes back, never forward), one footer line for key hints. Apply it to every screen in
   this group.
3. **First run.** The motion question is one sentence and two large answers with a third "Decide
   later". New Game's lower fields get full contrast, plain labels and no unexplained letters.
   Starting a new Adventure takes at most two presses from the title for a player who accepts the
   defaults.
4. **Empty states are designed.** An empty load screen says "No saves yet" with one button to
   start; it shows no credit figure. The game-over screen with nothing to show says one true
   thing and offers Retry.
5. **Settings**: group into Game, Controls, Video, Sound, Accessibility with one page each; the
   most-used five settings on top of each page; no row clipped by a fade. A setting's change is
   visible at once where it can be (a live preview of text size, of screen shake off). The
   "Flight assists" and "Aim first" toggles other agents are adding sit under Controls.
6. **Help** is the controls, drawn: a picture of the keyboard and mouse (and a controller) with
   each action named in the game's plain words (Pull, Shove, Pin, Bomb, Plow, the Line), read
   from the live bindings so a rebound key shows correctly. Then one screen per verb with one
   sentence and a small looping picture or diagram of what it does. No clipped lists.
7. **Pause** is five large rows: Resume, Settings, Help, Save (Adventure) or Abandon run (Swarm),
   Quit to title. Destructive rows ask once.
8. **Credits** are a real, scrolling roll with the game's name, the owner as creator, and the
   tools and libraries the game uses (read `package.json` and `vendor/` for the list); the art
   sits fully on screen; no percentage readout.
9. **Loading** shows what is happening in one plain line and a hint worth reading; never a frozen
   bar.

Keyboard, controller and touch reach everything; 12 px minimum type; `--walk` passes.

## Prove

Before and after frames for every screen at the three sizes. `node scripts/ui-bench.mjs
--shot=<these shots> --walk` reports no findings. The menu tests (`ls test | grep -i -E
"title|menu|settings|save-load|help|credits|pause"`) pass, with those that pin the old title rows
rewritten. `node scripts/fleet/game-lock.mjs run -- npm run check:playable` passes (it walks the
title to flight: if its route breaks because a door moved under More, fix the route in the check
to use the new door). In the receipt: frame paths, files changed, presses from title to flight
in each mode before and after.

## Files

The title, menu, new-game, pause, settings, save/load, help, credits and loading screens under
`src/ui/screens/` and `src/ui/orrery/`, their CSS sources (regenerate sidecars with
`node scripts/lib/buildUiCssSidecars.mjs`), `tools/ui-bench.js`,
`scripts/player-truth/routes.mjs` if the route changes, tests. Other agents are editing
`src/ui/screens/settings.js` and `help.js` this hour (new toggles and power wording): use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>` so only your lines land.
