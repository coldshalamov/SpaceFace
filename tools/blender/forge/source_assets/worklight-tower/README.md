# Worklight contract donor

`contract.blend` contains only two finished native meshes: `ContractCollision` and
`ContractBeaconLOD1`. They pin the existing gameplay collision shape and middle-tier beacon
while the decorative floodlight crown changes. They are authoring inputs, never runtime assets.

The worklight recipe appends these objects outside `ship.objects`, binds the beacon to its
existing `glow_amber` material, and registers them through `set_collision_mesh` and
`set_lod_mesh_override`. Forge copies them into each applicable export without finishing,
decimation, generated-GLB patching, or dependence on a previous output GLB.

`contract-source.json` pins their geometry in Blender coordinates and records the original source
GLB SHA256. Rebuild the native input with Blender:

```
blender --background --python tools/blender/forge/source_assets/worklight-tower/bake-contract.py
```

The donor contains no textures or materials. Collision positions/triangle indices survive export
exactly. Beacon positions/indices/UVs survive exactly; native normal/tangent serialization can
round components by about 0.0001. This is geometry reproducibility, not byte-identical `.blend`
serialization across Blender versions. The initial bake used Blender 5.1.2.
