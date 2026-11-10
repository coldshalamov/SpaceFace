Done — both residuals implemented, left uncommitted per campaign constraints.

- **M13:** named restitution offers support original recovery, purchased replacements, partial clearance, decline, and abort.
- **M01:** real raid freight and survivors retain custody outcomes through settlement, escape, and Continue.

Live incident bills remain law-owned. Custody supplies the offers and handoff records, preserving SFQ-B120’s cause-specific standing restoration.

Changed files:

- `src/systems/custodyConsequences.js`
- `src/systems/aftermathWrecks.js`
- `src/systems/lawSecurity.js`
- `src/systems/missions.js`
- `src/systems/combatOutcome.js`
- `test/m13-pay-back-the-wake.test.mjs`
- `test/m01-opening-raid-aftermath.test.mjs`

Seed-4242 tests: **M13 3 passed, 0 failed; M01 4 passed, 0 failed.** Adjacent regressions passed, including the production opener and custody suite.

Simulation reload parity passed; the checked-in golden hash differs and remains unchanged. A transient missing export in foreign edits resolved before the affected suite passed.