# 15 — The next run: what is true on 2026-11-23, and the work it orders

**Written 2026-11-23 by a ZCode session at the owner's request, after a read-only pass over the repo.**
Its job is the next round of agents: what is actually wrong, in what order to fix it, and a brief for
each job. Nothing here overrides `AGENTS.md`; where they disagree, `AGENTS.md` wins.

How to read the labels: **[measured]** a command was run for this page and this is what it printed.
**[code]** read in the working tree by the verification pass (file and line given). **[reported]**
someone's claim that nobody re-checked. Anything with no label is this page's own judgement.

---

## 0. The short version

About 227 commits have landed since the release list was written on 11-20. The game is still weak
and buggy for five reasons, and none of them is "not enough work":

1. **Nobody has played it.** The owner's last three sessions lasted 0 seconds, 2 minutes and 5
   minutes. He has not launched the game since 11-21 00:15. The opening capture — the repo's own
   definition of done — was last run on 11-20, and in its last Adventure run the scripted player
   could not reach the station, dock or mine. Re-shot tonight on the
   current build: **Swarm's first round is fought in black space with no floor**, it is **74 seconds
   from launch to flying**, and the Adventure dock still fails.
2. **The signals are red, so regressions land unheard.** About 820 of the 5,900 unit test files fail
   on committed `master`. At the start of this pass four of the forty
   "must fail on a real regression" tests failed and six of twelve cheap static gates; by the next
   morning another session's mostly uncommitted fixes had cleared the four tests and one gate, and
   five gates are still red. Every lane reports "no new failures" against that baseline.
3. **Work lands half-connected.** A gun card promises a bounce that does not exist. Shop figures are
   built with no caller. A dying-ship flicker is built with no consumer. The round's cast
   announcement is dropped at the worker bridge. Fourteen of seventeen enemy kinds never got the new
   brain. Adventure enemies have no senses at all.
4. **It is slow.** The newest full run of the referee says "IS IT SMOOTH: NO" on all five routes:
   Swarm rounds 2, 6 and 12 at 21–23 fps, Adventure at 23. No performance run has ever been taken
   on a clean committed build.
5. **About 6,400 lines were uncommitted with no owner when this pass began** (170 files by
   morning), and one of them is a proven regression: the defeated player is now deleted from the
   world, so death cannot be recovered from.

The run, in order: **Wave 0** make the tree safe and the signals true (first, alone); **Wave 1** walk
the first five minutes of each door with eyes and fix what is actually bad; **Wave 2** finish the
half-built fight; **Wave 3** harvest the red tests; **Wave 4** make the player get stronger; **Wave 5**
Adventure's first hour; **Wave 6** speed, one engineer at a time on a quiet machine; **Wave 7** the
owner plays.

---

## 1. How to run this page

- **Waves in order.** Inside a wave the briefs touch different files and can run at once.
- **At most four builders at a time.** On this account five parallel agents spent a whole usage
  window in about 75 minutes and wrote nothing. Measurement briefs get the machine to themselves.
- **Each brief is a whole assignment.** Paste it to a subagent, or copy it to
  `design/program/fleet/packets/<ID>.md` and run `node scripts/fleet/run.mjs <ID> <backend>`.
- **Seats.** Briefs marked *taste* need the strongest model in the session and a model that can open
  a frame. Briefs marked *mechanical* need any careful model. No brief needs a particular vendor.
  Seat health changes hourly: send a one-line ping packet before queuing real work on a seat.
- **Before any builder reports,** it runs, and pastes the result:
  `npm run test:fast` (40 of 40 once W0-2 has landed), `npm run check:sim`, `npm run check:src-syntax`,
  and the focused tests for the files it touched. A moved `check:sim` hash is a bug unless the change
  was meant to alter the simulation; then the golden is re-recorded in the same commit and the
  message says so. Anything visible is looked at through the ordinary route, with a frame opened.
- **Commits** by exact path. Never a tree-wide `git reset`, `restore`, `checkout`, `clean` or
  `stash`. Merge, never rebase. Do not push unless the owner says so.
- **Reports** in this order: what a player now gets, what was checked and what it showed, what is
  still wrong or unverified.
- **Another of the owner's sessions is active in this checkout** (ship-package provenance, the first ten
  minutes and a plain-words sweep, on the night of 11-22 and the morning of 11-23; its probe windows
  took the focus from tonight's Adventure capture mid-run). Before starting, run `git status --short` and compare with
  Appendix A. Anything dirty that Appendix A does not list is theirs: leave it alone and say so.

What that session had in flight at 05:45 on 11-23 **[measured]**. A brief that overlaps one of these
rows starts by reading that session's newest commits and run folders, and takes only what is left:

| Its area | The signs | Overlaps |
|---|---|---|
| Plain words | `5623a6feef`, `379349d1c5`, `a5f84e8e50`, `6f5928bbbb` at 05:22–05:23 | W1-5 |
| Boot and load time | `scripts/probe-demo-timings.mjs`, three `scripts/.tmp-*.mjs` probes, runs under `.devshots/first-ten/` | W1-4, W0-4 |
| World textures to KTX2 | about forty `.ktx2` and `.sha256` files under `assets/`, `scripts/encode-world-ktx2.mjs` | Wave 6, handoff job 4 |
| The first ten minutes of Adventure | `.devshots/first-ten/run3` | W1-3, W5-1 |
| Ship-package provenance | `.devshots/fleet/package-provenance-investigation/` | W0-2's `check:render-package-pilots` |
| The deferred-spawn and allocation groups | `test/combat-fire-emit-pool`, `test/entity-spawned-batch`, still being written | W0-1, Appendix A groups 1 and 2 |

| Wave | Builders at once | Needs the machine alone |
|---|---|---|
| 0 | 2, then the two measures one after the other | yes, for W0-3 and W0-4 |
| 1 | 4 | no |
| 2 | 4 | no |
| 3 | 4 | no |
| 4 | 3 | no |
| 5 | 2 | no |
| 6 | 1 | yes |
| 7 | none | yes, the owner is playing |

---

## 2. What is true now

Working tree: this pass began at 23:30 on 11-22 on `master` at `77136bdd41` with 134 modified files
(+6,447 / −2,604) and 15 untracked paths. By 05:40 on 11-23 `master` was at `6f5928bbbb` (four plain-words
commits at 05:22) with **170 modified files (+8,171 / −3,612)**, because another of the owner's sessions
kept working. Appendix A and every number here describe the tree as it was at the start unless a row
says otherwise.

| Fact | Value | How known |
|---|---|---|
| The owner's last three sessions | 11-17: 0 s. 11-19: 2 min, 1 freeze. 11-21 00:15: 5 min, 4 freezes (three waiting on the screen's acknowledgement, one a stolen focus). Nothing since. | [measured] `npm run check:owner-session -- --all` |
| The freeze recorder on his machine | Has never run: `%APPDATA%\SpaceFace\freeze-log.jsonl` does not exist. Every freeze fix since 11-21 is unconfirmed by a real launch. | [measured] same |
| Unit tests, whole tree | 5,996 files. 72 skipped (they boot a browser). 5,924 run: **5,052 green, 842 red, 30 timed out**; 2,079 failing sub-tests. 75 minutes, machine loaded. | [measured] the sweep, now `scripts/test-sweep.mjs` |
| The same 842 with committed content | **750 still red, 72 too slow to finish, 20 green.** So about 820 are red on `master` and the uncommitted work breaks 20. | [measured] `scripts/test-sweep.mjs --head` |
| What the red on `master` is | 291 files where an expected event or beat never happens; 219 where values differ; 161 that crash on a `ReferenceError` or `TypeError` before really running; 67 wording pins; 73 too slow; 12 other. | [measured] `design/overhaul/15_RED_TESTS.txt` |
| The core tier (`npm run test:fast`) | **36 of 40** at 23:30 on 11-22 (all four red were stale tests, not gameplay bugs); **40 of 40** at 06:35 on 11-23, after another session's fixes, which sit in the uncommitted tree (W0-2). | [measured] |
| The deterministic replay (`npm run check:sim`) | Green on the working tree, uncommitted simulation edits included. | [measured] |
| Cheap static gates | **5 of 12 red at 06:41 on 11-23:** `check:save-schema`, `check:progression-verb-audit`, `check:src-reachability`, `check:colour-tokens`, `check:gate-reachability` (W0-2). `check:render-package-pilots` was red at 23:30 and is green since another session repaired the ship-package inputs. | [measured] |
| The opening capture | Last run 2026-11-20. Adventure: 6 of 13 steps, flight ready 48 s after launch. Swarm: 8 of 8 steps on the one-press route, flight ready 84 s, died in round 4. Frame rates not usable (machine loaded). | [measured] `.devshots/capture/progression-adventure`, `hud-swarm` |
| The Adventure opening on the current build | 2026-11-23 04:52, machine at 100 % from other agents: **7 of 13 steps.** Pass: look, objective, powers, the Line, mine, job, fight. **Fail: dock** ("never reached dock range… berth 1314 m, steer timeout", the fourth capture in a row over three days), station, undock; and the map key and Esc opened nothing (possibly the stuck dock approach or the load: look at the frames). | [measured] `.devshots/capture/next-run-adventure` |
| Docking on the taught route | Has failed in every Adventure capture since 11-20: the "fly to the berth" autopilot approaches and never arrives. The fix `e6c0d4b743` (11-22) did not change that. | [measured] four captures |
| The Foundry floor | Missing, black space, in the newest referee frames at rounds 6 and 12 (11-22 16:47–16:55), present at rounds 2–4 and in an earlier round-6 frame the same day. Cause not settled: the floor is built only when `swarm:arenaEntered` arrives with the Foundry's id (`renderer.js:31735`), from one emit site (`src/systems/world.js:1542`). | [reported] `.devshots/smooth/2026-11-22T21-44-53-*`; needs a look on every route |
| The Swarm opening on the current build | 2026-11-23 05:33, machine 50–83 % loaded: **6 of 6 steps** on the one-press route (the scripted player died in round 2). **Flight ready 74 s after launch** (27 s of that to the title). **Round 1 has no floor:** black space and a nebula for the whole round; the deck is back in round 2. "STALE" on screen in round 1. 26 fps average. | [measured] `.devshots/capture/next-run-swarm` |

| Smoothness, newest full referee run | 2026-11-22 16:44–17:02, on a loaded tree: Swarm Foundry r2 23 fps, r6 21.3, r12 22.6; Asteroid Mill r6 23.6; Adventure Helios 23.3. "IS IT SMOOTH: NO". No frame budget met on any route. Freeze log 0 everywhere. | [reported] `.devshots/smooth/2026-11-22T21-44-53-summary.txt`; no run in its history was on a clean committed build |
| The uncommitted tree | 13 groups (Appendix A). One proven regression: the defeated player is removed from the world, and `test/core-player-lifetime-sweep.test.mjs` fails with "defeated player must remain addressable". It passes with committed content. | [measured] both ways |
| The plan documents | The ledger was last updated 11-19, the board and the release list 11-20. Most of the release list's 142 rows were re-checked against code for this page; what has landed is in Appendix C, and the rows nobody reached are named in the briefs. | |

---

## 3. Why it still feels weak and buggy

**1. It is judged by proxies.** Days of work were ordered by frame-callback milliseconds, test counts
and document rows. The one rule says taste, not proxies. The two things that tell the truth about
the experience — a person playing, and the opening capture looked at with eyes — had not happened
since 11-20. Tonight's re-shoot of the two openings found the Swarm floor missing in round 1, a
tenfold distance error on the Adventure objective card, and a dock the autopilot does not finish.

**2. Red is the baseline.** The director's own notes record "787 test files, 0 new failures" on
11-20: the suite was already red and has been compared against itself ever since. A suite where one
file in seven fails cannot say that a change broke something, so "no new failures" has meant little
for days.

**3. Half-connected work is the norm.** The repo's first rule is "Built but unconnected is not
done." Tonight's list: `weaponShopFigures` (`src/data/gunFamilies.js:190`) with no caller
**[code]**; `plumeStutter` and `lampFlicker` (`src/render/vfx/bodyHitRead.js:176, 189`) with no
consumer **[code]**; the Bank Stream card saying "Banks off stone" with no bounce anywhere
(`src/data/weapons.js:131-137`) **[code]**; the cast announcement dropped at the worker bridge
unless an uncommitted adapter lands (`scripts/lib/simEventBridge.mjs:200`) **[code]**; four of the
five ported expeditions sitting in one derelict field competing for one slot, with probes stretched
to 900 s because offers "never arrived" **[reported]**.

**4. The fight is slow before it is anything else.** At 21–27 fps nothing feels crisp, and the
newest honest table says no budget is met.

**5. The tree is not a place to build on yet.** Thirteen groups of uncommitted work, two files that
are only line-ending flips, two junk files in the root, a vendored engine file patched, and a
simulation change that breaks death.

---

## 4. The run

Sizes: **S** an hour or two, **M** half a day, **L** more than a day or several sittings.

### Wave 0 — a tree you can trust

Do this wave first and do not overlap it with building. Everything after it depends on it.

#### W0-1 · Land or shelve the uncommitted work · mechanical · M

**The player gets:** nothing visible. The next agent gets a tree where `git status` is short enough
to read, and 6,400 lines of finished work stop being one `git clean` away from gone.

**Files:** only those in Appendix A, plus their untracked tests.

**First, find what is still moving.** Any file in Appendix A whose modification time is from the
last few hours is that session's live work. Leave it uncommitted, land everything else, and list
what was left with its latest time.

**Do, in this order:**
1. **Noise out.** `src/features/breakwaterSpur/readModel.js` and `test/breakwater-spur.test.mjs`
   differ from the commit in line endings only (`git diff -w --ignore-cr-at-eol --stat -- <file>`
   prints nothing for either) **[reported]**. Put their committed bytes back, those two paths only.
   Delete the two junk files in the repo root: `C:Users93robAppDataLocalTempalhud.txt` (a test log a
   bad shell redirect wrote on 11-22) and `nul` (a Windows reserved name; remove it as
   `rm "//?/C:/Users/93rob/Documents/GitHub/SpaceFace/nul"`).
2. **The cast-announcement adapter** (group 10). It is 37 lines and without it the Swarm round card
   and the minimap cast are silently absent on the default worker route **[code]**. Land it with a
   test that runs the ordinary worker route and shows the card.
3. **The loading movie** (group 4, ruling R25) and **the controller remap** (group 3), each as its
   own commit with its untracked test. Group 3 changes the default for every controller player
   (twin-stick), so its message says so. `src/core/gameState.js` and `src/save/saveSystem.js`
   carry hunks from group 3 and group 1: split them by hunk with a patch applied to the index, or
   land the shared files in one commit and say which groups it carries.
4. **The allocation sweep** (group 2). It is meant to be result-identical. In
   `src/combat/damage.js` check four things before landing **[reported]**: a listener that keeps the
   pooled `dp.pos` past the emit gets the next hit's position; `dp.channels` is one shared
   reference; `mergedEnvHeatOrigin` hands out a module-level scratch; `rejectedResult.impulseApplied`
   mutates what `rejected()` returns.
5. **The simulation group** (group 1) — **not as it stands.** Restore the line the working tree
   deletes from `src/core/coreSystem.js` (committed at line 823):
   `if (e && e.id === state.playerId) continue;`. Recovery at a dock revives the same body
   (`src/systems/combat.js:1153-1186`) and refuses when it is gone **[code]**. Make
   `test/core-player-lifetime-sweep.test.mjs` green again and add a test of the real path: die in
   Helios, recover at the dock. Then either finish or delete the half-built ledger in that file
   (`_deadThisTick`, `_liveCount` and `_liveAnchor` are written and never read), and stop dropping a
   failed deferred-spawn job with only a `console.error`. `check:sim` is green with this diff in
   place **[measured]**, so landing it does not move the golden.
6. **Render groups 6, 7, 8 and 9** (the pool, the ribbon-trail batch, the flight-UI sweep, the
   11-21 render work, and the 9-line hook in `vendor/three.module.js`). Three switches in group 6
   (`motionPool`, `inFileTiers`, `emptyBatches`) are on by default, showed no gain in the only
   on/off pairs taken, and leave pooled wasps on full-detail bodies (33,000 triangles for seven
   hulls) **[reported]**. Land these groups with those three switches **off** until W6-3 measures
   them. `scripts/lib/smoothCensus.mjs` goes with them.
7. **The rest**, each with its untracked test: the audio bake (group 5), the instrument fixes
   (group 11), `test/sg02-body-pool.test.mjs` (it tests a pool that is already committed in
   `6a3cb87f8f`), the loading-movie probes, and the test-only edits (group 12) after checking each is
   a real re-pin and not a loosened assertion. Move `economy-model-report/` under
   `.devshots/director/fable/econ/`.
8. **After the last commit:** `git status --short` shows nothing but the other session's files;
   `npm run test:fast`, `npm run check:sim`, `npm run check:src-syntax` are green; and of the 20
   tests the uncommitted work broke (first block of `15_RED_TESTS.txt`) none is red, or each one
   that remains is explained in the report.

**Done when:** every group is committed by exact path or named in the report as deliberately left,
with the reason.

#### W0-2 · Green the core tier and the static gates · mechanical · S

**The player gets:** a repo that can tell when something breaks.

The four test rows went green on the working tree between 23:30 on 11-22 and 06:35 on 11-23, in
edits that are not committed (one of them `test/trade-settlement-invariants.test.mjs` at 05:04). For
those the job is to find the edit, check that it states the new rule, and land it. The gate rows
were still red at 06:41.

Each, and what it is:

| Check | Why it is red | Fix |
|---|---|---|
| `test/swarm-first-throw-contact.test.mjs` (9 tests) | The harness does not provide `validateRunStateForTick`, which `src/systems/survivalAnnounce.js:171` now calls. | Give the harness the stub. |
| `test/trade-settlement-invariants.test.mjs` (2) | Pins the old rule that hold volume is the cap. Since the cargo bag, "slots are the ONLY hard admission cap" (`src/systems/economy.js:2958`). | Rewrite to the new rule: the fill is what `slotFitFor` allows, and a non-finite **slot** cache refuses the trade. |
| `test/ui-control-labels.test.mjs` (1) | Pins a key-only label for the Line; the tile now reads "RMB / P" (ruling R17). | Rewrite with the new label. |
| `test/player-counts.test.mjs` (2) | Five places glue a number to a noun by hand: `src/data/pilotTree.js:328`, `src/ui/asteroid/rockReport.js:102`, `src/ui/cargoBag.js:298`, `src/ui/galaxyMap.js:10486`, `src/world/adventureXp.js:42`. | Use `pluralWord()` / `counted()` from `src/core/numberFormat.js`. |
| `check:save-schema` | The generated schema is behind the real save shape (the five ported expeditions added state). | Regenerate, and add the migration test if the save version moved. Saves must keep loading. |
| `check:progression-verb-audit` | Two things a player can buy name behaviour that no longer exists: `impulseChargeCapacity` (gone from `src/systems/impulseCharges.js`) and `pullCollector` (gone from `src/systems/fields.js`). Three Kinetic modules (`unique_kinetic_orbital_magazine`, `unique_kinetic_aftershock_core`, `unique_kinetic_load_bridge`) implement no verb. | Build the behaviour, or take the item off every shelf. Never leave a purchase that does nothing. |
| `check:src-reachability` | `src/render/modularLegacyMountPlacement.js` has no importer. | Wire it or add it to `test/src-reachability.baseline.json` with a reason. |
| `check:colour-tokens` | 15 literal colours in `styles/ui.css` duplicate named tokens, so themes and high contrast cannot reach them. | Write the tokens. |
| `check:render-package-pilots` | Was red: "parts-rack: input descriptor is stale". Green at 06:41 on 11-23. | Nothing, unless it goes red again. |
| `check:gate-reachability` | `test/gate-reachability-contract.test.mjs` asserts the order of steps in the CI workflow file. | Make the test and the workflow agree. |

**Done when:** `npm run test:fast` prints 40 of 40 and all twelve gates in the table of section 2
exit 0, each in its own commit with the cause in the message.

#### W0-3 · The two openings, re-shot and looked at · taste · S · machine alone

**The player gets:** whatever the next waves fix. This brief is the evidence they fix it from.

1. Nothing else running: `node scripts/fleet/game-lock.mjs run -- node scripts/capture-opening.mjs --mode=adventure --out=.devshots/capture/w0-adventure`, then the same with `--mode=swarm`.
2. Open both `sheet.png` and then, at full size, the worst frame of each step. Write down, in order
   of what a stranger would hit: every second that reads as cheap, dark or broken; every step that
   failed and why; every banned word.
3. Replace the Adventure and Swarm rows of the scoreboard in `12_PIPELINE.md` §4 with the new
   numbers, with the date and the commit. A first pass taken tonight, on a loaded machine, is in
   `.devshots/capture/next-run-adventure` and `next-run-swarm`: use it as the "before", not as the
   measure.

**Done when:** the scoreboard is current and the list from step 2 is at the top of Wave 1.

#### W0-4 · One honest performance number · mechanical · M · machine alone

**The player gets:** nothing yet. Every speed claim after this is measured against this number.

`npm run check:smooth` on the committed build (all five routes), then `npm run check:no-freeze`.
Write the table into `12_PIPELINE.md` §4 next to the 11-20 measure: fps, p50 and p95, frames over
100 ms, world speed, worker step, with date, commit and other-load percentage. Traps: Foundry r2, r6
and r12 fight windows report a median of 0 ships, so a profile taken there is not a fight profile;
run-to-run noise is about ±3 fps, so judge by the milliseconds of each owner, not the fps.

### Wave 1 — the first five minutes of each door

These four start from W0-3's list. The owner's sessions were two and five minutes long: this wave is
the whole game to him.

The owner's sessions were two and five minutes long: this wave is the whole game to him. The
evidence is tonight's re-shoot of both openings on the current build (with another session's probes
loading the machine); W0-3 repeats it clean.

#### W1-1 · The Swarm floor is there in round 1 · mechanical · S to M

**The player gets:** the lit Foundry from the first second of round 1, on every route. Tonight,
round 1 was fought in black space.

- **[measured]** `.devshots/capture/next-run-swarm/frames/01-13-round-1.png` to `02-13-round-1.png`:
  the HUD says "SWARM · RICOCHET FOUNDRY · ROUND 01" over empty space and a nebula. The deck is back
  in round 2 (`02-38-round-2.png` onward). The capture of 11-20 on the same one-press route had the
  deck in round 1. **[reported]** The referee's frames of 11-22 16:47 show it missing at rounds 6 and
  12.
- The deck is built when `swarm:arenaEntered` reaches the renderer with the Foundry's id
  (`src/render/renderer.js:31735-31736`) and thrown away on return to the menu (`:22598`). The event
  has one emit site, `src/systems/world.js:1542`, carrying `state.run?.arenaId` **[reported]**.
- **Find which:** the one-press start entering flight before the listener exists or without the
  event; the uncommitted sliced sector entry (`sliceArrival`, Appendix A group 1) holding it back;
  or the dirty `renderer.js`. Do not check old commits out of the shared checkout. Instrument the
  path instead: one log line at the emit and one at the listener, run the capture, and read which
  one is missing. Then the switches in `src/render/frameCostSwitches.js`.
- **Done when:** round-1 frames of the one-press route, the Customize route, "Again" after Run Over
  and a resumed run all show the deck, three runs running.

#### W1-2 · The Foundry looks lit, and everything in it reads · taste · L (after W1-1)

**The player gets:** a room that looks the way its own loading screen shows it: light with a source,
shadows that land, a ship you find in under a second, enemies you can tell apart, and effects sized
to what caused them.

- **Shadows are off on four of five quality tiers** (`src/render/adaptiveQuality.js:102, 128, 180,
  208`; on only at `:154`) **[code]**, so most players see a lit room with no shadows. The newest
  referee run recorded `qualityPreset: low, shadows: false` **[reported]**.
- Seen in the frames of 11-22 **[reported]**: a flat olive-brown floor with faint seams and a
  furnace that lights nothing; one cream fireball about 700 × 600 px filling a third of the frame,
  against a design of two to four times the hull; rocks blown out white or reading as crumpled
  foil; enemies as blurry cyan capsules; mustard and cream pods competing with the player's ring;
  softness whenever the resolution governor sits at 0.5–0.65; the HUD over about 35–40 % of the
  frame.
- **Files:** `src/render/arenaSets/foundrySet.js`, `src/render/adaptiveQuality.js`,
  `src/render/vfx.js`, `src/render/forceLanguage/*`, the rock materials,
  `src/render/frameCostSwitches.js` (`foundryCheapMat`).
- **Do, in order:** shadows on at every tier, paid for by architecture and not by taking things
  away (R14: a fitted sun shadow, baked light in the deck, the cheap material with a judged frame
  pair); the explosion sized to its cause; rocks in stone, iron, ice and crystal; hulls told apart
  at fight distance; the player's ship the first thing the eye finds.
- **Done when:** a native-scale frame of a round-6 fight, judged beside the loading screen's key
  art, with its GPU cost inside the Wave 6 budget.

#### W1-3 · Adventure's opening: the dock · mechanical · M

**The player gets:** the taught route works: fly to the berth, dock, land in the station, undock.

- **Three clean captures failed this step on 11-20**, and tonight's did too. Tonight's last 110
  seconds were the "Flight interrupted" pause plate after another session's probe window took the
  focus, so only its first 40 seconds count **[measured]**.
- **One frame holds a plain bug** (`next-run-adventure/frames/02-46-dock.png`): the objective card
  says "Helios Station ~13 km", the minimap says "HELIOS STATION · 1.3 km", and the approach log
  says "berth 1314 m". Ten apart on one screen **[measured]**.
- **The autopilot does not close.** "AUTOPILOT to the Helios Station berth" at 194 m/s for those 40
  seconds, and the station is still 1.3 km away **[measured]**. A rock sits on the approach lane
  beside the ship with a ring drawn on it; whether a latched or towed body blocks docking was not
  checked.
- **Files:** the berth autopilot (`nav.autoTravel`, `routeFollower`, `src/ui/berthOffer.js`), the
  objective card's distance, `src/systems/world.js:3946-3955` (dock readiness), and the capture
  bot's dock step under `scripts/player-truth/` if the bot is what is wrong.
- **Done when:** three captures running pass dock, station and undock, and the card and the minimap
  agree to the last digit. If it is only the bot that cannot dock, a human hand-docks once on the
  ordinary route and says so in the report.

#### W1-4 · Into a Swarm fight in ten seconds · mechanical · M

**The player gets:** press the Swarm door and fly within ten seconds. Tonight it was **74 seconds
from launch**, 27 of them to the title; on 11-20 it was 84 **[measured]**.

- Split the 47 seconds from door to flight with the capture's boot timeline, and name each owner.
- The plan's campaign B applies: derive once, key by content hash, persist (`14_PERF_PLAN.md` §2).
  The likely owners are the Foundry set, the sim worker's warm-up (`1d87b33741`) and the ship
  packages.
- **Done when:** three cold and three warm launches, median under 10 s from door to flight and
  under 10 s to the title.

#### W1-5 · Plain words, with a check that fails the build · mechanical · S to M

**The player gets:** no internal name on screen, and numbers that agree with each other.

- Ruling R18 asks for `npm run check:plain-words`. **No such script exists.** A list sits in
  `scripts/lib/report/plainWords.mjs` with nothing gating on it, and `scripts/capture-opening.mjs`
  carries its own copy **[measured]**. The English catalogue was last regenerated on 11-20 10:17
  **[code]**.
- Still in player-facing text, counted from source strings on 11-22 **[reported]**: "Crucible"
  (`src/data/achievements.js:56-68`, `src/ui/screens/shareCode.js:97, 317`,
  `src/ui/survivalHud.js:1172`); "Repulsor" (`src/ui/captions.js:17, 282, 290`,
  `src/ui/hudAttention.js:630`, `src/data/powerPreview.js:400`, `src/data/swarmFortify.js:65`);
  "Mass Seed"; "STALE", seen in tonight's round 1; "Bay screen"; "Station wire"; "Universe seed";
  "unbound".
- **Another session is sweeping these words as this page is written:** `5623a6feef` ("bay board",
  "station comms"), `379349d1c5` ("Not set" for a key with nothing bound) and two more at 05:22 on
  11-23. Count what is left before starting, and leave its files alone.
- **Do:** regenerate the catalogue; write the check over the catalogue and the captured DOM text,
  which is the part nobody has built; clear what is left; then the units (the tenfold distance in
  W1-3).
- **Done when:** the check goes red on a planted banned word, green on the tree, and is wired into
  `check:all`.


### Wave 2 — the fight

What is already true and should not be redone: the rope never refuses; a cannon wallop moves a ship
more than a screen; the Tumbler exists; heat as rhythm is built in the simulation; recoil moves the
hull; an uncaused bump cannot kill; the camera answers only the player.

#### W2-1 · Heat you can read · mechanical, one look · S

**The player gets:** the gun that is hot says so, glows amber from 60 %, and shows its 1.2-second
lock. Today the gauge shows one number for every gun and shows a locked gun as cooling.

- The simulation's truth: the player's hot gun alone locks for `PLAYER_GUN_LOCK_S = 1.2`; released
  at `FEATHER_BAND = 0.6` or above it cools in 0.35 s (`src/systems/weapons.js:1080-1116, 1151`)
  **[code]**.
- The HUD disagrees with itself three ways **[code]**: `src/ui/weaponHeat.js` is one aggregate and
  ignores the lock; the hardpoint pips read `_overheated` and `_venting`, which the simulation never
  sets (`src/ui/orrery/hudAdapter.js:803-812`); the gauge changes tone at 0.75
  (`src/ui/orrery/flightCluster.js:725`) and the pips at 0.8. "WEAPONS VENTING" names no gun
  (`src/ui/hud.js:5346-5357`). Two readers still expect the old ship-wide vent:
  `src/ui/crucibleCombatReadout.js:62-71` and `src/audio/audioSystem.js:1623-1657`.
- **Do:** one threshold (0.6) everywhere; an amber band; per-gun lock with its countdown; the alert
  names the gun; the dry-fire clack plays during a per-gun lock. A test that pins the rule with the
  ruling (OVH-08b) in its message.

**Done when:** a frame with two guns overheating at different times reads at a glance.

#### W2-2 · Guns that do what their card says · mechanical · M

**The player gets:** no gun promises something it cannot do, and every shop card shows the five
figures that tell guns apart.

- **The Bank Stream** card says "Banks off stone" (`src/data/weapons.js:131-137`); the record has
  no bounce and its voice is the autocannon's **[code]**. Build the bounce and give it a voice, or
  change the card. Then delete the deferral notes that park the idea: "Pinball — later packet"
  (`src/data/swarmMods.js:110`), the railgun's "Skewer — later packet" forge row.
- **The railgun** kills in one shot (`86f0cd0b47`) but has no pierce of its own; only two pilot nodes
  lend it one **[code]**. Decide: native pierce through up to three targets, or none, and make the
  card true.
- **Shop figures** exist (`weaponShopFigures`, `src/data/gunFamilies.js:190`: rate, punch, reach,
  kick, sustain) with no caller **[code]**. Put them on the Swarm draft cards and in Adventure
  outfitting.
- **Pairs:** the small autocannon (damage 14, 2.2 a second, impulse 28) is a downgrade and the
  medium pulse laser strictly beats the small one **[code]**. Give each a strength that is paid for
  by a weakness.
- **The bench** still hard-codes the old 1.74-second vent (`scripts/bench-gun-curve.mjs:18, 78`)
  **[code]**. Make it read the live constant, then re-run.

**Done when:** the bench prints every banded gun passing, or names each miss as deliberate
(point-defence flak; capital-tier beams).

#### W2-3 · A ship you are shooting tells you it is dying · taste on mechanical wiring · M

**The player gets:** hits that scale with the ship's size on screen, lamps that stutter as a hull
dies, scorch that stays, no hitch on the first hit, and a word when the gun is the wrong tool.

- `plumeStutter` and `lampFlicker` are built and unused (`src/render/vfx/bodyHitRead.js:176, 189`)
  **[code]**. Wire them.
- Scars that last exist for the player's hull only (`src/combat/hullScars.js`). Enemies leave marks
  for under 8 seconds in one 32-slot ring shared by the whole scene
  (`src/render/weapons/contactMarks.js`) **[code]**. Give enemies lasting scars; grow or replace
  the ring.
- Hit streaks are a fixed world size (`src/render/vfx.js`), so a far ship flashes as big as a near
  one **[code]**. Scale by screen size.
- The first hit on a hull clones a material for each of about 85 parts
  (`src/render/hullHitFlash.js:50-63`) **[code]**. Per-instance uniform, or warm it before the fight.
- Nothing says "this gun will not get through that armour" **[code]**. One line on the target card.
- The death screen still says "Unidentified attacker" (`src/ui/screens/crucible.js:2970, 4521`) and
  "Unidentified fire" (`:2839, 2843`) **[code]**. Name the killer: a rock, a furnace, a ship.

**Done when:** frames of one enemy at 100, 75, 50 and 25 % hull, looked at, and no hitch over
16 ms on the first hit in a trace.

#### W2-4 · Enemies that tell you what they are doing · mechanical · M

**The player gets:** a Swarm round whose cast is announced on the default route, a marked ship when
a pack is called, enemies that break off when hurt, and Adventure enemies that have not noticed you.

- **The cast card** depends on the adapter landed in W0-1. Verify it on the worker route; if W0-1
  left it out, the round card and the minimap "Incoming" line are absent for every player
  **[code]**.
- **The pack caller has no mark in the world**: `pack_call` is a telegraph
  (`src/systems/survivalWave.js:2040`, `src/data/swarmCharacter.js:48`) and a HUD chip
  (`src/ui/hud.js:1413`); nothing under `src/render` draws it **[code]**. Draw it.
- **Wounded enemies never break off** on the pack brain: it has no hurt fallback, while the full
  brain has `wounded_fallback` and `wounded_corridor` **[code]**. Add it to
  `src/ai/pack/packBrain.js`.
- **Two enemy jobs were decided and not built** **[code]**: Mothlight should be *Deny* and is
  *Reach*; the brood tendril should be *Seize* and is *Rush* (`src/data/enemyJobs.js`).
- **The wasp's wind-up is 15 ticks (0.25 s)**, deliberately, because it is fodder
  (`src/data/packArchetypes.js:36-38`) **[code]**. Look at it once at gameplay zoom and confirm it
  reads as fair. If it does not, raise it and say so.

**Done when:** a round-2 capture shows the cast card, the caller's mark and a wounded wasp turning
away; a test names which brain each enemy kind runs.

#### W2-5 · Adventure enemies have senses · mechanical, large · L

**The player gets:** a calm world. In Adventure an enemy that has not seen you does not attack; one
that has, fights; one that is hurt and far from its post, goes home. Today every enemy in a sector
knows where you are from the first tick.

- There are no sense states **[code]**. `DEFAULT_SENSOR_RANGE = 1600`
  (`src/systems/aiPorts.js:52`) with no mode check at `sensorRangeFor` (`:2161`); no unaware,
  suspicious or engaged state; `src/ai/playerAwareness.js` is cloak-only. Swarm's "whole arena"
  awareness is only the arena being smaller than 1600.
- Build to ruling R15: a perception radius, an alert state, allies called within earshot, a leash
  back to the post. Adventure only; Swarm keeps whole-arena awareness. If an enemy is not attacking,
  the reason is visible in the world.
- The engagement gate already exists (`src/ai/engagementAuthority.js`); senses feed it. Do not add
  team checks to weapons (`docs/COMMON_BUGS.md` §2).

**Done when:** a test walks one enemy through unaware, suspicious, engaged and returning; a frame of
the opening minute shows nothing closing on the player; `check:sim` green or re-recorded on purpose.

### Wave 3 — the suite means something

**The player gets:** every fix after this stays fixed. The red tests are not paperwork: they are
sentences like "the convoy sold at the station", "a captain survives Continue and is delivered",
"audio destroy stops every music scheduler", "a late dock impulse revokes docking readiness". Each
one is a promise the game once made and stopped keeping, or a promise a ruling withdrew.

#### W3 · Harvest the red tests · mechanical · L · four builders, by shard

The list is `design/overhaul/15_RED_TESTS.txt`: 843 files, each tagged with where it is red and what
kind of failure. Work only the `master` and `master?` rows (823); the first 20 belong to W0-1.

**Shards** (by family, because one root cause usually breaks a whole family):

| Shard | Families (files) | Why first or later |
|---|---|---|
| A | `al-*`, `rc-*`, `next-*`, `first-*`, `starter-*`, `helios-*`, `world-*`, `save-*`, `economy-*`, `station-*` (about 100) | The first hour. Start here. |
| B | `swarm-*`, `wave-*`, `crucible-*`, `r2-*`, `arsenal-*`, `pb-*`, `sf-*`, `sfq-*` (about 75) | The Swarm run. |
| C | `anvil-*` and the orchard tests (about 70) | One family, almost every file red: find the one cause. |
| D | `ceres-*`, `charon-*`, `cinder*`, `bolus-*`, `counterweight-*` (about 55) | Story routes. |
| E | `inf-*`, `infer-*`, `nxi-*`, `m3-*`, `pro-*`, `worker-*` (about 90) | |
| F | `pq*` and `pq-*` (about 45) | |
| G | everything else (about 390) | After A–F, many will already be green. |

**For each red file, decide in this order:**
1. Does it pin a rule a ruling withdrew (the rope refusing, the old shop, the old hold-volume cap,
   "Crucible", a hold-to-accept)? **Rewrite it with the new rule in its message**, or delete it and
   name the ruling.
2. Does it crash on a `ReferenceError` or `TypeError` in its own harness? **Fix the harness.**
3. Is the promised behaviour still wanted? **It is a bug: fix the code and keep the test.**
4. Too slow to finish? Split it or move it to a slow tier. The assertion stays.

Never make a test pass by loosening what it asserts. Never delete a test without naming the rule
that replaced it. When one cause breaks a family, fix the cause and say so in the commit.

**Done when:** each shard reports green / rewritten (with the ruling) / bugs fixed (each one a line a
player would notice) / still red (why); `node scripts/test-sweep.mjs` on a quiet machine prints the
new total; and `test/tiers/fast.txt` gains the tests that would have caught tonight's regressions.

### Wave 4 — getting stronger

#### W4-1 · A Swarm run with something worth buying · taste on numbers · M

**The player gets:** Scrap that buys something they want, at a pace that makes them choose.

- **Floor shops exist only in the Foundry** (`src/systems/swarmFloor.js:421`) **[code]**. The other
  eight arenas have no mid-round spend.
- **The purse is rich and the shelves are thin.** In the 11-20 capture the scripted player held 491
  Scrap after round 1, 998 after round 2 and 3,367 at death in round 4, with wall guns at 500, the
  Crate at 950, Taps from 1,500 and the Forge at 5,000 **[reported]**.
- **Levels come too fast to choose.** Level 10 by round 4 in that capture, against a design of
  about 14 by round 10 **[reported]**. A 30-round run at that pace takes most of the 54-node tree,
  and "find your niche" is lost.
- `RUN_XP_SOURCES` (`src/core/runState.js:104`) is a dead table whose values contradict the live
  payouts; the room's 2.5× is really paid by `SWARM_ROOM_KILL_PAY`
  (`src/systems/survivalRewards.js:51`) **[code]**. Delete the dead table. Whether a boss pays its
  100 XP was not found: check, and pay it.
- **Done when:** a played run to round 10 shows at least three real choices of what to buy and a
  tree still half untaken; rounds 1–10 take the player to about level 14.

#### W4-2 · The Pilot Tree is whole; make its work branches matter · taste · M

**The player gets:** a trader, a miner and a builder with as many decisions as a gunner.

- The tree is finished as a table: **54 nodes defined, 54 live, each read somewhere**; the five
  evolutions and the six Ghost nodes included **[code]**. The old "51 unbuilt skills" row is closed.
- The branches: Guns 7, Knockback 6, Line 6, Powers 7, Ramming 8, Stealth 6, Evolutions 5 — and
  Trading 3, Mining 3, Building 3. The design gives the three work branches ten each
  (`06_PROGRESSION_AND_ECONOMY.md` §2.1) **[code]**.
- Two readers are still wired to nodes that no longer exist: `tetherGameplay.js:662` reads "Second
  Line" and `powerVerbs.js:206` reads the cut Deep Cast **[code]**. Delete them.
- **Done when:** a save at hour three has a real choice of next point on each work branch.

#### W4-3 · Trading as its own game · mechanical, then taste · M

**The player gets:** a market screen and a map that show the trend, so a route can be spotted
before it is over.

- The price model landed (`6fddfd284f`; `src/economy/marketModel.js:415-432`): a closed form of
  good, station and time; six regimes lasting 30–90 minutes; nine event types; the player's own
  trades move a price by at most 15 % **[code]**.
- **It is barely shown.** The map's Trade lens still reads remembered quotes through
  `src/ui/map/chartTradeRead.js`, and its trend is always empty **[code]**. The regime's name shows
  only with the Market Sense skill (`marketDriverPresenter.js:185, 296`); otherwise the market says
  "no news, just trading". Help gives the trading game one line (`src/ui/screens/help.js:398`)
  **[reported]**.
- **Do:** point the Trade lens at the landed model; show each good's regime and its direction to
  everyone; make the news tape about routes the player can act on; teach the game in three
  sentences on the market screen.
- **Done when:** a stranger who has not read the plan looks at the Trade tab, says which route is
  strengthening and why, and makes money on it once.

#### W4-4 · Money that adds up · taste, measured · M

**The player gets:** prices that match what an hour of work earns, from labour to capital.

- Ship prices are unchanged: 0, 15k, 28k, 35k, 95k, …, 720k, 4.2M **[code]**. No income per hour
  has been measured on the current build.
- The harnesses exist: `src/balance/courierPublicRoute.js`, `hunterPublicRoute.js`,
  `prospectorPublicRoute.js`. Run each for one simulated hour at each phase of the ladder, write
  the table into `06_PROGRESSION_AND_ECONOMY.md` §5, and set the hull and gear prices against it.

#### W4-5 · The scan payout · mechanical · S

**The player gets:** experience for what they did, not for pressing Scan.

- **[reported], verify first:** a two-second sector scan emits `poi:discovered` for every place in
  the sector at 40 XP each (`src/world/adventureXp.js`; the emits are at `src/systems/world.js:7855,
  7953`). That is 900 XP, four skill points, for one scan in the starting sector, and about 17
  points across the galaxy — against 10 XP for a kill, 60 for a job, and a design target of about
  10 points by hour three. Whether the starter ship can scan was not checked.
- **Done when:** one scan pays what one small job pays at most, and the first-hour XP table is in
  the test's message.

#### W4-6 · The cargo bag, walked · taste · S

**The player gets:** whatever the walk finds. Nobody looked at the bag on this pass.

- Walk it on the ordinary route: `I` opens the grid in flight; drag a stack out and it becomes a
  crate in space that can be roped and picked back up; on a pad and on touch, select a stack and
  press Jettison; the station's trade and storage screens show the same grid; a save from before
  the bag still loads.
- **Files:** `src/ui/cargoBag.js`, the cargo owner under `src/systems/`, `src/ui/market/*`.
- **Done when:** each of those five things is true in a frame or a test, or fixed.


### Wave 5 — Adventure's first hour

#### W5-1 · The first job, and the retired currency · mechanical, one taste call · M

**The player gets:** a job waiting on the arrival page, and no reward in a currency that no longer
exists. Docking itself is W1-3 and comes first: this brief starts when three captures running have
passed dock, station and undock.

- **The arrival page opens on the Concourse with five doors** and badges them without opening one
  (`src/ui/station/stationApp.js:1856-1858, 1911`) **[code]**. Whether the Jobs door is marked on the
  very first dock was not settled: look, and make the first job the obvious next action.
- **The first mission still pays research points** (`reward: { credits: 400, rp: 4 }`,
  `src/data/missionsData.js:2782`; "+N RP" at `src/systems/missions.js:5414`) **[code]**. R1 sent
  research points away. Remove them from pay and from the screen, and decide what the old radial
  research tree becomes now that the Pilot Tree exists.
- **The beat order** puts the free choice last, after eight taught beats (`src/systems/onboarding.js`)
  **[reported]**. A taste call: should the first paid job come earlier?

**Done when:** a first-time player docks and the Jobs door is the obvious next thing to press; no
mission offers research points; `npm run test:fast` stays at 40 of 40.

#### W5-2 · The five expeditions, spread and signposted · taste on mechanical work · M

**The player gets:** five places in the galaxy that each offer something to do, and a way to hear
about each.

- TOWJAW, BLACKBOX RUNS, GLASSWAKE and Kinetic Catalysts all sit in `sector_vesta_forge` at the
  same derelict field and compete for one ambient slot. An offer needs 7–9 minutes near the field,
  and the probes were stretched to 900 s because offers "never arrived" **[reported]**.
- **Do:** one expedition per sector, on the route a player flies; a line in a bar, a job board entry
  or a chart marker for each; an offer inside a minute of arriving. `scripts/probe-pro-five-*.mjs`
  come back to honest waits.

**Done when:** a capture or probe reaches each of the five from the ordinary route, and each is
listed on a board or chart a player can open.

#### W5-3 · The rover and the claims inside a rock · not inspected on this pass

Nobody on this pass reached the rover, the board inside a rock, claims, the belt view, the lines
between claims or the raids. Another of the owner's sessions built them on 11-21 and 11-22 and was
still probing the first ten minutes tonight. Before anyone works there, get that session's own open
list. The one question for this run comes from outside it: **does a new player find the rover in
the first hour?** If the answer needs a look: one capture that presses `B` on a small rock and
places one machine.


### Wave 6 — speed

One engineer at a time, the machine otherwise idle, each job proven by `check:smooth` before and
after on the same day. Never by making the game emptier or uglier (R14).

**Where the time goes** **[reported]**, newest full run: the frame callback is 24–29 ms at the
median; the browser's own style, layout and paint work is 7.75 ms; bloom costs 13–18 ms of GPU; the
worker step reaches 41 ms at the 95th percentile in round 12. Of 579 slow frames, 56 % have a
callback of 24 ms or more, 27 % have an idle main thread waiting on a late GPU or compositor present,
and 17 % have about 30 ms of non-script time.

| Job | What the player gets | The lead | Proof |
|---|---|---|---|
| W6-1 · Bodies stop being built during a fight | No long frame when a wave arrives | Every wasp builds a body when it spawns and another whole body each time its on-screen size changes tier (`partsLibrary.js:12291`; `startupGpuResidency.js:1358`). In Swarm, use the detail levels already inside each ship file, so a tier change is a visibility flip. | The long-frame owners table: no composition task over 4 ms in a round-2 fight. |
| W6-2 · Fewer draws per hull | A cheaper frame with the same look | Round 2, 272 draws: wasps 96, the player's Hornet 31–44, the Foundry deck 21, husk shards 18. Round 6: bastions 40, and their file has a lighter body that is never used ("no tier family"). | The census draw table, and a frame pair judged. |
| W6-3 · The pool switches, measured | Either the gain or the switches gone | `motionPool`, `inFileTiers`, `emptyBatches`: default on, no gain in the only pairs taken, pooled wasps stuck on full-detail bodies. | Two quiet on/off pairs; fix or leave off. |
| W6-4 · The callback and the bloom tail | 30 held, then 60 | Finish the callback earlier (per-frame style writers: the fuse-lamp CSS animation, `floatingText` pad labels, the speed dial); the Foundry's cheap material cut `bloomScene` from 29 to 22 ms in one A/B and needs a judged frame pair. | `check:smooth`: p95 at or under 33 ms, no frame over 100 ms, world speed 0.97 or better. |
| W6-5 · The HUD remainder | | `14_PERF_HANDOFF.md` job 3: the receipt lane and the obstacle snapshot in `src/ui/hud.js`, per-frame DOM reads in `src/ui/radar.js`. | `npm run check:ui:perf`; zero per-frame `querySelector` in a steady-flight trace. |
| W6-6 · Round 12's worker step | | The worker's 95th-percentile step is 41 ms in round 12 against a bar of 8. | `scripts/probe-worker-physics-load.mjs`. |

After these, the rest of `14_PERF_HANDOFF.md` in its own order (jobs 2, 4, 5, 6, 7, 8), and the
round-8 and round-20 scenes, which the referee has never measured.

**Done when:** on the committed build, Foundry round 2 and round 6 hold a locked 30 with p95 at or
under 33 ms, no frame over 100 ms and world speed 0.97 or better; then the 60 bar.

### Wave 7 — the owner plays

Nothing in this run is "fixed" until this has happened. Ask him, in these words:

> Launch the desktop build. Play one Swarm run through round 6 holding two keys at once. Then start
> Adventure, die once, and get back to a dock. Quit. That is all.

Then run `npm run check:owner-session`. It reads his launch log, `freeze-log.jsonl` (created by his
first launch since 11-21) and `frame-rate-log.jsonl`, and says in plain words what he got. If it
reports a freeze or a long frame, that is the next run's first job and everything else waits.

---

## 5. The queue after this run

Ranked by what a player would feel, each already scoped by tonight's pass:

1. **The fourteen enemy kinds still on the full brain** (`pack+` in `src/data/enemyJobs.js`; only
   wasp, dart and zealot run `src/ai/pack/packBrain.js`). One job, one tell, one answer each.
2. **Swarm rounds 11 to 30** are the old cast rows (`src/data/swarmCourseCast.js`); rounds 13 and 19
   use kinds ruled out of the Swarm core. Compose them, and make rounds 10 and 25 real bosses: today
   they are five ordinary elites with a trick that only works against missiles, and four escorts.
3. **The other eight arenas** have no lit set (`src/render/arenaSets/` holds only the Foundry) and no
   floor shops.
4. **Lasting damage on the player's side:** beam cuts that glow and cool.
5. **Orbit-fire against rocks and stations** (only roped hostiles get the solver's aim today).
6. **The HUD remainder and the bake cache** (`14_PERF_PLAN.md` campaigns B and G).
7. **Sound, last** (R8): thirty hero sounds, one voice per gun family, a score, 134 MB to under 20.
8. **Shipping:** controller-only and handheld, a two-hour soak in each mode, old saves, the Steam
   build, the store page, a demo.
9. **Places:** the four sky plates twenty sectors still share, the empty frontier lanes, the two Io
   places with one name.
10. **Pin and Shove read as forces** (`src/render/forceLanguage/*`). The newest frame shows Pin as a
    thin purple line, a circle and an "Anchor" chip, and Shove as scattered pink crescents **[reported]**.
11. **Thirty-three of fifty-eight microevents are unwired**
    (`design/incubator/microevent_library/INTEGRATION.md`), and 711 emitted event names have no
    listener anywhere, most of them faction-prefixed: more a deletion job than a wiring job
    **[reported]**.

---

## 6. Only the owner can settle

1. **What happens when you die in Adventure.** The committed rule keeps your defeated ship in the
   world until you recover at a dock. The uncommitted simulation work removed that and no test
   covered it. W0-1 restores the committed rule; if "your wreck stays and you wake at a dock" is not
   the game he wants, that is his call to make before W3 touches the death tests.
2. **Twin-stick for every controller player.** The uncommitted controller work changes the default
   with no switch. It should be his decision whether a pad player starts on twin-stick.
3. **Which old promises he still wants.** Wave 3 rewrites or deletes each red test against a ruling.
   The list of rewritten and deleted tests is the place to veto.
4. **Whether the 21–27 fps of the Foundry is his machine or the game.** No measurement has ever been
   taken on a real focused launch by him. Wave 7 answers it.

---

## Appendix A — the uncommitted tree, by group

From the triage pass **[reported]**; file counts checked against `git diff --stat` **[measured]**.

| # | Group | Files | State | Notes for landing |
|---|---|---|---|---|
| 1 | Deferred spawn and sliced sector entry | `src/core/coreSystem.js` (+178), `src/core/gameState.js`, `src/systems/world.js` (+219), `src/world/asteroidField.js`, `src/systems/spawnBudget.js`, `aftermathWrecks.js`, `lootShards.js`, `src/combat/killCausality.js`, `src/data/commodities.js` (a column realignment only); untracked `test/core-deferred-spawn`, `entity-destroyed-batch`, `spawn-budget-mint` | Half finished | **Not as it stands** (W0-1 step 5). Moves spawn order. |
| 2 | "Mint nothing" allocation sweep | `src/combat/damage.js` (+107), `src/systems/lawSecurity.js`, `combatOutcome.js`, `tacticalAI.js`, `src/combat/projectileFlight.js` | Looks finished | Meant to be result-identical; four checks in W0-1. |
| 3 | Controller remap (twin-stick default) | `src/systems/input.js`, `gamepad.js` (+154), `src/ui/input.js`, `confirm.js`, `screens/help.js`, `screens/settings.js`, `contextWheel.js`, `styles/ui.css`, `scripts/check-input-modalities.mjs`; untracked `test/controller-1-aim-assist.test.mjs`, `scripts/check-controller-route.mjs` | Looks finished | A default change for every pad player. |
| 4 | The loading movie plays from memory (R25) | `index.html`, `src/ui/bootMediaPlayback.js`, `test/boot-media-playback.test.mjs`, `design/overhaul/00_RULINGS.md` | Complete, with a test | |
| 5 | Audio voice bake | `src/audio/audioSystem.js` (+341), `synth.js` (+96); untracked `test/audio-voice-bake.test.mjs` | Looks finished | Performance work, not sound design. |
| 6 | Ship pool and static freeze | `src/render/partsLibrary.js`, `frameCostSwitches.js`, `vfx/quarksSystem.js`, `visualFactory.js`, `renderer.js`, `staticChildMatrices.js`, `packageCpuDetach.js`, `thruster/retroMounts.js`, `scripts/lib/smoothCensus.mjs`, `vendor/three.module.js` (+9) | Unmeasured | Three switches default on; one known bug (W0-1 step 6). |
| 7 | Ribbon-trail batch | `src/render/engineTrailSurfaces.js` (+477), `thruster/*`, `vfx.js` (+259), `actionVfx.js`, `forceLanguage/*`; untracked `test/ribbon-trail-batch.test.mjs` | Looks finished | |
| 8 | Flight-UI sweep | `shipMicroMotion.js`, `toasts.js`, `alerts.js`, `persistentBeams.js`, `comms.js`, `commsRadial.js`, `uiRoot.js`, `src/features/towjaw/presentation.js`; untracked `src/ui/contactCensus.js`, two tests | Not read | Many share one modification second: a scripted rename. |
| 9 | Render work of 11-21 | `src/main.js`, `src/features/industrialDisasters/render.js`, `farPlaneLife.js`, `parallaxLayers.js`, `feel.js`, `visualOverrides.js`, others | Not read | |
| 10 | The cast-announcement bridge adapter | `scripts/lib/simEventBridge.mjs` (+37), `src/ui/marketNews.js` | Looks finished | **Land early**: without it the round card is absent. |
| 11 | Instrument fixes | `scripts/soak.mjs`, `probe-worker-physics-load.mjs`, `probe-pro-five-*.mjs` | Looks finished | |
| 12 | Test-only edits | about 25 tests, `test/fixtures/m3-career-cohorts/cohort-report.v2.json` | Not read | Check each is a real re-pin. |
| 13 | Line-ending flips | `src/features/breakwaterSpur/readModel.js` (315/315), `test/breakwater-spur.test.mjs` (740/740) | Pure noise | Drop. `src/core/runState.js` and `test/pq-164-04-twinstick.test.mjs` are mixed: a few real lines among flips. |

Also untracked at 05:45 on 11-23: `test/combat-fire-emit-pool.test.mjs` and
`test/entity-spawned-batch.test.mjs` (groups 2 and 1, still being written); about forty `.ktx2` and
`.sha256` files under `assets/` with `scripts/encode-world-ktx2.mjs` (another session converting
world textures); `scripts/probe-demo-timings.mjs` and three `scripts/.tmp-*.mjs` probes (its boot and
load work); `economy-model-report/` (an audit's output, 11-20),
`scripts/analyze-loading-movie-freeze.mjs` and `scripts/probe-loading-movie-freeze.mjs` (freeze-lane
instruments), `test/sg02-body-pool.test.mjs`.

## Appendix B — the red tests

`design/overhaul/15_RED_TESTS.txt`, one line per file: where it is red (`master`, `master?`,
`uncommitted-work`), the kind of failure, the file, how many sub-tests fail, and the first failing
assertion. Re-measure with:

    node scripts/test-sweep.mjs --conc=12            # about 40 minutes on a quiet machine
    node scripts/test-sweep.mjs --head --conc=12 --red-from=.devshots/test-sweep/<stamp>-results.json

The first twenty lines of the list are the tests the uncommitted work breaks. Three matter beyond
their number: `core-player-lifetime-sweep` (death, above), `massline-input-grammar` and
`world-streaming`.

## Appendix C — landed since the release list (do not re-chase)

Checked against the working tree **[code]** unless marked.

- **Adventure:** the opening in sight of Helios with an establishing shot (`5124b7093c`); E never
  picks a gate (`16495f0b63`, `57d6565c35`, `1027b730ad`); the Wasp needs no research; the boot film
  is skippable (`97e951ccb2`); Adventure has the Pilot Tree (`559384fbed`, `6604dd13d2`); rocks
  regrow (`04e56773c0`, `87e3b74163`); station boards post rover, building and Field Build jobs
  (`40a28efdfc`); the rover goes down on one press (`ff3a7a067d`); claims carry a summary
  (`8edcf4dfa1` and after); the third-person camera (`02bfb40466`, `95313d214e`); the five expeditions
  are ported (`c943e36f19`, `2a3c70d222`, `10959b0738`, `39fe906efa`).
- **The fight:** the Tumbler (`b740fa368c`); the railgun kills in one shot (`86f0cd0b47`); heat as
  rhythm in the simulation (`2e297c887f`); turning while thrusting on the Standard scheme
  (`e45c8793e1`); an uncaused bump cannot kill (`a3a3668d9c`); Swarm weapon levels are off sale
  (`95cfa55db7`); recoil moves the hull (`3474e87069`).
- **Enemies:** the pack brain for three kinds (`a19025d7f6`); the composer and Swarm rounds 1–10
  (`1431703175`); lanes and chips for every doctrine (`0a469ef672`); rings and glyphs by job
  (`4671dc7ddd`, `010e88724a`); readers for the cast card and the minimap line (`678f1a9ded`,
  `6f454d30ad`), which only work once the adapter in Appendix A group 10 lands.
- **Speed and stability:** the pose table and a worker clock that never stops for acknowledgements
  (`1bd2067881` and after); quiet launches that do not steal focus (`19dbdc018b`); the pause plate on
  a lost focus (`623582184f`); GPU budget governor (`74fe37f4ab`); replies applied by the frame
  (`cb74922dcf`); mission bookkeeping coalesced (`d036746ef1`); the law arena's static matrices
  (`39ac40fb38`); live shader compiles out of play (`480f085625`).
- **The Pilot Tree is whole:** 54 nodes defined and 54 live, each read somewhere, the five
  evolutions and the six Ghost nodes included; Adventure awards experience and cards, and `T` opens
  the tree (`559384fbed`, `c98a459427`).
- **Swarm's run:** one press from the title (`97153c2063`); the shop and the refit every tenth round
  (`SWARM_DRAFT_EVERY = 10`); a room kill pays 2.5× (`src/systems/survivalRewards.js:51`); perks and
  weapon levels no longer reach a run (`fd5b4f75eb`, `95cfa55db7`); zero Scrap to start.
- **Look:** boss plates the Line can tear off (`src/systems/capitalBossEncounters.js`); Shadows Off
  holds in the Foundry (`e0dbcadcc6`); the level-up has its own feedback (`4090880a60`).
- **Interface:** the title's unfinished verbs (Sandbox, Physics Challenges and the rest) sit behind a
  dev switch (`src/ui/screens/mainMenu.js:352`); the chain tiers read STREAK; the map has four tabs
  (`756215e99d`) and agrees with the minimap (`27ed5e861c`); the cloak is on `V`.


## Appendix D — instruments

| To learn | Run | Alone on the machine | About |
|---|---|---|---|
| Which unit tests are red, and why | `node scripts/test-sweep.mjs` | yes, for comparable timings | 40–75 min |
| Is a red test red on `master`? | `node scripts/test-sweep.mjs --head --red-from=<results>` | yes | 20–40 min |
| What a stranger meets in each door | `npm run capture:opening -- --mode=adventure` (and `swarm`) | yes | 12 and 8 min |
| Is it smooth | `npm run check:smooth` (flags `--quick`, `--profile`, `--trace`, `--census`, `--routes=`, `--scheduling=`) | yes | 18 min |
| Does it freeze | `npm run check:no-freeze` | yes, through the game lock | 15 min |
| What the owner got | `npm run check:owner-session` (`-- --all` for every session) | no | seconds; reads only |
| Does the simulation replay | `npm run check:sim` | no | 51 s |
| Is the core right | `npm run test:fast` | no | 1 min |

`scripts/test-sweep.mjs`, `scripts/lib/headModeHook.mjs` and `scripts/lib/headModeHookImpl.mjs` were
added for this page and are not committed. The head mode runs every modified tracked file with its committed content, read-only: no
checkout, no second copy of the repo. It cannot speak for tests that read source files as text.
