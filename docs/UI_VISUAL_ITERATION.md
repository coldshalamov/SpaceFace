<!-- LIFETIME: STABLE -->
# Frontend iteration — see the screen, then fix what you see

You are the reviewer. The picture is the work. Open it in this pass, judge it, and change it until the screen you touched is clean in every state a player can reach. A PNG left on disk for someone else is not a review.

The bench mounts the **real** screen (the same module the game uses) over a frozen backdrop. It does not boot the game, start the sim, or load a sector. One command, one picture, a few seconds.

```
node scripts/ui-bench.mjs --list
node scripts/ui-bench.mjs --shot=pause
node scripts/ui-bench.mjs --shot=pause,settings,flight
node scripts/ui-bench.mjs --shot=station-market --walk
```

PNGs land in `.devshots/ui-bench/`. Open each path the command prints — read the image file — before you edit, and again after. The command also prints overlapping controls, clipped text, and offscreen controls. Those are defects. The picture can still be ugly when that list is empty, so the list does not replace looking.

Backdrops are three committed stills, chosen for you: the title plate, the station shell, and a world plate (`assets/ui/backdrops/`). The interface sits on top. Pass `--bg=path/to/still.png` only when you already have a better plate. Do not boot the game to photograph a menu.

`--walk` puts every visible control back at the arrival screen, hovers it, clicks it, and writes another PNG only when the picture changes. It prints what each control did. Run it on the screens you changed before you call them done. Open every PNG it adds. Raise the cap with `--max=` if it says controls were left untried.

`node scripts/ui-bench.mjs` with no `--shot` serves the page. `?screen=pause&chrome=0` is the same frame the command captures.

## What you owe the screen

For every screen you changed, and every state that screen can open (tabs, panels, hovers, the thing a control reveals):

- Look at the arrival PNG. Name what is wrong: overlap, a word cut off, type too small to read, uneven gaps, a pile of panels, a control with no job, anything that looks unfinished or cheap.
- Fix that in the screen's owner or the kit (`src/ui/AGENTS.md`). Shoot again. Open the new PNG and compare it to the one you just looked at.
- Walk the controls. Every control you can see has to do something you can name, and you have to have seen the state it opens. "No visible change" on a control that is sitting there as a choice is a bug. A disabled control has to look disabled.
- The screen is done when you have opened the after pictures and they are clean: nothing overlapping, nothing clipped, nothing off the frame, no dead control, no state you failed to open, nothing you would be ashamed to show.

The owner's bar: consistent, high-detail, creative, interactive, non-generic. Direction context is `design/frontend/direction/FIELD_HARDWARE_PROGRAM.md`. Nothing under `design/frontend/direction/approved/` is an approved frame.

## When the bench is the wrong tool

If the command prints `NOT MOUNTABLE`, that one screen needs the live game:

```
node scripts/ui-look.mjs --only=<id>
```

That boots the game. Use it for that screen only. `npm run ui:stills` is the same boot, for a batch. It is not the way to iterate.

Ids match the bench list and the surface ids in `scripts/ui-grammar-surfaces.mjs` (`title`, `station-market`, `chart`, `comms-radial`, …). `--list` is the set you can shoot.
