<!-- LIFETIME: DURABLE -->
# The four frontend handoffs — starter prompts

Copy one prompt per agent, in order. **Task A must be finished, reviewed and accepted before B, C
or D start.** B, C and D then run in parallel on separate agents (they touch disjoint files); D's
sweep and proof wait for B and C to land. Each prompt is self-contained.

The authority chain every prompt points at: `AGENTS.md` (how to work here) →
`design/frontend/direction/DIRECTION_SHEET.md` (what every screen looks like) →
`design/frontend/direction/KIT_SPEC.md` (the exact tokens, classes, markup, motion, sound, seams)
→ the task file (the order of work, geometry, checks, handoff).

---

## Prompt A — the kit and the title

```
You are implementing Task A of the SpaceFace frontend: the kit and the title screen. Work in the
repo at the current directory. Read, in this order, before touching anything:
1. AGENTS.md — the repo's working agreement: finish the job end to end, commit and push as you go,
   never ask the owner to choose between options.
2. design/frontend/direction/DIRECTION_SHEET.md — what every screen looks like and the rules. It
   is the aesthetic authority. Read all of it.
3. design/frontend/direction/KIT_SPEC.md — every token, class, markup pattern, motion, sound and
   integration seam, with file and line references. Copy its CSS and JS verbatim; do not redesign.
4. design/frontend/direction/tasks/TASK_A_KIT_AND_TITLE.md — your task: the ordered steps, the
   exact files, the title screen's geometry, the checks, and what to hand to review.

Your outcome: styles/kit.css and src/ui/kit/ exist exactly as specified; the variable Bricolage
face is vendored, licensed and verified; the eight UI sound recipes are re-tuned; the kit page
(_kitlab.html) shows every component and is captured at three widths; the capture path can
photograph the 3D hull (the task names the seam and the flags); and the title screen is live on
the default route in the new look with the old menu plate CSS deleted. Booting the game must show
the starter hull in its hangar filling the frame, the game's name enormous top-left, a column of
words down the left edge, the version in fine print.

Rules: no colour, size, face, shadow, radius, gradient, glow, panel, card, border or animation
beyond what KIT_SPEC.md gives; never paint a background to hide a missing hull; never ask the
owner which option they prefer — the sheet decides, and when it is silent use the nearest value
on the scale and write the choice in your receipt; keep the ids and classes the checks query as
inert hooks; never touch files a live design/program/NOW.md row names; commit each finished step
with a pathspec-limited commit and push origin master; run the checks the task file names and
keep them green.

When every step is done: write design/program/roadmap/receipts/FRONTEND-A-REPORT.md in the format
the task file gives, put the captures where it says, mark the queue units implemented, commit,
push, and report in plain words what the owner will see when they boot the game. Then stop; the
reviewer takes it from there.
```

## Prompt B — the shell and the flight HUD

```
You are implementing Task B of the SpaceFace frontend: the shell screens and the flight HUD. Task
A (the kit and the title) is accepted and on master; build on it and do not change the kit except
where your task file explicitly permits a recorded one-line addition. Work in the repo at the
current directory. Read, in this order, before touching anything:
1. AGENTS.md.
2. design/frontend/direction/DIRECTION_SHEET.md — all of it; your screens are under "The shell"
   and "Flight" in §2.
3. design/frontend/direction/KIT_SPEC.md — the classes and helpers you must use; §11.1–§11.7 are
   your seams.
4. design/frontend/direction/tasks/TASK_B_SHELL_AND_HUD.md — your task: per-screen tables for new
   game, load, settings, pause (and photo mode), game over, the new credits screen, then the HUD
   (kit faces and tokens with no plates, speed as the hero number, the Power Rail as words, the
   arrival choreography on undock, the frame going cold when wanted), the exact files, the
   checks, the handoff.

Rules: only kit classes and tokens; delete each screen's injected style block in the same commit
that migrates it; keep the ids and classes the checks query as inert hooks; keep every check the
task file names green — the HUD's attention rules are floor (quiet instruments, one receipts
channel, no keys on the windshield) and the HUD stays inside its frame budget (re-baseline the
budgets with the command in KIT_SPEC §11.7); never ask the owner to choose; never touch files a
live NOW.md row names, and never the station, the instruments, the chart, the Crucible or the
reading screens (other agents own them); commit per screen with pathspec-limited commits and push
origin master.

When done: captures for every screen at 1280, 1920 and 2560 and the two clips (undock arrival,
going wanted) where the task file says; design/program/roadmap/receipts/FRONTEND-B-REPORT.md; the
queue units marked implemented; commit, push, and report in plain words what the owner will see.
Then stop; the reviewer takes it from there.
```

## Prompt C — the station, the instruments and the chart

```
You are implementing Task C of the SpaceFace frontend: the station as a place, THE SHIP, THE
FOOTPRINT, THE RANGE and the chart. Task A (the kit and the title) is accepted and on master;
build on it and add to the kit only the rules your task file lists in its §1.1, recording them.
Work in the repo at the current directory. Read, in this order:
1. AGENTS.md.
2. design/frontend/direction/DIRECTION_SHEET.md — all of it; your screens are under "The
   station" and "The instruments" in §2, and §6 (the dense register) is your hardest rule.
3. design/frontend/direction/KIT_SPEC.md.
4. design/frontend/direction/tasks/TASK_C_STATION_INSTRUMENTS_CHART.md — your task: docking as
   arrival over the berth (the hull mount is the berth — the world canvas freezes while docked and
   the task tells you how to put the hull in the shot), the station shell, market, ledger,
   missions, factions, industry, bar, shipworks and THE SHIP (one shared stage), THE FOOTPRINT,
   THE RANGE, the chart; per-screen tables, the exact files, the checks, the handoff.

Rules: the market and ledger follow the dense register exactly (twelve rows, half width, the
selected number repeated at hero size); what each screen DOES does not change — the trade math,
the departure gate, the contract flow, orbit, trace, fly, the map's authority and every guarding
check stay as they are; only kit classes and tokens; the three station stylesheets become one,
rewritten with kit tokens; do not restructure galaxyMap.js beyond CSS, palette and class swaps;
never ask the owner to choose; never touch files a live NOW.md row names, and never the shell, the
HUD, the Crucible, the Works or the reading screens (other agents own them); commit per screen and
push origin master.

When done: captures at three widths for every screen with the hull visible behind the station,
the docking clip, design/program/roadmap/receipts/FRONTEND-C-REPORT.md, the queue units marked
implemented, commit, push, and report in plain words what the owner will see. Then stop; the
reviewer takes it from there.
```

## Prompt D — the modes, the reading screens, the sweep and the proof

```
You are implementing Task D of the SpaceFace frontend: the Crucible screens, Asteroid Works
reconciled, the reading screens, then the final sweep and the proof. Task A is accepted and on
master. Tasks B and C may be landing in parallel on other agents — do not touch their files; do
the Crucible, the Works and the reading screens first, and start the sweep and the proof only when
B and C are on master. Work in the repo at the current directory. Read, in this order:
1. AGENTS.md.
2. design/frontend/direction/DIRECTION_SHEET.md — all of it; your screens are under "The modes"
   and "The reading screens" in §2; §10 (what retires) and §11 (the never-list) drive the sweep.
3. design/frontend/direction/KIT_SPEC.md.
4. design/frontend/direction/tasks/TASK_D_MODES_READING_SWEEP_PROOF.md — your task: the Crucible
   door, draft, refit, results and lab; Asteroid Works reconciled under its own law (motion,
   temperature, never-list only); missions log, codex, help, tech tree; the sweep (dead
   stylesheets, style blocks, fonts and code deleted with a grep per deletion; budgets and the
   regression references re-baselined on the new look); the proof (the thirteen signature-moment
   clips, the twenty blind pairs prepared for the reviewer, the ninety-second reel).

Rules: the Crucible's signal colour is white and its frame has no scrim; the Works keeps its own
faces, palette, plates and radii — you touch only what the task names; what the screens DO does
not change; only kit classes and tokens; the sweep deletes only what no live file references and
proves it in the commit message; you prepare the blind pairs, you do not judge them; never ask the
owner to choose; never touch files a live NOW.md row names; commit per screen and push origin
master.

When done: captures at three widths for every screen, the clips, the pairs list, the reel and its
cue sidecar, design/program/roadmap/receipts/FRONTEND-D-REPORT.md, the queue units marked
implemented, commit, push, and report in plain words what the owner will see. Then stop; the
reviewer takes it from there.
```

---

## What the reviewer does after each task

Opens the captures under `.devshots/frontend/<TASK>/`, answers the sheet's §9 checklist for each
against the screen's line in the sheet and the task file's table, reads the receipt, runs
`npm run check:baseline`, and either accepts (promotes the queue units to done) or returns a punch
list to the same agent. Nothing is accepted from a description.
