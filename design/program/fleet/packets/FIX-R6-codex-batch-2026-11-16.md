# FIX-R6 — the four findings from the 2026-11-16 codex batch review

**Lane 2.** Source review report: `design/program/fleet/reviews/2026-11-16-be43a250cb.md`
(committed `8a75fd6600`). One commit per finding, red-first evidence each. Never the whole suite;
focused tests only, through the game lock if a test boots the sim.

## Shared-checkout note (files with foreign WIP)

`src/world/worldRecords.js` and `src/systems/npcJobsRuntime.js` carry foreign uncommitted hunks.
For those two files use the protocol's own-commit flow
(`bash scripts/fleet/own-commit.sh begin <file>` … `commit "<msg>" <files>`): your hunks land,
theirs stay uncommitted in place. `weighingWorksite.js` and `compostArrivalScene.js` are clean —
normal exact-path commits.

## Item 1 — HIGH: Ninth Mouth originals captured in a schema their restore rejects

`src/world/worldRecords.js:902` computes `captureNinthMouthBody(entity)` and drops it; capture
(`:1017`) and normalization (`:411`) admit payload type only for `starterBuoy || lanternHardware`,
and `:1041` saves `lanternHardware || d.itinerary`, discarding the fresh Ninth Mouth snapshot.
Consequence: save/Continue or leave-Ceres-and-return loses the seven payload originals; a seated
lamp loses its captured installed/light/physics state.

**Important:** the working tree's uncommitted foreign hunks in this file already contain the
candidate fix (`ninthBody && entity.type === 'payload'` in the type ternary; `ninthBody ||` in the
itinerary line). Do not rewrite them — **review them line by line**, extend them only if a seam is
missed (e.g. the restore validator at `ceresNinthMouthBodies.js:103` must now accept what capture
writes), and land exactly those hunks via own-commit.sh. Red-first evidence: extract the two
committed versions of those lines (git show HEAD:…) into a temp copy and show the test fails
against them, then green against the tree. Commit message: `fix(R6-high): ninth mouth payload
originals survive capture with their fresh state`.

## Item 2 — MED: killing a Weighing original bypasses the canonical reveal

`src/missions/weighingWorksite.js:237`: with one assembled original dead, `!all` returns
`voidQuiet(...)` once `r.assembled` or `settled(m)` is true — the phase flips to combat with
`helixFalseFlag = false` and no `reveal_pending`. PRI-10f direction 1 requires a physical pattern
break by "shove, thrown mass, kill" to expose Helix. Fix: a confirmed death of an assembled
original member is a valid physical break — route it through the canonical reveal using the
retained original cast identities; keep missing/replaced/never-assembled members fail-closed.
Red-first test: kill one assembled original before displacement, assert the reveal evidence is
armed (and `voidQuiet`'s shortcut is not taken). Commit: `fix(R6-med): killing an assembled
Weighing original still exposes Helix`.

## Item 3 — LOW: Rookside drops the growth acknowledgement during the arrival cooldown

`src/missions/compostArrivalScene.js:88` returns while `s.simTime < memory.nextAt`;
`faction_understory.js:2169` clears `_compostArrivalDirty` before calling it, and
`tickCompostArrival` retries only on proximity change — so a growth request inside the 8 s cooldown
is discarded forever. Fix: retain a pending reconciliation deadline when the cooldown defers a
meaningful transition; reconcile once when it comes due. Red-first test: deliver growth feed
inside the cooldown window, advance past `nextAt`, assert the acknowledgement fires without
another event. Commit: `fix(R6-low): rookside growth acknowledgement survives its cooldown`.

## Item 4 — LOW: disposing the NPC jobs owner strands the two Helios helpers

`src/systems/npcJobsRuntime.js`: init installs `_cuttingCourtesyCleanup` and `_sharedCutCleanup`
(`:1116–1119`) but `destroy()` clears only `_ceresWinchingCleanup` and `_ceresNinthMouthCleanup`
(verified by lead). Fix: clear both in `destroy()` (own-commit.sh — file is dirty with foreign
work). Red-first test: init, destroy, re-init on a retained bus, assert the retired helpers fire
nothing. Commit: `fix(R6-low): npc jobs destroy releases the helios helper subscriptions`.

## Done

Four commits as named, each with red-first evidence in the receipt, focused tests green, no
foreign hunks swept, honest receipt (`.devshots` receipt path per the runner).
