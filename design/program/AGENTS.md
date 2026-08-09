<!-- LIFETIME: STABLE -->
# `design/program/` agent notes

This tree owns admitted work, brief mutation coordination, and exact-revision acceptance. It does not replace source plans or live code.

- Start at [`../../CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md).
- Read [`NOW.md`](./NOW.md) only for threads mutating now and exact dirty hunks that must be preserved.
- Read the queue row, then exactly one file under [`roadmap/active/`](./roadmap/active/README.md).
- Follow [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md).

Lifecycle and acceptance are independent. `integrated` does not imply `route_accepted`; `implemented` does not imply wired; an asset may be source-complete while runtime-unproven. Use exact labels and never compress these distinctions into “done.”

When an agent begins editing, it adds its own short exact-path row to `NOW.md`; when mutation stops,
it removes that row. The agent that finishes a unit updates its packet checklist, receipt, exact queue
row, and the affected shared status pages after inspecting the exact candidate. There is no separate
coordinator step. Research, reading, testing, and review do not reserve files, and in-repo work is not
declared blocked merely because another thread exists.

Keep global state out of packet prose. Link receipts instead of copying test transcripts and incident histories into queue rows. A green check proves only its contract; it does not prove visual quality, discoverability, reachability, performance, or fun unless those are the contract it actually exercises.
