# Hundred-Hand Mile runtime draft

This increment installs the real Mile world, physical module owners, convoy, crew, narrative and player prompt through the normal registry, simulation, renderer and asset manifests. It preserves the current public systems and the PR599 main-only prompt/forwarding prerequisite. It is not merely a recovery package.

## Explicit asset preparation

Retail build, server start and Electron launch materialize the one pinned Mile render GLB before consumption. The loader still uses its ordinary GLB path; no loader or workflow is replaced. This runtime step requires only Node and is Python-free.

Run `npm run prepare:hundred-hand-mile-authoring` before source-certificate or original-asset validation. It requires Node and an existing Python 3 with its standard-library lzma module for two XZ inputs. It verifies all 44 original asset paths, requires the 35 committed raw path entries, and reconstructs nine exact compressed-output path entries from eight pinned objects. The runtime render GLB is one of those nine; the other eight are authoring outputs. These generated original-source bytes are reconstructed from committed, identity-pinned compressed objects, not stored as standalone raw files in Git. Existing mismatching files, unsafe paths and unsupported/missing decoding prerequisites fail closed. No network, package install or hidden postinstall is used.

`npm run check:hundred-hand-mile-current-public` keeps preparation and tests in one CI leaf: the explicit runner prepares, then runs the original 15 candidate test files plus the final prerequisite-prompt tests, both materializer tests and authoritative-manifest tests. All test files run sequentially with --test-concurrency=1. The gate retains the existing 180-second CI budget. Existing aggregate commands and their order are preserved; this gate is appended. Do not run broad aggregate checks on constrained recovery machines.

## Evidence boundaries

Historical candidate qualification comprised 128 distinct author-run cases across 15 bounded files. The final prompt successor was separately qualified; its source and test replace the older prompt. The new runtime materializer has 17 real-filesystem fixture passes; the authoring preparer has 13, plus both actual XZ inputs decoded and checked in RAM. Integration-source reconstruction and isolated manifest invariants are not a fresh full graph, native browser, live visual/performance, or earned-campaign acceptance run. The full 44-path filesystem preparation and combined feature gate still require execution on a sufficiently provisioned checkout.

The original full native Save/load baseline reproduces `invalid_orchard_frame_source`. The exact five-hunk owned PR485 fix and unchanged dormant-frame test are a separately identified optional dependency, not silently absorbed or represented as full PR485 qualification. Separate earlier overlay results were four Save lanes, five source-loss cases and one native convoy observation; no complete campaign or native-browser acceptance is claimed.
