# The check suite, measured rather than estimated — 2026-08-23

`npm run check:ci:report` ran the whole matrix: **272 commands, 251 passed, 21 failed.**
Artifacts (report.json, report.md, per-command logs) in
`scratch/check-ci-report/2026-08-23T16-01-51-066Z/`.

This replaces a working estimate of "about nine red". Two of the twenty-one are fixed below, three
are diagnosed to a precise cause, and two are known environment conditions rather than defects.

## Fixed today

| check | what was actually wrong |
| --- | --- |
| `check-travel-lanes` | The recovery beacon was published only while the player stood inside the disrupted segment, but the drive stays knocked out after they coast out of it — so "where do I go now" vanished exactly when a stranded player needs it. Now published while the drive is knocked out. 11/12 → 12/12. |

## Diagnosed, not fixed — each needs a decision, not a patch

### `check-47a-tactics`, `check-47a-live-branch`
Full write-up in `47A-DELIVER-BRANCH-2026-08-23.md`. Short version: the courier delivery needs the
spindle within 160 WU of the beacon; it starts at 145.6 and drifts out to 234.6 because commit
`6996ef65` **deliberately removed** the release snap-correction that used to steer a thrown payload
onto the intercept angle. The checks assert behaviour the game intentionally no longer has.

**Do not widen `maxDistance`.** The spindle starts inside the radius and leaves; a wider one would
go green while the delivery still is not happening. Separately: the scripted sling changes nothing
about where the payload settles across a 2,300-tick spread of release timings, which is its own
question.

### `check-depth-program-k1-behavior`
`faction_pitborn must produce no fresh damaging decision after disable` — one decision at tick 195.

Localised to a **disagreement between two layers about the same fact**:

- The intent layer gets it right. `disabledNonlethalTargetFor()` in `src/systems/aiPorts.js` reads
  `ai.factionPresenceDoctrine`, and if `destroyTarget === false` queries the target's live combat
  runtime through `isDisabled()`. It fails closed, which is why `postDisable.fireTicks` is empty and
  nothing actually fires.
- The doctrine layer does not. `src/ai/combatDoctrine.js` guards its egress on
  `factionBehavior && (factionBehavior.disableThenRun || factionBehavior.destroyTarget === false)
  && target.disabled === true`, reading the perception contact rather than the runtime. For
  `faction_pitborn` that guard does not fire, so the doctrine keeps cycling into strike/commit and
  keeps publishing a fire window — a decision to damage, made by a ship that has been told not to.

The fix is to make the doctrine ask the same question the intent layer already answers correctly.
The remaining unknown is how `factionBehavior` reaches the doctrine through `src/ai/stack.js` and
whether it is populated at all for this faction.

**A wrong turn worth recording:** I first read this as the *actor* being disabled and added a
`self.disabled` branch to the doctrine. It is the actor's *target* that gets disabled, and
`isDisabled()` only tracks the drive capability, so the branch was dead code carrying a confident
comment. Reverted rather than shipped.

## Not defects

- `check-bundle` — exits 1 on `ENOSPC`. The disk sits at 100% of 944 GB. Not a code failure.
- `check-assets:live` — documented in CLAUDE.md as failing whenever the tree is dirty or `HEAD` is
  ahead of origin. With a concurrent lane running it is red by construction.

## Still untriaged (16)

`check-depth-program-s3-reach-cultures` (×2, "return crew must enter the SG-06 roster"),
`check-depth-program-a1` ("plinth scan into authored lore"), `depth-program-gt1-loot-audit-test`,
`sim-loot-audit`, `check-galaxy-map-inspector`, `check-mission-handoff` (TimeoutError),
`probe-flight-visual`, `check-graphics-asset-receipts`, `check-parts-manifest`,
`check-sg04-release-assets`, `check-station-archetype-glb-load`, `check-authored-place-runtime`,
`probe-ship-visual-stability`, `check-perf-packets`.

**That hypothesis is wrong, and I checked it rather than leaving it standing.** I suggested the seven
asset-family entries probably shared the disk-full or dirty-tree cause. `check-parts-manifest` run
directly reports **4,181 ok, 559 fail** — and the failures are content, not environment: hundreds of
`_export_tmp.glb` files were committed and are declared in the manifest, e.g.
`revamp-evidence/weapon_railgun/_export_tmp.glb`, plus at least one place GLB whose runtime metadata
will not load (`places/place_station_trade_hub.glb`).

So the asset family is real authoring debt: temporary export artefacts that reached both the repo and
the manifest. Clearing it means deleting committed GLBs and re-deriving manifest entries, which is
the art lane's territory and the owner's call, not a check to be quietened.

The disk is separately a real constraint — 446 MB free of 944 GB. Of that, `.devshots/perf` alone is
2.6 GB and `pq017-world-site` 993 MB. These are evidence archives from past runs; pruning them
destroys work products and is an owner decision, so nothing here has been deleted.


---

## Second full run, after the day's fixes — 252 pass / 20 fail

`check:ci:report` again: **272 commands, 252 passed, 20 failed** (was 251/21).

**Closed since the first run:** `check-travel-lanes` (fixed — the recovery beacon now outlives the
dead segment), `check-perf-packets` (fixed — one unguarded `requestAnimationFrame` in `createHud`
was killing the whole contact-roster file before any assertion ran), and `check-mission-handoff`
(never a defect — it passes standalone and only failed inside the batch).

**Appeared in this run, and neither is what it looks like:**

- `check-station-egress` — **passes standalone.** Another batch flake, same shape as
  `check-mission-handoff`. Not a defect.
- `check-bar-mission-readiness` — fails consistently right now, at the boot wait on line 34
  (`window.SF && state && bus && ctx`, 15s). **But the game boots fine:** a direct headless boot
  probe found all four present with zero page errors, and `check:playable` has passed 15/15
  repeatedly since. Two delegation lanes were running throughout with 18 node processes live, and
  this is the fragile `headless: true` path. **Re-tested once the machine was quieter (8 node
  processes instead of 18): it PASSES.** A load artefact, not a regression.

**So the honest red count is 18, not 20** — both of this run's new entries were load, and the
three frontend probes (`check:screens:overflow`, `check:station:overflow`,
`check:station:tabstate`) still report zero across 21 screens, 7 station tabs and 7 tab states
after 72 commits.

**Standing lesson, now three times confirmed:** a check that fails inside a 272-command sequential run
should be re-run alone before anyone investigates it. Two of the twenty-one in the first run were
load artefacts, and one of the two "new" failures here is as well.


---

## Do not run the check matrix while delegation lanes are active

A run taken with four lanes working reported 16 failures, four of which were phantom — and two of
those had passed standalone an hour earlier. Measured rather than assumed:

- `check-station-tabs` asserted the Hull/Fuel/Hold meters are at least 60px wide and got 0. In a real
  browser those tracks measure **184px**. The only track-less vital is Munitions, which the check's
  own comment expects.
- `check-station-egress` failed on `page.goto: Timeout 30000ms exceeded` — the page could not even
  load inside thirty seconds.

Both are the machine being saturated, not the game. The lanes also leave their in-progress edits in
the working tree, so any runtime check is testing half-applied work.

**Take the authoritative count when nothing else is running.** Everything else is a number that
needs an asterisk, and the asterisk gets lost.
