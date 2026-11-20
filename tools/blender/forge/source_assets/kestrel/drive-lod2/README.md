# Reviewed Kestrel LOD2 drive native input

`contract.blend` supplies `ContractDriveLOD2` to Forge's named LOD2 override. The recipe supplies the existing `glow_drive` material. The mesh stays outside the procedural construction/finish list.

The reviewed local coordinates and object translation must travel together. Blender translation is (-13.5149507522583, -0.03638443723320961, 0), corresponding to glTF (-13.5149507522583, 0, 0.03638443723320961). Copying only the translation onto newly centered decimated geometry would move the drive incorrectly.

`contract-source.json` is the permanent numeric authoring input, extracted from reviewed node `LOD2_HOOK_DRIVE_CORE` of the original accepted LOD2 source, SHA256 `b44ea059535ca407b65202c2805ff3f3e3cf7b9323f34fd00e95b943c757bb14`. It contains local positions, indices, UVs, normals and translation in native Blender coordinates. No generated or mutable output GLB is needed to rebuild the donor:

```
blender --background --python tools/blender/forge/source_assets/kestrel/drive-lod2/bake-contract.py
```

Blender may round reconstructed normals/tangents by approximately 0.0001. The existing reviewed-buffer stage restores the exact accepted render arrays while retaining this native object transform. Collider and existing render pins are unchanged. The guard binds the native blend, numeric source and bake script; regeneration requires explicit review/rebinding even if the mesh is equivalent.
