# Start here — make the next work deliberate

**60 BUILD assignments + 240 INFERENCE assignments across 15 areas.** Authored against `9a30ffc00204a943ed9307deb56cb8bf23687ad9`. The package supplies decided changes, mechanisms, counterexamples and prohibited shortcuts; it does not claim 300 newly discovered bugs or 300 independent features.

## Read and dispatch

The live BUILD rows are in `build_map.md` §1C H. The live small-task rows are in `design/program/INFERENCE_IDEAS.md`. [INDEX.md](INDEX.md) and `catalog.json` locate specifications only. After applying the bundle, the read-only helper can list eligible rows:

```sh
node scripts/next-wave-read.mjs --kind build --ready
node scripts/next-wave-read.mjs --kind inference --next
node scripts/next-wave-read.mjs --id NXB-025
```

The helper reads current Markdown status cells, never the JSON's initial statuses. It is advisory: it does not claim paths, read local agent leases, confirm remote PR integration, or replace the legacy PQ dispatcher. NXB/NXI IDs cannot be passed to the legacy dispatcher's PQ-only `--id` option.

At the authored snapshot, BUILD has **54 OPEN / 6 WAITING** and INFERENCE has **118 OPEN / 122 WAITING**. OPEN means eligible for current-source and exact-dirty-hunk checks, not a guarantee that the outcome is absent or the file is free. WAITING names a specific capability, not a reason to stop all other work. The strong agent opens dependent rows only after the capability exists. Never treat a deleted parent as completed or an old packet's `initial_status` as live truth.

## Strong-agent assignment

Take one NXB packet, check its [prior-work crosswalk](OVERLAP_MAP.md), and trace its live owners. The design choice is already supplied: implement that outcome using current architecture. Necessary implementation judgment remains with the strong agent. An equivalent older OPEN assignment should be executed once under the existing owner; map/retire the duplicate, not both implementations.

The parent must finish its entire contract. The four related small packets are focused subchecks and adjacent polish, not permission to leave the parent broken. Any child already completed by the parent closes `SHIPPED already true — <commit>`; it does not need a second diff. Existing functional behavior may also close a proposed parent as already satisfied with exact evidence.

## Small-agent assignment

Take one eligible NXI row. Its packet names the exact edit, one starting owner, a done case and what not to build. Read the related parent for context, not as an instruction to take over the whole feature. No new package, faction, framework, parallel owner or substitute idea. When the named result needs an absent foundation, identify that capability for the strong parent and take another ready task.

## First sessions

[First batches](FIRST_BATCHES.md) gives a concrete starting order and path collisions. [Execution contract](EXECUTION_CONTRACT.md) supplies the common guardrails. [Review and playtest plan](REVIEW_AND_PLAYTEST.md) gives area-level acceptance without a ceremony for each tiny edit. [Audit](AUDIT.md) explains what this research did and did not establish.

## Authority

The current user, current root/nested AGENTS, architecture and product vision outrank this dated package. ORRERY remains the interface authority. Existing exact dirty hunks remain protected; these packets do not create task-long lane locks. Current queue/done-log and the existing defect ledger remain authoritative. Neither this package nor a drained tool result permits uncontrolled weaker-agent brainstorming while useful directed work is available.
