# Illustrated industrial space

The September 2026 graphics direction is painted science-fiction machinery: recognizable hulls,
readable construction, broad light and shadow shapes, and energetic flowing plasma. Keep every
authored model and its identity. Realism is useful for construction and materials; the finished
image should read as an illustration in motion, with neither chrome everywhere nor clay toys.

## Runtime treatment

`src/render/illustratedSurface.js` shapes diffuse illumination into four broad values, with soft,
pixel-aware transitions. Cool shadows separate from warm illuminated faces. A small geometric
grazing-angle darkening gives the hull a contour. Textures, decals, ambient occlusion, specular
reflection and emission retain their individual jobs. This is material lighting, not RGB
posterization of the screen. It does not put a filter over the HUD.

The existing bloom composite also carries an ink filter: it adds restrained contrast contours
using derivatives of neighbouring fragments, and groups perceptual luminance into
soft painted bands. It runs identically in `bloom.js` and the optional `post/spaceRenderGraph.js`.
It adds no texture reads, render targets or extra passes. Bright HDR
energy bypasses the local ink contour, and additive bloom follows the value treatment. The
screen's UI stays outside the filter. Planet imagery receives a compatible lighting ramp;
distant retained structure outlines use broad panel planes and a recessed spine.

Authored structural materials receive the treatment through `authoredMaterialProfiles.js`;
procedural material-library surfaces use the same installer. Glass, transparent effects and
emissive-only roles keep their optical response. The installer chains packed-ORM and roughness
hooks and uses one shared shader-version key. It adds no scene pass, texture, render target,
light, shadow map or per-frame JavaScript traversal. Change the version key when the shader changes.
Metal masks retain 80% of their physical metalness in the illustration shader, giving even bare
machinery a small diffuse contribution against the dark sky. This is a deliberate lighting style;
the exported metallic textures and material factors remain intact. AO is applied after the light
bands so recesses and contact detail are not flattened by quantization.
An albedo power curve of 0.8 lifts the darkest structural paint into readable midtones before
lighting. It preserves black and white endpoints and the texture's spatial detail, while glass,
signals and glowing drive apertures retain their separate treatment.

## Tutorial: bring a model into this style

1. Start with its job and silhouette. Inspect the actual release model from the shipping chase
   camera. Pick one feature visible at ordinary play distance: cargo jaws, a broad radiator,
   a shielded drive, a work deck. Preserve the ship's identity before adding small details.
2. Separate manufactured surfaces by purpose. Painted hull panels carry the main colour;
   exposed mechanisms are darker metal; ceramic insulators have a broad dry highlight;
   glazing has a controlled reflection. Avoid assigning a single rough grey material to everything.
3. Paint three scales of information: large panel/value groups, service seams and joints,
   then restrained wear. Put wear where handling, contact and heat explain it. Noise across every
   face obscures construction and sparkles when the camera moves.
4. Export semantic material roles in glTF extras as `spacefaceMaterialRole`, or use descriptive
   names recognized by `authoredMaterialProfiles.js`: `hull`, `accent`, `mechanical`, `ceramic`,
   `radiator`, `docking`, `glass`, `signal`, `drive`, `geology`. Structural paint must not be marked
   as a signal just because it has a small emissive decal.
5. Preserve base-colour, normal and packed metallic/roughness/occlusion inputs. Colour textures
   are colour data; normal and ORM textures are linear data. Never bake the illustrated lighting
   into the albedo: that would make shadows turn with the hull instead of the light.
6. For a new procedural surface, resolve a named role through `materialLibrary.resolve`. For a
   custom opaque `MeshStandardMaterial`, install `installIllustratedSurface(material)` after its
   existing shader hooks and before precompilation. Do this at creation, never in the frame loop.
   Do not give each ship a unique shader key for its paint colour. The surface hook runs after
   lighting accumulation and before AO, including when a packed-ORM hook owns the AO code.
7. Follow the [asset production route](README.md) to export source, release manifests, LODs and
   runtime maps. A changed source GLB alone does not change what the player sees. Keep editable
   source and all model identities; the material style is not permission to replace a ship with
   a primitive or discard its details.
8. Fly past the model at normal, closest and far camera distance. Check a turn, a shadow crossing,
   a thruster burst and another hull nearby. Its silhouette and major panels must read without
   relying on bloom. Check markings are legible, dark surfaces retain shape, and highlights
   describe metal instead of washing it white. Review the actual picture, not only the export.

## Effects and shadows

Retain the long luminous flight history and its actual flown curve. A bright effect needs dark
separation inside its folds and a clear source; it should not become an opaque white rectangle.
Different forces have different shapes: nozzle jet, wake, impact, shield response and dust are
not interchangeable. Use the [VFX standard](VFX_TECHNIQUE_STANDARD.md).

Graphic shadows come from the existing directional shadow map and the material's banded light
response. Preserve local contact occlusion. Do not add per-ship shadow-casting lights, a second
full-scene outline render, or screen-wide blur to create drama. Geometric contours must follow
the hull, not every scratch in its normal map. Keep emission outside the surface contour operation.

## Performance configuration and verification

Keep the shipping native render scale, shadows, authored population and selective bloom. Preserve
the existing integrated-GPU profile and two-level bloom pyramid. Spend on the visible surface,
not offscreen recomposition. Inbound hull residency must cover the authored decode runway plus
eviction hysteresis; oscillation at the boundary must retain the exact mesh. Extra simulation
catch-up ticks must honor the selected AI backend's clock classification.

For each substantive change, measure the ordinary opening and the crowded route using the runtime
witness on the owner GPU. Record frame-time tails and hitch counts, not only average FPS. Do not
take GPU-readback screenshots inside the timing window; capture afterwards. Compare the same
route, viewport and settings. Follow with `npm run check:playable`. Shader unit tests protect hook
composition; they do not establish visual quality or GPU speed. The target remains 60 fps, with
rare frames above 32 ms and a quiet simulation median under 5 ms.
