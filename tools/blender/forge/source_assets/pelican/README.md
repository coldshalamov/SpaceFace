# Pelican reviewed source inputs

The recipe implements v05: 32-segment hip pods, thinner bill rails and cutter lamp,
15% bill emission, and crease-aware weighted normals after lower-tier decimation.
`pelican.export(...)` is the required export entry point, also used by its CLI.

`protected-nodes.json` retains original authored collision, drive/nav geometry,
and socket/motion transforms from commit 80693862f9236af51276924f72079896071fb106.
The three original file hashes are in that data. These are SpaceFace-owned source
inputs; they never read the possibly replaced live files during export.

`reviewed-lod1.glb` (540396 bytes) and `reviewed-lod2.glb` (256864 bytes) retain only
the reviewed v05 render meshes affected by Blender decimation nondeterminism.
They contain no materials or textures. The exporter keeps generated material
bindings and replaces only those mesh attributes and indices. All other objects
remain procedural. LOD0 remains procedural: its measured difference from v05 was
at most 7.46e-9 in positions and 1.075e-4 in normals/tangents, with equal oriented
triangle sets. This is not byte-identical source generation.

`provenance.json` locks the recipe, Forge, exporter, ANI_38, motion bank, helper,
protected data and two topology pins. The helper validates these before export
and refuses a stale pin. Do not update these hashes merely to clear the refusal.

To intentionally regenerate: build the changed recipe into scratch using the
scoped normal treatment, preserve original gameplay contracts, then capture and
review all changed tiers through the locked game renderer. Extract only changed
render meshes from the accepted scratch outputs, remove materials and textures,
and replace the corresponding pins. Record the new accepted output hashes,
source input hashes, visual evidence and decisions in the asset journal before
updating provenance. A geometry change must not be hidden by old tier pins.

Evidence for this revision is under `.devshots/fleet/pelican-astra/`: v05-combined,
combined-runtime-compare (LOD1/2 and Pallas), combined-lod0-fixed (corrected LOD0
package admission), v05-exact-contract.json and motion-check.json. These captures
are isolated renderer evidence, not ordinary-play acceptance. Parent publication
must preserve that distinction and reseal runtime metadata after promotion.
