# First-hour finish line (lead, 2026-11-15)

One acceptance run decides "demo-ready": both doors, a clean profile, headed, on current HEAD, using
`scripts/fleet/looks/demo-route.mjs` (+ the load split and the staged throw fixture). A finding that
moves no row below goes on a list, not to an agent.

| Row | Target | Last measured |
|---|---|---|
| Boot → title (cold) | ≤ 15 s | 38.5 s (headed, Intel Arc, 2026-11-15) |
| Swarm PLAY → first hostile (cold / warm) | ≤ 10 s / ≤ 5 s | 53.3 s cold ("Preparing the visuals" 42.8 s) / warm: pending |
| Adventure New Game → flying | ≤ 15 s | ~30 s (OPENING-1b) |
| First flight frame → first throw, Adventure | ≤ 30 s | first latch 10.5 s; throw not yet registered |
| First flight frame → first throw, Swarm | ≤ 30 s | pending |
| Press → latch, staged fixture | ≥ 95 % | 38/40 (f4), 40/40 (f5), 16/16 (f6); wrong body 3/16 once the hostile is truly under the pointer |
| Click → throw given a live line, staged fixture | ≥ 95 % | 21/21 (f4), 13/13 (f6) on the staged hostile; worker lane 3/3 |
| Release beats flailing (kills thrown vs held, staged cluster) | thrown clearly higher, held not limp | 2.55 vs 1.46 (n=8); 3.57 vs 0.28 (n=7) |
| Clipped / overlapping on-screen strings (desktop 1280×720 and phone) | 0 | Swarm r10: ALIGN, top-centre stack: fixed, frames pending |
| Page errors / console errors on both routes | 0 | Swarm run-end crash fixed (fc7ac010); mergeGeometries warnings remain |
| Frame rate, this laptop, preset low (Adventure / Swarm r1 start → after 30 s) | ≥ 55 fps / no decay | 29 / 24 → 14 (draw calls 203 → 444, INV-05) |
| Enemies drawn as placeholder bodies at first contact | 0 | white stand-ins seen in r1–r2 (LOAD-01) |
| One clear "what next" on every frame | yes | pending |
