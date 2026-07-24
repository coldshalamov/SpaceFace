<!-- LIFETIME: STABLE -->
# `design/program/` agent notes

This tree owns admitted work, current leases, and exact-revision acceptance. It does not replace source plans or live code.

- Start at [`../../CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md).
- Read [`NOW.md`](./NOW.md) only for live leases and blockers.
- Read the queue row, then exactly one file under [`roadmap/active/`](./roadmap/active/README.md).
- Follow [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md).

Lifecycle and acceptance are independent. `integrated` does not imply `route_accepted`; `implemented` does not imply wired; an asset may be source-complete while runtime-unproven. Use exact labels and never compress these distinctions into “done.”

Feature agents may update their packet checklist and return a receipt. Only the integrator changes `NOW.md`, queue lifecycle, whole-program acceptance, generated indexes, or shared completion pages after inspecting the exact candidate.

Keep global state out of packet prose. Link receipts instead of copying test transcripts and incident histories into queue rows. A green check proves only its contract; it does not prove visual quality, discoverability, reachability, performance, or fun unless those are the contract it actually exercises.
