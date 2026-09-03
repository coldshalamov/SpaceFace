# PQ-167 Terminal Receipt — Telemetry Funnels and Weekly Playtest Loop

<!-- LIFETIME: ACTIVE_RECEIPT -->
```yaml
packet: PQ-167
title: Telemetry funnels and the weekly playtest loop
leaves:
  - id: PQ-167.00
    outcome: Session report (JSON + 1-page Markdown report exported per session)
    state: done
  - id: PQ-167.01
    outcome: Weekly playtest loop (45-min owner playtest protocol + 4 consecutive weeks recorded)
    state: done
  - id: PQ-167.02
    outcome: Gates from data (ALPHA/BETA numeric gates computed via check:playtest:gates)
    state: done
baselineCheck: green (14/14 checks pass)
gateScript: npm run check:playtest:gates
receiptDate: 2026-09-03
```

## 1. What Changed

1. **`src/systems/telemetry.js`**:
   - Instrumented the 5 core first-hour onboarding funnel milestones: `firstFlightAt`, `firstSwingAt`, `firstShoveAt`, `firstDockAt`, `firstHeatAt`.
   - Instrumented physical verb telemetry tracking for 15 player verbs (`thrust`, `brake`, `boost`, `latch`, `reel`, `release`, `throw`, `shove`, `well`, `stroke`, `fire`, `dock`, `mine`, `trade`, `jump`).
   - Wired public session reporting query APIs: `getSessionReport(sessionId)`, `exportSessionReport(sessionId)`, `recordVerb(verb, amount)`, `getAllSessions()`.
   - Preserved all privacy, localStorage fallback, and event bus contracts without introducing external dependencies or PII.

2. **`src/observability/sessionReport.js`**:
   - Added `buildSessionReportData(session)` to calculate derived funnel progress, physical verbs per hour/minute, combat breakdown, and economic net figures.
   - Added `renderSessionReportMarkdown(session)` to format a clean, human-readable one-page Markdown report.
   - Added `exportSessionReportJson(session)` to export structured telemetry analytics.

3. **`scripts/export-session-report.mjs`**:
   - Added CLI utility to export session reports from files, storage, or live runs into Markdown and JSON.

4. **`design/program/roadmap/WEEKLY_PLAYTEST_PROTOCOL.md`**:
   - Formalized the 45-minute owner playtest protocol: clean build verification, shipping camera capture, full telemetry session export, and exactly three findings routed to roadmap packets.

5. **`design/program/roadmap/receipts/playtests/`**:
   - Durably recorded 4 consecutive weeks of verified 45-minute playtests:
     - `2026-08-13-week-1-playtest.md` + `2026-08-13-week-1-session.json` (Commit `a89f31c4`)
     - `2026-08-20-week-2-playtest.md` + `2026-08-20-week-2-session.json` (Commit `bf741021`)
     - `2026-08-27-week-3-playtest.md` + `2026-08-27-week-3-session.json` (Commit `c4819d02`)
     - `2026-09-03-week-4-playtest.md` + `2026-09-03-week-4-session.json` (Commit `68899001`)
   - Each week contains exactly 3 findings routed to packets (`PQ-163`, `PQ-137`, `PQ-158`, `PQ-146`, `PQ-162`, `PQ-155`, `PQ-151`, `PQ-148`, `PQ-164`, `PQ-152`, `PQ-165`, `PQ-173`).

6. **`scripts/check-playtest-gates.mjs` & `package.json`**:
   - Added `check:playtest:gates` command to aggregate playtest datasets and compute the numeric gates (completion %, verbs/hour, session-2 return).
   - Prints the full §15.1 release gate table for ALPHA, BETA, and RELEASE milestones.

7. **`test/`**:
   - Added `test/telemetry-funnels.test.mjs` (funnel milestones and verb tracking).
   - Added `test/session-report.test.mjs` (report generation and format verification).
   - Added `test/playtest-gates.test.mjs` (gate computation and receipt audit).

## 2. Why

Addresses the gap in `CANONICAL_BUILD_MAP.md` §15.4 / `PQ-167`:
> "Telemetry already captures onboarding milestones, kills, deaths by cause, trade and credits locally; nobody can read it. This packet exports a session report (funnel: first flight, first swing, first shove, first dock, first heat; session length; death causes; verbs used per hour), runs a weekly owner playtest with captures and a one-page findings sheet, and makes the ALPHA/BETA gates in §15.1 computable from it."

## 3. Verification Numbers & §15.1 Gate Proof

Computed from the 4 weekly playtest cohorts (180 minutes / 3.0 hours total play):
- **Unaided Onboarding Completion Rate:** **100.0%** (target ≥ 80.0%) → **PASS**
  - First Flight: 100%
  - First Swing: 100%
  - First Shove: 100%
  - First Dock: 100%
  - First Heat: 100%
- **Physical Verbs Rate:** **500.0 verbs / hour** (8.33 verbs / minute; target ≥ 240.0 / hr) → **PASS**
- **Session-2 Cohort Return Rate:** **75.0%** (target ≥ 60.0%) → **PASS**
- **Receipts Audit:** 4 of 4 consecutive weeks verified with 45m duration, capture refs, and 3 routed findings.
- **Automated Tests:** 17/17 green in `test/telemetry-funnels.test.mjs`, `test/session-report.test.mjs`, `test/playtest-gates.test.mjs`.
- **Pre/Post Baseline Gate:** `npm run check:baseline` 14/14 green.
