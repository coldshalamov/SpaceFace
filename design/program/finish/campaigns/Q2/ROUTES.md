<!-- LIFETIME: CAMPAIGN -->
# Q2 - the route walkers

A route is a player journey with expected beats. A walker plays it on the ordinary route with the
Browser pane visible (or `--electron` where the shell is the claim), records what happened, and files
only material defects with a capture. A green unit test is not a route walk.

## The routes

### R1 - New game to first flight (smoke)
Boot -> New Game -> choose a career origin -> the starter card and ship sheet -> Launch -> flight
starts -> thrust changes speed -> the HUD shows hull, fuel, a gun and the objective.
**Pass:** the six invariants in `scripts/check-game-playable.mjs` plus one visible acceleration.
**Red flags:** menu freeze, no hull, zero vitals, dead thrust, shader error, an invisible authored
ship.

### R2 - The first hour (W5)
Fresh save, follow only on-screen guidance: mine the first rock -> dock -> the first dock teaches the
ship sheet -> the first choice splits into trade / hunt / prospect -> one job from each loop is
offered and one is completed. At ten random moments, write down the answer to "what do I do next?".
**Pass:** every answer is visible within 15 s; no dead end; no "unknown" objective.
**Red flags:** an objective that names a place the player cannot find, a choice with no consequence,
a tutorial that never yields.

### R3 - Act 1 (W1)
Fresh save: B0 mine -> Skim -> dock at Helios; B1 alloy -> Scale 4 -> furnace; B2 Cinder marks ->
compost / Nest; the first interlude; the act-turn plate names Act II.
**Pass:** beats in order, the tracker names the act, the Journal can re-read it, no blocked book job
without a named prep step.

### R4 - Acts II-IV (W1/W2)
Hunt -> tow -> choose a door -> the branch chain -> the Deep Reach operation -> one ending A-E.
**Pass:** each act has a goal, a new verb, a set piece, a cliffhanger; the finale names what the
player did; the post-ending sandbox is playable.

### R5 - Swarm 1-15
Title -> SWARM -> round 1 -> draft -> waves 1-15 including the wave-5 and wave-10 bosses -> results
-> Retry with the same seed.
**Pass:** the Line latches/tows/throws, the HUD stays quiet, the boss breaks up, rewards pay once,
Retry replays the seed.

### R6 - Station screens
Dock at Helios, Tethys, Ashfall and one player-owned berth. Visit: Hub, Market, Shipyard,
Outfitting, Shipworks, Missions, Contracts, Services, Factions, Bar, Tech, Research, Credits,
Automation, Codex, Chart, Settings, Pause, Save/Load, Help.
**Pass:** every tab mounts, every control is reachable and does something nameable, no clipped text
at 960x540 and 1920x1080, no console error, the back/undock path always works.

### R7 - Save, quit, continue
Save to a slot -> quit to title -> Continue -> the same ship/sector/credits/mission/cargo -> save
again -> export/import the JSON.
**Pass:** no loss, no duplicate mission, no double reward, the autosave and quick slot stay distinct.

### R8 - Settings and input
Rebind a flight key and a combat key -> verify in flight -> switch keyboard/gamepad -> pause/resume ->
reduced motion/flash -> quality tier -> resolution.
**Pass:** rebinds survive reload, the pad reaches the same verbs, pause freezes the ship but not the
scenery, reduced motion removes shake without removing the cue.

### R9 - Crucible, racing, sandbox
Enter each from the title; finish or abandon one run; return to the title.
**Pass:** entry and exit are clean, the results plate is truthful, no contamination of the Adventure
save.

### R10 - Soak
Thirty minutes of ordinary Adventure with one forced context loss and one sector jump.
**Pass:** zero terminal panes, zero frames > 250 ms after load, no growing heap, the route still
responds.

## The walk record

For each pass, write `design/program/finish/campaigns/Q2/walks/<date>-<route>.md`:

```
Route: R5 - Swarm 1-15
Build: <commit>
Host: <laptop, pane visible/electron>
Beats observed: <ordered list, with the moment each was reached>
What do I do next?: <the ten answers, with the wait in seconds>
Defects: <one line each, severity, owning lane, capture path>
Verdict: PASS / FAIL / PARTIAL (name what was not walked)
```

File material defects to the owning lane, not to Q2. Repeat the affected route after the fix; do not
re-walk unrelated routes for a one-line change.
