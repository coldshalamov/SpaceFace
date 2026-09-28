# Validation report

## Artifact integrity — passed

- **300 packet IDs**, exactly SF-001 through SF-300; all unique titles and chosen implementation texts.
- **20 domains**, 15 packets each; 20 domain guides and eight deeper implementation specifications.
- **345 Markdown files** checked, including this report; all required packet sections present.
- **1677 local Markdown links** checked for target existence; zero broken links.
- **503 indexed source/test/policy paths** checked against the exact planning snapshot; all existing files matched their recorded SHA-256 hashes.
- **603 distinct commit-pinned repository URL paths/line anchors** checked locally against that snapshot; all paths and line ranges exist. External live web URLs were not crawled by this validator.
- **9 conditional capability-reference edges**, all known and acyclic. These are not a new dispatch queue or an all-300 execution waterfall.

Proposal types: 261 deepening, 15 integrated-play slices, 9 conditional repairs, and 15 optional expansion packets. These classifications describe plans, not completed production work.

## Utility smoke checks — passed

The three Python utilities compiled. A single-packet executor brief and a two-packet reviewer brief were generated successfully, including their domain/shared rules and relevant deep dives. Their rebased local links resolved. Invalid packet IDs, more than five IDs and an attempt to overwrite an existing output were rejected. The read-only source-drift tool matched the selected packet's paths and core authority documents against the planning snapshot.

The utilities use Python 3.10+ and the standard library. They do not contact a network, call a model, create tasks, modify Git or implement game changes. The compiler writes only an explicitly requested new brief file, or prints to standard output.

## Local game-source checks — limited and explicit

`node --check src/render/selectionSigil.js` passed. The focused custody and field-lifecycle invocation passed **12 tests, zero failed**; [full output](evidence/focused-passing-tests.tap). An earlier invocation that also included the selection-sigil functional suite could not load that suite because `three` was absent; [original output](evidence/focused-tests.tap). That dependency failure was not treated as a product assertion failure.

No complete game playthrough, live visual/audio acceptance, GPU benchmark, long Ceres reproduction, full suite or cross-shell acceptance was performed. Artifact integrity does not prove that all ideas are missing, all diagnoses remain current, or the proposed designs will be good in play. See [source provenance](SOURCE_PROVENANCE.md).

## Archive

The ZIP contains this planbank only, not the repository's large source/media snapshot, fonts, player saves or generated Python bytecode. Packaging performs a ZIP CRC check and verifies the contained Markdown count. The source commit is `c92756afb46a9115d47e9d1757369678023efce4`; newer source must be reconciled rather than reverted.
