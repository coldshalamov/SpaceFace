# Weekly Playtest Protocol

<!-- LIFETIME: ACTIVE_POLICY -->
```yaml
protocol: spaceface-weekly-playtest
owner: owner / lead developer
cadence: weekly (every Thursday/Friday)
duration: 45 minutes continuous play
route: default route (assisted flight, starter hull, production profile, no cheats)
```

## 1. Purpose

The weekly playtest is the heartbeat of SpaceFace production (reference: Supergiant Games' weekly play cadence; PQ-167). It bridges daily micro-iterations and the release gates (§15.1) by putting the owner/lead in the cockpit for a continuous 45-minute unaided run on a clean build.

No feature is complete because an agent says so. A feature is complete when the owner experiences it on the default route, telemetry records the physical verbs and funnel milestones, and defects are turned into actionable findings routed to roadmap packets.

## 2. Protocol Requirements

Every weekly playtest must strictly satisfy the following five rules:

### Rule 1 — Clean Build & Verified Baseline
- The playtest MUST run on a clean Git checkout at `HEAD`.
- Preflight gate: `npm run check:baseline` must be green before the session begins.
- The build commit hash and timestamp are recorded in the playtest header.

### Rule 2 — Exactly 45 Minutes of Play
- Session duration is 45 minutes (2,700 seconds) of active gameplay.
- Default route only: starter hull, assisted flight computer, standard camera height and settings.
- No debug hotkeys, invulnerability toggles, or dev shortcuts during the run.

### Rule 3 — Real Capture at Shipping Camera
- The session must record a visual capture (frame strip sequence, video clip, or deterministic replay seed) captured at the default shipping camera.
- Stills alone are insufficient for feel; temporal evidence proves motion, impacts, and readability.

### Rule 4 — Full Local Telemetry Session Export
- The game's local telemetry sink (`src/systems/telemetry.js`) records every event during the session.
- At session end, export the JSON and one-page Markdown session report using:
  ```bash
  node scripts/export-session-report.mjs --file <session-file> --format both --out design/program/roadmap/receipts/playtests/
  ```
- The report verifies:
  - Onboarding funnel milestones: First flight, first swing, first shove, first dock, first heat.
  - Physical verbs per hour (target floor: ≥ 240 / hr).
  - Survivability and death causes.
  - Economic flow (credits earned/spent, ore mined, trade volume).

### Rule 5 — Exactly Three Findings Routed to Packets
- Every weekly playtest MUST conclude with exactly **three** owner/tester findings.
- Each finding must name:
  1. The observed defect or friction point in player units (not engineering jargon).
  2. The causal hypothesis (why the world felt wrong).
  3. The target feel contract bar (`design/FEEL_CONTRACT.md`) or release gate (§15.1) affected.
  4. The specific roadmap packet assigned to fix it (e.g., `PQ-163`, `PQ-137`, `PQ-158`, `PQ-146`, `PQ-151`).

## 3. Storage and Archival

Playtest receipts and their associated session JSON files are archived under:
`design/program/roadmap/receipts/playtests/`

Naming convention:
- Markdown report: `YYYY-MM-DD-week-N-playtest.md`
- Telemetry JSON: `YYYY-MM-DD-week-N-session.json`

At least four consecutive weeks of verified playtests must be maintained in the receipts archive to satisfy the `PQ-167.01` release gate.

## Recording completed play

Run `node scripts/run-weekly-playtest.mjs --record --file session.json --capture capture.mp4 --findings findings.json --commit <full-build-commit> --observed-by-owner --week N`. The findings file contains exactly three objects with `observation` and `packet` fields. This imports completed play; it does not play, simulate a tester, manufacture findings, or assert a passing baseline. Demo exports are explicitly synthetic and never satisfy weekly or release gates. Preserve captures alongside the records; absent capture files leave acceptance open.
