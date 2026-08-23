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
not reproduce them — so the real movement is **five checks closed**:

`check:market-first-loop` · `check:controls-discoverability` · `check:first-dock-handoff` ·
`check:contracts` · `check:bundle`

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
