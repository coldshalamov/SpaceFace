# Weekly Owner Playtest Report — Week 2 (2026-08-20)

<!-- LIFETIME: ACTIVE_RECEIPT -->
```yaml
packet: PQ-167.01
week: 2 of 4
date: 2026-08-20
buildCommit: bf741021
baselineCheck: green (14/14 checks pass)
duration: 45 minutes (2,700s)
tester: owner (lead developer)
route: default route (assisted flight, starter hull, production profile)
captureRef: .devshots/playtests/2026-08-20-week-2-capture.mp4
sessionJson: design/program/roadmap/receipts/playtests/2026-08-20-week-2-session.json
```

## 1. Executive Summary

Week 2 of the 45-minute owner playtest cycle. The session verified improvements from Week 1: tether swing feeling cleaner, and mining drone assists operating reliably. Total verb activations increased to 347 (462.7 verbs/hour). All five core onboarding milestones were cleared well ahead of target deadlines.

## 2. Onboarding Funnel Milestones

- **First Flight:** 0m 10s (Target: ≤ 1m 00s) — [PASS]
- **First Swing:** 1m 25s (Target: ≤ 3m 00s) — [PASS]
- **First Shove:** 3m 40s (Target: ≤ 5m 00s) — [PASS]
- **First Dock:** 6m 30s (Target: ≤ 10m 00s) — [PASS]
- **First Heat:** 11m 50s (Target: ≤ 15m 00s) — [PASS]

Secondary milestones:
- First Mine: 4m 50s
- First 1,000 Credits: 8m 10s
- First Kill: 9m 50s
- First Mission Completed: 18m 00s
- First Jump: 23m 40s

## 3. Physical Verbs & Activity Metrics

- **Total Verbs:** 347 activations
- **Verbs / Hour:** 462.7 / hr
- **Verbs / Minute:** 7.71 / min
- **Distinct Verbs Used:** 15 distinct verbs
- **Top Verbs:** `thrust` (132), `fire` (62), `brake` (36), `boost` (22), `latch` (16), `release` (15), `shove` (14)

## 4. Combat & Survivability

- **Kills:** 6 (5 fighters, 1 scout)
- **Player Deaths:** 2
  - Death 1 (15m 20s): `ship:fighter` (outflanked by Reach pursuit flight)
  - Death 2 (35m 50s): `collision:station` (over-boosted drift approach to station bay)
- **Average Lifespan:** ~18 minutes

## 5. Three Routed Findings

### Finding 1: Stunt Detector Misses High-Speed Reverse Drift Flips
- **Observation:** Performing an unassisted 180-degree flip while drifting backward at 180 WU/s fails to pop a named stunt toast.
- **Causal Hypothesis:** The stunt grammar evaluates angle delta without verifying non-zero translational drift velocity over the required angular window.
- **Feel Bar:** `CANONICAL_BUILD_MAP.md` §15.1 stunt grammar (≥ 12 named tricks).
- **Routed Packet:** `PQ-146` (Stunt grammar, moment detector, and physics trick receipts).

### Finding 2: Station Docking Aperture Camouflages Against Station Geometry
- **Observation:** Approaching the mining outpost at night, the green docking bay guidance lights blend into surrounding industrial emissives.
- **Causal Hypothesis:** Dock approach lacks a distinct optical funnel ribbon or silhouette framing contrast.
- **Feel Bar:** `CANONICAL_BUILD_MAP.md` §15.1 solid enough to understand & station approach.
- **Routed Packet:** `PQ-162` (Station interior and approach remaster).

### Finding 3: Ore Faucet Yield Scales Too Slowly in Mid-Session
- **Observation:** Common ore trading generates steady early credits, but by minute 35 the credit curve does not support purchasing tier-2 modules without grind.
- **Causal Hypothesis:** The first-hour faucet relies too heavily on raw ore volume rather than high-value discovery nodes or salvage claims.
- **Feel Bar:** `CANONICAL_BUILD_MAP.md` §15.1 economy curve (first upgrade ≤ 15m, hour-by-hour progression).
- **Routed Packet:** `PQ-155` (The honest ten-hour economy curve).
