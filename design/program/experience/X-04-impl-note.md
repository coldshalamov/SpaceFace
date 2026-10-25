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
