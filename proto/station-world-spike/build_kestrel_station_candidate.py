"""Export a non-destructive, station-camera Kestrel fidelity candidate.

This opens the packed V4 production blend in memory, preserves the promoted
source on disk, bevels the hard manufactured forms that currently read as raw
primitives, keeps all source detail (no LOD0 50% decimation), and exports an
isolated comparison GLB. This proof intentionally retains the source object
hierarchy: visual fidelity is evaluated before any batching pass.
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy


SOURCE_COLLECTION = "KESTREL_V4_PRODUCTION_SOURCE"
ROOT_NAME = "SF_K0_BORROWED_TIME_ROOT"

BEVEL_PREFIXES = (
    "Cockpit_Frame_", "Cockpit_Console", "Cockpit_Seat",
    "Dorsal_Spine_Rib_", "Engine_HeatVane_", "Engine_NozzlePetal_",
    "FieldRepair_", "Hull_Dorsal_Spine", "Hull_SidePanel_", "Hull_TopPanel_",
    "Hull_Ventral_Keel", "Landing_Damper_", "Landing_Skid_", "Landing_Strut_",
    "Mining_Cage_", "Nose_", "Practical_Utility_", "Pulse_Receiver",
    "Pulse_MuzzleBrake_", "Service_Louver_", "Shoulder_Brace_", "UtilityPod_",
)

BEVEL_EXACT = {
    "LOD0_HULL_Kestrel_PressureHull": (0.065, 3),
    "Engine_Main_Housing": (0.085, 3),
    "Hull_Shoulder_Armor_Pair": (0.055, 2),
    "Hull_Radiator_Pod_Pair": (0.045, 2),
    "Cockpit_Recessed_Laminate": (0.035, 2),
    "Nose_Armored_Brow": (0.07, 3),
}


def bevel_settings(obj):
    if obj.name in BEVEL_EXACT:
        return BEVEL_EXACT[obj.name]
    if not obj.name.startswith(BEVEL_PREFIXES):
        return None
    minimum = min(float(value) for value in obj.dimensions)
    if minimum < 0.055:
        return None
    return (max(0.018, min(0.06, minimum * 0.16)), 2)


def apply_bevel(obj, width, segments):
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_viewport = False
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("Station camera edge treatment", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    if hasattr(modifier, "harden_normals"):
        modifier.harden_normals = True
    try:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        return True
    except RuntimeError:
        obj.modifiers.remove(modifier)
        return False
    finally:
        obj.select_set(False)


def build(output):
    source = bpy.data.collections.get(SOURCE_COLLECTION)
    if source is None:
        raise RuntimeError(f"open the V4 production blend first; missing {SOURCE_COLLECTION}")
    root = bpy.data.objects.get(ROOT_NAME)
    if root is None:
        raise RuntimeError(f"missing {ROOT_NAME}")

    meshes = [obj for obj in source.all_objects if obj.type == "MESH" and not obj.hide_render]
    bevelled = 0
    for obj in meshes:
        settings = bevel_settings(obj)
        if settings and apply_bevel(obj, *settings):
            bevelled += 1

    for obj in meshes:
        obj["sf_station_fidelity_candidate"] = True
    export_objects = set(meshes)
    export_objects.add(root)
    for name in (
        "RIG_EngineFan", "RIG_PulseGun_Yaw", "RIG_PulseGun_Recoil", "RIG_MiningEmitter",
        "SOCKET_Weapon_Front", "SOCKET_Mining_Front", "SOCKET_Engine_Main",
        "SOCKET_Trail_Main", "SOCKET_Utility_Dorsal", "SOCKET_Cargo_Ventral",
        "SOCKET_Camera_Focus", "SOCKET_RCS_Port", "SOCKET_RCS_Starboard",
    ):
        obj = bpy.data.objects.get(name)
        if obj:
            export_objects.add(obj)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_extras=True,
        export_animations=False, export_materials="EXPORT",
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_attributes=True, export_image_format="AUTO",
        export_unused_images=False,
    )
    polygons = sum(len(obj.data.polygons) for obj in meshes)
    print(
        f"SF_STATION_CANDIDATE path={output} bevelled={bevelled} "
        f"source_meshes={len(meshes)} polygons={polygons} bytes={output.stat().st_size}"
    )


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 1:
        raise SystemExit("usage: blender V4.blend --background --python SCRIPT -- OUTPUT.glb")
    build(Path(args[0]).resolve())
