# FB-103 — A Statistics screen in the Pause reference group reads the career counters

**Kind:** build · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: pause.js, seam: achievements.js
**Write-set:** `src/ui/screens/pause.js`, `src/ui/screens/achievements.js`, `test/fb-statistics-screen.test.mjs`

## The gap
No statistics screen exists (`statistics` has zero hits under `src/ui/screens/`). `smuggledValue` and
`totalPassiveEarnedLifetime` are computed and shown nowhere. Pure UI, hence the ORRERY lane; the sim half is
FB-102.

## Why this direction
The mk() pattern in the pause reference group and the medal orrery are the two existing shapes to compose
from.

## Mechanism
- Add a Statistics entry to the pause reference group opening a screen that reads `+careerStats()`,
  `player.stats` and the achievement counters, grouped by verb (flight, line, fight, trade, law).
- Walk it with `node scripts/ui-bench.mjs --walk` before calling it done.

## Done when
`test/fb-statistics-screen.test.mjs`: the screen model renders every counter from a seed-4242 save; the pause
walk reaches it and returns.

## Do not
Do not compute in the UI. Do not add a leaderboard.

## Focus test starting points
- `test/focus-lifecycle.test.mjs`
