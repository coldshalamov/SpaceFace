# RECEIPT — what `npm run check` actually checks, 2026-08-23

**Finding:** the master check aggregate has **111 steps** and stops after **25**. The remaining
**86 have never run as part of it**. Run independently, the true state of the suite is
**88 pass / 25 fail**.

---

## 1. Why nobody noticed

`scripts.check` is a single `&&` chain. Step 6 (`check:depth-program:contracts`) fails on a hash
mismatch inside `test/depth-program-encounter-loader.test.mjs`, and the chain stops there. Everything
after it is unreachable — not skipped, not reported, simply never executed.

The failure output looks exactly like *one* broken thing. It is in fact one broken thing plus 86
unknowns, and that shape is indistinguishable from the outside.

This is the same class of defect the build map already records twice: a green check that inspects a
convenient stand-in. Here the check is red, and the damage is the opposite — a red aggregate hides how
much it never looked at.

## 2. Method

`.devshots/suite-truth.txt` is produced by running **every step of the chain independently**, in
order, with a 300 s cap each, recording the real exit code of every one:

```
node -e "extract every `npm run X` and `node scripts/Y` from scripts.check"   # 98 + 13 = 111
for each: run it alone, record PASS/FAIL, duration, and first error line
```

Independence is the whole point: a `&&` chain reports the first failure, never the population.

## 3. Result

**88 pass / 25 fail.** The 25:

| Check | Fails on |
|---|---|
| `check:depth-program:contracts` | seeded 60-schedule matrix hash drift |
| `check:alpha:evidence:contract` | `00_CONSTITUTION.md` authority chain heading |
| `check:alpha:baseline:contracts` | `onShow` draws before the cadence boundary |
| `check:sg02` | body spec exposes non-save-safe physics fields |
| `check:sg06` | hidden player state read |
| `check:title-continue-runtime` | summary picks the wrong save slot |
| `check:controls-discoverability` | tether HUD does not signal line-control mode |
| `check:new-game-first-run` | headless CI layout |
| `check:first-dock-handoff` | onboarding copy names the wrong rail |
| `check:mission-handoff` | timeout |
| `check:mission-cargo-loading` | flight HUD objective missing the loaded contract |
| `check:first-15-runtime` | B0 sample not on thrust |
| `check:market-first-loop` | docked view does not show credits |
| `check:contracts` | — |
| `check-gameplay-core.mjs` | drill input rejects the live `tether_standard` id |
| `check:47a:tactics` | `covert_courier` does not resolve `deliver_to_contact` |
| `check:47a:live-branch` | same, without a `scenarioBranch` command |
| `check-phase0-slice-contract.mjs` | unclassified `Math.random` in `asteroidRenderer3d.js:2043` |
| `check:flight:clean` | **console-warning flood only** — see §5 |
| `check:atlas` | fail-closed assertions |
| `check:art` | kestrel missing `spacefaceAsset` extras |
| `check:bundle` | — |
| `check:perf-packets` | — |

Plus two lines whose script name spans a wrapper (`New`, `production`).

## 4. None of these are from this session's work

Established structurally, not by hope.

- **`depth-program:contracts`** — its five direct imports were walked to a **transitive closure of 184
  modules**. The intersection with this session's 50 changed files is **empty**. The five seed files
  were last touched 2026-07-27 … 2026-08-12.
- **`check-phase0-slice-contract.mjs`** names `src/ui/asteroid/asteroidRenderer3d.js:2043`. That file
  is **not in this session's diff at all**, and was last written by `22dc978f` on 2026-08-22 — the
  previous session.
- **The remainder** fail in domains this session never touched: constitution headings, save-slot
  summaries, mission handoff, onboarding beats, market copy, drill ids, scenario resolution, atlas,
  art export, bundle, perf packets.

## 5. `check:flight:clean` is red for a reason worth stating separately

Every behavioural assertion in it **passes**: `rightBanksRight`, `leftBanksLeft`, `releaseStopsSpin`,
`strafeDoesNotYaw`, `throttleMovesShip`, `boostAccelerates`, `reverseUsesBrakeIntent`, `reverseBrakes`,
`tapDashFires`, `runtimeModeSwitchAffectsAssist`, `diagnosticsAvailable`, `sg02DynamicReady`,
`canvasNonBlank`, `noPageErrors` — all true.

It fails on `noConsoleWarnings` alone, with **4,212 warnings, all the same line**:
`THREE.Texture: Unable to serialize Texture.` That warning was already flooding the first
`check:playable` run of this session, before anything was edited.

So the flight gate is not reporting a flight defect. It is reporting one noisy Three.js warning
multiplied four thousand times against a `--strict-warnings` flag.

## 6. What this costs, and the cheapest repair

While the chain stops at step 25, a developer can land anything that breaks steps 26–111 and see a
failure identical to the one that was already there. The suite cannot distinguish "you broke
something" from "the thing that was already broken is still broken".

The repair is not to fix all 25 — several are real work owned by other lanes. It is to make the
aggregate **report the population instead of the first casualty**: run every step, collect results,
fail at the end with a list. `.devshots/suite-truth.txt` is that output today, produced by hand.

Until then, treat `npm run check` as covering the first 25 steps only, and use the per-check names
directly for anything after that.

## 7. Verified green in this session

`check:draw-to-fly` (20), `check:colour-tokens`, `check:type-floor`, `check:arcade-structural-fx` (11)
and `check:gate-reachability` are steps 107–111 — i.e. **inside the unreachable tail**. Each passes
when run directly, and each was additionally mutation-tested. `check:playable` is not in the aggregate
at all and passed 15/15 after every change this session.

---

## 8. Addendum — four of the 25 closed, and what they taught

Worked the same session. **Four of the twenty-five are now green**, and the interesting part is that
**three of them were never game defects at all.**

| Check | Was red because | Fix |
|---|---|---|
| `check:market-first-loop` | queried `.sx-credits__v` — a selector from a superseded design that no JS in `src/` has ever emitted | point at `.sxb-purse__value`, which reads "12,453" live |
| `check:controls-discoverability` | the tether line-control key hint **genuinely did not exist** | build it |
| `check:first-dock-handoff` | asserted the copy against `onboarding.js`; the copy lives in `hudAttention.js` | point at the file that owns the words |
| `check:contracts` | three UI panels got wired and the reachability ratchet was not updated | remove the stale exceptions |

### The root cause behind three of them

A superseded `sx-` station design. Selectors and copy moved — `sx-credits` → `sxb-purse`,
`sx-hstep` → `sxb-hstep`, first-use lines → `hudAttention.js` — and the checks did not follow. The
style layers for the dead components were still present too, fully authored, for markup that does not
exist: `.sx-credits` carried flex layout, an icon colour, a tabular-numeric value, a unit, a
`content:"CREDIT LINE"` label and a drop-shadow, across **two** stylesheets.

### The discipline that matters here

**Prove the feature works before calling a check stale.** `.sxb-purse__value` was read live in the
station lab — "12,453" under a "Credits" label — before either the check or the CSS was touched.

Because the opposite case is real and looks identical from the outside:
`check:controls-discoverability` was red for a **feature that was genuinely missing**. The string it
demanded was absent from `hud.js` entirely, and the right response was to build the thing, not to
repoint the assertion. Same symptom, opposite fix. Getting that backwards would have deleted a
real requirement and shipped a HUD that still hides the game's signature verbs.

### One more hidden-behind-a-failure case

Clearing `check:contracts`' three stale exceptions immediately exposed four more unreachable modules
(`backendDecision`, `webgpuPresent`, `batchedInstanceRenderer`, `presentPhaseTimers`) that the stale
error had been masking — the same shape as this whole receipt, one level down. All four are live
staged work: each has its own gate, all of which still pass, and each is now baselined with a
concrete reason and date rather than a shrug.

### Closing state, measured with `check:all` itself

```
93 pass / 18 fail of 111 steps
```

Up from **88 / 25** at the start of the session. Two of that original 25 (`New`, `production`) were
parse artifacts of the hand-rolled expansion — `check-all.mjs` splits the chain correctly and does
not reproduce them — so the real movement is **four checks closed**:

`check:market-first-loop` · `check:controls-discoverability` · `check:first-dock-handoff` ·
`check:contracts`

**`check:bundle` was wrongly listed as a fifth and is corrected here.** Re-run directly it exits 1,
and the reason is the machine rather than the code: `ENOSPC: no space left on device` while copying
assets into `build/web.__building`. **The disk is 100% full — 613 MB free of 944 GB**, with
`.devshots/` alone holding **6.5 GB** of gitignored capture artifacts (`perf` 2.6 G,
`pq017-world-site` 993 M, `station-polish` 410 M …). It passed earlier in the same session and failed
later, which is what a filling disk looks like.

Worth recording how the bad claim arose, because it is a reusable trap: the hand-rolled expansion
grepped the first line matching `/error|assert|fail/i` out of each step's output, and a `node --test`
summary contains the literal line `ℹ fail 0`. So passing runs were captured with a "first error" that
was actually a **pass** line — `check:bundle`, `check:perf-packets` and `check:depth-program:contracts`
all show that shape in `suite-truth.txt`. `check-all.mjs` reports on the **exit code** and does not
have this problem; the hand-rolled predecessor did.

The remaining 18 run and report every time now, which is the point: a failure list is a thing you can
work through, and the first casualty of a `&&` chain is not.

| Still red | Domain |
|---|---|
| `check:depth-program:contracts` · `47a:tactics` · `47a:live-branch` | scenario / encounter data |
| `alpha:evidence:contract` · `alpha:baseline:contracts` | documents + cadence contract |
| `sg02` · `sg06` | physics save-safety, hidden state reads |
| `title-continue-runtime` · `new-game-first-run` · `first-15-runtime` | save slots, first-run layout, onboarding beats |
| `mission-handoff` · `mission-cargo-loading` | missions |
| `check-gameplay-core.mjs` · `check-phase0-slice-contract.mjs` | drill ids, unclassified `Math.random` |
| `check:flight:clean` | the 4,212-warning flood, §5 — not a flight defect |
| `atlas` · `art` · `perf-packets` | assets, export, packaging |

None is in this session's diff.

---

## 9. The queue is stale in BOTH directions

Recorded here because the queue is the instrument the next agent uses to choose work, and it is
currently wrong in the two ways that waste the most time.

**Marked done, was broken.** `PQ-007` ("Restore auto-target and direct draw-to-fly control") carried
state `integrated` with a route-acceptance receipt, while the feature was 50–64 WU off the player's
drawn line on every curve. Its acceptance measured nothing about the geometry — the fixture asserted
that *some* command was emitted on a two-point straight line. Repaired this session; an addendum on
`PQ-007-route-acceptance-REPORT.md` records what the acceptance missed and why.

**Marked open, is built.** `PQ-133.01` (Combat Lab extension) and `PQ-133.02` (Ten-wave shell) both
read `ready`, while `npm run check:crucible:route` passes **13/13** — draft, results with an
accountable death line, and same-seed restart all working — against eight `survival*` modules and a
`survivalWaves` data set that exist on master.

Their states are **left alone deliberately**. `.02` is well evidenced by that route check; `.01`
(Combat Lab) was not separately verified here, and flipping a queue state on partial evidence is the
same failure as the hollow acceptance directly above it. The discrepancy is recorded instead, so the
next agent checks before either implementing what exists or trusting what does not.

**The general rule this session kept re-learning:** a state, a check name, or a receipt is only as
true as the weakest assertion behind it. Run the unit's own declared checks before believing its row.

---

## 10. `check:all` is contention-sensitive, and that limits what its tally means

A second full run after the four-lane pass returned **91 pass / 20 fail**, which looks worse than the
88/25 it started from. It is not. Re-run **individually**, several of those "failures" pass:

| Step | In the suite | Alone |
|---|---|---|
| `check:command-deck-ui` | FAIL | **PASS** |
| `check:bar:mission-readiness` | FAIL | **PASS** |
| `check:title-continue-runtime` | FAIL | **PASS** |
| `check-ui-screen-imports.mjs` | FAIL | **PASS** |

Running 111 steps back to back leaves browsers alive and disk consumed. During that second run the
machine carried **17 live Chrome processes** and the disk sat at **100% (601 MB free of 944 GB)** —
reclaiming `build/web` took it back to 1.3 GB and had already been the difference between
`check:bundle` failing on `ENOSPC` and passing.

**So the population tally is reliable for the non-browser steps and advisory for the browser ones.**
That is still strictly better than a chain that reports one failure and hides eighty-six, but it is
not a number to quote without saying which kind of step it counts.

### A worked example of how easily this misleads

`check:market-first-loop` failed twice at HEAD and passed once with three files reverted, which reads
like a clean bisect and is not one — **the reverted state then failed on its own next run.** The check
is FLAKY on this machine under this load, and two single-sample runs had nearly produced a confident
and wrong attribution to the delegated lanes. A bisect over a flaky test measures the flakiness.

The three gates that lane closed (`title-continue-runtime`, `new-game-first-run`, `first-15-runtime`)
each pass individually, and `check:playable` is 15/15, so the work stands. The honest statement about
`market-first-loop` is that its status here is **unknown under contention**, not regressed.

**Rule for the next session:** run browser checks alone, and never attribute a browser check's result
from a single run.

---

## 11. Second orchestrated round, and the disk is now the dominant variable

Six delegated lanes ran in total across two rounds (grok via Cursor, grok CLI, GLM, Kimi, and a
Codex review). Measured **individually** — because the suite run is contention-polluted, §10 — the
previously-failing set now stands at **10 passing, 11 still red**:

**Now green:** `alpha:evidence:contract` · `contracts` · `title-continue-runtime` ·
`new-game-first-run` · `first-15-runtime` · `mission-cargo-loading` · `mission-handoff` ·
`market-first-loop` · `check-phase0-slice-contract` · `bundle`

**Still red:** `depth-program:contracts` · `alpha:baseline:contracts` · `sg02` · `sg06` ·
`perf-packets` · `atlas` · `art` · `flight:clean` · `47a:tactics` · `47a:live-branch` ·
`check-gameplay-core`

Several of the still-red were advanced past their FIRST failure to a deeper one — `sg02`, `sg06` and
`depth-program:contracts` each now fail on an assertion that was previously unreachable, which is
progress that a pass/fail column cannot show.

### FOUR of the ten were never game defects

`mission-handoff` was not broken at all: run alone it completes the full loop, and its TimeoutError
only appears when two headless Chromiums overlap. `mission-cargo-loading`, `market-first-loop` and
`first-dock-handoff` were checks hunting for a superseded design's selectors and copy. A lane that had
no reason to look for the contention effect found it independently, which is the strongest form the
evidence could take.

### THE DISK IS NOW THE BINDING CONSTRAINT, and it corrupts measurements

Free space on the 944 GB volume moved like this during the session:

```
613 MB  ->  check:bundle failing on ENOSPC
1.3 GB  ->  after reclaiming build/web            check:bundle PASSES
 61 MB  ->  after one individual-check sweep      bundle and mission-handoff both FAIL
697 MB  ->  after reclaiming build/web again      both PASS again
```

Every browser check writes artifacts, so **running the suite consumes the space that the suite needs**.
Some of the eleven red results above were measured at 61 MB and are therefore not trustworthy as
failures; they need re-running with room.

`.devshots/` holds **6.5 GB** of gitignored capture evidence (`perf` alone is 2.6 GB) and `assets/` is
21 GB. `build/` regenerates and was reclaimed twice here. **Pruning the evidence is an owner decision,
not a cleanup** — receipts cite some of it — but until the volume has headroom, no check result on
this machine should be quoted without stating the free space it was measured at.
