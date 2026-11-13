# Wasp original collider

`collision.glb` preserves the original `COLLISION_HULL` node, world transform and mesh from the
authored Wasp source identified by `provenance.json`. It is repository-authored geometry, not an
external asset. The Wasp export adapter imports it through Blender's glTF importer so reducing
render lofts cannot silently change gameplay collision. Keep this independent input when the
runtime Wasp GLB is replaced.

The accepted recipe retains the original shared Forge maps and cyan strength, makes graphite
panels readable, reduces invisible radial detail, restores lower-tier light strips/normals and
seats the nacelle vents. Explicit player paint remains authoritative. The painted variant still
has a surface-detail quality gap; that is follow-up work, not a reason to add an imperceptible
extra texture.
