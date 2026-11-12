# Weekly Owner Playtest Report — Week 3 (2026-08-27)

<!-- LIFETIME: ACTIVE_RECEIPT -->
```yaml
packet: PQ-167.01
week: 3 of 4
date: 2026-08-27
buildCommit: c4819d02
baselineCheck: green (14/14 checks pass)
duration: 45 minutes (2,700s)
tester: owner (lead developer)
route: default route (assisted flight, starter hull, production profile)
captureRef: .devshots/playtests/2026-08-27-week-3-capture.mp4
sessionJson: design/program/roadmap/receipts/playtests/2026-08-27-week-3-session.json
```

## 1. Executive Summary

Week 3 of the 45-minute owner playtest cycle. The run tested extended combat escalation, outfitting upgrades in Sector Tethys Junction, and multi-sector route navigation. Survivability was strong, with only 1 defeat across the 45-minute run. Telemetry logged 393 physical verbs (524.0 verbs/hour), maintaining high interaction density.

## 2. Onboarding Funnel Milestones

- **First Flight:** 0m 11s (Target: ≤ 1m 00s) — [PASS]
- **First Swing:** 1m 20s (Target: ≤ 3m 00s) — [PASS]
- **First Shove:** 3m 15s (Target: ≤ 5m 00s) — [PASS]
- **First Dock:** 6m 00s (Target: ≤ 10m 00s) — [PASS]
- **First Heat:** 10m 50s (Target: ≤ 15m 00s) — [PASS]

Secondary milestones:
- First Mine: 4m 20s
- First 1,000 Credits: 7m 00s
- First Kill: 8m 40s
- First Jump: 21m 20s
- First Module Purchased: 12m 40s

## 3. Physical Verbs & Activity Metrics

- **Total Verbs:** 393 activations
- **Verbs / Hour:** 524.0 / hr
- **Verbs / Minute:** 8.73 / min
- **Distinct Verbs Used:** 15 distinct verbs
- **Top Verbs:** `thrust` (145), `fire` (68), `brake` (41), `boost` (26), `latch` (19), `release` (17), `shove` (16), `trade` (14)

## 4. Combat & Survivability

- **Kills:** 8 (6 fighters, 1 gunship, 1 scout)
- **Player Deaths:** 1
  - Death 1 (30m 20s): `ship:heavy` (heavy cruiser broadside during Wanted Tier 2 law enforcement response)
- **Lifespan:** 30m 20s first life, 14m 40s second life

## 5. Three Routed Findings

### Finding 1: Wanted Heat Tier 2 Hunter Aggression Ramps to Instant Ambush
- **Observation:** Escaping Tier 2 Wanted heat feels like an abrupt DPS wall rather than a cinematic chase through terrain.
- **Causal Hypothesis:** Law enforcement spawns directly in combat range rather than vectoring in from edge coordinates with visible radar telegraphs.
- **Feel Bar:** `CANONICAL_BUILD_MAP.md` §15.1 BETA gate (wanted loop has four tiers with a physical escape at each).
- **Routed Packet:** `PQ-151` (The wanted loop as a game: four tiers, four escapes).

### Finding 2: Free-Floating Cargo Containers Lack Visual Mass Inertia
- **Observation:** When cargo spills from a defeated hauler, scooping and towing containers feels like nudging hollow cardboard boxes.
- **Causal Hypothesis:** Cargo canisters use minimal collider restitution and lack momentum transfer to the tow cable.
- **Feel Bar:** `CANONICAL_BUILD_MAP.md` §15.1 BETA gate (cargo is physics, PQ-148).
- **Routed Packet:** `PQ-148` (Cargo is physics: hold, sling, spill, secure).

### Finding 3: Controller Thumbstick Deadzone Lacks Micro-Aiming Resolution
- **Observation:** Fine aiming adjustments on gamepad thumbstick feel stepped rather than progressive, making precision shots at distance frustrating.
- **Causal Hypothesis:** Input mapping applies an aggressive radial deadzone cutoff without a non-linear response curve.
- **Feel Bar:** `CANONICAL_BUILD_MAP.md` §15.1 controller parity in every screen.
- **Routed Packet:** `PQ-164` (Input truth: controller, Deck, trackpad, haptics).
