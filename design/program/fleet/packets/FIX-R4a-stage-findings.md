# FIX-R4a — Three Stage findings from the fourth review

**Lane 2. Do after G16-03 is BUILT** (same files). Source: `design/program/fleet/reviews/2026-11-11-b14da677.md`
— read the three G16 findings in full:
1. **Persistent status pills consume timed announcements:** a gate-range info pill with `ttl: Infinity` holds the
   banner; an objective/comms voice queues behind it, its arbiter TTL expires, and `voice:clear` removes it —
   the player never sees it. Fix: start/count a voice's presentation only when its caption is admitted, or let a
   timed announcement temporarily take the seat of a persistent status pill (which resumes after).
2. **Refreshing a queued alert breaks FIFO:** a same-id, same-priority refresh must keep its arrival sequence and
   queue position (update content in place); re-rank only when severity changes.
3. **Dialogs still bypass admission:** add screen reservation/release at the screen manager's stack boundary;
   route the migrated confirm, recap and comms dialogs through the Stage admission API (keeping their focus and
   input ownership), so a dialog raised while a full screen is open waits until it closes.
Tests with the real hosts for each. Commits: one per finding, `fix(G16): <what>`.
