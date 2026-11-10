# Hundred-Hand Mile: recovery-only project package

This draft preserves a reviewed implementation candidate and all 44 original model-source/release/render asset paths. It does **not** install the feature in the public game, change production manifests or workflows, or establish full-game acceptance.

## What is preserved
- 67 intended text paths: the 20 narrow public-source patches, 39 new source/test/diagnostic files, six additive asset manifests, the dedicated Blender generator, and a package.json test-gate recipe.
- All 44 original asset paths and byte identities. Thirty-five path entries are stored unchanged; nine path entries are recovered from six gzip and two XZ objects (two paths share one identical source GLB).
- Exact public base: `3bf67c9617e285561330a413472bd11a94bf2f7b`.
- Shared Forge tools and textures already match the public base and are not overwritten. Save schema 20 and migrations are unchanged.
- The model set is the original source-v4 family, with the separately recorded guide paint2 material derivative. Later receiver-finish work is not reconstructed from missing source.

The recovery directory has no runtime loader. Compressed objects are ordinary archival copies, not alternate assets used by the game. Original Blender packed-image provenance and ordinary editor defaults remain unchanged to preserve source certificate identities.

## Restore without touching the base
Use Node 22.12–24 and Python 3 with its standard-library lzma module. No package install, credentials, network or custom loader is required by the restorer.

From this directory:
```sh
node restore.mjs --base /path/to/exact-public-checkout --verify-only
node restore.mjs --base /path/to/exact-public-checkout --output /path/to/new-overlay-directory
```

The base must have the exact public HEAD above and matching bytes for every source read. New-file and asset paths must be absent. The output directory must not exist, must be outside both the base and recovery trees, and must have no symlink ancestors. The script refuses unsafe paths, changed source/patch contexts, index tampering, mismatched compressed/raw identities and overwrites. It validates everything before writing only the explicitly requested new overlay. It does not copy the unchanged public base, modify that checkout, run Git writes, or execute tests. Integrating this overlay remains a separate authorized engineering step.

Source reconstruction is defined by `source-reconstruction.json` and `new-files.json`; `index.json` binds storage encodings and every original asset byte count, SHA256 and Git blob identity. Public CRLF is retained. The manifest's tested semantic LF SHA256 is `a96a4714e238521b7df4ab506e4ce40f22c6b93be38c2a206ea9174d7bf70350`; restored CRLF SHA256 is `21fd14e76ba70438c286f095f5405a63e7ab69d3bd428e50576b5a6aeaaa4d89`.

## Qualification, not acceptance
The sealed candidate passed distinct local gates of 65, 12, 3, 1, 38 and 9 cases: 128 across 15 files. These were bounded runs, not one monolithic test invocation. The final 38-case native rerun used the final lifecycle source; its separate receipt supersedes neither failed attempts nor the earlier historical proof.

The intended package recipe adds `check:hundred-hand-mile-current-public` at the existing static 2/3 leaf while preserving previous command order. This recovery PR does not install or execute that gate. No current recovery-head gameplay CI pass is claimed.

The candidate's original full native Save/load gate failed four lanes with `invalid_orchard_frame_source`; the same failure was reproduced on the exact public baseline. This failure is retained, not skipped or rewritten as a pass.

A separately qualified optional dependency uses only five source hunks from the project's public [PR485](https://github.com/coldshalamov/SpaceFace/pull/485), head `99ad82fb517bfcf5334b3dba9eebe0ca0227a181`. It is **not applied by default** and does not import that PR's old package or unrelated readiness code. The optional recipe pins its current-base and resulting source hashes. Separate terminal results on that overlay were four full-Save lanes, five source-loss/restitution cases, and one native convoy observation. Earlier incomplete combined runs remain separately recorded. The convoy used real same-life motion and arrived with an authenticated witness; it did not prove an earned entire campaign or fabricate milestone payment. Its exit manifest is partial, explicitly not a complete dependency manifest.

Local source/runtime evidence is not a full browser checkout or live visual/performance acceptance. The CPU model preview is an actual source comparison with simplified lighting/texture sampling, not PBR, live-camera or finished-detail acceptance. Remaining feature integration, the complete earned campaign, full PR485 suite, and final game acceptance stay open.

## Recovery verification performed
The final restorer's pure reconstruction functions reproduced all 67 intended text files byte-for-byte in RAM. Wrong-base, ambiguous patch and unsafe-path negative checks were exercised. Original/compressed asset identities were independently checked and losslessly round-tripped before staging. The filesystem CLI wrapper was syntax-checked and independently source-reviewed; it was not run against a newly allocated full checkout. See the verification receipt for precise boundaries.

## Publication transport history
The larger raw blob route returned no result before interruption, and subsequent expected-blob checks returned 404. No hard transport size limit was inferred. The original source bytes were instead preserved through the standard compressed recovery objects recorded in the index. Successful objects were retained; uncertain writes were checked before retry. No credentials, workflow changes, runtime substitution or private commit ancestry were introduced.
