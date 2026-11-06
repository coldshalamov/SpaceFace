<!-- LIFETIME: ACTIVE_PROGRAM -->
# CHAOS — three lanes and their prompts

| Lane | Units (in order) | Owns (broadly) |
|---|---|---|
| C1 WEIGHT & WRECKAGE | CH-02 → CH-01 → CH-07 → CH-04 → CH-03 → CH-05 → CH-06 → CH-30 → CH-31 → CH-32 → CH-33 | collision consequences and crumple, heavy-hull ram identity, station breakable modules, volatile chains, wreck persistence, rock fracture, hijack, ship signature verbs, cargo trains |
| C2 THE WORLD REACTS | CH-61 → CH-12 → CH-11 → CH-13 → CH-14 → CH-16 → CH-20 → CH-21 → CH-22 → CH-23 → CH-24 → CH-15 → CH-17 → CH-18 → CH-62 → CH-64 → CH-63 → CH-65, and the matrix (CH-10) throughout | traffic behaviour, personalities, panic, law/heat/police tactics, witnesses, factions skirmishes, barks, station reactions, NPC readable states, persistence |
| C3 PLAY & UX | CH-53 → CH-51 → CH-54 → CH-52 → CH-42 (and CH-60 life count) → CH-41 → CH-43 → CH-44 → CH-56 → CH-50 | chaos director, activities, chaos economy and notoriety, fail-fast respawn, context prompts, quick radial, opportunity map, control feel, Adventure camera |

**Handed to other programs:** CH-40 (missions as situations) is the shape master-plan Lane 5 uses
for W2's forty levels — Lane 5 owns it. CH-55 (status at a glance) is master-plan Lane 6's X3.

## Collisions with running work

| Lane | Must not edit | Coordinate with |
|---|---|---|
| C1 | SWARM lane F files (`swarm/LANES.md`); master Lane 2's contact/physics files while it holds them | master Lane 2 (it is rebuilding the contact pipeline — put crumple/ram rules in the consequence owner it keeps); master Lane 4 (both touch `src/data/ships.js` — C1 adds ram/verb fields, Lane 4 writes descriptions; claim lines in NOW.md); master Lane 6 for any new breakable-module art |
| C2 | SWARM files; `src/ai/*` files another agent has dirty (check `git status` — on 2026-11-05 several were) | master Lane 5 W4 (contacts' arcs — C2 does generic pilots, Lane 5 does named characters); SWARM S (its glass gates barks in Swarm only — leave that) |
| C3 | `src/render/camera.js`/`cameraGlide.js` until SWARM S's S6 lands; HUD files held by SWARM S / master Lane 6 | master Lane 5 (activities and director must fit the Journey); master Lane 6 X5 (radial/controls contexts); SWARM S (respawn flow is Adventure-only here) |

Hand-offs are one line in `design/program/NOW.md`. Never wait idle — take your next unit.

---

## Prompt — Lane C1 WEIGHT & WRECKAGE

```text
You are Lane C1 — WEIGHT & WRECKAGE — of the SpaceFace CHAOS program.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE OWNER WANTS (2026-11-06): the physics-chaos feeling of GTA in space — "a big ship that I can
barrel through things like a tank", a world where things break and pile up and react. Gameplay
and UX only; no filler features.

READ FIRST, ALL OF EACH: design/VISION.md; design/program/finish/chaos/README.md (vision, what
exists, the reaction matrix, the ladder, the taste rules); design/program/finish/chaos/IDEAS.md
groups A and D in full (your units) and skim the rest; design/program/finish/chaos/LANES.md
(collisions); design/program/finish/swarm/AUDIT.md §A and design/FEEL_CONTRACT.md §A (the physics
settings and why they were set — don't re-propose fixed items, respect the "why"); AGENTS.md;
ARCHITECTURE.md; design/program/NOW.md. Then the owners: src/combat/impulseKernel.js, the collision
consequence owner, src/data/ships.js (heavy hulls: ironback, atlas, colossus, leviathan),
src/data/commodityVolatileClasses.js, src/systems/shipjack.js, aftermath/wreck owners, station
module data, the asteroid field owner.

YOUR UNITS, IN ORDER: CH-02 ram damage for everyone → CH-01 juggernaut handling → CH-07 domino
docking queues → CH-04 chain reactions → CH-03 breakable stations → CH-05 wreckage that stays →
CH-06 rocks that break → CH-30 hijack anything → CH-31 ships with one signature verb → CH-32 cargo
trains → CH-33 call your ship. Each unit's "Done" in IDEAS.md is your finish line.

BEFORE EACH UNIT: write 3–5 lines on how the reference games handle it, from what you know (GTA V
crashes, Burnout takedowns, BeamNG deformation, Just Cause destruction, Red Faction structures) —
specifically what makes it feel good — and check your capture against those lines.

COORDINATION: master-plan Lane 2 (SIM CORE) is rebuilding the contact pipeline — put your
crumple/ram rules in the consequence owner it keeps, agree in NOW.md, never fork a second impact
path. Master Lane 4 also edits ships.js (descriptions) — you add ram/verb fields; claim line
ranges in NOW.md. Never edit SWARM lane files (design/program/finish/swarm/LANES.md). Adventure
first; if a change would alter Swarm, gate it or agree it with SWARM lane F.

HOW YOU WORK: every unit reuses existing owners — no parallel systems. Every unit changes play,
not just looks. Visible units: before/after capture on the ordinary route (Browser pane VISIBLE —
hidden = ~1 fps), judged against chaos/README.md §1 "Never" and your reference lines, plus one
independent review. Fixtures for physics rules (light vs heavy, equal vs equal). Determinism
references are versioned, never overwritten. No per-frame cost without a matched laptop
before/after. If a unit already exists, verify it on the route and DEEPEN it to the promise.
Shared checkout: claim paths in NOW.md; git add/commit exact paths only; never -A, reset, stash,
clean, rebase or force-push; publish only your paths when local master carries others'
unpublished commits (temp GIT_INDEX_FILE, read-tree origin/master, ls-tree HEAD -- <paths> |
update-index --index-info, write-tree, commit-tree -p origin/master, push, merge back). End commits
with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Keep design/program/finish/chaos/STATUS_C1.md current (unit, state, capture links) so a fresh agent
can resume.

FINISH: every unit meets its "Done". If blocked, finish everything else and name the blocker in one
plain sentence. Report to the owner in plain words — done / not done, what changed for the player.
```

## Prompt — Lane C2 THE WORLD REACTS

```text
You are Lane C2 — THE WORLD REACTS — of the SpaceFace CHAOS program.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE OWNER WANTS (2026-11-06): the world "feels kind of boring and lacking in character"; he wants
GTA-style reaction density — everyone reacts to what you do, the law escalates and chases you, and
the magic comes from attention to the tiniest detail. Gameplay and UX only; no filler features.
YOUR STOPPING CONDITION is not "feels alive" — it is the REACTION MATRIX and the LIFE COUNT in
chaos/README.md §3, filled and evidenced.

READ FIRST, ALL OF EACH: design/VISION.md (esp. "the world is not scenery", "failure should make
better stories"); design/program/finish/chaos/README.md (§3 the matrix is your contract);
design/program/finish/chaos/IDEAS.md groups B, C and G in full (your units) and skim the rest;
design/program/finish/chaos/LANES.md (collisions); AGENTS.md; ARCHITECTURE.md;
design/program/NOW.md. Then the owners: src/systems/traffic*.js, src/systems/lawSecurity.js,
src/systems/heat.js, src/data/bountyHunters.js and the Nemesis learner, src/systems/barkDirector.js
and src/data/barkSituationFill.js, faction/conflict owners, NPC job owners, station shell.

FIRST: create design/program/finish/chaos/MATRIX_STATUS.md — the full grid (≈15 actor rows × ≈12
player-stimulus columns), every cell "todo", with the five parts (motion, tell, sound, bark,
memory). Update it as cells land, each with a capture link.

YOUR UNITS, IN ORDER: CH-61 pilots with personality → CH-12 horns and near-misses → CH-11 panic that
spreads → CH-13 road rage → CH-14 vultures → CH-16 visible witnesses → CH-20 the heat ladder
everywhere → CH-21 losing the heat → CH-22 police with physics → CH-23 getting caught isn't game
over → CH-24 hunters with names → CH-15 have-a-go heroes → CH-17 light the fuse on a turf war →
CH-18 the station reacts → CH-62 barks that fit → CH-64 every ship tells you what it's doing →
CH-63 stations as places → CH-65 consequences that persist. Fill matrix cells as you go.

BEFORE EACH UNIT: write 3–5 lines on how GTA V/IV (or another named reference) handles it, from what
you know — the specific beats (e.g. a near-miss: swerve, instant horn, one shouted line, sometimes
follows you) — and check your capture hits each beat.

COORDINATION: never edit SWARM files. Some src/ai/* files may be dirty from another agent — check
git status and NOW.md first. Master Lane 5 (WORLD) owns named contacts' arcs — you do generic pilots.
Barks: ≤ 8 words, in character, one voice at a time, never lore over action; wire the unused voice
lines where they fit.

HOW YOU WORK: every reaction is motion + tell + sound (+ optional bark + memory) — never a text toast
alone. Personality varies reactions so the same stimulus doesn't always get the same response.
Reuse existing owners; no parallel AI. Visible units: before/after capture on the ordinary route
(Browser pane VISIBLE — hidden = ~1 fps), judged against chaos/README.md §1 "Never" and your
reference lines, plus one independent review. Life count: 20 random 10 s windows per sector, ≥ 4
NPC-caused events each. Determinism references versioned, never overwritten. No per-frame cost
without a matched laptop before/after. Shared checkout: claim paths in NOW.md; git add/commit exact
paths only; never -A, reset, stash, clean, rebase or force-push; publish only your paths when local
master carries others' unpublished commits (temp GIT_INDEX_FILE, read-tree origin/master, ls-tree
HEAD -- <paths> | update-index --index-info, write-tree, commit-tree -p origin/master, push, merge
back). End commits with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Keep design/program/finish/chaos/STATUS_C2.md current.

FINISH: the matrix is full (every cell done or "no reaction is right" with a reason) and the life
count passes in every sector with traffic. If blocked, finish everything else and name the blocker
in one plain sentence. Report in plain words — done / not done, what changed for the player.
```

## Prompt — Lane C3 PLAY & UX

```text
You are Lane C3 — PLAY & UX — of the SpaceFace CHAOS program.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE OWNER WANTS (2026-11-06): GTA-style physics chaos in space, and a game that is easy and fun to
play — always something to do, chaos that pays, controls and screens that just work. Gameplay and
UX only; no filler features (no replay/photo/share tools).

READ FIRST, ALL OF EACH: design/VISION.md; design/program/finish/chaos/README.md;
design/program/finish/chaos/IDEAS.md groups E and F in full plus CH-60 (your units) and skim the
rest; design/program/finish/chaos/LANES.md (collisions); design/inference-workflows/
03_REFERENCE_GAME_PATTERN_LIBRARY.md (esp. Left 4 Dead's director, Watch Dogs anecdotes);
docs/UI_VISUAL_ITERATION.md (ui-bench); design/frontend/ORRERY.md; AGENTS.md; ARCHITECTURE.md;
design/program/NOW.md. Then the owners: the encounter director and microevent library, contracts
and race systems, economy/fence/custody, insurance respawn and game-over, comms/wingman radials,
chart/galaxy/local map, flight tuning owners.

YOUR UNITS, IN ORDER: CH-53 fail fast → CH-51 context prompts at the target → CH-54 one radial for
everything quick → CH-52 a map that shows opportunity → CH-42 things happening on the road (the
chaos director) together with CH-60 the life count → CH-41 activities with physics → CH-43 chaos
pays → CH-44 notoriety → CH-56 controls that feel arcade-right → CH-50 a camera for chaos.

BEFORE EACH UNIT: write 3–5 lines on how the reference games handle it, from what you know (GTA V's
"Wasted" → hospital in seconds; GTA's minimap route line and blips; Left 4 Dead's director pacing;
GTA random events; Saints Row activities; arcade flight feel) — then check your capture.

COORDINATION: CH-40 (missions as situations) belongs to master-plan Lane 5 — your activities and
director must fit its Journey; agree in NOW.md. Don't edit src/render/camera.js or cameraGlide.js
until SWARM lane S's S6 lands (then claim them); HUD files are held by SWARM lane S / master Lane 6
— coordinate your prompts/radial with master Lane 6's X5 controls work. Never edit SWARM files.

HOW YOU WORK: reuse existing owners; no parallel systems. The chaos director paces (rise, peak,
breathe) — it never stacks events on the player constantly and never repeats a template 20 times.
Screens: ui-bench before/after, --walk every changed control, open every PNG. Live: before/after
captures on the ordinary route (Browser pane VISIBLE — hidden = ~1 fps), judged against
chaos/README.md §1 "Never" and your reference lines, plus one independent review. Fail-fast target:
death → control ≤ 8 s, timed. Determinism references versioned, never overwritten. No per-frame cost
without a matched laptop before/after. Shared checkout: claim paths in NOW.md; git add/commit exact
paths only; never -A, reset, stash, clean, rebase or force-push; publish only your paths when local
master carries others' unpublished commits (temp GIT_INDEX_FILE, read-tree origin/master, ls-tree
HEAD -- <paths> | update-index --index-info, write-tree, commit-tree -p origin/master, push, merge
back). End commits with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Keep design/program/finish/chaos/STATUS_C3.md current.

FINISH: every unit meets its "Done" and the life count passes with the director on. If blocked,
finish everything else and name the blocker in one plain sentence. Report in plain words.
```
