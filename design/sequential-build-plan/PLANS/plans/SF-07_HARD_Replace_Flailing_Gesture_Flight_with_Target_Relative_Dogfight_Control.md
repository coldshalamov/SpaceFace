---
id: "SF-07"
sequence: 7
status: "rejected"
execution_prohibited: true
superseded_by: "Explicit user direction, 2026-07-24"
---

# SF-07 — REJECTED CONTROL DIRECTION

This prompt is a tombstone, not an executable plan.

The reviewer-derived target-relative pursuit-slot controller was never requested by the user and
must not be restored. Specifically prohibited:

- MMB pursuit selection or adjustment;
- automatic bearing/range station keeping around a combat target;
- pursuit-specific physics impulses or hidden autopilot authority;
- `PURSUIT ASSIST` HUD, status, settings, hints, or toasts;
- retiring or replacing the user-requested G auto-target/draw-to-fly route.

The retained player contract is direct and granular: G may enable locked-target weapon lead while
relative, clutchable draw-to-fly input controls the ship as an independent channel. Historical
reviewer decisions, source packages, receipts, tests, and commits describing pursuit-slot or
autopursuit behavior are evidence of a rejected experiment only.

Do not implement, prototype, A/B test, re-admit, or map the rejected mechanic to a new packet ID.
