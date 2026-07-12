# K0 material transfer notes for Helios V5

This folder inventories the user-supplied SF-K0 “Borrowed Time” packages. It does not contain copied geometry or textures and does not authorize live promotion.

## Narrow reuse decision

- Geometry: `exports/SF_K0_hull.glb` is the only Helios V5 geometry allowlist entry. Use it only as a reference or an intact docked K0 element; do not turn the K0 silhouette into station macro-geometry.
- PBR families permitted for Helios surface-language transfer: `hull`, `armor_dark`, `mechanical`, `brushed_metal`, `rubber`, `frontier_cyan`, `repair_green`, and `warning_orange` (base color, OpenGL normal, and ORM triplets).
- Generic decal permitted: `textures/decal_hazard_stripes.png`.
- Identity decals excluded: `decal_borrowed_time.png` and `decal_stencils.png`. The latter contains `K0-947`, `SALVAGE / MINING`, `CAUTION: M-DRIVE`, and `3 OWNERS // 1 WARRANTY`.
- All other K0 GLBs remain reference-only for this narrow transfer. They are not invalid assets; they are simply unnecessary for the Helios V5 station/material lane.

## Material contract

- Base color is sRGB.
- Normal maps are OpenGL tangent-space.
- ORM packing is R = ambient occlusion, G = roughness, B = metallic.
- Generate MikkTSpace tangents for meshes that use these normal maps when tangents are absent.
- If a permitted material is adopted, preserve its texture identity in authoring provenance and embed/package it through the normal SpaceFace release pipeline. Do not add a runtime dependency on the Downloads or revamp-evidence paths.

## Integrity and rights note

The extracted Revamp tree matches all 84 ZIP entries byte-for-byte. Exact archive, GLB, and texture hashes are in `INVENTORY.json`. Package documentation says the work was generated specifically for SpaceFace with no third-party content, and the user explicitly permitted direct SpaceFace reuse. However, the package contains no formal `LICENSE`/`COPYING` file and names no rights holder. Treat project-internal use as authorized, keep the provenance record, and record an explicit project rights statement before asserting general external redistribution rights.
