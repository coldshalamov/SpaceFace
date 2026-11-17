# LOAD-02 — Swarm's veil lifts on a first-picture set, like Adventure (flagged, measured)

Read first, fully: `.devshots/fleet/runs/INV-17-what-the-swarm-veil-waits-for.grok.*/RECEIPT.md` (gate chain, history, recommendation)
and `.devshots/fleet/runs/INV-08-*/RECEIPT.md`. Today Swarm's veil waits ~36 s for the whole survival cook inside
`prepareLiveSectorBeforeFlight`; Adventure lifts on `live.requiredFirstPicture` (`src/render/renderer.js` ~13976) at ~6.3 s.

## Build (behind a URL flag `?swarmFirstPicture=1`, default OFF until measured)
On `survivalRunHoldsArena`, return from `prepareLiveSectorBeforeFlight` after a first-picture barrier shaped like Adventure's,
containing exactly (per INV-17's history):
- the player hull incl. its living-hull depth variant;
- the round-1 on-glass roster (the opening Wasps — already authored at 5–7 s with `pendingPools` 0);
- the room in view: floor pads and in-view arena debris (NOT Helios stations/wrecks/places outside the glass);
- in-view rock variant keys only (not all ~2000 rock-pool issues).
Let `preparePostOpeningPipelines` and `live.materialSettle`'s hidden stragglers and the off-view rock keys continue after
the return. Keep the Crucible 500 ms cap (`src/ui/loadingPresenter.js` ~451). Stamp `firstPlayableFrameAt` as today
(otherwise the 15 s failsafe dumps deferred compiles). Do not change Adventure.

## Measure (one lock hold; never kill a holder you did not start)
Three interleaved runs per arm (flag off / on), cold, same build, with a fixed-workload calibration before each run (see
INV-13's receipt). Per run: PLAY → veil lift, PLAY → first hostile, and in the first 30 s after the lift: shader-link
count, Wasp links, rock links, frames > 100 ms (and worst frame). Baseline to stay within (INV-17, flag off): 121 non-rock
links, 12 Wasp links, 0 rock links, 2 frames > 100 ms (worst 283 ms). The regressions history names (must not return): a
multi-second brick at first draw, ≥ 78 ms admission frames repeatedly, ~460 ms shader links, the 15 s failsafe dump.
If flag-on cuts PLAY → first hostile substantially and stays inside the baseline, flip the default ON in the same commit
series and say so; if not, leave it OFF and report why.
Tests for the gate (node, where the cook can be stubbed); `npm run check:sim` green. Exact-path commits; renderer.js has
other writers — use own-commit.sh. Report the per-run table.
