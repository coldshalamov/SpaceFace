# 10 — Engine: fast to start, smooth to play, honest about cost

**Director, 2026-11-18.** Performance and simulation are the owner's Codex threads (owner split
2026-11-13/14; queue rows QUAL-01…09). This page states the targets the overhaul depends on, the costs
already measured, and the one architecture requirement it adds. It starts no parallel perf campaign.

## 1. Targets (doc 19, FINISH-LINE)

| Measure | Last number | Target |
|---|---|---|
| Boot → title | 38.5 s headed, Intel Arc (2026-11-15) | ≤ 10 s |
| Swarm PLAY → first hostile | 36–42 s first door, 13–15 s later doors (LOAD-03) | ≤ 5 s warm, ≤ 10 s cold |
| Adventure New Game → flying | 13.5 s (ACCEPT-05) | ≤ 10 s |
| Swarm round 20, preset low | ~26–30 fps headed (ACCEPT-05) | 60 |
| Crowded Helios, preset low | 45–52 fps (ACCEPT-04/05) | 60 |
| Console errors per run | 6–10 `mergeGeometries()` (ROCK-04 claims fixed) | 0 |

## 2. Known costs (measured by INV-08, INV-14, INV-15, INV-17, LOAD-03 — see the lead handoff memory)

- The Swarm veil waits for the whole survival cook (~36 s); Adventure lifts on a finite first picture.
- ~22 s of the first Swarm door is one-time in-session compile; later doors are 13–15 s.
- `live.postOpeningPipelines` is awaited (~8–11 s).
- Frame time in flight was dominated by style recalculation from the HUD (fixed down by STYLE-03/04)
  and a wide JS tail (timer and message churn, HUD obstacle snapshots).
- The boot film gates start-up; the movie and its playback hold should never block the game's own
  initialisation.

## 3. The requirement the overhaul adds: a Swarm run lives in its own space

`04` §6.1. No campaign entity, notice, objective, count or voice inside a run, proven by a census at
round start. INV-08 ruled out a rebuild that adds load time; the implementation is the engine owner's
choice within that budget (a dedicated arena sector with the Helios sky, or a hard filter at entity
admission). This is a correctness requirement first; it also removes campaign work from Swarm frames.

## 4. Every look item pays its way

The look recipe (`07` §2) adds a fitted sun shadow, light pools, media only where matter is, and
arena sets. Each lands with a matched before/after frame-time measurement on the owner's laptop at
preset low (quiet machine, interleaved runs — `memory: owner-perf-workflow-measure-keep`), and a
budget: shadow + bloom + media + light pools ≤ 4 ms. Instancing for arena-set props and Swarm hulls
(PERF-08) is part of building the sets, not an afterthought.
