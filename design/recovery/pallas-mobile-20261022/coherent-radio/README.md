# Recovery: coherent world/HUD and truthful Pallas radio

RECOVERY ONLY. This append-only directory preserves the final local candidate bcfdd4730a74c2b79b6e53e3bd7111d6d2ec1dc3 / tree707320df59191f596616b9741c79586fd817e386. It does not apply runtime code to this branch, deliver an implementation PR, assert full-green CI, or establish final gameplay acceptance. Earlier recovery artifacts remain unchanged.

The complete 61-path implementation delta is against exact public snapshot70bb667878b654477d762a9add8d8a7e46f3f4ad / tree4369d4835da0464e2834795445af648bacf357c9. All61 outputs were reconstructed from the patch, compared byte-for-byte against frozen Git blobs, and the full resulting tree independently recomputed to707320df59191f596616b9741c79586fd817e386. Actual Blender/GLB assets, source, generators, tests and package registration are included in the binary-capable patch.

## Restore

Starting at the repository root containing these artifacts, use a NEW clean clone:

```sh
RECOVERY_DIR="$(pwd)/design/recovery/pallas-mobile-20261022/coherent-radio"
git clone https://github.com/coldshalamov/SpaceFace.git ../spaceface-coherent-radio-recovery
git -C ../spaceface-coherent-radio-recovery checkout --detach 70bb667878b654477d762a9add8d8a7e46f3f4ad
python3 "$RECOVERY_DIR/restore.py" ../spaceface-coherent-radio-recovery
```

The script verifies exact clean base, chunk/archive/file hashes, each changed file's baseline and result identities, and the complete reconstructed tree. It applies only current-master.patch; no package install or tests run automatically. Do not combine this with earlier recovery patches or apply it to newer master without reconciliation.

## Archive contents and baseline meanings

Chunks are ordered base64 of an XZ-compressed tar archive. recovery-manifest.json pins every chunk and archive entry. Every published file is <=24 KiB. The archive contains:

- current-master.patch: complete61-path delta from public70bb to the final tree.
- outputs.json: authoritative per-file baseline/output identities for current-master.patch.
- manifest.json: original candidate provenance and changes against its sole public parent e7f6122f8d8f2985223940bfbb60eb4f66272561, not70bb.
- narrative-and-gate.patch: four-path layer against inherited candidate84ba49d3ce0261117f8be16a64fe5c0e41471ee4 / treeec18e927938b04bb873cde50636a85f5bc768f17.
- delta-manifest.json: original four-path metadata; baselineBlob fields are inherited parent metadata, not authoritative84ba49 baseline identities. Use the patch's correct base tree rather than treating null baselineBlob as proof a path was absent there.
- HANDOFF.md, verification.json and commit-object.txt: handoff, validation scope and exact original commit provenance. Recovering the final tree from70bb does not recreate the original e7-parent commit ancestry.

To inspect archived handoff/manifests without applying code, concatenate recovery.tar.xz.b64.* in lexical order, base64-decode, XZ-decompress and read the tar archive. Do not execute archived files blindly; restore.py performs integrity checks first.

## Validation boundary

The final radio source passed20/20 pure/read-model/hail tests; fresh derivative pure tests13/13 and syntax/gate checks pass. Prior-wording22/22 includes two physical cases not relabeled as final-wording execution. Inherited coherent-base selections passed76/76 original non-reef,17/17 native residency/reef,34/34 generic cleanup,126/126 mobile and27/27 newer-upstream tests. Selections overlap and are not summed into a unique-test total. Expanded upstream remains311/316 with five known shunt failures reproduced on a public-source control. This is not full-green CI.

Current-master reconciliation, implementation PR publication, shipping-camera/GPU appearance, native-phone layout/scrolling/safe areas, full-world performance, personal play and full-game acceptance remain open. This snapshot is recovery protection, not their substitute.
