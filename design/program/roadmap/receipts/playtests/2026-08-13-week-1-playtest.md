# Weekly Owner Playtest Report — Week 1 (2026-08-13)

<!-- LIFETIME: ACTIVE_RECEIPT -->
```yaml
packet: PQ-167.01
week: 1 of 4
date: 2026-08-13
buildCommit: a89f31c4
baselineCheck: green (14/14 checks pass)
duration: 45 minutes (2,700s)
tester: owner (lead developer)
route: default route (assisted flight, starter hull, production profile)
captureRef: .devshots/playtests/2026-08-13-week-1-capture.mp4
sessionJson: design/program/roadmap/receipts/playtests/2026-08-13-week-1-session.json
```

## 1. Executive Summary

Week 1 of the formal 45-minute owner playtest cycle. The run started from a fresh save in Sector Helios Prime, completing the initial flight orientation, tether attachment, mining, early combat skirmishes, and a hyperspace jump to Ceres Belt. Telemetry aggregates recorded 309 player physical verb activations across 45 minutes (412.0 verbs/hour), comfortably exceeding the 240 verbs/hour baseline floor.

## 2. Onboarding Funnel Milestones

All 5 core onboarding milestones were achieved within standard pacing targets:
- **First Flight:** Reached at 0m 14s (Target: ≤ 1m 00s) — [PASS]
- **First Swing:** Reached at 1m 50s (Target: ≤ 3m 00s) — [PASS]
- **First Shove:** Reached at 4m 40s (Target: ≤ 5m 00s) — [PASS]
- **First Dock:** Reached at 8m 10s (Target: ≤ 10m 00s) — [PASS]
- **First Heat:** Reached at 13m 40s (Target: ≤ 15m 00s) — [PASS]

Secondary milestones:
- First Mine: 6m 00s
- First 1,000 Credits: 10m 20s
- First Kill: 12m 00s
- First Jump: 28m 00s
- First Rep Tier-Up: 32m 00s

## 3. Physical Verbs & Activity Metrics

- **Total Verbs:** 309 activations
- **Verbs / Hour:** 412.0 / hr
- **Verbs / Minute:** 6.87 / min
- **Distinct Verbs Used:** 15 distinct verbs (`thrust`, `brake`, `boost`, `latch`, `reel`, `release`, `throw`, `shove`, `well`, `stroke`, `fire`, `dock`, `mine`, `trade`, `jump`)
- **Top Verbs:** `thrust` (118), `fire` (58), `brake` (32), `boost` (18), `release` (12), `shove` (11)

## 4. Combat & Survivability

- **Kills:** 5 (4 fighters, 1 scout)
- **Player Deaths:** 3
  - Death 1 (12m 40s): `ship:fighter` (Reach interceptor in contested transit corridor)
  - Death 2 (25m 40s): `collision:asteroid` (high-speed rebound clip while tethered)
  - Death 3 (40m 10s): `ship:fighter` (pirate skirmish near Ceres perimeter)
- **Average Lifespan:** ~14.5 minutes

## 5. Three Routed Findings

### Finding 1: Opening Tow-Rig Shove Requires Real Force Feedback
- **Observation:** The opening drill teaches latching and cutting, but shoving derelicts or rocks feels weightless with the starter pulse gun plink.
- **Causal Hypothesis:** The starter pulse gun imparts negligible impulse (`impulsePerHit: 0.5`), forcing the player to treat weapons purely as DPS rather than physical tools.
- **Feel Bar:** `FEEL_CONTRACT.md` Bar B4 (shove magnitudes) & §15.1 first ten minutes.
- **Routed Packet:** `PQ-163` (The first ten minutes: the power fantasy, honest).

### Finding 2: Governor Counterthrust Fights Pilot Circling Intent
- **Observation:** When attempting a tight high-speed orbit around an asteroid anchor, assisted counterthrust attempts to kill lateral slip rather than letting the pilot bank through.
- **Causal Hypothesis:** Flight computer assisted mode applies aggressive neutral damping before recognizing active line tension.
- **Feel Bar:** `FEEL_CONTRACT.md` Bar B2/B3 (nimble regime).
- **Routed Packet:** `PQ-137` (Combat and flight feel fundamentals).

### Finding 3: Asteroid Surface Collisions Lack Heavy Acoustic Thump
- **Observation:** Glancing off a 100-ton asteroid at 80 WU/s produces screen shake but only a tinny impact sound.
- **Causal Hypothesis:** Sound selection does not scale by collider mass product (`mass * deltaV`), flattening impact perception.
- **Feel Bar:** `FEEL_CONTRACT.md` Bar B9 (impacts answer by weight).
- **Routed Packet:** `PQ-158` (Audio direction & impact ladder).
