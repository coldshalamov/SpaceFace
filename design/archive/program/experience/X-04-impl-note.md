# X-04 impl note — first gate jump: the toll is part of the pay

Three one-shot lines + one remedy, all numbers computed at speak time via `gateTollFor`
and the run's reward — no literals. `gate:range` for the run's destination upgrades the
generic hint once: "Toll 194 out, 246 home. The run pays 760. Jump." (also stamps
firstGate). `jump:arrive` names the Flare Rack lead-in. `mission:completed` says
"Paid 760. Keep 246 for the gate home." — placed before the dock-beat return since
accept ends the rail. `jumpAbortText` credits refusal now ends "Earn it at a dock."

Re-pins (deliberate): `jump-verb-notice.test.mjs` :38 and :267 gain the remedy suffix.
Tests: new x04-first-gate-toll-line 6/6; jump-verb-notice 14/14; keep-green 34/35 —
the first-session-places relighting miss is the same pre-existing director drift.
Review fixes: `_runOriginSectorId` falls back to the contract's board station (missions.js
removes the run before emitting, so home reads 246 not Ceres's 194); accepted missions read
`reward_cr` not `terms`; the Ceres arrival line only speaks on the Helios leg.

Complete-with-evidence (devin-expu audit 2026-10-25): landed 6e0aa21444 (+9ab4054e32 review
fixes — no berth re-offer, home toll reads the contract's own sector, arrival on the Helios leg
only). `x04-first-gate-toll-line` 7/7 green today. Audit residuals (no guided toll moment, no
return-leg line, refusal names no remedy) closed by `firstGateToll`/`firstGateArrive`/
`firstTradePaid` + `jumpAbortText` copy (verified `onboarding.js:761,777,2003`,
`jumpNotice.js:50`). Rejected draft scope (toll-sum tracking, broke-at-gate grant, Helios
re-entry line) was adjudicated at plan time — no remaining named sub-scope.
