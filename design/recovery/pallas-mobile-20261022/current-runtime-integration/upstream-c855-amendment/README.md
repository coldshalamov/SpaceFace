# Current-base amendment, 2026-10-22 13:54 UTC

This small amendment supersedes only the base/tree/parent metadata in the existing current-runtime-integration recovery. It does not replace or reupload its archive, sources, models or tests.

Fresh master is c855b6a6b9fb488d44a4fdfa4e865a9a854826b9, tree 4c6a609d86477dc161a49e1c466c12d90deca911. PR488 remains open/draft at e7f6122f8d8f2985223940bfbb60eb4f66272561. Updated runtime proposal tree is 5108d18430a99cda51c577a4c7a3a8bd7bf993d4, with ordered PUBLIC parents e7f6122f8d8f2985223940bfbb60eb4f66272561 and c855b6a6b9fb488d44a4fdfa4e865a9a854826b9. No private ancestry. Recheck both remote heads before actual runtime publication.

Compared with public 065f9d, the new master adds ONLY src/ui/ionStormHud.js (bfb2dc1755b14c199996cc2907f3afe9c1bad0af) and src/ui/travelVectorHud.js (d6e4158486815fc09bdaee9d2ae92c9b02ed0c65). Both exact owner additions are preserved. They are explicit no-op update/destroy placeholders: import absence is resolved, but real HUD features are not implemented and browser/game acceptance is not established.

The public Git tree proof was checked at root, src and src/ui: every existing sibling retained its exact blob/tree and mode, and only the two named leaves were added. The proposed tree was calculated from the previously validated cf901 tree plus those same additions. All 69 reviewed output SHA256 values remain identical. Neither added path belongs to the 1838 verified native/renderer input paths. Accordingly the prior 124 scoped passing checks remain applicable to unchanged inputs; no native fixtures were rerun. This is input-equivalence evidence, not a new game-play result.

The original recovery ZIP remains 1,441,825 bytes, SHA256 40274b742e78621a0a5034348ea193e1c04bcfdde26451cb6bad6b67491224fb, preserved by recovery commit 1a1cb0d149a64c5e98591cd4bf06fa3d7cfa6618. Retain its historical065-base evidence. Run `python apply-metadata.py ORIGINAL.zip amended-manifest.json` to verify the original archive and all 69 payloads, then emit the updated portable manifest without altering the archive. Restore its unchanged outputs onto a clean checkout of public c855b6a6, preserving both already-present upstream stubs. Changed-path base guards remain valid because no existing upstream file changed.

Only recovery metadata is published here. No final runtime tree, commit or ref is published by this amendment. Required model-source availability and actual runtime publication remain separate work. No held native snapshots, private paths or communication identifiers are included.
