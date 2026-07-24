<!-- LIFETIME: STABLE -->
# SpaceFace program control surface

This directory is the only whole-program status and acceptance surface. It separates live leases, machine-indexed work, executable packets, and retained evidence so an agent can orient without ingesting the repository's history.

## Read by need

| Need | Read |
|---|---|
| Live worktrees, leases, protected paths, blockers | [`NOW.md`](./NOW.md) |
| Stable packet IDs, dependencies, broad checks/evidence | [`roadmap/program-queue.json`](./roadmap/program-queue.json) |
| Executable instructions for admitted packets | [`roadmap/active/README.md`](./roadmap/active/README.md) |
| Finite implementation/review/verification protocol | [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md) |
| Verified outcomes | [`01_VERIFIED_DONE.md`](./01_VERIFIED_DONE.md) |
| Admitted remaining work | [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) |
| Live acceptance evidence | [`03_LIVE_ACCEPTANCE_MATRIX.md`](./03_LIVE_ACCEPTANCE_MATRIX.md) |
| Worktree/integration history when specifically needed | [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md) |
| Retained unscheduled ideas | [`06_RETAINED_FUTURE_BACKLOG.md`](./06_RETAINED_FUTURE_BACKLOG.md) |
| Plan-family navigation | [`PROGRAM_MAP.md`](./PROGRAM_MAP.md) |

## State model

Lifecycle and acceptance are tracked separately:

- lifecycle: `planned`, `ready`, `claimed`, `implemented`, `integrated`, plus `blocked`, `deferred`, `historical`;
- acceptance: `unproven`, `focused_green`, `route_accepted`, `milestone_accepted`.

Never infer one axis from the other. A source asset can be implemented but not runtime-wired. Integrated code can retain an open route or visual acceptance debt. A packet can be blocked even when substantial substrate already exists.

## Maintenance

- `NOW.md` contains only volatile state and an expiry marker.
- Queue rows stay compact; link receipts instead of embedding incident histories and test transcripts.
- Active packets are the implementation handoff. Retire or replace them when the live seam changes materially.
- Feature agents update packet checkboxes and receipts. The integrator updates global state.
- Run `node scripts/check-program-docs.mjs` after changing these control surfaces.
