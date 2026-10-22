# Drift intake r2 recovery

RECOVERY ONLY. This directory preserves the exact reviewed 11-file patch, new native fixture and tests (inside the patch), full source hash manifest, and meaningful failing/passing evidence. It does not integrate runtime code, merge, deploy, claim full-game acceptance, or change earlier recovery files.

## Restore

Use a new clean clone. First restore the coherent-radio sibling snapshot exactly as described in ../coherent-radio/README.md. That produces the sealed bcfdd4730a74c2b79b6e53e3bd7111d6d2ec1dc3 source / tree 707320df59191f596616b9741c79586fd817e386 from public commit 70bb667878b654477d762a9add8d8a7e46f3f4ad. Do not apply this to current master or combine it with older Pallas patches.

Then run `python3 /absolute/path/to/drift-intake-r2/restore.py /absolute/path/to/restored-clone`. It verifies every modified baseline file, patch SHA256, all unchanged source hashes, applies the patch, and checks all 11 outputs plus the 2,399-entry source manifest. It does not install packages or run tests. The source manifest is split into lexically ordered text chunks; concatenate source-tree-sha256.txt.* to recover the exact original manifest. Original changed-file metadata is outputs.json.

## Evidence and scope

The patch preserves finite native yaw using the negative-quaternion convention and requires modulo-2pi agreement with finite station.rot within 1e-5 radians before resolving station geometry. Intake radius, speed, clearance, custody and other guards are not relaxed.

Evidence includes expected prior-source native-yaw failure; focused ready-save regression 11/11; fresh native route 11/11 (about 95 seconds); and focused read models 9/9. Logs retain original results, with temporary machine paths replaced by descriptive placeholders. These selections overlap and must not be added as unique tests.

For a fresh route, run `node --test test/pallas-drift-intake.test.mjs` with required repository dependencies available. The fixture excludes full world.update. Leave-return evidence proves no offscreen consumption, not resumed arrival; queue drain alone is not proven to fix missing station materialization. Historical focused ready-save captures are not needed for fresh reconstruction and are not included here. Do not mix capture generations.

Slow/looping haul, ordinary pilot/render/phone/performance, visible receiving animation and ordinary-camera comprehension remain open. The carrier was partly occluded by the existing trade-hub roof/rim; no receiver asset was invented. Do not run test/anvil-receiver-delivery.test.mjs or aggregates that include it.
