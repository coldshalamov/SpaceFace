# Boot preload repair, 2026-10-22

Result: static regeneration and independent review passed. Publication and browser acceptance remain open.

## Exact scope and baseline

Claim: `CLAIM_BOOT_PRELOADS_2026-10-22.md` at handoff commit
`5353242ac6de324c1801060b1ddb070021b14ba8`.
Production change: only the generated modulepreload registry block in `index.html`.
Evidence destination: `design/program/world-depth-2026-10-02/BOOT_PRELOAD_REPAIR_2026-10-22.md`.

Public source baseline: `5e5b619b57c53be410e90c7e5f21bbb2fd0127f5`.
Original index blob: `30e86f03ce7ee723c96fa823da7ca5fe3acd6c8b`.
Generator blob: `ed4078b9a1c45a589eca874307600cd8499f5d69`.
Repaired index blob: `77f7d1f982fdb5f96a7efd968429ffa8fb8ce522`.
Repaired index SHA-256: `b0c40063c7f5a63edd30df89fb1b541875b8db6367cf6ab618ffb492d5422187`.

Public NOW blob `28c49d3e8aa779e931c7830e7bebcdf8ae1e13fd` contained no exact-path
owner for index.html or this generator. Shared control files were not changed.
The dirty canonical checkout was never modified.

## Reproduction and implementation

The unchanged public generator, which imports only Node built-ins and reads static import
text without evaluating game code, reproduced drift: exit 1, 100 missing current imports,
16 stale preloads. Regeneration exited 0. Repaired `--check` exited 0:

`[modulepreload] in sync — 35 main + 2182 registry imports covered.`

The exact diff adds 100 currently reachable modules and removes 16 nonexistent encounter
paths: encounter 1300 and encounters 570 through 584. Their scene replacements are included
in the current graph (902 onward). All removal targets are absent from the composed public
inventory, rather than inferred absent from a partial local copy. 2,082 existing managed
imports remain. All node_modules hints remain unchanged. Every byte before and after the
managed block, including hand-maintained preload waves, is identical to the public baseline.
The repair changes no script, runtime module, test, workflow, assertion or browser behavior
beyond correcting the generated fetch hints.

## Coherent read-only source proof

This is not a physical clean checkout. Storage constraints required a hash-gated virtual
source filesystem. Its public existence inventory composes the full c855b6a6 tree with the
complete c855-to-250 public delta and independently fetched 250-to-5e comparison (five commits,
four changed paths). Both changed source files were fetched at exact 5e. Needed sources were
read only from exact matching Git blobs, exact matching existing files, or exact-ref public
connector responses. Dirty local bytes were never accepted without the expected public blob
hash. The source map fails closed on unknown or mismatched reads; writes are restricted to
the candidate index, never the canonical tree. The generator source is byte-for-byte unchanged.

Baseline and repaired runs read exactly the same 2,277 unique verified files with zero
unresolved public sources or hash failures. The preliminary claim's 2,278 count was corrected
by the actual generator read audit; 2,277 is the final count. The independent discovery walk
also inventories package metadata, which is not a generator source read.

Seven installed dependency JavaScript files were hash-recorded. Their package versions and
installed lock integrity metadata match the exact public lockfile. This is lock/version
provenance, not tarball re-download or tarball-content verification. Three.js is represented
by tracked vendor files in this graph. Five nonexistent three-mesh-bvh comment-example paths
are matched by the generator's regex and ignored by its existing absent-file behavior;
these are explicitly enumerated, not treated as unknown public-source gaps.

## Evidence and recovery

The local review packet includes the exact candidate, unified patch, original public index
inside public-inputs.json.gz, unchanged generator, source map and public fetch responses, complete
baseline and repaired logs, dependency evidence, read-hash manifests, and executable verification
helpers. Public-source hashes and immutable refs preserve reproducibility if reusable local
source paths later change. Referenced existing source/object stores are not duplicated in full;
the harness refuses changed bytes rather than silently using them.

Run `node run-generator.mjs --check` for the original failure; `node run-generator.mjs` writes
the candidate; `node run-generator.mjs --candidate --check` verifies the repair; `python verify.py`
checks exact diff scope and matching read manifests. Commands operate inside this packet.

No browser, game execution, server, CI rerun, external execution thread, Git fetch, deployment,
GitHub write, or forbidden test was used. This proves static preload synchronization and removal
of the known dead fetch targets, not full browser acceptance or unrelated CI repairs.

## Independent review and normal-checkout reproduction

Independent review reran the baseline and repaired checks through the inspected read-only mapping, intercepting audit output in memory. It reproduced the same 100 missing/16 stale failure and the repaired pass, with the exact same 2,277 read hashes and no hash failures. All packet checksums, source blobs, patch scope, retained imports and outside-block bytes passed review. No game code was evaluated.

The virtual packet is not required to use this repair. In a normal checkout of the published commit with lock-matched dependencies, run `node scripts/sync-modulepreload.mjs --check`. The unchanged generator is already in the repository. A green static check does not prove browser startup, mobile launch, visual quality, performance or resolution of unrelated CI failures.
