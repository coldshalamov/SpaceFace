<!-- LIFETIME: DURABLE -->
# R1 visible gameplay bubble: ~93–125 WU normally, ~145–164 WU when physics-earned

The professional-recovery R1 scale reset supersedes the old 72-WU close chase as normal gameplay
framing. The selected base is **144 WU**, fixed-heading and position-following exactly as before. Speed
still opens the scene smoothly; a second, wider envelope is reachable only while Flight V3 reports
real physics-earned overspeed.

This document separates browser evidence from deterministic projection evidence. A source check or a
projection calculation does not substitute for the final normal-play motion clip.

## Candidate selection — real browser frames

**Captured 2026-08-08, Chrome, 1600×1000, production game route through the R0 Sandbox launcher.**
The matched candidates used the same 50-degree FOV and 60-degree fixed-heading tilt.

| candidate | route / player hull | measured player width | composition result |
|---|---|---:|---|
| 120 WU | Ceres / Hitch starter | ~16–20% | too tight for the normal recovery frame |
| 144 WU | Planet Sling / Hitch starter at ~40 WU/s | **~10.6%** | inside the R1 normal-play target; reticle remains legible |
| 144 WU | visual stress / Hornet | ~15–16% | large hull remains readable with a landmark and three-plus actor silhouettes |

The Hornet is materially larger on screen than the starter and is not the normal new-game sizing
reference. The 144-WU candidate was selected because the starter lands inside the required 8–12%
band while the stress scene still keeps the player, aiming reticle, a large structure/landmark and at
least three actors in one frame. Actor lighting and identity remain presentation work; the camera now
gives that work room to exist.

The reviewed local evidence files were:

- `.devshots/recovery/r0-ceres-pocket-live.png`
- `.devshots/recovery/r0-planet-sling-live.png`
- `.devshots/recovery/r0-visual-stress-live.png`
- `.devshots/recovery/r0-physics-swarm-live.png`

These ignored captures are evidence for candidate selection, not durable release artifacts.

## Exact R1 camera envelope — deterministic production projection

**Measured 2026-08-08 against `createChaseCamera`, 1600×1000, FOV 50, tilt 60 degrees, no threat,
tether, aim or director bias.** The real Three.js perspective camera was allowed to settle for ten
seconds, then ground-plane points were projected through its final matrix. `fwdEdge` is the greatest
distance directly ahead whose ground point remains inside the viewport.

| state | speed / hull max | provenance | settled distance | **fwdEdge** | 28-WU reference width |
|---|---:|---|---:|---:|---:|
| idle | 0× | ordinary | 126.72 WU | **93.25 WU** | 14.81% |
| ordinary max thrust | 1× | ordinary | 169.92 WU | **125.00 WU** | 11.04% |
| earned sling | 2× | `governor.physicsEarned` | 196.56 WU | **144.75 WU** | 9.55% |
| exceptional earned sling | 3×+ | `governor.physicsEarned` | 223.20 WU | **164.25 WU** | 8.41% |

The 28-WU row is a geometry reference retained from the original measurement, not a claim about every
authored hull. Runtime asset bounds are why the matched starter and Hornet browser widths above remain
the player-facing selection evidence.

### Shipped math

- Normal base: `144 WU`.
- Idle-to-hull-max factor: `0.88× → 1.18×`.
- Unearned overspeed remains capped at `1.18×`; raw speed does not fabricate physics provenance.
- Physics-earned overspeed eases from `1.18×` at 1× hull speed to a bounded `1.55×` at 3×.
- The target is sampled at 8 Hz and the actual camera distance damps at 1.4/s, so clearing earned
  provenance returns monotonically through intermediate compositions instead of cutting inward.
- Fresh GameState and every `game:new` reset use 144 WU by construction. A later explicit
  `camera:zoom` choice of 72/96/120/etc. is exact and is never remapped by the render controller.
- The camera still calls `lookAt(focus)` and never follows player yaw.

Focused behavioral proof compares the real follow controller at ordinary max, earned 2× speed and
the complete return. At 2× the settled earned distance is at least 12% wider than ordinary max; after
provenance clears, no sample rebounds outward and the camera settles within 0.5 WU of ordinary framing.

## Density assumptions after R1

World population must now be authored against the following camera-local bands:

- **0–95 WU ahead:** always visible even at rest. Put the immediate work verb, close hazard, tether
  candidate and nearest actor here.
- **95–125 WU ahead:** normal moving-play space. A local work pocket should place its primary
  structure and at least three interacting actors inside this combined band rather than distributing
  them over a sector disc.
- **125–165 WU ahead:** speed-revealed space. Use it for the next anchor, collision consequence,
  pursuit continuation or environmental payoff that earned velocity opens into view.
- **Beyond ~165 WU:** radar/map and approach content under the ordinary chase. Large/tall landmarks
  may still silhouette above the ground-plane horizon, but they do not count as immediate activity.

The new normal visible strip is roughly twice as deep as the old one, but it is still tiny relative to
jobs or structures spaced hundreds or thousands of units apart. R5/R6 Ceres work therefore still
needs deliberate camera-local pocket projection. The camera reset makes a dense pocket possible; it
does not make sector-scale scattering visible.

Draw ranges and activity counters remain insufficient evidence. An entity contributes to visual
density only when its actual bounds project into the supported camera and remain readable in motion.

## Historical baseline — superseded by R1

The pre-R1 measurement was captured 2026-08-05 in real-GPU Chrome at 1920×1080, seed 12345,
`sector_helios_prime`, with the 72-WU base:

| scenario | player speed | camera y / z | forward edge |
|---|---:|---:|---:|
| idle | 0 | 54.9 / -31.7 | 45 WU |
| cruise | 34 | 59.1 / -34.1 | 50 WU |
| cruise-boost | 53 | 59.8 / -33.8 | 45 WU |

The 28-WU player reference occupied about 23% of frame width and the strip was roughly 120 WU across
at player depth. Nearby asteroids at 678–995 WU, Local Contacts at 261–995 WU and NPC jobs at
1083–13491 WU were all outside that frame. Those observations remain valid evidence for why the reset
was necessary; their **45–50 WU density assumption is no longer current**.

The old lateral scan values of 50 / 490 / 760 remain invalid. Points near the ground-plane horizon
produced near-degenerate screen X values, so only monotonic forward scans and projected real bounds
should be used.

## Re-measurement contract

Re-run the matched browser capture and deterministic projection after any change to:

- `src/render/camera.js` base distance, speed envelope, tilt, damping or safe composition;
- default FOV;
- player ship identity or normal-route asset bounds;
- a density decision that assumes a camera-local range.

For the browser pass, record candidate/source hash, viewport, route, speed, physics provenance,
projected player bounds, actor/landmark bounds, reticle visibility and a motion segment covering
pullback plus return. Do not approve from a still alone.
