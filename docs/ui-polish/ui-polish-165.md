# ui-polish-165 — Records Wall empty state

- **Before:** a fresh Records Wall showed five bare category words (FLIGHT, LINE, FIGHT, TRADE, LAW) under a rule, then a large blank stage. At 390 the row wrapped and LAW dropped to its own line.
- **After:** the empty state lists each reading as a ruled row: the name, then what it will count (taken from the sections the ledger renders once there is data). The tick before each name no longer gets squeezed out on the longer words.
- **Files:** `src/ui/screens/statistics.js` (`promiseScale`), `src/ui/orrery/achievementsLayouts.js` (promise-scale rules only).
- **Checked:** 390x844, 960x540, 1280x720, 1920x1080; short-height (≤460) rule keeps rows compact. Type floor passes.
