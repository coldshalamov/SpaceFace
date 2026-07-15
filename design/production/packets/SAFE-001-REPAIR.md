# PACKET SAFE-001-REPAIR — Close the rejected runner boundary

> **Manual packet; exact activation required.** See `README.md`. Discovery does not activate it.

packetId: SAFE-001
revision: repair-1 after independent rejection
milestone: M0 Wave A
kind: security-control
lane: manually supervised sole code_mutation lane; autonomous SAFE-001 execution is forbidden
writablePaths: tools/production/run-agent.mjs, tools/production/lib/guard.mjs, tools/production/lib/integrate.mjs, tools/production/lib/journal.mjs, tools/production/lib/leases.mjs, tools/production/lib/snapshot.mjs, tools/production/lib/util.mjs, tools/production/lib/validate.mjs, scripts/check-safe-agent-runner.mjs, design/production/schemas/worker-submission.schema.json
coverage: ALPHA_PROGRAM Task 0.5 containment prerequisite
dependsOn: none
externalPrerequisites: fresh lease/owner preflight; same SAFE-001 implementer/session receipt; exact rejection-evidence artifact hashes
authorModel: <BOUND_AT_COMPILE>
authorModelFamily: <BOUND_AT_COMPILE>
reviewerModels: <BOUND_AT_COMPILE>
reviewerModelFamilies: <BOUND_AT_COMPILE>
qualityCard: <BOUND_AT_COMPILE>
qualityCardHash: <BOUND_AT_COMPILE>
qualityCardMode: control_plane
gates: scope, technical, runtime, temporal, quality, operational
readDependencies: <BOUND_AT_COMPILE>

## Outcome

An auto-approved terminal worker cannot mutate the live dirty tree, controller state, or another
lane; cannot outlive or lose its lease silently; and cannot promote a reviewed candidate through a
stale or partial integration. The current 44/44 fixture result is supporting evidence only: the
candidate is REJECTED until every hostile fixture below passes and two fresh cross-model reviewers
approve the repaired candidate hash.

## Rejected defects to repair

1. `.campaign` is excluded from ACL/watch protection (`guard.mjs`), so a worker can alter leases,
   run records, snapshots, briefs, or reviewer output.
2. Heartbeat errors are swallowed (`run-agent.mjs`), allowing a lease-less worker to continue.
3. Guards are lifted when the main process exits without proving every descendant is terminated.
4. Expired-lease reclaim is non-atomic; release can race a successor.
5. Integration can stage/verify, then publish mutable temp files and can crash after partial
   multi-file publication.
6. Workspace journaling does not reject hardlinks to live/control files.
7. Windows ADS/device/path aliases can evade normal directory walking.
8. Submission validation misses unique evidence paths and strict ISO heartbeat validation.
9. Same-user owner authority can remove the runner's deny ACE; naive `EPERM` proves only a worker
   that did not try to revoke the guard.
10. Git-porcelain watch is blind to ignored live paths and watch-only detection cannot restore
    destroyed uncommitted bytes.
11. Integration does not normalize/contain output paths and its multi-file commit can fail
    half-applied without a recovery/report.

## Required boundary behavior

- Worker write authority is limited to the isolated candidate allowlist plus one submission ingress.
  The controller-owned control plane is never worker-writable. Use a restricted non-owner identity
  or stronger OS sandbox whose guard cannot be revoked through `WRITE_DAC`/owner rights; controller
  records are written by a separate authority after worker write access ends.
- Lease acquire/reclaim/release uses an atomic lock and owner token. Heartbeat failure latches a
  violation, kills the complete process tree, rejects the run, and keeps guards active.
- Use an OS-enforced process group/Windows Job Object or equivalent fixture-proven descendant
  containment. After the apparent main exit, verify the group is empty and hold the guard through a
  stabilization window before journaling or lifting it.
- Snapshot/journal/integration reject symlinks/reparse points, external hardlinks, ADS, device paths,
  case/path aliases, and non-regular candidate outputs. A candidate cannot change the live file by
  mutating a link inside its workspace.
- Git/watch detection is defense in depth only and must cover ignored paths when used. It never
  substitutes for prevention on the dirty live tree or on a platform without equivalent isolation.
- Integration holds its own lease, revalidates live inputs and every staged/output hash immediately
  before each atomic publish, produces a recovery journal before the first live rename, and never
  records integrated after a partial/crashed publish. Normalize every output path and prove its
  resolved destination remains inside live root. Final live hashes must equal the reviewed delta
  manifest.
- Missing/corrupt control records fail closed. Healing stale guards never deletes or rewrites an
  active successor's record.

## Mandatory new destructive fixtures

- control-plane absolute/path-traversal writes;
- worker attempt to remove/replace its own deny ACE and a pre-existing-deny preservation check;
- writes to ignored live paths under the Git-watch strategy;
- heartbeat failure while worker continues writing;
- two-process expired-lease reclaim race and old-owner release race;
- detached/background descendant that writes after the parent exits;
- workspace hardlink to live root and control plane;
- ADS/device/path-alias attempts on Windows;
- post-review candidate mutation and integration staging mutation;
- absolute/`..`/case/long-path integration-output escape;
- simulated crash on every multi-file publication boundary with recovery verification;
- duplicate evidence paths, invalid heartbeat timestamps, and non-regular evidence;
- worker payload/controller-envelope schema parity: every good/bad fixture produces the same result
  in JSON Schema and the hand-written runtime validator;
- corrupt/missing control state and guard-heal successor protection.

Every hostile fixture has a valid control. Run against disposable mock roots only; never aim a
destructive fixture at the SpaceFace live root.

## Acceptance

1. `npm run check:safe-agent-runner` passes all old and new fixtures with exact assertion count.
2. A manually supervised valid worker creates an isolated candidate and cannot write live/control
   files; integration of one reviewed allowlisted output succeeds and hashes match.
3. Zero live SpaceFace files are changed by hostile fixtures; before/after live-tree fingerprint is
   identical.
4. Fresh Fable-family and non-Claude-family reviewers inspect the exact candidate independently and
   return hash-bound schema-valid PASS with zero open critical/major defects. A prose/advisory review
   is not acceptance.
5. Only then may the controller mark SAFE-001 accepted and enable autonomous mutation.

## Prohibited shortcuts

Do not widen guard allowlists, shorten stabilization, ignore heartbeat/process errors, disable a
hostile fixture, accept watch-only detection as prevention on the live dirty tree, or manually
delete/reclaim the currently stale code lease. Coordinate lease ownership through the controller.
