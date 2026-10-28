# Archive instrument cradle: production candidate

2026-10-23. Outcome: one distinct structural model, with three authored LODs. Source and actual exported geometry reviewed; unregistered, not released, not integrated, not accepted as a finished game experience.

## Purpose and identity

Commission 6 of WORLD_BUILD_REQUESTS asks for the missing structural piece that makes the Archive Field Lab's work and scale readable. The actual exported-geometry surround preview showed the existing sensor mast as an almost invisible hairline beside a freight apron. This cradle gives that instrument a manufactured horizontal footprint, not a new station or research system.

Five-word idea: **Split-keel laboratory, exposed listening spine.** Asymmetric ivory instrument housings sit on dark structural keels, joined by a navy service spine. A physical calibration rail and carriage remain exposed beside a low central mast seat. Small cyan status lenses and amber service ends are construction details, not scan targets or a claimed scientific result. It has no invented crew, habitable interior, new reward or mandatory bearing.

The original generic sensor mast is NOT part of this asset and is not modified. Watcher (-1700,1500), Archive lab (1600,-700) and Wake Lab station (480,-980) remain separate. Proposed future use is an additional authored cradle at the actual live Archive POI anchor, preserving the existing mast and four-piece surround. No gameplay placement has been changed by this packet.

## Real export and alignment evidence

Uses canonical Forge materials/textures and asset_bank_export.py, not a replacement exporter. Three source GLBs retain embedded base/normal/ORM textures and forge-v1 semantic materials. Blender +Z converts to glTF +Y. SOCKET_MastSeat's actual exported world transform puts its origin at [0,0,0] and its local +X forward vector along glTF +Y; metadata up is glTF -Z. Actual exported seat-corner vertices are [±2.8,0,±2.4]. The seat proxy top is also Y=0.

Actual complete export bounds: X [-10,10], Y [-3.20000005,0.68000001], Z [-7.80000019,7.80000019]. The raised instrument housings flank, rather than cover, the mast support. The seat's width is sufficient for the full existing mast's drawn XZ envelope, using the previously decoded exact public sensor-mast blob a0dc395cd0863c434eea26171f231c479911a366: source X[-1.31276454,3.71348624], Ymin0, Z[-2.08498699,2.08499264], actual draw scale10/14, X offset−0.857400607, Z offset−0.000002017. This is numerical alignment against the prior actual exported-geometry receipt, not a new composite mast render. A final composite and live renderer validation remain required.

LOD0: 5,556 triangles / 532,724 bytes. LOD1: 1,364 / 317,752. LOD2: 1,216 / 300,304. LODs are not additional models. Authored compound boxes are approximate solids, not a certified flight-clearance hull. The western mouth is a visual approach cue, not a passage through the structure; narrow gaps between cradle and nearby props are not ship lanes.

## Review and iteration

Opened actual top/oblique LOD0 images. First export's rectangular housings read too block-like and a cap overlap caused a coplanar artifact. Replaced housing boxes with tapered Forge lofts and separated cap geometry; a failed intermediate call used tuple sections rather than the actual dictionary API. A second visual review found roof plates outside the shortened shoulder support. Moved them onto the actual shoulder, exported again and inspected the final image. The silhouette, material hierarchy and attachments now read at this candidate-review scale.

Preview is flat CPU material shading of decoded GLB triangles. It does not validate game PBR, shadows, fog, bloom, normal camera readability, ordinary flight, Save/Continue or final acceptance. Source-only technical checks do not close SF-ASSET-QUALITY, SF-VISUALS or SF-LIVING-WORLD.

## Checks and reproduction

Seven focused node:test tests pass: distinct identity and three LODs; bytes, hashes and costs; actual transformed socket; actual seat-face vertices; existing mast draw envelope and seat height; footprint, semantic materials and embedded textures; maintenance attachment and vent clearance. Independent review reran 7/7, and the parent reran 7/7 at 2026-10-23 19:09:57 UTC.

From a checkout with the existing dependencies installed:

    node --test test/archive-instrument-cradle.test.mjs
    PYTHONDONTWRITEBYTECODE=1 blender -b -t 1 --python-exit-code 1 --python tools/blender/forge/ships/place_archive_instrument_cradle.py

The exporter writes the three source GLBs and metadata under assets/models/asset-bank/research. SPACEFACE_FORGE and SPACEFACE_ASSET_OUT optionally select the existing Forge directory and an isolated output directory. The test accepts SPACEFACE_CANDIDATE and SPACEFACE_REPO for isolated validation.

NodeIO can emit an optional KHR_materials_emissive_strength extension warning during these geometry checks. The checks do not establish live emissive intensity or PBR appearance.

### Retained visual evidence

[archive-cradle-review.jpg](./archive-cradle-review.jpg) is deliberately retained as a top/oblique review of final LOD0 decoded GLB geometry with flat CPU material shading. It is not a live camera capture, texture/lighting acceptance, or a composite with the existing mast. Its geometry and source-material provenance can be checked against the retained source GLB and authoring recipe.

- JPEG SHA256: 9e5c612d3a4c758b5da1344ba9891a342b6bd7d6877b49c69fcbd811c7716ff8.
- Final LOD0 SHA256: 1e0e3929ff50bee60833cfeaab2b143dcf6c53b44c08473dd0ab729824afdf2d.
- Authoring source SHA256: c86edfae30bacb02d4b3c79fb7fe37b9943bb94244abfed677ee164944f9e6df.

## Next exact integration seam, not an orphan request

Fresh ownership inspection at18:48UTC: public master75b6f1840e8fcfe09ee9721870376f0a8f9bc352; NOW blobe9f2d2f6941373f9f23459fb1d947a808621e604 has no Archive-specific asset writer. PR518 owns survey/runtime; PR552 owns four-piece surround; PR554 owns lighting, not this model. No matching current lab architecture model was found. Recheck before promotion.

After asset visual/pipeline approval, register through existing Forge new-place route: tools/blender/forge/fleet.json (new_place and explicit socket names), assets/ships/parts/places/place_archive_instrument_cradle.glb, assets/ships/parts/parts_manifest.json; src/render/partsLibrary.js PLACE_FILES/runtimeSlots.place; assets/ships/render-packages/pilots.json; selected release export into assets/ships/release/parts/places/ and release_manifest.json. Existing publisher then regenerates affected render packages, src/render/renderPackageManifest.js and src/data/modelTruthCensus.json using their actual owning scripts. Verify the exact generated path in the publisher before editing; never hand-splice census or stale package hashes.

Only then coordinate the PR552 tritonFieldLabDressing.js owner for an explicit fifth authored Triton row within its existing six-row limit. Preserve the four reviewed rows and the real poiId anchor. A separate cradle is the desired integration, NOT changing landmarkGlb to replace the mast globally. Verify no unintended recenter/normalization shifts the seat, explicit placement scale1 and socket alignment, actual collision admission, new composite view, ordinary approach and Save/Continue before claiming integration accepted. This candidate does not itself complete registration, placement or live acceptance.

## Final maintenance pass and independent review

Two actual recessed service vents occupy the broad navy covers, with LOD0 slats; eight captive fasteners sit at keel/housing joints; a dark conduit joins the rear spine to the calibration bed. No extra lights or textures were added.

Independent review identified a 0.015 WU conduit support gap, a 0.01 WU slat support gap and a 0.45 WU south cover/vent overlap. Corrected conduit height to -0.27, slat height to 0.31 and cover spacing to 2.3. The slats and conduit now contact their supporting surfaces with 0.005 WU penetration, and the cover clears the full vent. Re-exported, inspected the corrected image and added an exported-vertex/construction regression. Independent review accepted the isolated candidate delta; game integration and final visual acceptance remain open.
