# PRI-09 — Frontier households: a first crate, rings that say where, food that counts (#940, rebuilt)

**Lane 2. This is a rebuild, not a port.** Read `design/program/fleet/PR-INTAKE.md` first, then the
"#940" section of `.devshots/pr-intake/reviews/codex-dot-small.md`. PR #940's rules are right and its
tests describe real behaviour, but its foundation is wrong: eight helper files each re-scan the whole
entity list at 60 Hz, speak in paragraphs, and add saved fields that old saves lack. Read the PR to learn
the behaviour (`git show refs/remotes/pull/940:src/missions/<file>` and its `test/` files). **Do not bring
any of its eight `src/missions/*.js` helpers.** Build the same player outcomes inside the Frontier owner
(`src/systems/faction_frontier.js`, the `frontierHomesteads` system) as below.

The voice of this faction is already on master — `FRONTIER_BARN_RAISING.strandedLine`:
*"We'll owe you. We always owe somebody."* Every line below is written to sit beside it. Use them exactly.

## What the player gets
1. After you raise a barn, a first supply crate waits outside its ring. Tow it in: the house is supplied.
2. Every place that wants something from you wears a ring with a short tag saying what.
3. A mutual-aid marker waits in clear space beside the creditor, can be latched, and counts once.
4. A food pod you jettisoned yourself and towed in slowly is taken as supplies, and paid.
5. A wreck two steads are claiming is still there after save and Continue.

## Build

### A. One delivery counts once (`_settleDebt`)
When a supply landing covers an aid debt (`how === 'covered'`), the intake already counted that supply —
do not add another. Only `how === 'carried'` adds one. (The PR's fix; keep its
`test/frontier-aid-one-delivery.test.mjs`.)

### B. The first crate — on the transition, never per tick
- `_onBarnMissionCompleted`: for a newly validated completion with `attempt.adoptedSite === false`, set
  `attempt.firstProvision = 'pending'`. A completed attempt loaded from an old save has no such field and
  must never mint a crate.
- New owner method `_stageFirstProvision(state)`: if pending, the frame is the live raised stead of that
  attempt (same id, generation, mission, site) and the player is in its sector: find a clear spot on a ring
  320 / 420 / 520 wu out (16 bearings each, first clear wins; an existing live `supplyCargo` pod of that
  site counts as already staged), spawn one `payload` pod (`supplyCargo: true`, `frontierSite`, 10 t, radius 6,
  persistent, `masslineTetherable`, scan label `HOMESTEAD SUPPLIES · 10t`), set `firstProvision = 'issued'`
  **only after** the spawn returned an entity, and say (speaker = the stead's name):
  `First crate's outside the ring. A roof was the start.`
- Call it from: the completion handler, `sector:enter`, and `_afterRestore`. Nowhere else. A blocked ring
  simply waits for the next of those.

### C. Rings with tags — one reconciler, driven by events
New file `src/missions/frontierReceivingTags.js` exporting `syncFrontierReceivingTags(owner)` and
`moveFrontierReceivingTag(owner, key, pos)`. Model the beacon on the guide that
`src/missions/furnaceReceivingLane.js` already spawns (non-physical, non-tetherable, not saved).
- It derives the wanted set from the owner's rows and reconciles it against `owner._receivingTags`
  (a `Map` key → entity id, transient): create missing, relabel changed, remove stale. Keys and labels:
  - active barn attempt frame → `E-21 RECEIVING · <snapped>/6` (ring radius `FRONTIER_FRAME.snapRange`)
  - each live stranded stead → `SUPPLIES WANTED` (ring radius `FRONTIER_HOMESTEAD.supplyRadius`)
  - each open debt's debtor → `AID · bring the marker` (ring radius `FRONTIER_MUTUAL_AID.settleR`)
  - each open dispute's claimant steads → `CLAIM · <stead name>` (ring radius `FRONTIER_SALVAGE_CLAIMS.settleRadius`)
  One stead wearing two reasons shows the first in that order.
- The owner calls `syncFrontierReceivingTags(this)` **only** where those rows change: barn mission
  accepted / ended / completed, a module snapping to the frame, a stead becoming stranded / supplied /
  gone, a debt posted / settled / lapsed, a dispute opened / closed, `sector:enter`, `_afterRestore`,
  `_clearBoard`, `destroy`. It is never called from `update`.
- Steads and frames can be towed. Where `_tickHomesteads` already refreshes `rec.pos` each tick, call
  `moveFrontierReceivingTag` for that stead (a Map lookup and two assignments — no allocation, no scan);
  same for the barn frame where `_tickBarnAttempt` already reads it.
- Because tags are rebuilt from rows, **no new saved fields** exist for them. Do not port the PR's
  `receivingDebtorGen` / `receivingGens` / `claimCarryBindings`.

### D. One line per moment
Each is said once per stead (remember in `rec.said`, a small saved object; missing = nothing said yet) or
once per barn attempt (`attempt.said`). Proximity uses the player-distance the tick already has in hand
for that stead/frame, and is skipped entirely once said. Through the owner's existing `_log(state, text, speaker)`.
| Moment | Speaker | Line |
|---|---|---|
| Player first within 650 wu of the frame during an active barn job | `E-21 weld crew` | `Six modules. Bring them to the ring.` |
| Sixth module snaps | `E-21 weld crew` | `That's six. Stand clear for the weld.` |
| Player first within 650 wu of a raised stead | the stead | `Welders are gone. We live here now.` |
| First supplies taken aboard after that | the stead | `Stores are in. That's a household.` |
| A food pod is taken as supplies (E) | the stead | `Food's aboard. The board pays.` |
| Player brings a disputed wreck within reach of two claimant rings | `Frontier board` | `Two rings want that wreck. Pick one.` |
Keep master's existing aid-posted line as it is. Add no other speech and no `comms:popup`.

### E. Food you hauled yourself counts
In the supply intake of `_tickHomesteads`, additionally consider **only the one body the player is towing**
(`state.player.tether` active → its target; nothing else is scanned). It is taken as a supply landing when:
it is a pod the player's own jettison made, holding a whole food load (validate custody and contents with
the same owner call `src/missions/compostRoute.js` uses — `gardenFeedMass` — cached per pod id + occupant
generation so it is evaluated once), it has stayed inside the stead's `supplyRadius` for 2 continuous
sim-seconds while moving slower than 12 wu/s (owner-held timer keyed to that pod; leaving the ring or
speeding up resets it). Then settle exactly like a supply pod (same fee, rep, deed, lead and debt calls),
remove the pod through `helpers.removeEntity`, and say the line.

### F. The aid marker
In `_postDebt`: place the marker in a clear pocket just outside the creditor's hull on the side facing the
debtor (probe a few bearings; if none is clear, post no debt this time — the existing timer retries). The
marker is a dynamic 12 t body, persistent, `masslineTetherable`, label `MUTUAL AID · 12t · to <debtor>`.

### G. A claimed wreck survives Continue
When a dispute opens on a wreck that no other owner persists (`flags.persistent` falsy and no
`data.persistenceOwner`), set `flags.persistent = true` and `data.persistenceOwner = 'frontierClaim'`.
When the dispute closes, if `data.persistenceOwner === 'frontierClaim'`, clear both. Never touch a wreck
another owner already persists. Check that `_rebindGenerations` re-finds the wreck after a restore.

## Tests
Port the behaviour of the PR's tests into at most four files (`test/frontier-first-provision.test.mjs`,
`test/frontier-receiving-tags.test.mjs`, `test/frontier-aid-and-claims.test.mjs`,
`test/frontier-provision-freight.test.mjs`) plus `test/frontier-aid-one-delivery.test.mjs`. They must drive
the real `frontierHomesteads` system with the events the game really emits. Required cases beyond the PR's:
an old save (completed barn, open debt, open dispute, no new fields) loads with its obligations intact,
shows the right tags, and mints no crate; the per-tick path creates no entities and allocates no arrays
when nothing changed (assert the tag Map and entity count are stable across 600 ticks and that
`syncFrontierReceivingTags` was not called — spy on it).

## Files you may edit
`src/systems/faction_frontier.js`, `src/missions/frontierReceivingTags.js` (new), the test files above,
existing frontier tests that pin replaced behaviour (list each with a reason). Lines live in
`src/data/factions/free.js` beside `strandedLine` if that file is clean; otherwise as constants at the top
of the owner.

## Checks
The five test files, then in one call every existing test that names the frontier owner
(`grep -ln "faction_frontier\|frontierHomesteads" test/*.mjs`) — report pass/fail counts; reds that already
fail on untouched master are reported, not "fixed". `npm run check:src-imports`. No game or browser run.

Commits (one per lettered part that changes behaviour; A alone, B, C+D together, E, F, G):
`fleet(PRI-09): <what the player now sees>`.
