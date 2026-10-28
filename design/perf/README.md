<!-- LIFETIME: STABLE -->
# design/perf/ — the one perf document

**Owner, 2026-10-28 (Finish Program):** the ~59 dated PERF_* reports, campaign docs and lead
diagnoses were folded into this file and archived under [`design/archive/perf/`](../archive/perf/).
The live performance program is **Lane 1's board**:
[`design/program/finish/LANE_1_MACHINE_AND_PICTURE.md`](../program/finish/LANE_1_MACHINE_AND_PICTURE.md)
— its bars, budgets and measurements are the authority. Root `AGENTS.md` §1 routes "the game is
hitching" there.

Two documents stay here because live program files still cite them:

- [`STRUCTURAL-HORIZON.md`](./STRUCTURAL-HORIZON.md) — the whole-sim worker horizon and the wire-hop
  measurement behind `simLane=worker` (owner ruling 8: flip it to default when a within-session A/B
  on the owner's laptop shows the frame win and the parity/digest tests are green).
- [`TABLE_AUTHORITY_PLAN.md`](./TABLE_AUTHORITY_PLAN.md) — the authoritative plan the finish program
  cites for the sim's table/near/glass partitioning.

Everything else perf is history in [`design/archive/perf/`](../archive/perf/): PERF_MASTER_PLAN,
PERF_RESCUE_*, the W4_* kernel reports, the lead* fix reports, the hitch/persistence/advanced
campaigns, the modernization execution plan and the option space. Perf *evidence* images live in
`docs/archive/perf-evidence/`. Consult them by filename through git history or the archive; do not
revive them as a second queue — Lane 1's board is the only perf plan.
