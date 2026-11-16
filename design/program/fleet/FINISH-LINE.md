# First-hour finish line (lead, 2026-11-15)

One acceptance run decides "demo-ready": both doors, a clean profile, headed, on current HEAD, using
`scripts/fleet/looks/demo-route.mjs` (+ the load split and the staged throw fixture). A finding that
moves no row below goes on a list, not to an agent.

| Row | Target | Last measured |
|---|---|---|
| Boot → title (cold) | ≤ 15 s | 38.5 s (headed, Intel Arc, 2026-11-15) |
| Swarm PLAY → first hostile (cold / warm) | ≤ 10 s / ≤ 5 s | 34–54 s cold; warm 41.8 s (cache saves ~11 s). Swarm-only tax itemised in INV-08: survival cook 11.4 s, awaited post-opening pass 10.2 s, per-frame style recalc 10.7 s |
| Adventure New Game → flying | ≤ 15 s | ~30 s (OPENING-1b) |
| First flight frame → first throw, Adventure | ≤ 30 s | ✅ 18.2 s (opening1b-r, worker lane, clean profile); first latch 8.4 s; ACCEPT-01 headed 29.6 s before the beat-4/cue fixes |
| First flight frame → first throw, Swarm | ≤ 30 s | pending |
| Press → latch, staged fixture | ≥ 95 % | 38/40 (f4), 40/40 (f5), 16/16 (f6); wrong body 3/16 once the hostile is truly under the pointer |
| Click → throw given a live line, staged fixture | ≥ 95 % | 21/21 (f4), 13/13 (f6) on the staged hostile; worker lane 3/3 |
| Release beats flailing (kills thrown vs held, staged cluster) | thrown clearly higher, held not limp | ✅ SWING-01 node test, 10 seeds: thrown 2.1 kills of 5 (plough), held 0 kills / 277 chip damage |
| Clipped / overlapping on-screen strings (desktop 1280×720 and phone) | 0 | Swarm r10: ALIGN, top-centre stack: fixed, frames pending |
| Page errors / console errors on both routes | 0 | Swarm run-end crash fixed (fc7ac010); mergeGeometries warnings remain |
| Frame rate, this laptop, preset low (Adventure / Swarm r1 start → after 30 s) | ≥ 55 fps / no decay | 29 / 24 → 14 (draw calls 203 → 444, INV-05) |
| Enemies drawn as placeholder bodies at first contact | 0 | white stand-ins seen in r1–r2 (LOAD-01) |
| One clear "what next" on every frame | yes | pending |
