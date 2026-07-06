# Technique Checklist — SpaceFace Hard-Surface

**Primary reference:** `professional-techniques.md` — this checklist is a quick reminder; the main doc has the depth.

Use during each pass. Every pass must actively employ and document multiple advanced techniques from the main professional-techniques document. 

If your work only touches basic inset + bevel + flat colors, it fails.

## Silhouette & design

- [ ] Readable at thumbnail scale (64px ship height)
- [ ] Asymmetric interest — avoid mirror-perfect kitbash
- [ ] Engine read, cockpit read, weapon hardpoints obvious
- [ ] Panel lines follow form flow (longitudinal on fuselage, radial on hubs)
- [ ] Faction palette hint via accent placement, not full recolor

## Topology

- [ ] Quads on hero surfaces; triangles only on hidden/low-visibility
- [ ] Support loops around booleans and inset panels
- [ ] No ngons on flat armor faces
- [ ] Bevel-weight or sharp-edge marking consistent

## Chamfer / bevel (style law)

- [ ] Panel corner bevels: 2–3 segments, radius ~0.02–0.04m
- [ ] Cutline bevels on every boolean seam
- [ ] No 0-segment "fake" chamfers (edge split only)
- [ ] Glass canopy lip beveled

## UV

- [ ] Uniform texel density on hull hero faces
- [ ] Seams on undersides, panel backs, engine interior
- [ ] 0–1 padding ≥4px at 1k
- [ ] Trim sheet islands aligned to sheet grid if using trim workflow

## High-poly detail

- [ ] Panel inset depth 1–3mm at ship scale
- [ ] Bolt/grille floaters only where normal bake resolves them
- [ ] No micro-greeble noise that disappears at game camera distance
- [ ] Weighted normals applied before bake

## Bake quality rubric

### AO
- [ ] Contact shadows at panel overlaps
- [ ] Cavity darkening in vents and recesses
- [ ] No pure-black clipping (multiply-safe)
- [ ] No bake artifacts at UV seams (cage tuned)

### Roughness
- [ ] Edges lighter (wear) than flats
- [ ] Cavities darker/more matte
- [ ] Mechanical bays slightly different from hull paint
- [ ] Glass roughness near 0 in mask, not painted white

### Normal
- [ ] Panel lines visible without shimmer at glancing angles
- [ ] No ray-distance spikes on corners
- [ ] Consistent tangent space (OpenGL per metadata)

### Emissive mask
- [ ] White = emissive only (thrusters, windows)
- [ ] Color comes from runtime — mask is grayscale
- [ ] No bleed into hull albedo

## Material roles

- [ ] `Material_Hull` on primary body
- [ ] `Material_Accent` on antennas/decals only
- [ ] `Material_Mechanical` on engines/braces
- [ ] `Material_Glass` on canopy/lens
- [ ] Wholeship: hull tris ≥800 on hull role geometry

## Export metadata

- [ ] `spacefaceAsset` extras present
- [ ] `chamfered: true`
- [ ] `ormChannels: R=AO,G=Roughness,B=Metallic`
- [ ] Forward +X, Up +Y, Starboard +Z
- [ ] Tri count ≤ budget for kind

## Post-export

- [ ] `parts_manifest.json` entry
- [ ] Release build run
- [ ] `check:exporter` green
- [ ] `check:assets:live` green
- [ ] In-game screenshot confirms authored mesh (not procedural fallback)