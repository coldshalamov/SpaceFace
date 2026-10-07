# Mite N4 new recovery candidate

New editable production study rebuilt from the exact recovered R28 checkpoint. N4 is NOT recovered Surface3, final quality approval, installed gameplay, or GPU evidence. Runtime promotion remains off.

## Useful evidence
- Cold-import material close image and native 29.7739 px LOD2 render/crop are included. Transparent backgrounds; neutral Blender Cycles, not the game Look or a population frame.
- N1 no-map clay proves the original crown band was a split-normal/section discontinuity. N2 replaced it with a continuous physical ridge. N3 growth direction was visually rejected; N4 corrected the directional bake.
- N4 retains actual protected roots,3 asymmetric tissue folds, thin fan membranes, paired cutting jaws,3 materials/shared 1024×512 albedo/normal/roughness atlas,18,928 / 4,756 / 2,017 triangles and9 primitives per tier.
- Fresh 13/13 focused geometry/helper/hook tests pass. Exact decoded all-LOD/all-retained-fan envelope fits dense circle 2.4 at uniform scale 0.3521721885745643.
- Included native source contract radius 7.1 / mass 22 and 28-piece proposal are REVIEW DATA. Old compound-fit receipts are deliberately omitted. They do not describe the canonical dense-tier radius 2.4 / mass 8 simulation or prove jaw-gap physics.
- SIGNAL is the documented source surface mount at [.8, 1.3859453, 0]; dorsal [−.7, 1.86, 0] and contact coordinates remain fixed. No gameplay timing change.

## Rebuild
From this directory, Blender 4.3.2 and Node 24 are the tested tools. Run:
`blender -b --threads 2 --python-exit-code 1 --python tools/blender/forge/ships/brood_mite_lamellar.py -- --contract "$PWD/contracts/lamellar-mite-contract.json" --out "$PWD/artifacts/rebuilt"`
The entry explicitly refuses `--live`. The packed editable master is artifacts/n4/brood_mite.blend. All atlas recipes and exact PNGs are included. Rebuilding the atlas is optional; the included recipe is tools/bake-n1-atlas.py (legacy filename, newly pinned N4 inputs).

## Remaining gates
Close surfaces still read cleaner/smoother than the concept. Art review, normal release/package qualification, exact current flat-array presentation integration, scene/epoch/cancellation and GPU-readiness tests, real-density culling/LOD tests, and actual game Look remain open. The unchanged fleet-look CLI reached Chromium but failed with singleton Unix socket EPERM; its exact log is included. No workaround or success claim.

This archive preserves work privately for the authorized owner/publisher. PR publication is separate.
