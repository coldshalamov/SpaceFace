# M-01 plan — 47-A campaign chain

Tribunal synthesis (Drifter + Archivist + Accountant):

**Slice**: per-contact `strained` deed lines in `src/data/contactDeedMemory.js`.
All 15 trackers already carry bounded counters and two authored prose states; the negative
band today borrows one shared shrug for every contact. Add an optional third `strained`
string to each `memory()` record — written in each contact's own register — and prefer it
in `contactDeedMemory` when `value < 0`. The shared fallback stays for forward-compat.

Why this and not the other seams: BEAT_COMMS is saturated (extra rows would double
popups), CONTACT_CARDS/DEPTH_PROGRAM_CONTACTS are test-pinned closed, and the witness seam
is explicitly reserved for Dorin/Kell. The negative band is the only unvoiced memory state
the schema already computes.

Cost: one data file, ~16 authored lines, a two-line read preference. No new machinery,
no counter changes, no writes. `castLastCall` picks the lines up for free.

Honest scope note: only three counters can go negative today — `vane.favor` (−3),
`dorin.trust` (−1), `mara.debt` (−3). Their strained lines are live the moment a deed
sours the counter; the other 12 records carry `strained` as dormant-but-valid data for
any future negative-band writer, matching how the shared fallback already read.

Verification: `test/station-contact-counters.test.mjs` + a node check that a negative
`vane.favor` returns the authored strained opener (zero-band clamps to `empty` as before).
Foreign hunks preserved: `embodiedMissions.js` reckoning callbacks untouched.

Review: plan ✓3 — recorded.
