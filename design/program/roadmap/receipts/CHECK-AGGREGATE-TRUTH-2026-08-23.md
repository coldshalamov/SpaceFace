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
