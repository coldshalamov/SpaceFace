# Modular cutter recovery increment

This subtree is a recovery package only. It does not modify live runtime paths, constitute a runtime PR, or claim visual acceptance. It includes exactly three full reviewed source/test outputs, their patch, integrity metadata, review summary and passing author/independent logs. No generated simulation-state snapshots, validation VFX copy, symlink tree or private ancestry are included.

## Safe restoration

1. Restore the already preserved native, radio and sealed r4 dependency chain from this recovery branch into a separate clean working tree. Preserve newer owner work. This package is a delta over that chain, not a standalone application.
2. Verify every package file against SHA256SUMS before use. Verify the existing destination src/render/npcJobSignatureVfx.js has SHA256 231947f7e10ec9128fd5e3903150481b82d71d603311878f10394f91250c8108 and test/pallas-reef-read-model.test.mjs has SHA256 35e7a986f2b5f6b6a7fee518e11deb428df6b60a6aace2e6a3acf4a7f9f91d18. The new test/pallas-modular-cutter-vfx.test.mjs must be absent. Stop on any mismatch: do not overwrite unrecognized newer owner files.
3. Require src/render/vfx.js from public commit e7f6122f8d8f2985223940bfbb60eb4f66272561, blob 7ab066945cefa7bec490cef4129fc9dce7aafe49, exactly 828373 bytes and SHA256 011206ed8caecd9929b5a173d6e107c5010c3bbdea541687541129aaa9c48fcb. This is a validation input, not included here. Never combine the module with the unpublished monolithic _emitPallasReefCut handler.
4. Run git apply --check on modular-cutter.patch, apply it only after every base check passes, and verify all three output hashes against manifest.json. Alternatively copy the three full outputs only after the same base and absence checks. Do not apply both methods.
5. Run the focused and relevant commands below with the restored dependencies. Production src/core/renderUpdatePhase.js already installs the decorator; no additional wiring is required.

## Validation commands and results

Focused (author and independent review each 19 pass, 0 fail):
node --preserve-symlinks --test test/pallas-modular-cutter-vfx.test.mjs test/pallas-reef-read-model.test.mjs

Relevant renderer regressions (author and independent review each 66 pass, 0 fail):
node --preserve-symlinks --preserve-symlinks-main --test test/npc-job-signature-vfx.test.mjs test/npc-job-reactions-deploy.test.mjs test/npc-job-work-target-resolution.test.mjs test/pq-141-02-npc-job-contact.test.mjs test/fb-096-contact-scratch-pool.test.mjs test/npc-job-signatures-quiet-sleep-latch.test.mjs test/pic-30-fielded-craft-signatures.test.mjs

No aggregate suite or anvil-receiver-delivery test was run. Ordinary camera visibility, live-pool fade and device performance remain separate acceptance work. Runtime integration is intentionally separate from this recovery increment.
