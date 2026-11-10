# Loose Rib model-quality inspection

The runtime remains procedural. These compact glTF files are diagnostic exports of actual Three BufferGeometry from the original and candidate builders, not new shipping assets or live game captures. Source arrays are retained for comparison. Existing tissue images resolve through repository-relative URIs; no new texture was authored.

Final geometry: two cached meshes,480 triangles, closed tapered cartilage, authored side/radial-cap UVs and seam-shared unit normals. Root orientation, motion, radius16 and mass200 remain unchanged. The crook reads in both top and source-defined chase directions. The moving joint retains a visible crease/cuff but passes volume-overlap checks.

The final authored geometry includes0.93 uniform scale allowance for the existing motion. Rest origin radius13.641813 WU;968 sampled poses max15.667542; conservative all-time analytic envelope15.795125. Full targeted tests64/64; appended existing gate targets17/17. The validator reports no candidate errors and two runtime-generated tangent-space portability warnings.

## Reproduce with existing tooling
Requires the matching complete runtime, Three, sharp, Blender4.3.2 and Pillow. No dependency or generic renderer change is part of this increment. From repository root, use the included scripts:

    node scripts/inspect-bolus-rib.mjs --baseline-root /path/to/original-checkout --output-dir artifacts
    node scripts/inspect-bolus-rib.mjs --baseline-root /path/to/original-checkout --output-dir artifacts --motion
    python scripts/check-rib-export.py --input-dir artifacts
    blender -b -t 2 --python scripts/render-rib-offline.py -- --input-dir artifacts --output-dir artifacts
    blender -b -t 2 --python scripts/render-rib-offline.py -- --input-dir artifacts --output-dir artifacts --motion

The exporter creates a complete standalone diagnostic bundle using the existing repository tissue textures. An explicit --texture-dir may supply those same verified image bytes. To reproduce this compact public layout, set --output-dir design/program/world-depth-2026-10-02/bolus-rib-quality and --image-uri-prefix ../../../../assets/ships/release/surfaces/creature-skins; do not commit copied duplicate images. The public layout's URIs resolve to the original assets.

Blender source views reconstruct PBR nodes from runtime material scalars, color and exact existing maps. Export views use Blender's glTF importer. Lights,32 samples and33WU orthographic framing are matched. The chase direction follows source camera coordinates, but this is fixed inspection scale, not game distance or live Three shading. Side and top views are included. A reduced128px display comparison helps assess smoothing, not phone/gameplay acceptance. The whole-game/live visual gate remains open.
