# FB-039 — A wanted fine at the dock is a decision, not a silent deduction

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: lawSecurity.js, seam: customsPrompt.js, seam: impoundPayPrompt.js
**Write-set:** `src/systems/lawSecurity.js`, `src/ui/impoundPayPrompt.js`, `test/fb-fine-on-dock-choice.test.mjs`
**Neighbours (extend, never restate):** SFQ-B112, NXB-044, NXI-174, SF-161

## The gap
At SCAN or BOUNTY tier, docking at a lawful station charges `LAW_DOCK_FINE_BASE_CR` plus per-level
automatically, emits `heat:clear` and records a receipt; insufficient funds leave the warrant standing. The
law's most common interaction has no decision in it. `law:fineAssessed` already carries `{ stationId, amount, paid, heatLevel, wantedTier }`
and has no listener.

## Why this direction
A courtroom was rejected. The impound prompt is the precedent for an event-only prompt with engine
re-validation; the fine gets the same three doors: pay, work it (a short lawful job at that station), or leave
with the warrant standing.

## Mechanism
- Stop charging on dock; emit the offer on `law:fineAssessed` and let the prompt (extend `impoundPayPrompt.js`
  with a fine mode) answer pay / work / leave; the engine re-validates credits and dock state on the reply.
- Work-it reuses the impound work accrual so a broke player can clear a scan-tier warrant by presence and a
  lawful errand.
- Pin the three outcomes and that leaving keeps heat unchanged.

## Done when
`test/fb-fine-on-dock-choice.test.mjs`: pay clears heat and debits once; work clears after the accrual; leave
keeps the warrant; no double charge on re-dock; `pq-151-00-wanted-tiers.test.mjs` stays green.

## Do not
Do not add a dialogue tree. Do not let the prompt execute the charge (engine does). Do not change tier
thresholds.

## Focus test starting points
- `test/pq-151-00-wanted-tiers.test.mjs`
- `test/heat-wanted-victim.test.mjs`
- Locate impound suites with `rg impoundPay test/`.
