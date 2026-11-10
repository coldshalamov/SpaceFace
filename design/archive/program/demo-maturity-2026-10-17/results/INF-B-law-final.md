Implemented all three units; edits remain uncommitted for the orchestrator.

- **LAW-11:** Paid tolls appear once in Footprint as settled, including after reload.
- **LAW-12:** A clean pass earns a station/day trust mark; same-day inspection offers are waived after checking for new contraband.
- **LAW-13:** A delivered pod produces testimony alongside the existing **0.08** cooling, once per pod.

Footprint reads the persisted payment record, preventing duplicate rows on refresh. Customs clearance stays with lawSecurity, while testimony follows the heat owner’s measured cooling receipt without writing WANTED directly.

The requested tests passed:

| Test | Passed |
|---|---:|
| `test/inf-law-11-toll-footprint.test.mjs` | 1/1 |
| `test/inf-law-12-customs-trust-mark.test.mjs` | 2/2 |
| `test/inf-law-13-pod-testimony-cooling.test.mjs` | 1/1 |

Combined: **tests 4 · pass 4 · fail 0**. Including nearby regressions: **71 passed, 0 failed**. Player-facing label checks passed.

Changed files also include:

- `src/systems/lawSecurity.js`
- `src/systems/survivorPod.js`
- `src/ui/screens/footprint.js`
- `src/ui/customsPrompt.js`
- `test/helpers/infLawScenario.mjs`
- `test/pq048-lawful-cargo-inspection.test.mjs`

All added player-visible copy, verbatim with seeded test values:

- “Toll · settled”
- “Toll settled — Helios passage toll · 120 cr.”
- “CUSTOMS CLEAR — trust mark recorded at Helios Station for today.”
- “CUSTOMS WAIVED — Helios Station remembers today's clean pass.”
- “RESCUED PILOT — testimony filed; heat reduced.”

Station names, toll labels, and amounts use live record values.

Outstanding validation: Adventure player-truth **failed before menu entry** on a 30-second navigation timeout: [verdict](/C:/Users/93rob/Documents/GitHub/SpaceFace/scratch/player-truth/adventure-inf-b-law-20261017-inf-b-law-20261017/verdict.md), [contact sheet](/C:/Users/93rob/Documents/GitHub/SpaceFace/scratch/player-truth/adventure-inf-b-law-20261017-inf-b-law-20261017/contact-sheet.jpg). Simulation hashes matched across reload, but the comparator reported an expected-hash difference. Neither issue was changed in this batch.

