# Veil-Ray Nursery measured source-model comparison

This is a new source-model reconstruction, not a live game-camera capture, exported GLB package render, full public-graph integration result, or final visual acceptance.

## Preserved evidence
- Image: comparison.jpg, Git blob f6aa177fafa816a3bc597dd4c8d60a88dbc045bc; SHA256 dbf28ae52689489fff456ecbb218f2082a729c85a13f7d61181d00d9ca8ce8e1; 204872 bytes, 1600×1180.
- Full provenance: b7b66cecf92b7c2a20a963ee45900f3f7f683806.
- Measured pose evidence: 0f11511305c71f90ef524c0c9af8b7f8f6f813f6, with baseline/candidate source identities, dependency limits and bounded probe source.
- Public source commit: eee0a811f56b9ea9d9de3b1b914fe3115e2f18e3 in coldshalamov/SpaceFace.
- The temporary base64 inspection envelope is not part of this bundle.

## Measurement
One paired actual tickAlienEcology sample, seed 1, epoch 0, tick 726, simTime 12.1. Three adults, one eight-member aggregate, and seven ribs per variant. All 22 root transforms were checked against the immutable pose evidence. Both variants report surveyed=true, watchSeconds=12, mode=QUIET. Baseline adult distances from the nursery center are 195.529/152.314/227.141 WU; candidate distances are 28.325/27.681/27.975 WU.

Simulation evidence uses exact selected public modules over a read-only dependency remainder; it is not a complete current-public graph or a full Save.loadEnvelope test. Aggregate poses are measured, including the helper's preceding-adult-tick timing, not inferred from final adult poses. No invented trajectories or physics were used.

## Portable reproduction
Use an existing authorized SpaceFace source tree at the public commit above, with its dependencies already installed. This bundle neither fetches/clones nor installs anything. Place measured-poses.json (the exact pose evidence), extract.mjs, render.py and raster_core.py together.

Run in a suitable environment with space for the output:
python -B render.py --repo PATH_TO_SPACEFACE --poses measured-poses.json --font PATH_TO_DejaVuSans.ttf --bold-font PATH_TO_DejaVuSans-Bold.ttf --output comparison.jpg

The script verifies the two visual source blobs and palette source blob before building. It does not rerun simulation. It calls the actual buildFaunaMesh/buildNurseryMineralRib builders. Actual authored-motion callbacks are frozen with reducedMotion=true at time12.1, deliberately not replaying historical animation. Renderer roots use measured X/Z, Y=0, yaw=-rot and no entity-radius scaling. Actual world and instance matrices, geometry, normals and vertex colors are extracted. Triangle counts: 2718 per adult, 8832 for the aggregate, 108 per rib.

The material branch is the actual source untextured tissue fallback, not the skin-ready tint branch. There are no textures, normal maps, native lighting, roughness/metalness shading, PBR acceptance or historical animation claims. The existing generated CPU raster helper approximates neutral ambient/diffuse light: .28 + 1.3 max(0,n·normalize[-.3,.85,.4]), emissive contribution .36, sRGB output. Orthographic zbuffer with no backface culling.

Matched top panels: 752×500, span440, center[-70,0,-65]. Separately labeled oblique detail crop: span260, center[-5,8,0], camera[.25,1.5,1.6]. JPEG quality89. The geometry/poses are unaltered between encoding variants. WebP quality85/75/65/55/45 gave 104630/81480/76380/71162/65534 bytes, so the full JPEG was retained for readability, with no claim that local storage was solved.

## Versions and licenses
The observed render used CPython3.12.14 (PSF license), Node24.19.0, Three.js0.184.0 (MIT, copyright2010–2026 three.js authors), NumPy2.3.5 (BSD-3-Clause; installed binary distributions may include additional notices), Pillow12.3.0 (MIT-CMU), and DejaVu Sans/DejaVu Sans Bold (Bitstream Vera license; DejaVu changes public domain). Consult each installed package's LICENSE/notices. No third-party implementation or font binary is vendored here. The included extractor, layout and reused CPU helper are generated task code; no new license is asserted for repository/game assets.

Font SHA256:
- Regular:57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e
- Bold:a4c5bc453ca281d90ea079e596da7ae0dfeb5777497c29ec254e76d97ff6f890

CPU helper SHA256:3054fb817f79830929a9c1dd267d460902eee2d37137b8778333ee7b602be330.

The portable Python files were syntax-checked by AST parse; extract.mjs was checked with node --input-type=module --check. The portable adaptation was not rerendered. Exact encoded byte identity can depend on codec/font/package versions; the original checked image and its immutable hashes remain the reference.
