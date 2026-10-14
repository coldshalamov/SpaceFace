# Archived Orchard reconciliation packet (f564), superseded

This branch preserves the frozen Orchard source/model/test packet for recovery. It is an archive, not a runnable PR or a claim that the complete feature is done. Every recoverable source, model, test, and two handoff documents are stored below `payload/` with their original repository-relative paths. The full renderer blob is absent; the exact minimal diff against the fresh public master snapshot is in `handoff/renderer.patch`.

## Provenance and limitations

- Packet base and test snapshot: public commit `f564e4ee4c8fffb9afd9d64e3f747891ed29abb4`; later frozen publication check used `680260a967fa151b344d3bcd00095b1f06ff0727`.
- This archive branch was created from fresh public master `e3e6065c35d6d7bc59e9609120dc058517493f4e`. It does not alter master or overwrite current files.
- Payload includes 108 of 109 deliverable paths plus the two supplemental design/handoff documents. `src/render/renderer.js` was not uploaded because its 1.76 MB blob route repeatedly stalled; the minimal, exact Orchard-only patch is retained separately.
- The frozen versions of `src/core/physicsAuthority.js` and `src/core/sg02DynamicBodyOwner.js` are preserved under `payload/`, not installed over newer master content. Fresh master had changed both since the prior packet base.
- A later real UI Continue route exposed a native Orchard adoption failure when flight admission is deferred. That finding supersedes the frozen package’s earlier test results. Root engineering is preparing a native fix, integration of the two changed upstream dependencies, and a new test; none is asserted by this archive.

## State tracking

- Exported: yes, frozen packet and checksums recorded in `handoff/manifest.json`.
- Reviewed: prior automated checks are documented in `handoff/prior-publication-check.json`; they do not cover the later real UI Continue failure.
- Published: yes, as this recovery-only branch.
- Integrated: no.
- Accepted: no.
- Full Orchard feature: open and not demonstrated complete.

The payload is intentionally namespaced for recovery. To stage a future coherent candidate, reconcile the current upstream files, include the new native UI Continue fix and regression test, restore the full renderer from its patch, then rerun current-base validation. Do not copy the frozen payload wholesale over current master.
