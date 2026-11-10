#!/usr/bin/env python3
"""M4 Ashline V2 source-adaptation builder.

This wrapper deliberately reuses the proven SpaceFace export/evidence contract from
``build_m4_ashline_family.py`` while replacing its primitive macro hulls with coherent
CC0 Quaternius Ultimate Spaceships source meshes.  Every output is isolated under
``assets/ships/m4_ashline_v2``; this script never promotes or wires runtime assets.

Blender authoring is Z-up. Export is glTF Y-up with +X forward.
"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
BASE_SCRIPT = ROOT / "tools" / "blender" / "build_m4_ashline_family.py"
FAMILY_ROOT = ROOT / "assets" / "ships" / "m4_ashline_v2"
SOURCE_ROOT = FAMILY_ROOT / "source" / "reference" / "quaternius_ultimate_spaceships"
PACKET = "M4-ASHLINE-SOURCE-FAMILY-V2-001"
MANUFACTURED_NORMAL_POLICY = {
    "method": "smooth_by_angle",
    "angleDegrees": 28,
    "keepSharpEdges": True,
}
# Every camera-visible Rig mesh authored by this pass must match exactly one rule below. The rules
# drive both the inventory and semantic subjects; adding a Hook_* object without classifying it is a
# build error rather than a silent omission from the claimed authoredRig union.
RIG_COMPONENT_RULES: tuple[tuple[str, str, int, tuple[str, ...]], ...] = (
    ("boomChord", "Hook_BoomChord_", 4, ("capture",)),
    ("boomWeb", "Hook_BoomWeb_", 6, ("capture",)),
    ("boomWebFrame", "Hook_BoomWebFrame_", 6, ("capture",)),
    ("boomSplice", "Hook_BoomSplice_", 16, ("capture",)),
    ("captureRootDoubler", "Hook_BoomRootDoubler_", 2, ("capture",)),
    ("captureRootGusset", "Hook_BoomRootGusset_", 2, ("capture",)),
    ("captureRootTransition", "Hook_BoomRootTransition_", 2, ("capture",)),
    ("captureJawTransition", "Hook_BoomJawTransition_", 2, ("capture",)),
    ("jawClevis", "Hook_ClevisEar_", 4, ("capture", "jaw")),
    ("clevisPin", "Hook_ClevisPin_", 2, ("capture", "jaw")),
    ("clevisCollar", "Hook_ClevisCollar_", 2, ("capture", "jaw")),
    ("clevisRetainer", "Hook_ClevisRetainer_", 2, ("capture", "jaw")),
    ("jawArm", "Hook_JawArm_", 2, ("jaw",)),
    ("jawForging", "Hook_JawForging_", 2, ("jaw",)),
    ("jawKeeper", "Hook_JawKeeper_", 2, ("jaw",)),
    ("jawPad", "Hook_JawPad_", 6, ("jaw",)),
    ("jawPin", "Hook_JawPin_", 4, ("jaw",)),
    ("jawPivotBoss", "Hook_JawPivotBoss_", 2, ("jaw",)),
    ("jawActuatorEnd", "Hook_JawActuatorEnd_", 2, ("jaw",)),
    ("hydraulicCylinder", "Hook_JawHydraulicCase_", 2, ("jaw",)),
    ("hydraulicRod", "Hook_JawHydraulicRod_", 2, ("jaw",)),
    ("hydraulicGland", "Hook_JawHydraulicGland_", 2, ("jaw",)),
    ("hydraulicClevis", "Hook_JawHydraulicClevis_", 2, ("jaw",)),
    ("hydraulicRootPin", "Hook_JawHydraulicRootPin_", 2, ("jaw",)),
    ("hydraulicHose", "Hook_JawHydraulicHose_", 2, ("jaw",)),
    ("tetherBaseFrame", "Hook_TetherBaseFrame_", 2, ("winch",)),
    ("tetherBearingCap", "Hook_TetherBearingCap_", 2, ("winch",)),
    ("tetherBrakeServiceCover", "Hook_TetherBrake_ServiceCover", 1, ("winch",)),
    ("drumBearing", "Hook_TetherDrum_Bearing_", 2, ("winch",)),
    ("drumBrake", "Hook_TetherDrum_BrakeBand", 1, ("winch",)),
    ("drumCableWrap", "Hook_TetherDrum_CableWrap", 1, ("winch",)),
    ("drumClutchLever", "Hook_TetherDrum_ClutchLever", 1, ("winch",)),
    ("tetherDrum", "Hook_TetherDrum_Grooved", 1, ("winch",)),
    ("drumKeyedShaft", "Hook_TetherDrum_KeyedShaft", 1, ("winch",)),
    ("braidedCable", "Hook_TetherFairlead_BraidedRun", 1, ("winch",)),
    ("fairleadDrumRun", "Hook_TetherFairlead_DrumRun", 1, ("winch",)),
    ("fairleadGuide", "Hook_TetherFairlead_Guide_", 2, ("winch",)),
    ("fairleadRoller", "Hook_TetherFairlead_Roller_", 2, ("winch",)),
    ("tetherFairlead", "Hook_TetherFairlead_Sheave", 1, ("winch",)),
    ("fairleadTerminal", "Hook_TetherFairlead_Terminal_", 2, ("winch",)),
    ("drumGuard", "Hook_TetherGuard_", 2, ("winch",)),
    ("driveBell", "Hook_DriveBell_", 2, ("drives",)),
    ("driveCavityLiner", "Hook_DriveCavityLiner_", 2, ("drives",)),
    ("driveClamp", "Hook_DriveClamp_", 4, ("drives",)),
    ("driveHotSection", "Hook_DriveHotSection_", 2, ("drives",)),
    ("driveInternalCue", "Hook_DriveInternalCue_", 2, ("drives",)),
    ("drivePressureCase", "Hook_DrivePressureCase_", 2, ("drives",)),
    ("driveRefractoryThroat", "Hook_DriveRefractoryThroat_", 2, ("drives",)),
    ("driveRootDoubler", "Hook_DriveRootDoubler_", 4, ("drives",)),
    ("driveRootLink", "Hook_DriveRootLink_", 4, ("drives",)),
    ("driveSaddleCheek", "Hook_DriveSaddleCheek_", 2, ("drives",)),
    ("driveSaddleFoot", "Hook_DriveSaddleFoot_", 4, ("drives",)),
    ("driveSaddleWeb", "Hook_DriveSaddleWeb_", 4, ("drives",)),
    ("driveServiceLine", "Hook_DriveServiceLine_", 2, ("drives",)),
    ("driveSaddle", "Hook_DriveThrustSaddle_", 2, ("drives",)),
    ("driveValveFitting", "Hook_DriveValveFitting_", 4, ("drives",)),
    ("driveValvePack", "Hook_DriveValvePack_", 2, ("drives",)),
    ("driveServiceTag", "Hook_ServiceTag_Drive_", 2, ("drives",)),
    ("forwardMountSaddle", "Hook_ForwardMountSaddle", 1, ("forwardMount",)),
    ("forwardMountGusset", "Hook_ForwardMountGusset_", 2, ("forwardMount",)),
)
RIG_COMPONENT_COUNT_EXPECTATIONS = {
    role: expected for role, _prefix, expected, _groups in RIG_COMPONENT_RULES
}
RIG_COMPONENT_MATERIAL_EXPECTATIONS = {
    "boomChord": "Material_Hull",
    "boomWeb": "Material_Mechanical",
    "boomWebFrame": "Material_Hull",
    "boomSplice": "Material_Mechanical",
    "captureRootDoubler": "Material_Mechanical",
    "captureRootGusset": "Material_Hull",
    "captureRootTransition": "Material_Hull",
    "captureJawTransition": "Material_Mechanical",
    "jawClevis": "Material_Mechanical",
    "clevisPin": "Material_Mechanical",
    "clevisCollar": "Material_Mechanical",
    "clevisRetainer": "Material_PolishedSteel",
    "jawArm": "Material_Mechanical",
    "jawForging": "Material_Mechanical",
    "jawKeeper": "Material_Hull",
    "jawPad": "Material_Hardface",
    "jawPin": "Material_Mechanical",
    "jawPivotBoss": "Material_Mechanical",
    "jawActuatorEnd": "Material_Mechanical",
    "hydraulicCylinder": "Material_Mechanical",
    "hydraulicRod": "Material_PolishedSteel",
    "hydraulicGland": "Material_Mechanical",
    "hydraulicClevis": "Material_Mechanical",
    "hydraulicRootPin": "Material_Mechanical",
    "hydraulicHose": "Material_CableSteel",
    "tetherBaseFrame": "Material_Hull",
    "tetherBearingCap": "Material_Mechanical",
    "tetherBrakeServiceCover": "Material_Red_Paint",
    "drumBearing": "Material_Mechanical",
    "drumBrake": "Material_Mechanical",
    "drumCableWrap": "Material_CableSteel",
    "drumClutchLever": "Material_Mechanical",
    "tetherDrum": "Material_Mechanical",
    "drumKeyedShaft": "Material_PolishedSteel",
    "braidedCable": "Material_CableSteel",
    "fairleadDrumRun": "Material_CableSteel",
    "fairleadGuide": "Material_Hull",
    "fairleadRoller": "Material_Mechanical",
    "tetherFairlead": "Material_Mechanical",
    "fairleadTerminal": "Material_Mechanical",
    "drumGuard": "Material_Mechanical",
    "driveBell": "Material_HotSection",
    "driveCavityLiner": "Material_Mechanical",
    "driveClamp": "Material_Mechanical",
    "driveHotSection": "Material_HotSection",
    "driveInternalCue": "Material_Cyan",
    "drivePressureCase": "Material_Mechanical",
    "driveRefractoryThroat": "Material_Refractory",
    "driveRootDoubler": "Material_Hull",
    "driveRootLink": "Material_Mechanical",
    "driveSaddleCheek": "Material_Hull",
    "driveSaddleFoot": "Material_Mechanical",
    "driveSaddleWeb": "Material_Mechanical",
    "driveServiceLine": "Material_Mechanical",
    "driveSaddle": "Material_Hull",
    "driveValveFitting": "Material_PolishedSteel",
    "driveValvePack": "Material_Mechanical",
    "driveServiceTag": "Material_Red_Paint",
    "forwardMountSaddle": "Material_Mechanical",
    "forwardMountGusset": "Material_Hull",
}
if set(RIG_COMPONENT_MATERIAL_EXPECTATIONS) != set(RIG_COMPONENT_COUNT_EXPECTATIONS):
    raise RuntimeError("Rig component material expectations must cover exactly every component rule")
RIG_COMPONENT_INVENTORY_SCHEMA = "spaceface.rigMaterialTruthInventory.v3"
RIG_COLLISION_CONTRACT = {
    "schema": "spaceface.rigCompoundCollision.v1",
    "helpers": [
        {
            "name": "COLLISION_HULL_00",
            "compoundIndex": 0,
            "translation": [-6.166666507720947, 0.0, 0.0],
            "bounds": {
                "min": [-3.3299999237060547, -2.7726552486419678, -4.827301502227783],
                "max": [3.3299999237060547, 2.7726552486419678, 4.827301502227783],
            },
        },
        {
            "name": "COLLISION_HULL_01",
            "compoundIndex": 1,
            "translation": [0.0, 0.0, 0.0],
            "bounds": {
                "min": [-3.3299999237060547, -3.036717653274536, -5.287044525146484],
                "max": [3.3299999237060547, 3.036717653274536, 5.287044525146484],
            },
        },
        {
            "name": "COLLISION_HULL_02",
            "compoundIndex": 2,
            "translation": [6.166666507720947, 0.0, 0.0],
            "bounds": {
                "min": [-3.3299999237060547, -2.7726552486419678, -4.827301502227783],
                "max": [3.3299999237060547, 2.7726552486419678, 4.827301502227783],
            },
        },
    ],
}
RIG_COMPONENT_INVENTORY: dict[str, Any] | None = None
RIG_SEMANTIC_BOUNDS: dict[str, Any] | None = None

# These are intentionally pre-merge authoring names. The released mesh is joined by material to
# preserve the Rig's nine-draw LOD0 budget; the root contract retains what that merge erases.
RIG_SEMANTIC_GROUP_IDS = ("capture", "jaw", "winch", "drives", "forwardMount")
RIG_SEMANTIC_GROUP_PREFIXES: dict[str, tuple[str, ...]] = {
    group_id: tuple(
        prefix
        for _role, prefix, _expected, groups in RIG_COMPONENT_RULES
        if group_id in groups
    )
    for group_id in RIG_SEMANTIC_GROUP_IDS
}
RIG_SEMANTIC_BOUNDS_SCHEMA = "spaceface.m4-ashline-v2.rig-semantic-bounds.v2"


def canonical_digest(value: Any) -> str:
    def normalize(item: Any) -> Any:
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, dict):
            return {key: normalize(child) for key, child in item.items()}
        if isinstance(item, list):
            return [normalize(child) for child in item]
        return item

    return hashlib.sha256(
        json.dumps(normalize(value), sort_keys=True, separators=(",", ":")).encode("utf-8"),
    ).hexdigest().upper()


RIG_COLLISION_CONTRACT_DIGEST = canonical_digest(RIG_COLLISION_CONTRACT)


def load_base():
    spec = importlib.util.spec_from_file_location("spaceface_m4_ashline_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {BASE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base()
base.FAMILY_ROOT = FAMILY_ROOT
base.PACKET = PACKET
base.FAMILY_ID = "ashline_v2"
base.LOD_RECIPES = (
    ("lod0", 1.0, False),
    ("lod1", 0.52, True),
    ("lod2", 0.20, True),
)
base.CANONICAL_MATERIAL_NAMES = tuple(dict.fromkeys((
    *base.CANONICAL_MATERIAL_NAMES,
    "Material_RepairPrimer",
    "Material_HeatMetal",
    "Material_PolishedSteel",
    "Material_CableSteel",
    "Material_Hardface",
    "Material_HotSection",
    "Material_Refractory",
)))

ORIGINAL_CREATE_CANONICAL_MATERIALS = base.create_canonical_materials
ORIGINAL_ENSURE_PACKED_ORM_ASSIGNMENTS = base.ensure_packed_orm_assignments
ORIGINAL_BUILD_ONE_SHIP = base.build_one_ship
ACTIVE_BUILD_SHIP_KEY: str | None = None

# One Rig authority table feeds the direct Blender material setup and the authored embedded maps.
# Family defaults remain intentionally separate for Dart/Lode, whose accepted preservation
# contracts use Material_HeatMetal and a different shared plate response.
RIG_MATERIAL_TREATMENTS = {
    "Material_Hull": ((26, 32, 36, 255), 0.72, 0.08, None, 0.0),
    "Material_Mechanical": ((43, 46, 48, 255), 0.31, 0.88, None, 0.0),
    "Material_Red_Paint": ((82, 22, 15, 255), 0.78, 0.0, None, 0.0),
    "Material_PolishedSteel": ((104, 112, 116, 255), 0.18, 0.96, None, 0.0),
    "Material_CableSteel": ((52, 58, 60, 255), 0.42, 0.93, None, 0.0),
    "Material_Hardface": ((68, 54, 48, 255), 0.38, 0.90, None, 0.0),
    "Material_HotSection": ((67, 62, 57, 255), 0.34, 0.94, None, 0.0),
    "Material_Refractory": ((55, 49, 41, 255), 0.97, 0.0, None, 0.0),
    "Material_Cyan": ((8, 20, 23, 255), 0.52, 0.02, (0.004, 0.07, 0.11), 1.0),
}


def build_one_ship_with_active_material_role(ship_key: str) -> dict[str, Any]:
    """Select Rig direct-material truth without changing Dart/Lode family defaults."""
    global ACTIVE_BUILD_SHIP_KEY
    prior = ACTIVE_BUILD_SHIP_KEY
    ACTIVE_BUILD_SHIP_KEY = ship_key
    try:
        return ORIGINAL_BUILD_ONE_SHIP(ship_key)
    finally:
        ACTIVE_BUILD_SHIP_KEY = prior


base.build_one_ship = build_one_ship_with_active_material_role


def ensure_rig_packed_orm_assignments(doc: dict[str, Any]) -> None:
    """Bind every Rig ORM image to both material data roles after glTF export.

    Blender's glTF writer emits the metallic/roughness link from the Principled node but does not
    infer that this game's packed red channel is also the authored occlusion input.  Patch the
    exported texture-info objects rather than introducing a second image, retaining any existing
    UV transform/texcoord and occlusion strength metadata.
    """
    ORIGINAL_ENSURE_PACKED_ORM_ASSIGNMENTS(doc)
    root_names = {node.get("name") for node in doc.get("nodes") or []}
    if "SF_M4_ASHLINE_V2_RIG_ROOT" not in root_names:
        return
    required = {
        "Material_Hull", "Material_Mechanical", "Material_Red_Paint",
        "Material_PolishedSteel", "Material_CableSteel", "Material_Hardface",
        "Material_HotSection", "Material_Refractory", "Material_Cyan",
    }
    materials = {material.get("name"): material for material in doc.get("materials") or []}
    missing = sorted(required - set(materials))
    if missing:
        raise RuntimeError(f"Rig packed ORM materials missing: {missing}")
    for name in sorted(required):
        material = materials[name]
        metallic_roughness = (material.get("pbrMetallicRoughness") or {}).get("metallicRoughnessTexture")
        if not metallic_roughness or not isinstance(metallic_roughness.get("index"), int):
            raise RuntimeError(f"{name} has no exported metallicRoughness ORM texture")
        prior_occlusion = material.get("occlusionTexture") or {}
        # Retain the Metallic/Roughness texture sampling metadata by default; a pre-existing
        # occlusion texture may supply a deliberately tuned strength or UV transform.
        occlusion = {
            key: copy.deepcopy(value)
            for key, value in metallic_roughness.items()
            if key != "index"
        }
        for key in ("texCoord", "extensions", "extras"):
            if key in prior_occlusion:
                occlusion[key] = copy.deepcopy(prior_occlusion[key])
        occlusion["index"] = metallic_roughness["index"]
        occlusion["strength"] = prior_occlusion.get("strength", 1.0)
        material["occlusionTexture"] = occlusion


base.ensure_packed_orm_assignments = ensure_rig_packed_orm_assignments


def create_material_truth_materials() -> dict[str, bpy.types.Material]:
    mats = ORIGINAL_CREATE_CANONICAL_MATERIALS()
    # Coatings are dielectrics; exposed construction logic is supplied by separate mechanical and
    # heat-metal parts rather than pretending paint is bright metal.
    base._wire_material_maps(mats["Material_Hull"], (108, 76, 69, 255), 0.52, 0.34, None, 0.0)
    base._wire_material_maps(mats["Material_Mechanical"], (47, 43, 45, 255), 0.58, 0.82, None, 0.0)
    base._wire_material_maps(mats["Material_Red_Paint"], (116, 28, 24, 255), 0.58, 0.0, None, 0.0)
    # The legacy semantic slot remains available to runtime hooks, but the authored treatment is a
    # dim recessed energy cue rather than a glossy exterior neon part.
    base._wire_material_maps(
        mats["Material_Cyan"],
        (70, 12, 10, 255),
        0.45,
        0.02,
        (0.55, 0.02, 0.01),
        0.35,
    )
    additions = {
        # Chalked zinc/phosphate repair primer. It remains dielectric until physically chipped.
        "Material_RepairPrimer": ((132, 124, 108, 255), 0.82, 0.0, None, 0.0),
        # Nickel-superalloy hot sections and heat-darkened stainless shielding.
        "Material_HeatMetal": ((58, 48, 44, 255), 0.44, 0.92, None, 0.0),
        # Rig-only authored roles. Dart and Lode continue to use Material_HeatMetal unchanged.
        "Material_PolishedSteel": ((104, 112, 116, 255), 0.18, 0.96, None, 0.0),
        "Material_CableSteel": ((52, 58, 60, 255), 0.42, 0.93, None, 0.0),
        "Material_Hardface": ((68, 54, 48, 255), 0.38, 0.90, None, 0.0),
        "Material_HotSection": ((67, 62, 57, 255), 0.34, 0.94, None, 0.0),
        # Alumina/zirconia nozzle throats and optical collimators.
        "Material_Refractory": ((91, 86, 76, 255), 0.78, 0.0, None, 0.0),
    }
    for name, (rgba, rough, metal, emit, strength) in additions.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        base._wire_material_maps(mat, rgba, rough, metal, emit, strength)
        mats[name] = mat
    if ACTIVE_BUILD_SHIP_KEY == "rig":
        # Establish the exact Rig factors and colors before any geometry is authored. The later
        # treatment replaces these temporary solid maps with role-specific generated maps using
        # this same table, so neither path can silently retain the shared family defaults.
        for name, (rgba, rough, metal, emit, strength) in RIG_MATERIAL_TREATMENTS.items():
            base._wire_material_maps(mats[name], rgba, rough, metal, emit, strength)
    material_contracts = {
        "Material_Hull": {"surfaceClass": "coated_structural_steel", "metallic": 0.34, "emissive": False},
        "Material_Mechanical": {"surfaceClass": "nitrided_cold_steel", "metallic": 0.82, "emissive": False},
        "Material_Red_Paint": {"surfaceClass": "oxide_red_guard_coating", "metallic": 0.0, "emissive": False},
        "Material_Cyan": {"surfaceClass": "recessed_internal_indicator", "metallic": 0.02, "emissive": True},
        "Material_HeatMetal": {"surfaceClass": "nickel_hot_section_or_hardface", "metallic": 0.92, "emissive": False},
        "Material_PolishedSteel": {"surfaceClass": "polished_shaft_and_interface_steel", "metallic": 0.96, "emissive": False},
        "Material_CableSteel": {"surfaceClass": "braided_high_carbon_cable_steel", "metallic": 0.93, "emissive": False},
        "Material_Hardface": {"surfaceClass": "heat_darkened_hardface_alloy", "metallic": 0.90, "emissive": False},
        "Material_HotSection": {"surfaceClass": "nickel_hot_section_and_bell", "metallic": 0.94, "emissive": False},
        "Material_Refractory": {"surfaceClass": "dry_alumina_zirconia_ceramic", "metallic": 0.0, "emissive": False},
    }
    for name, contract in material_contracts.items():
        mats[name]["spacefaceMaterial"] = contract
    return mats


base.create_canonical_materials = create_material_truth_materials


def preserve_historical_render_paths(
    ship_key: str,
    _root: bpy.types.Object,
    _lod0_meshes: list[bpy.types.Object],
    evidence_dir: Path,
) -> list[str]:
    """Never overwrite unbound historical contacts during a source rebuild.

    Current material-truth evidence is produced by the separate exact-source renderer and bound
    through the evidence epoch. Reusing the old filenames here would create another mixed epoch.
    """
    renders = evidence_dir / "renders"
    if not renders.exists():
        return []
    return [
        str(path.relative_to(ROOT)).replace("\\", "/")
        for path in sorted(renders.glob("*.png"))
        if path.is_file()
    ]


base.render_evidence = preserve_historical_render_paths


def reset_scene_without_preferences() -> None:
    """Clear scene datablocks without resetting Blender preferences or the MCP add-on."""
    base.ensure_object_mode()
    base.deselect_all()
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


base.reset_scene = reset_scene_without_preferences

ORIGINAL_ENSURE_NORMALS = base.ensure_normals


def ensure_manufactured_normals(obj: bpy.types.Object) -> None:
    """Preserve rolled curvature while keeping folded and machined edges mechanically crisp."""
    if obj.type != "MESH":
        return
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth_by_angle(
            angle=math.radians(MANUFACTURED_NORMAL_POLICY["angleDegrees"]),
            keep_sharp_edges=True,
        )
    except Exception:
        ORIGINAL_ENSURE_NORMALS(obj)
    finally:
        obj.select_set(False)


base.ensure_normals = ensure_manufactured_normals

ORIGINAL_TRIANGULATE_OBJECT = base.triangulate_object


def triangulate_and_validate(obj: bpy.types.Object) -> None:
    ORIGINAL_TRIANGULATE_OBJECT(obj)
    if obj.type == "MESH" and obj.data:
        # Blender's glTF exporter otherwise repairs invalid post-decimation custom data during
        # export and emits a warning. Repair it deterministically before evidence or export.
        obj.data.validate(clean_customdata=True)
        obj.data.update()


base.triangulate_object = triangulate_and_validate


SHIP_CONFIG: dict[str, dict[str, Any]] = {
    "dart": {
        "donorHints": ("insurgent",),
        "targetLength": 15.6,
        "sourceScale": (1.12, 0.82, 0.72),
        "title": "Ashline V2 Dart",
    },
    "lode": {
        "donorHints": ("pancake",),
        "targetLength": 24.0,
        "sourceScale": (1.00, 1.16, 1.22),
        "title": "Ashline V2 Maul",
    },
    "rig": {
        "donorHints": ("striker",),
        "targetLength": 18.5,
        "sourceScale": (1.00, 1.04, 1.12),
        "title": "Ashline V2 Hook",
    },
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def source_candidates() -> list[Path]:
    preferred = {".glb": 0, ".gltf": 1, ".fbx": 2, ".obj": 3, ".blend": 4}
    files = [p for p in SOURCE_ROOT.rglob("*") if p.is_file() and p.suffix.lower() in preferred]
    return sorted(files, key=lambda p: (preferred[p.suffix.lower()], len(p.parts), str(p).lower()))


def resolve_donor(ship_key: str) -> Path:
    files = source_candidates()
    if not files:
        raise FileNotFoundError(f"No supported Quaternius source models beneath {SOURCE_ROOT}")
    hints = SHIP_CONFIG[ship_key]["donorHints"]
    for hint in hints:
        matches = [p for p in files if hint in str(p).lower()]
        if matches:
            # Prefer the base/red variation when the pack contains material variants.
            preferred = {".glb": 0, ".gltf": 1, ".fbx": 2, ".obj": 3, ".blend": 4}
            matches.sort(key=lambda p: (preferred[p.suffix.lower()], len(str(p))))
            return matches[0]
    raise FileNotFoundError(f"No donor matching {hints}; available={files[:20]}")


def import_source(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    ext = path.suffix.lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    elif ext == ".blend":
        with bpy.data.libraries.load(str(path), link=False) as (data_from, data_to):
            data_to.objects = list(data_from.objects)
        for obj in data_to.objects:
            if obj is not None:
                bpy.context.scene.collection.objects.link(obj)
    imported = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not imported:
        raise RuntimeError(f"Source imported no mesh objects: {path}")
    return imported


def join_imported(imported: list[bpy.types.Object], coll: bpy.types.Collection) -> bpy.types.Object:
    base.ensure_object_mode()
    base.deselect_all()
    for obj in imported:
        # Preserve evaluated source topology while removing fragile parent transforms.
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    # Bake import-space rotations/scales before joining so bounds and +X normalization operate
    # on the actual visible geometry rather than the glTF scene-root transform.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(imported) > 1:
        bpy.ops.object.join()
    hull = bpy.context.active_object
    hull.name = "SourceAdapted_MacroHull"
    for owner in list(hull.users_collection):
        owner.objects.unlink(hull)
    coll.objects.link(hull)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return hull


def bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    pts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
        Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))),
    )


def orient_and_scale(hull: bpy.types.Object, ship_key: str) -> None:
    lo, hi = bounds(hull)
    dims = hi - lo
    major = max(range(3), key=lambda i: dims[i])
    if major == 1:
        hull.data.transform(Matrix.Rotation(-math.pi / 2.0, 4, 'Z'))
    elif major == 2:
        hull.data.transform(Matrix.Rotation(math.pi / 2.0, 4, 'Y'))
    hull.data.update()

    lo, hi = bounds(hull)
    dims = hi - lo
    if dims.x <= 0.001:
        raise RuntimeError("Degenerate donor length")
    target = float(SHIP_CONFIG[ship_key]["targetLength"])
    uniform = target / dims.x
    sx, sy, sz = SHIP_CONFIG[ship_key]["sourceScale"]
    hull.data.transform(Matrix.Diagonal((uniform * sx, uniform * sy, uniform * sz, 1.0)))
    hull.data.update()

    # Place geometric center at origin. Source role hardware and sockets are authored around it.
    lo, hi = bounds(hull)
    center = (lo + hi) * 0.5
    hull.data.transform(Matrix.Translation(-center))
    hull.data.update()

    # Infer nose direction from end-cap radial mass; the narrower end points forward.
    verts = [v.co.copy() for v in hull.data.vertices]
    xs = [v.x for v in verts]
    xmin, xmax = min(xs), max(xs)
    band = max(0.05, (xmax - xmin) * 0.13)
    neg = [math.hypot(v.y, v.z) for v in verts if v.x <= xmin + band]
    pos = [math.hypot(v.y, v.z) for v in verts if v.x >= xmax - band]
    neg_radius = sum(neg) / max(1, len(neg))
    pos_radius = sum(pos) / max(1, len(pos))
    if neg_radius < pos_radius:
        hull.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
        hull.data.update()


def make_material_truth_mesh(
    name: str,
    vertices_rt: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Create an explicitly authored runtime-space mesh without primitive operator defaults."""
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([base.L(*vertex) for vertex in vertices_rt], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.data.materials.append(material)
    obj["sf_detail_level"] = detail
    obj["sf_source_adaptation_detail"] = True
    obj["sf_material_truth"] = True
    if close_only:
        obj["sf_close_only"] = True
    if component:
        obj["sf_component"] = component
    return obj


def make_runtime_box(
    name: str,
    size_rt: tuple[float, float, float],
    location_rt: tuple[float, float, float],
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    sx, sy, sz = (value * 0.5 for value in size_rt)
    cx, cy, cz = location_rt
    vertices = [
        (cx + dx, cy + dy, cz + dz)
        for dx, dy, dz in (
            (-sx, -sy, -sz), (-sx, -sy, sz), (-sx, sy, sz), (-sx, sy, -sz),
            (sx, -sy, -sz), (sx, -sy, sz), (sx, sy, sz), (sx, sy, -sz),
        )
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_runtime_beveled_box(
    name: str,
    size_rt: tuple[float, float, float],
    location_rt: tuple[float, float, float],
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    bevel: float = 0.04,
    detail: int = 1,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Small manufactured block with explicit edge breaks; never use for primary silhouette masses."""
    obj = make_runtime_box(
        name, size_rt, location_rt, material, coll,
        detail=detail, close_only=close_only, component=component,
    )
    base.bevel_object(obj, bevel, 2)
    return obj


def make_chamfered_prism_x(
    name: str,
    x0: float,
    x1: float,
    center_y0: float,
    center_y1: float,
    center_z0: float,
    center_z1: float,
    height0: float,
    height1: float,
    width0: float,
    width1: float,
    chamfer_ratio: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Eight-sided changing section for receivers, girders, and housings with real edge breaks."""
    ratio = max(0.04, min(0.42, chamfer_ratio))
    vertices: list[tuple[float, float, float]] = []
    for x, cy, cz, height, width in (
        (x0, center_y0, center_z0, height0, width0),
        (x1, center_y1, center_z1, height1, width1),
    ):
        hy, hz = height * 0.5, width * 0.5
        dy, dz = height * ratio, width * ratio
        vertices.extend([
            (x, cy - hy + dy, cz - hz),
            (x, cy - hy, cz - hz + dz),
            (x, cy - hy, cz + hz - dz),
            (x, cy - hy + dy, cz + hz),
            (x, cy + hy - dy, cz + hz),
            (x, cy + hy, cz + hz - dz),
            (x, cy + hy, cz - hz + dz),
            (x, cy + hy - dy, cz - hz),
        ])
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(8))),
        tuple(8 + index for index in range(8)),
    ]
    for index in range(8):
        nxt = (index + 1) % 8
        faces.append((index, nxt, 8 + nxt, 8 + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_plate_outline_y(
    name: str,
    outline_xz: list[tuple[float, float]],
    y0: float,
    y1: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Folded plate with an authored plan outline, avoiding rectangular decal-like slabs."""
    vertices = [
        (x, y, z)
        for y in (y0, y1)
        for x, z in outline_xz
    ]
    count = len(outline_xz)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_plate_outline_z(
    name: str,
    outline_xy: list[tuple[float, float]],
    z0: float,
    z1: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Fabricated side plate in the X/Y load plane, with honest thickness across runtime Z."""
    vertices = [
        (x, y, z)
        for z in (z0, z1)
        for x, y in outline_xy
    ]
    count = len(outline_xy)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_plate_frame_z(
    name: str,
    outer_xy: list[tuple[float, float]],
    inner_xy: list[tuple[float, float]],
    z0: float,
    z1: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Thick fabricated cheek with a real through-opening, not a painted triangle on a slab."""
    if len(outer_xy) != len(inner_xy) or len(outer_xy) < 3:
        raise ValueError(f"{name} frame loops must have equal vertex counts >= 3")
    count = len(outer_xy)
    vertices: list[tuple[float, float, float]] = []
    for z in (z0, z1):
        vertices.extend((x, y, z) for x, y in outer_xy)
        vertices.extend((x, y, z) for x, y in inner_xy)
    faces: list[tuple[int, ...]] = []
    stride = count * 2
    for index in range(count):
        nxt = (index + 1) % count
        # Front and rear annular faces.
        faces.append((index, nxt, count + nxt, count + index))
        faces.append((
            stride + index, stride + count + index,
            stride + count + nxt, stride + nxt,
        ))
        # Outer perimeter wall and inner aperture wall.
        faces.append((index, stride + index, stride + nxt, nxt))
        faces.append((
            count + index, count + nxt,
            stride + count + nxt, stride + count + index,
        ))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_profiled_plate_chord(
    name: str,
    sections: list[tuple[float, float, float, float]],
    thickness: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Stepped plate-girder flange from an authored centerline and changing visible depth."""
    if len(sections) < 2:
        raise ValueError(f"{name} requires at least two chord sections")
    vertices: list[tuple[float, float, float]] = []
    for index, (x, y, z, width) in enumerate(sections):
        previous = sections[max(0, index - 1)]
        following = sections[min(len(sections) - 1, index + 1)]
        dx, dy = following[0] - previous[0], following[1] - previous[1]
        length = math.hypot(dx, dy)
        if length <= 1e-6:
            raise ValueError(f"{name} has a collapsed centerline section")
        nx, ny = -dy / length, dx / length
        for z_offset in (-thickness * 0.5, thickness * 0.5):
            vertices.extend([
                (x + nx * width * 0.5, y + ny * width * 0.5, z + z_offset),
                (x - nx * width * 0.5, y - ny * width * 0.5, z + z_offset),
            ])
    faces: list[tuple[int, ...]] = []
    for section in range(len(sections) - 1):
        start = section * 4
        nxt = (section + 1) * 4
        faces.extend([
            (start, nxt, nxt + 1, start + 1),
            (start + 2, start + 3, nxt + 3, nxt + 2),
            (start, start + 2, nxt + 2, nxt),
            (start + 1, nxt + 1, nxt + 3, start + 3),
        ])
    faces.extend([
        (0, 1, 3, 2),
        (
            (len(sections) - 1) * 4,
            (len(sections) - 1) * 4 + 2,
            (len(sections) - 1) * 4 + 3,
            (len(sections) - 1) * 4 + 1,
        ),
    ])
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_tapered_plate_strap(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    width_start: float,
    width_end: float,
    thickness: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Load-directed plate strap with a visibly changing section and no box-primitive ancestry."""
    x0, y0, z0 = start
    x1, y1, z1 = end
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length <= 1e-6:
        raise ValueError(f"{name} strap endpoints collapse")
    nx, ny = -dy / length, dx / length
    outline = [
        (x0 + nx * width_start * 0.5, y0 + ny * width_start * 0.5, z0),
        (x1 + nx * width_end * 0.5, y1 + ny * width_end * 0.5, z1),
        (x1 - nx * width_end * 0.5, y1 - ny * width_end * 0.5, z1),
        (x0 - nx * width_start * 0.5, y0 - ny * width_start * 0.5, z0),
    ]
    half_t = thickness * 0.5
    vertices = [
        (x, y, z + offset)
        for offset in (-half_t, half_t)
        for x, y, z in outline
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_multisection_chamfered_prism_x(
    name: str,
    sections: list[tuple[float, float, float, float, float]],
    chamfer_ratio: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Faceted welded pressure case with shoulders and waist changes along its flow axis."""
    if len(sections) < 2:
        raise ValueError(f"{name} requires at least two pressure-case sections")
    ratio = max(0.04, min(0.42, chamfer_ratio))
    vertices: list[tuple[float, float, float]] = []
    for x, cy, cz, height, width in sections:
        hy, hz = height * 0.5, width * 0.5
        dy, dz = height * ratio, width * ratio
        vertices.extend([
            (x, cy - hy + dy, cz - hz),
            (x, cy - hy, cz - hz + dz),
            (x, cy - hy, cz + hz - dz),
            (x, cy - hy + dy, cz + hz),
            (x, cy + hy - dy, cz + hz),
            (x, cy + hy, cz + hz - dz),
            (x, cy + hy, cz - hz + dz),
            (x, cy + hy - dy, cz - hz),
        ])
    faces: list[tuple[int, ...]] = [tuple(reversed(range(8)))]
    for section in range(len(sections) - 1):
        start = section * 8
        nxt_start = (section + 1) * 8
        for index in range(8):
            nxt = (index + 1) % 8
            faces.append((start + index, start + nxt, nxt_start + nxt, nxt_start + index))
    last = (len(sections) - 1) * 8
    faces.append(tuple(last + index for index in range(8)))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_revolved_profile_z(
    name: str,
    profile: list[tuple[float, float]],
    center_x: float,
    center_y: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    sides: int = 10,
    detail: int = 2,
    close_only: bool = True,
    component: str = "",
) -> bpy.types.Object:
    """Faceted bolt, bearing cap, or pin aligned to runtime Z."""
    vertices: list[tuple[float, float, float]] = []
    for z, radius in profile:
        for index in range(sides):
            angle = math.tau * index / sides
            vertices.append((
                center_x + math.cos(angle) * radius,
                center_y + math.sin(angle) * radius,
                z,
            ))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(profile) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            a = ring * sides + index
            b = ring * sides + nxt
            c = (ring + 1) * sides + nxt
            d = (ring + 1) * sides + index
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(sides))))
    last = (len(profile) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_revolved_profile_y(
    name: str,
    profile: list[tuple[float, float]],
    center_x: float,
    center_z: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    sides: int = 8,
    detail: int = 2,
    close_only: bool = True,
    component: str = "",
) -> bpy.types.Object:
    """Faceted roof fastener or vertical pin aligned to runtime Y."""
    vertices: list[tuple[float, float, float]] = []
    for y, radius in profile:
        for index in range(sides):
            angle = math.tau * index / sides
            vertices.append((
                center_x + math.cos(angle) * radius,
                y,
                center_z + math.sin(angle) * radius,
            ))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(profile) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            a = ring * sides + index
            b = ring * sides + nxt
            c = (ring + 1) * sides + nxt
            d = (ring + 1) * sides + index
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(sides))))
    last = (len(profile) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_tapered_prism_x(
    name: str,
    x0: float,
    x1: float,
    center_y0: float,
    center_y1: float,
    center_z0: float,
    center_z1: float,
    height0: float,
    height1: float,
    width0: float,
    width1: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Closed folded/forged mass whose section changes along X instead of reading as a cuboid."""
    vertices: list[tuple[float, float, float]] = []
    for x, cy, cz, height, width in (
        (x0, center_y0, center_z0, height0, width0),
        (x1, center_y1, center_z1, height1, width1),
    ):
        hy, hz = height * 0.5, width * 0.5
        vertices.extend([
            (x, cy - hy, cz - hz),
            (x, cy - hy, cz + hz),
            (x, cy + hy, cz + hz),
            (x, cy + hy, cz - hz),
        ])
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_revolved_profile_x(
    name: str,
    profile: list[tuple[float, float]],
    center_y: float,
    center_z: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    sides: int = 12,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Faceted closed body of revolution along runtime +X."""
    vertices: list[tuple[float, float, float]] = []
    for x, radius in profile:
        for index in range(sides):
            angle = math.tau * index / sides
            vertices.append((
                x,
                center_y + math.cos(angle) * radius,
                center_z + math.sin(angle) * radius,
            ))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(profile) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            a = ring * sides + index
            b = ring * sides + nxt
            c = (ring + 1) * sides + nxt
            d = (ring + 1) * sides + index
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(sides))))
    last = (len(profile) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_revolved_shell_x(
    name: str,
    profile: list[tuple[float, float, float]],
    center_y: float,
    center_z: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    sides: int = 12,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Faceted hollow shell with visible inner wall and open axial ends."""
    vertices: list[tuple[float, float, float]] = []
    for x, outer, inner in profile:
        for radius in (outer, inner):
            for index in range(sides):
                angle = math.tau * index / sides
                vertices.append((
                    x,
                    center_y + math.cos(angle) * radius,
                    center_z + math.sin(angle) * radius,
                ))
    faces: list[tuple[int, ...]] = []
    stride = sides * 2
    for ring in range(len(profile) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            outer_a = ring * stride + index
            outer_b = ring * stride + nxt
            outer_c = (ring + 1) * stride + nxt
            outer_d = (ring + 1) * stride + index
            faces.append((outer_a, outer_b, outer_c, outer_d))
            inner_a = ring * stride + sides + index
            inner_b = (ring + 1) * stride + sides + index
            inner_c = (ring + 1) * stride + sides + nxt
            inner_d = ring * stride + sides + nxt
            faces.append((inner_a, inner_b, inner_c, inner_d))
    for ring in (0, len(profile) - 1):
        start = ring * stride
        for index in range(sides):
            nxt = (index + 1) % sides
            if ring == 0:
                faces.append((start + index, start + sides + index,
                              start + sides + nxt, start + nxt))
            else:
                faces.append((start + index, start + nxt,
                              start + sides + nxt, start + sides + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_segmented_clamp_x(
    name: str,
    x_center: float,
    depth: float,
    center_y: float,
    center_z: float,
    inner_radius: float,
    outer_radius: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    segments: int = 8,
    fill_ratio: float = 0.68,
    detail: int = 1,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Segmented clamp band; the gaps make assembly and service breaks explicit."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    x0, x1 = x_center - depth * 0.5, x_center + depth * 0.5
    for segment in range(segments):
        center = math.tau * (segment + 0.5) / segments
        half = math.pi * fill_ratio / segments
        a0, a1 = center - half, center + half
        base_index = len(vertices)
        for x in (x0, x1):
            for radius, angle in (
                (inner_radius, a0), (inner_radius, a1),
                (outer_radius, a1), (outer_radius, a0),
            ):
                vertices.append((
                    x,
                    center_y + math.cos(angle) * radius,
                    center_z + math.sin(angle) * radius,
                ))
        faces.extend([
            (base_index, base_index + 1, base_index + 2, base_index + 3),
            (base_index + 4, base_index + 7, base_index + 6, base_index + 5),
            (base_index, base_index + 4, base_index + 5, base_index + 1),
            (base_index + 1, base_index + 5, base_index + 6, base_index + 2),
            (base_index + 2, base_index + 6, base_index + 7, base_index + 3),
            (base_index + 3, base_index + 7, base_index + 4, base_index),
        ])
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_hat_section_x(
    name: str,
    x0: float,
    x1: float,
    center_y: float,
    center_z: float,
    height: float,
    width: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 1,
    close_only: bool = False,
) -> bpy.types.Object:
    """Folded sheet cover with feet, returns, and a raised center channel."""
    cross = [
        (0.0, -width * 0.50),
        (height * 0.18, -width * 0.50),
        (height * 0.18, -width * 0.34),
        (height, -width * 0.24),
        (height, width * 0.24),
        (height * 0.18, width * 0.34),
        (height * 0.18, width * 0.50),
        (0.0, width * 0.50),
    ]
    vertices = [
        (x, center_y + y, center_z + z)
        for x in (x0, x1)
        for y, z in cross
    ]
    count = len(cross)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only,
    )


def make_gusset(
    name: str,
    points_xy: tuple[tuple[float, float], tuple[float, float], tuple[float, float]],
    center_z: float,
    thickness: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 1,
    close_only: bool = False,
) -> bpy.types.Object:
    vertices = [
        (x, y, center_z + z)
        for z in (-thickness * 0.5, thickness * 0.5)
        for x, y in points_xy
    ]
    faces = [
        (0, 2, 1), (3, 4, 5),
        (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5),
    ]
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only,
    )


def make_open_web_brace(
    name: str,
    x0: float,
    x1: float,
    lower_y: float,
    upper_y: float,
    center_z: float,
    thickness: float,
    strap_width: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 1,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Two welded diagonal straps in one bay, leaving actual negative space between the chords."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    def add_strap(start: tuple[float, float], end: tuple[float, float]) -> None:
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        if length <= 1e-6:
            raise ValueError(f"{name} strap endpoints collapse")
        px, py = -dy / length * strap_width * 0.5, dx / length * strap_width * 0.5
        outline = [
            (start[0] + px, start[1] + py),
            (end[0] + px, end[1] + py),
            (end[0] - px, end[1] - py),
            (start[0] - px, start[1] - py),
        ]
        base_index = len(vertices)
        for z in (center_z - thickness * 0.5, center_z + thickness * 0.5):
            vertices.extend((x, y, z) for x, y in outline)
        faces.extend([
            (base_index, base_index + 3, base_index + 2, base_index + 1),
            (base_index + 4, base_index + 5, base_index + 6, base_index + 7),
            (base_index, base_index + 1, base_index + 5, base_index + 4),
            (base_index + 1, base_index + 2, base_index + 6, base_index + 5),
            (base_index + 2, base_index + 3, base_index + 7, base_index + 6),
            (base_index + 3, base_index, base_index + 4, base_index + 7),
        ])

    inset = min(0.18, (x1 - x0) * 0.08)
    add_strap((x0 + inset, lower_y), (x1 - inset, upper_y))
    add_strap((x0 + inset, upper_y), (x1 - inset, lower_y))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_tapered_web_frame_x(
    name: str,
    x0: float,
    x1: float,
    lower_y0: float,
    lower_y1: float,
    upper_y0: float,
    upper_y1: float,
    center_z: float,
    thickness: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 1,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Fabricated plate-girder bay in the X/Y plane with tapered chords and real voids.

    This deliberately builds only the perimeter, node collars, and load-directed diagonals.  The
    large empty bays are as important as the metal: a capture boom made from a solid wall or four
    identical rails still reads as a toy, even after it receives a convincing material.
    """
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    def add_strap(
        start: tuple[float, float],
        end: tuple[float, float],
        width_start: float,
        width_end: float,
    ) -> None:
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        if length <= 1e-6:
            raise ValueError(f"{name} has a collapsed strap")
        nx, ny = -dy / length, dx / length
        outline = [
            (start[0] + nx * width_start * 0.5, start[1] + ny * width_start * 0.5),
            (end[0] + nx * width_end * 0.5, end[1] + ny * width_end * 0.5),
            (end[0] - nx * width_end * 0.5, end[1] - ny * width_end * 0.5),
            (start[0] - nx * width_start * 0.5, start[1] - ny * width_start * 0.5),
        ]
        base_index = len(vertices)
        for z in (center_z - thickness * 0.5, center_z + thickness * 0.5):
            vertices.extend((x, y, z) for x, y in outline)
        faces.extend([
            (base_index, base_index + 3, base_index + 2, base_index + 1),
            (base_index + 4, base_index + 5, base_index + 6, base_index + 7),
            (base_index, base_index + 1, base_index + 5, base_index + 4),
            (base_index + 1, base_index + 2, base_index + 6, base_index + 5),
            (base_index + 2, base_index + 3, base_index + 7, base_index + 6),
            (base_index + 3, base_index, base_index + 4, base_index + 7),
        ])

    lower_root, lower_tip = (x0, lower_y0), (x1, lower_y1)
    upper_root, upper_tip = (x0, upper_y0), (x1, upper_y1)
    # Unequal root/tip widths give the web a load direction rather than a repeated scaffold read.
    add_strap(lower_root, lower_tip, 0.26, 0.15)
    add_strap(upper_root, upper_tip, 0.30, 0.17)
    add_strap(lower_root, upper_root, 0.30, 0.26)
    add_strap(lower_tip, upper_tip, 0.19, 0.16)
    span = x1 - x0
    for bay, fraction in enumerate((0.22, 0.48, 0.76)):
        x = x0 + span * fraction
        lower = lower_y0 + (lower_y1 - lower_y0) * fraction
        upper = upper_y0 + (upper_y1 - upper_y0) * fraction
        # Alternating K braces leave distinct trapezoidal openings, not a global X-grid.
        if bay % 2 == 0:
            add_strap((x0 + span * max(0.02, fraction - 0.20), lower_y0 + (lower_y1 - lower_y0) * max(0.02, fraction - 0.20)),
                      (x, upper), 0.10, 0.09)
        else:
            add_strap((x0 + span * max(0.02, fraction - 0.20), upper_y0 + (upper_y1 - upper_y0) * max(0.02, fraction - 0.20)),
                      (x, lower), 0.10, 0.09)
        add_strap((x, lower), (x, upper), 0.11, 0.11)
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_segmented_clamp_y(
    name: str,
    y_center: float,
    depth: float,
    center_x: float,
    center_z: float,
    inner_radius: float,
    outer_radius: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    segments: int = 8,
    fill_ratio: float = 0.54,
    detail: int = 1,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Split circumferential band around a Y-axis drum: a brake, never a decorative torus."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    y0, y1 = y_center - depth * 0.5, y_center + depth * 0.5
    for segment in range(segments):
        center = math.tau * (segment + 0.5) / segments
        half = math.pi * fill_ratio / segments
        a0, a1 = center - half, center + half
        base_index = len(vertices)
        for y in (y0, y1):
            for radius, angle in (
                (inner_radius, a0), (inner_radius, a1),
                (outer_radius, a1), (outer_radius, a0),
            ):
                vertices.append((
                    center_x + math.cos(angle) * radius,
                    y,
                    center_z + math.sin(angle) * radius,
                ))
        faces.extend([
            (base_index, base_index + 1, base_index + 2, base_index + 3),
            (base_index + 4, base_index + 7, base_index + 6, base_index + 5),
            (base_index, base_index + 4, base_index + 5, base_index + 1),
            (base_index + 1, base_index + 5, base_index + 6, base_index + 2),
            (base_index + 2, base_index + 6, base_index + 7, base_index + 3),
            (base_index + 3, base_index + 7, base_index + 4, base_index),
        ])
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_segmented_clamp_z(
    name: str,
    z_center: float,
    depth: float,
    center_x: float,
    center_y: float,
    inner_radius: float,
    outer_radius: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    segments: int = 8,
    fill_ratio: float = 0.54,
    detail: int = 1,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Serviceable split brake band around a transverse Z-axis salvage drum."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    z0, z1 = z_center - depth * 0.5, z_center + depth * 0.5
    for segment in range(segments):
        center = math.tau * (segment + 0.5) / segments
        half = math.pi * fill_ratio / segments
        a0, a1 = center - half, center + half
        base_index = len(vertices)
        for z in (z0, z1):
            for radius, angle in (
                (inner_radius, a0), (inner_radius, a1),
                (outer_radius, a1), (outer_radius, a0),
            ):
                vertices.append((
                    center_x + math.cos(angle) * radius,
                    center_y + math.sin(angle) * radius,
                    z,
                ))
        faces.extend([
            (base_index, base_index + 1, base_index + 2, base_index + 3),
            (base_index + 4, base_index + 7, base_index + 6, base_index + 5),
            (base_index, base_index + 4, base_index + 5, base_index + 1),
            (base_index + 1, base_index + 5, base_index + 6, base_index + 2),
            (base_index + 2, base_index + 6, base_index + 7, base_index + 3),
            (base_index + 3, base_index + 7, base_index + 4, base_index),
        ])
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_service_line(
    name: str,
    points_rt: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 2,
    close_only: bool = True,
) -> bpy.types.Object:
    """Low-sided rooted hose/hardline following an explicit service path."""
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    curve.resolution_u = 1
    curve.resolution_v = 0
    spline = curve.splines.new("POLY")
    spline.points.add(len(points_rt) - 1)
    for point, runtime_point in zip(spline.points, points_rt):
        point.co = (*base.L(*runtime_point), 1.0)
    obj = bpy.data.objects.new(name, curve)
    coll.objects.link(obj)
    obj.data.materials.append(material)
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj["sf_detail_level"] = detail
    obj["sf_source_adaptation_detail"] = True
    obj["sf_material_truth"] = True
    if close_only:
        obj["sf_close_only"] = True
    obj.select_set(False)
    return obj


def make_braided_tether_x(
    name: str,
    x0: float,
    x1: float,
    center_y0: float,
    center_y1: float,
    center_z0: float,
    center_z1: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    braid_radius: float = 0.050,
    strand_radius: float = 0.026,
    turns: float = 10.0,
    detail: int = 1,
    component: str = "tether_cable",
) -> bpy.types.Object:
    """Three interleaved steel strands along the boom run, with physical terminal fittings."""
    slices, sides, strands = 30, 6, 3
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for strand in range(strands):
        strand_start = len(vertices)
        phase_offset = math.tau * strand / strands
        for step in range(slices + 1):
            t = step / slices
            phase = phase_offset + math.tau * turns * t
            x = x0 + (x1 - x0) * t
            cy = center_y0 + (center_y1 - center_y0) * t + math.cos(phase) * braid_radius
            cz = center_z0 + (center_z1 - center_z0) * t + math.sin(phase) * braid_radius
            for side in range(sides):
                angle = math.tau * side / sides
                vertices.append((
                    x,
                    cy + math.cos(angle) * strand_radius,
                    cz + math.sin(angle) * strand_radius,
                ))
        for step in range(slices):
            for side in range(sides):
                nxt = (side + 1) % sides
                a = strand_start + step * sides + side
                b = strand_start + step * sides + nxt
                c = strand_start + (step + 1) * sides + nxt
                d = strand_start + (step + 1) * sides + side
                faces.append((a, b, c, d))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=False, component=component,
    )


def make_braided_drum_wrap_y(
    name: str,
    center_x: float,
    center_z: float,
    y0: float,
    y1: float,
    radius: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    wraps: float = 15.0,
    strand_radius: float = 0.036,
    detail: int = 1,
) -> bpy.types.Object:
    """Visible wound cable on a fabricated drum, not a texture-painted spool.

    The primary helix establishes the rope lay from normal camera distance; two shallow companion
    helices break the highlight at close range without turning the drum into an inflated rope ball.
    """
    slices_per_turn, sides, strands = 10, 6, 3
    slices = max(24, int(round(wraps * slices_per_turn)))
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for strand in range(strands):
        strand_start = len(vertices)
        phase_offset = math.tau * strand / strands
        for step in range(slices + 1):
            t = step / slices
            phase = phase_offset + math.tau * wraps * t
            y = y0 + (y1 - y0) * t
            radial_x = math.cos(phase)
            radial_z = math.sin(phase)
            tangent_x = -math.sin(phase)
            tangent_z = math.cos(phase)
            for side in range(sides):
                angle = math.tau * side / sides
                # Cross section is built from the local radial/tangential directions, so the
                # winding reads as cable rather than three concentric plastic rings.
                vertices.append((
                    center_x + radial_x * (radius + math.cos(angle) * strand_radius)
                    + tangent_x * math.sin(angle) * strand_radius,
                    y,
                    center_z + radial_z * (radius + math.cos(angle) * strand_radius)
                    + tangent_z * math.sin(angle) * strand_radius,
                ))
        for step in range(slices):
            for side in range(sides):
                nxt = (side + 1) % sides
                a = strand_start + step * sides + side
                b = strand_start + step * sides + nxt
                c = strand_start + (step + 1) * sides + nxt
                d = strand_start + (step + 1) * sides + side
                faces.append((a, b, c, d))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=False, component="tether_drum",
    )


def make_braided_drum_wrap_z(
    name: str,
    center_x: float,
    center_y: float,
    z0: float,
    z1: float,
    radius: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    wraps: float = 15.0,
    strand_radius: float = 0.036,
    detail: int = 1,
) -> bpy.types.Object:
    """Cable-filled transverse drum; the rope lay stays visible between broad flanges."""
    slices_per_turn, sides, strands = 10, 6, 3
    slices = max(24, int(round(wraps * slices_per_turn)))
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for strand in range(strands):
        strand_start = len(vertices)
        phase_offset = math.tau * strand / strands
        for step in range(slices + 1):
            t = step / slices
            phase = phase_offset + math.tau * wraps * t
            z = z0 + (z1 - z0) * t
            radial_x = math.cos(phase)
            radial_y = math.sin(phase)
            tangent_x = -math.sin(phase)
            tangent_y = math.cos(phase)
            for side in range(sides):
                angle = math.tau * side / sides
                vertices.append((
                    center_x + radial_x * (radius + math.cos(angle) * strand_radius)
                    + tangent_x * math.sin(angle) * strand_radius,
                    center_y + radial_y * (radius + math.cos(angle) * strand_radius)
                    + tangent_y * math.sin(angle) * strand_radius,
                    z,
                ))
        for step in range(slices):
            for side in range(sides):
                nxt = (side + 1) % sides
                a = strand_start + step * sides + side
                b = strand_start + step * sides + nxt
                c = strand_start + (step + 1) * sides + nxt
                d = strand_start + (step + 1) * sides + side
                faces.append((a, b, c, d))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=False, component="tether_drum",
    )


def make_rig_material_image(
    name: str,
    rgba: tuple[int, int, int, int],
    size: int = 256,
    non_color: bool = False,
    role: str = "base",
) -> bpy.types.Image:
    """Material-specific maps; never stamp the same panel/fastener motif onto every substrate."""
    image = bpy.data.images.get(name)
    if image is None:
        image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    material_name = name.rsplit("_", 1)[0]
    roughness = {
        "Material_Hull": 0.72,
        "Material_Mechanical": 0.31,
        "Material_Red_Paint": 0.78,
        "Material_PolishedSteel": 0.18,
        "Material_CableSteel": 0.42,
        "Material_Hardface": 0.38,
        "Material_HotSection": 0.34,
        "Material_Refractory": 0.97,
        "Material_Cyan": 0.52,
    }[material_name]
    metallic = {
        "Material_Hull": 0.08,
        "Material_Mechanical": 0.88,
        "Material_Red_Paint": 0.0,
        "Material_PolishedSteel": 0.96,
        "Material_CableSteel": 0.93,
        "Material_Hardface": 0.90,
        "Material_HotSection": 0.94,
        "Material_Refractory": 0.0,
        "Material_Cyan": 0.02,
    }[material_name]
    material_code = sum(ord(char) for char in material_name) % 101

    def hashed_noise(column: int, row: int, salt: int) -> float:
        value = (column * 374761393 + row * 668265263 + salt * 69069) & 0xFFFFFFFF
        value = ((value ^ (value >> 13)) * 1274126177) & 0xFFFFFFFF
        return ((value ^ (value >> 16)) & 0xFFFFFFFF) / 0xFFFFFFFF

    def smooth_unit(value: float) -> float:
        return value * value * (3.0 - 2.0 * value)

    def value_noise(column: int, row: int, cell: int, salt: int) -> float:
        grid_x, grid_y = column // cell, row // cell
        local_x = smooth_unit((column % cell) / cell)
        local_y = smooth_unit((row % cell) / cell)
        low = (
            hashed_noise(grid_x, grid_y, salt) * (1.0 - local_x)
            + hashed_noise(grid_x + 1, grid_y, salt) * local_x
        )
        high = (
            hashed_noise(grid_x, grid_y + 1, salt) * (1.0 - local_x)
            + hashed_noise(grid_x + 1, grid_y + 1, salt) * local_x
        )
        return low * (1.0 - local_y) + high * local_y

    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            seed = ((x * 17 + y * 31 + x * y * 3 + material_code * 11) % 97) / 96.0
            grain = math.sin(x * 0.19 + math.sin(y * 0.041) * 2.1) * 0.5 + 0.5
            # Continuous variation keeps the substance readable without a global tiled pattern.
            large_noise = (
                math.sin(x * 0.071 + y * 0.043 + material_code * 0.13)
                + math.sin(y * 0.037 - x * 0.019 + material_code * 0.31) * 0.58
                + 1.58
            ) / 3.16
            turned_line = math.sin(y * 0.61 + x * 0.017 + material_code * 0.07) * 0.5 + 0.5
            braid_a = math.sin((x + y) * 0.31 + material_code * 0.03)
            braid_b = math.sin((x - y) * 0.29 - material_code * 0.05)
            braid = (braid_a + braid_b + 2.0) * 0.25
            abrasion = math.sin(x * 0.093 + y * 0.171 + large_noise * 2.3) * 0.5 + 0.5
            heat_band = math.sin(x * 0.055 + large_noise * 0.7)
            plate_seam = False
            plate_fastener = False
            paint_chip = material_name == "Material_Red_Paint" and (
                (large_noise > 0.91 and seed > 0.68)
                or (x % 79 <= 1 and y % 37 < 9)
            )
            refractory_fine = value_noise(x, y, 3, material_code + 17)
            refractory_medium = value_noise(x, y, 13, material_code + 41)
            refractory_pit = material_name == "Material_Refractory" and (
                hashed_noise(x // 5, y // 5, material_code + 73) > 0.975
                and refractory_fine < 0.44
            )
            # A sparse pair of adjacent, hash-selected texels reads as micro erosion instead of a
            # repeated contour.  It deliberately avoids radial/periodic terms that become swirls
            # after the nozzle's cylindrical UV projection.
            refractory_microcrack = material_name == "Material_Refractory" and (
                hashed_noise(x // 3, y // 3, material_code + 97) > 0.993
                and hashed_noise((x + 2) // 3, y // 3, material_code + 101) > 0.72
            )

            if role == "base":
                base_rgb = [channel / 255.0 for channel in rgba[:3]]
                if material_name == "Material_Hull":
                    delta = (large_noise - 0.5) * 0.035
                    if plate_seam:
                        delta -= 0.09
                    if plate_fastener:
                        base_rgb = [0.24, 0.25, 0.26]
                        delta = 0.0
                elif material_name == "Material_Mechanical":
                    delta = (grain - 0.5) * 0.052 + (seed - 0.5) * 0.012
                elif material_name == "Material_PolishedSteel":
                    delta = (turned_line - 0.5) * 0.045 + (seed - 0.5) * 0.008
                elif material_name == "Material_CableSteel":
                    delta = (braid - 0.5) * 0.095 + (seed - 0.5) * 0.012
                elif material_name == "Material_Hardface":
                    delta = (abrasion - 0.5) * 0.085 - max(0.0, large_noise - 0.82) * 0.05
                elif material_name == "Material_HotSection":
                    # Restrained nickel temper variation, not a copper/orange identity color.
                    base_rgb[0] += max(0.0, heat_band) * 0.020
                    base_rgb[1] += min(0.0, heat_band) * 0.012
                    base_rgb[2] += max(0.0, -heat_band) * 0.026
                    delta = (grain - 0.5) * 0.020
                elif material_name == "Material_Red_Paint":
                    if paint_chip:
                        base_rgb = [0.16, 0.17, 0.18]
                        delta = 0.0
                    else:
                        delta = (large_noise - 0.5) * 0.055 - max(0.0, seed - 0.88) * 0.045
                elif material_name == "Material_Refractory":
                    # Dry ceramic gets fine non-periodic grain and occasional erosion only. Keep
                    # contrast low so the texture cannot read as woodgrain, leather, a fingerprint,
                    # or a topographic ring over the physically modeled throat annulus.
                    delta = (
                        (refractory_fine - 0.5) * 0.025
                        + (refractory_medium - 0.5) * 0.012
                        - (0.045 if refractory_pit else 0.0)
                        - (0.060 if refractory_microcrack else 0.0)
                    )
                else:
                    delta = (seed - 0.5) * 0.012
                r, g, b = (max(0.0, min(1.0, value + delta)) for value in base_rgb)
            elif role == "orm":
                ao = 0.72 if plate_seam else 0.90 - seed * 0.025
                rough = roughness
                metal = metallic
                if material_name == "Material_Hull":
                    rough += (large_noise - 0.5) * 0.10 + (0.10 if plate_seam else 0.0)
                    if plate_fastener:
                        metal = 0.86
                elif material_name == "Material_Mechanical":
                    rough += (grain - 0.5) * 0.16
                elif material_name == "Material_PolishedSteel":
                    rough += (turned_line - 0.5) * 0.075 + (seed - 0.5) * 0.012
                elif material_name == "Material_CableSteel":
                    rough += (braid - 0.5) * 0.18 + (seed - 0.5) * 0.025
                elif material_name == "Material_Hardface":
                    rough += (abrasion - 0.5) * 0.20 + max(0.0, large_noise - 0.84) * 0.08
                elif material_name == "Material_HotSection":
                    rough += math.sin(x * 0.055) * 0.08 + (grain - 0.5) * 0.06
                elif material_name == "Material_Red_Paint":
                    rough += (large_noise - 0.5) * 0.12
                    if paint_chip:
                        rough, metal = 0.42, 0.86
                elif material_name == "Material_Refractory":
                    ao = (
                        0.82 if refractory_microcrack
                        else 0.85 if refractory_pit
                        else 0.89 - refractory_fine * 0.016
                    )
                    rough += (
                        (refractory_fine - 0.5) * 0.035
                        + (refractory_medium - 0.5) * 0.018
                        + (0.025 if refractory_pit else 0.0)
                    )
                else:
                    rough += (seed - 0.5) * 0.025
                r, g, b = ao, max(0.04, min(0.96, rough)), max(0.0, min(1.0, metal))
            else:
                nx, ny, nz = 0.5, 0.5, 1.0
                if material_name == "Material_Hull":
                    # The donor hull is coated plate, not quilted leather or a tiled floor. Keep
                    # the native normal restrained and non-periodic.  A second broad directional
                    # term suggests ground weld cleanup without drawing fake seams into quiet plate;
                    # plate boundaries and fasteners still come from authored geometry.
                    cleanup = math.sin(x * 0.047 + y * 0.009 + large_noise * 1.3)
                    nx += (large_noise - 0.5) * 0.017
                    ny += (seed - 0.5) * 0.012 + cleanup * 0.004
                    nz = 0.998
                elif material_name == "Material_Mechanical":
                    ny += (grain - 0.5) * 0.055
                    nx += (seed - 0.5) * 0.012
                    nz = 0.982
                elif material_name == "Material_PolishedSteel":
                    ny += (turned_line - 0.5) * 0.038
                    nx += (seed - 0.5) * 0.006
                    nz = 0.995
                elif material_name == "Material_CableSteel":
                    nx += braid_a * 0.060 + braid_b * 0.020
                    ny += braid_a * 0.020 - braid_b * 0.060
                    nz = 0.962
                elif material_name == "Material_Hardface":
                    nx += (abrasion - 0.5) * 0.082 + (seed - 0.5) * 0.024
                    ny += (large_noise - 0.5) * 0.068
                    nz = 0.968
                elif material_name == "Material_HotSection":
                    ny += (grain - 0.5) * 0.052
                    nx += heat_band * 0.020 + (seed - 0.5) * 0.010
                    nz = 0.984
                elif material_name == "Material_Red_Paint":
                    nx += (large_noise - 0.5) * 0.038
                    ny += (seed - 0.5) * 0.034
                    nz = 0.88 if paint_chip else 0.992
                elif material_name == "Material_Refractory":
                    nx += (refractory_fine - 0.5) * 0.014 + (refractory_medium - 0.5) * 0.005
                    ny += (refractory_medium - 0.5) * 0.014 + (refractory_fine - 0.5) * 0.005
                    nz = 0.955 if refractory_microcrack else 0.972 if refractory_pit else 0.989
                r, g, b = nx, ny, nz
            pixels.extend([r, g, b, rgba[3] / 255.0])
    image.pixels = pixels
    image.pack()
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return image


def apply_rig_material_treatment(mats: dict[str, bpy.types.Material]) -> None:
    """Give the Rig a sober salvage-yard palette without changing Dart or Lode outputs."""
    for name, (rgba, rough, metal, emit, strength) in RIG_MATERIAL_TREATMENTS.items():
        mat = mats[name]
        # The shared creator has already packed role images. Remove only this new scene's copies so
        # the Rig treatment is regenerated rather than silently reusing the Dart/Lode palette.
        for suffix in ("baseColor", "orm", "normal"):
            image = bpy.data.images.get(f"{name}_{suffix}")
            if image is not None:
                bpy.data.images.remove(image)
        original_image_factory = base._make_solid_image
        try:
            base._make_solid_image = make_rig_material_image
            base._wire_material_maps(mat, rgba, rough, metal, emit, strength)
        finally:
            base._make_solid_image = original_image_factory
    surface_classes = {
        "Material_Hull": "phosphate_coated_structural_steel",
        "Material_Mechanical": "nitrided_cold_steel",
        "Material_Red_Paint": "oxide_red_dielectric_coating",
        "Material_PolishedSteel": "polished_shaft_and_interface_steel",
        "Material_CableSteel": "braided_high_carbon_cable_steel",
        "Material_Hardface": "heat_darkened_hardface_alloy",
        "Material_HotSection": "nickel_hot_section_and_bell",
        "Material_Refractory": "alumina_zirconia_refractory",
        "Material_Cyan": "protected_low_intensity_indicator",
    }
    for name, (_, rough, metal, emit, strength) in RIG_MATERIAL_TREATMENTS.items():
        mats[name]["spacefaceMaterial"] = {
            "surfaceClass": surface_classes[name],
            "roughness": rough,
            "metallic": metal,
            "emissive": emit is not None and strength > 0.0,
        }


def audit_rig_component_inventory(parts: list[bpy.types.Object]) -> dict[str, Any]:
    """Fail closed on every authored Hook mesh's role, material, identity, and runtime bounds."""
    by_name = {
        obj.name: obj
        for obj in parts
        if obj.type == "MESH" and obj.name.startswith("Hook_")
    }
    classified: dict[str, str] = {}
    roles = []
    for role, prefix, expected, semantic_groups in RIG_COMPONENT_RULES:
        expected_material = RIG_COMPONENT_MATERIAL_EXPECTATIONS[role]
        names = sorted(name for name in by_name if name.startswith(prefix))
        if len(names) != expected:
            raise RuntimeError(
                f"Rig material-truth component inventory drift: {role}={len(names)} expected={expected} names={names}",
            )
        duplicates = sorted(name for name in names if name in classified)
        if duplicates:
            raise RuntimeError(
                f"Rig material-truth inventory prefix overlap: {role} duplicates={duplicates}",
            )
        for name in names:
            classified[name] = role
            materials = [slot.material.name for slot in by_name[name].material_slots if slot.material]
            if materials != [expected_material]:
                raise RuntimeError(
                    "Rig material-truth component material drift: "
                    f"{name}={materials} expected={[expected_material]}",
                )
        roles.append({
            "role": role,
            "count": len(names),
            "namePrefix": prefix,
            "names": names,
            "material": expected_material,
            "materialBindings": {name: expected_material for name in names},
            "semanticGroups": list(semantic_groups),
            "bounds": evaluated_runtime_aabb([by_name[name] for name in names]),
        })
    omitted = sorted(set(by_name) - set(classified))
    if omitted:
        raise RuntimeError(
            f"Rig material-truth inventory has unclassified camera-visible Hook meshes: {omitted}",
        )
    inventory = {
        "schema": RIG_COMPONENT_INVENTORY_SCHEMA,
        "roles": roles,
        "componentCount": len(classified),
        "components": sorted(classified),
        "manufacturedNormalPolicy": MANUFACTURED_NORMAL_POLICY,
    }
    inventory["digest"] = canonical_digest(inventory)
    return inventory


def runtime_point_from_blender(point: Vector) -> tuple[float, float, float]:
    """Invert the shared runtime→Blender ``L`` basis for root-local glTF metadata."""
    return (float(point.x), float(point.z), float(-point.y))


def evaluated_runtime_aabb(objects: list[bpy.types.Object]) -> dict[str, dict[str, float]]:
    """Return a finite root-local runtime AABB from evaluated authoring meshes.

    This runs before LOD/material joining.  It deliberately reads evaluated vertices rather than
    object ``bound_box`` so the declaration remains truthful if a future authoring component adds
    a modifier.  The Rig root is identity by contract, therefore the converted world coordinates
    are its stable glTF-root-local coordinates.
    """
    if not objects:
        raise RuntimeError("Rig semantic bounds cannot be derived from an empty component group")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    min_v = Vector((math.inf, math.inf, math.inf))
    max_v = Vector((-math.inf, -math.inf, -math.inf))
    vertex_count = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            for vertex in mesh.vertices:
                x, y, z = runtime_point_from_blender(evaluated.matrix_world @ vertex.co)
                min_v.x = min(min_v.x, x); min_v.y = min(min_v.y, y); min_v.z = min(min_v.z, z)
                max_v.x = max(max_v.x, x); max_v.y = max(max_v.y, y); max_v.z = max(max_v.z, z)
                vertex_count += 1
        finally:
            evaluated.to_mesh_clear()
    if vertex_count == 0 or not all(math.isfinite(value) for value in (*min_v, *max_v)):
        raise RuntimeError("Rig semantic bounds contain no finite evaluated vertices")
    minimum = [round(float(value), 6) for value in min_v]
    maximum = [round(float(value), 6) for value in max_v]
    size = [round(maximum[index] - minimum[index], 6) for index in range(3)]
    if any(value <= 0.0 for value in size):
        raise RuntimeError(f"Rig semantic bounds degenerate: min={minimum} max={maximum}")
    center = [round((minimum[index] + maximum[index]) * 0.5, 6) for index in range(3)]
    return {
        "min": {"x": minimum[0], "y": minimum[1], "z": minimum[2]},
        "max": {"x": maximum[0], "y": maximum[1], "z": maximum[2]},
        "center": {"x": center[0], "y": center[1], "z": center[2]},
        "size": {"x": size[0], "y": size[1], "z": size[2]},
    }


def build_rig_semantic_bounds(parts: list[bpy.types.Object]) -> dict[str, Any]:
    """Record manufacture-level Rig subjects without retaining costly component draw nodes."""
    by_name = {obj.name: obj for obj in parts if obj.type == "MESH" and obj.name.startswith("Hook_")}
    groups: dict[str, dict[str, Any]] = {}
    for group_id, prefixes in RIG_SEMANTIC_GROUP_PREFIXES.items():
        names = sorted(name for name in by_name if name.startswith(prefixes))
        if not names:
            raise RuntimeError(f"Rig semantic bounds missing {group_id} contributors")
        groups[group_id] = {
            "components": names,
            **evaluated_runtime_aabb([by_name[name] for name in names]),
        }
    authored_names = sorted({name for group in groups.values() for name in group["components"]})
    omitted = sorted(set(by_name) - set(authored_names))
    if omitted:
        raise RuntimeError(
            f"Rig authoredRig semantic union omits camera-visible Hook meshes: {omitted}",
        )
    inventory_names = (RIG_COMPONENT_INVENTORY or {}).get("components")
    if authored_names != inventory_names:
        raise RuntimeError(
            "Rig authoredRig semantic union differs from the exact component inventory: "
            f"semantic={authored_names} inventory={inventory_names}",
        )
    groups["authoredRig"] = {
        "components": authored_names,
        **evaluated_runtime_aabb([by_name[name] for name in authored_names]),
    }
    return {
        "schema": RIG_SEMANTIC_BOUNDS_SCHEMA,
        "basis": "rig-root-local-aabb",
        "groups": groups,
    }


def add_source_role_layer(ship_key: str, coll: bpy.types.Collection,
                          mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Add restrained functional hardware without replacing the coherent donor silhouette."""
    out: list[bpy.types.Object] = []
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    red = mats["Material_Red_Paint"]
    cyan = mats["Material_Cyan"]
    warm = mats["Material_Warm"]
    primer = mats["Material_RepairPrimer"]
    heat = mats["Material_HeatMetal"]
    polished = mats["Material_PolishedSteel"]
    cable = mats["Material_CableSteel"]
    hardface = mats["Material_Hardface"]
    hot_section = mats["Material_HotSection"]
    refractory = mats["Material_Refractory"]
    if ship_key == "dart":
        # Vector Reaction Drive S: paired faceted pressure cases, explicit hot sections,
        # refractory bells, service gaps, clamps, load saddles, and rooted feed lines.
        for side, z in (("P", -2.15), ("S", 2.15)):
            out.append(make_revolved_profile_x(
                f"Dart_VRDS_PressureCase_{side}",
                [(-7.58, 0.42), (-7.48, 0.50), (-6.68, 0.53), (-6.47, 0.45)],
                0.0, z, mech, coll, sides=12, component="drive",
            ))
            out.append(make_revolved_profile_x(
                f"Dart_VRDS_HotSection_{side}",
                [(-7.94, 0.34), (-7.84, 0.44), (-7.57, 0.45), (-7.49, 0.37)],
                0.0, z, heat, coll, sides=12, component="drive",
            ))
            out.append(make_revolved_shell_x(
                f"Dart_VRDS_NozzleBell_{side}",
                [(-8.29, 0.52, 0.41), (-8.08, 0.48, 0.35), (-7.86, 0.36, 0.25)],
                0.0, z, heat, coll, sides=12, component="drive",
            ))
            out.append(make_revolved_shell_x(
                f"Dart_VRDS_RefractoryThroat_{side}",
                [(-8.27, 0.39, 0.31), (-8.07, 0.33, 0.26), (-7.88, 0.24, 0.17)],
                0.0, z, refractory, coll, sides=12, component="drive",
            ))
            out.append(make_revolved_profile_x(
                f"Dart_VRDS_RecessedEnergyCue_{side}",
                [(-7.73, 0.060), (-7.69, 0.060)],
                0.0, z, cyan, coll, sides=12, detail=2, close_only=True,
            ))
            for index, x in enumerate((-7.56, -6.67)):
                out.append(make_segmented_clamp_x(
                    f"Dart_VRDS_Clamp_{side}_{index}",
                    x, 0.11, 0.0, z, 0.49, 0.58, mech, coll,
                    segments=8, fill_ratio=0.66, detail=1, close_only=True,
                ))
            out.append(make_runtime_box(
                f"Dart_VRDS_LoadSaddle_{side}",
                (0.58, 0.34, 0.62), (-6.34, 0.0, z), mech, coll,
                detail=1, component="drive",
            ))
            out.append(make_gusset(
                f"Dart_VRDS_GussetUpper_{side}",
                ((-6.62, 0.10), (-5.96, 0.10), (-6.18, 0.48)),
                z, 0.12, mech, coll, detail=2, close_only=True,
            ))
            out.append(make_gusset(
                f"Dart_VRDS_GussetLower_{side}",
                ((-6.62, -0.10), (-6.18, -0.48), (-5.96, -0.10)),
                z, 0.12, mech, coll, detail=2, close_only=True,
            ))
            for line_index, y in enumerate((-0.25, 0.27)):
                out.append(make_service_line(
                    f"Dart_VRDS_FeedLine_{side}_{line_index}",
                    [(-5.72, y * 0.65, z * 0.72),
                     (-6.18, y, z * 0.86),
                     (-6.72, y, z)],
                    0.045 if line_index == 0 else 0.035,
                    heat if line_index == 0 else mech,
                    coll,
                ))
            for cover_index, (x0, x1) in enumerate((
                (-7.72, -7.48), (-7.40, -7.16), (-7.08, -6.84),
            )):
                out.append(make_hat_section_x(
                    f"Dart_VRDS_ThermalShield_{side}_{cover_index}",
                    x0, x1, 0.40, z, 0.10, 0.58, heat, coll,
                    detail=2, close_only=True,
                ))

        # Folded RCS/drive feed spines: a steel hardline under three unequal, lapped service covers.
        # Gaps expose the pipe and break the legacy row of identical red rectangular chiclets.
        for side, z in (("P", -1.55), ("S", 1.55)):
            out.append(make_service_line(
                f"Dart_FeedSpine_Pipe_{side}",
                [(-1.72, 0.65, z), (-0.62, 0.67, z), (0.62, 0.67, z), (1.82, 0.65, z)],
                0.055, mech, coll, detail=1, close_only=False,
            ))
            cover_layout = (
                ("A", -1.70, -1.02, 0.24, red),
                ("B", -0.75, 0.08, 0.20, hull),
                ("C", 0.43, 1.60, 0.27, red),
            )
            for cover_id, x0, x1, width, cover_material in cover_layout:
                out.append(make_hat_section_x(
                    f"Dart_FeedSpine_Cover_{side}_{cover_id}",
                    x0, x1, 0.65, z, 0.10, width, cover_material, coll,
                    detail=1,
                ))
                for flange_id, flange_x in (("L", x0 + 0.08), ("R", x1 - 0.08)):
                    out.append(make_runtime_box(
                        f"Dart_FeedSpine_Flange_{side}_{cover_id}_{flange_id}",
                        (0.11, 0.055, width + 0.08),
                        (flange_x, 0.625, z),
                        mech, coll, detail=2, close_only=True,
                    ))
            for foot_index, (x, width) in enumerate((
                (-1.40, 0.43), (-0.22, 0.36), (0.72, 0.40), (1.45, 0.46),
            )):
                out.append(make_runtime_box(
                    f"Dart_FeedSpine_Mount_{side}_{foot_index}",
                    (0.24, 0.16, width), (x, 0.58, z), mech, coll,
                    detail=2, close_only=True,
                ))

        # Fixed pulse projector S: a compact rooted optical assembly aligned to the existing
        # weapon socket. No recoil rail, magazine, ammunition feed, or accelerator geometry.
        out.append(make_runtime_box(
            "Dart_PulseProjector_LoadSaddle",
            (0.66, 0.30, 0.68), (5.92, 0.12, 0.25), mech, coll,
            detail=1, component="pulse_projector",
        ))
        out.append(make_gusset(
            "Dart_PulseProjector_GussetUpper",
            ((5.58, 0.08), (6.28, 0.08), (5.92, 0.48)),
            0.25, 0.12, mech, coll, detail=1,
        ))
        out.append(make_gusset(
            "Dart_PulseProjector_GussetLower",
            ((5.58, -0.02), (5.92, -0.36), (6.28, -0.02)),
            0.25, 0.12, mech, coll, detail=1,
        ))
        out.append(make_revolved_profile_x(
            "Dart_PulseProjector_OpticalBody",
            [(6.12, 0.23), (6.22, 0.30), (6.78, 0.30), (7.03, 0.22)],
            0.15, 0.25, mech, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Dart_PulseProjector_CoolingJacket",
            [(6.42, 0.31), (6.49, 0.36), (6.88, 0.36), (6.96, 0.27)],
            0.15, 0.25, heat, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_shell_x(
            "Dart_PulseProjector_RefractoryCollimator",
            [(6.96, 0.23, 0.13), (7.17, 0.21, 0.11), (7.32, 0.17, 0.09)],
            0.15, 0.25, refractory, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Dart_PulseProjector_RecessedAperture",
            [(7.16, 0.055), (7.19, 0.055)],
            0.15, 0.25, cyan, coll, sides=10, detail=2, close_only=True,
        ))
        out.append(make_segmented_clamp_x(
            "Dart_PulseProjector_RootGimbal",
            6.16, 0.14, 0.15, 0.25, 0.29, 0.39, mech, coll,
            segments=8, fill_ratio=0.62, detail=1,
        ))
        for rib_index, x in enumerate((6.52, 6.63, 6.74, 6.85)):
            out.append(make_segmented_clamp_x(
                f"Dart_PulseProjector_CoolingRib_{rib_index}",
                x, 0.045, 0.15, 0.25, 0.35, 0.40, heat, coll,
                segments=10, fill_ratio=0.72, detail=2, close_only=True,
            ))
        out.append(make_service_line(
            "Dart_PulseProjector_PowerFlex",
            [(5.54, 0.35, 0.07), (5.86, 0.31, 0.16), (6.22, 0.29, 0.25)],
            0.038, heat, coll,
        ))
        out.append(make_service_line(
            "Dart_PulseProjector_CoolantFlex",
            [(5.50, -0.02, 0.46), (5.82, 0.02, 0.38), (6.28, 0.03, 0.34)],
            0.032, mech, coll,
        ))
    elif ship_key == "lode":
        # The Lode is a broad industrial/security hull converted around two heavy-autocannon load
        # paths. Each casemate is an open steel machine bay: a radial cradle, framed aperture,
        # faceted receiver, exposed recoil cylinders, and replaceable folded weather plates.
        # None of the visible primary masses are allowed to be a plain cuboid.
        for side, z, outward in (("P", -3.55, -1.0), ("S", 3.55, 1.0)):
            component = f"autocannon_{side.lower()}"

            # Two changing-section longitudinal rails carry recoil into the donor hull.
            for beam_index, z_offset in enumerate((-0.44, 0.44)):
                out.append(make_chamfered_prism_x(
                    f"Lode_RadialLoadFrame_{side}_{beam_index}",
                    -2.60, 5.62,
                    -0.43, -0.30,
                    z + z_offset, z + z_offset * 0.72,
                    0.26, 0.20, 0.22, 0.16, 0.22,
                    mech, coll, detail=1, component=component,
                ))
            for cross_index, x in enumerate((-1.75, 0.10, 1.92, 3.70, 5.10)):
                out.append(make_runtime_beveled_box(
                    f"Lode_RadialLoadFrame_CrossMember_{side}_{cross_index}",
                    (0.18, 0.27, 1.04 - cross_index * 0.055),
                    (x, -0.36, z), mech, coll,
                    bevel=0.025, detail=2, close_only=True, component=component,
                ))
                out.append(make_gusset(
                    f"Lode_RadialLoadFrame_Gusset_{side}_{cross_index}",
                    ((x - 0.30, -0.31), (x + 0.30, -0.31), (x - 0.04, 0.15)),
                    z + outward * 0.55, 0.12, mech, coll,
                    detail=2, close_only=True,
                ))

            # Irregular folded weather plates bridge the open frame. Their plan outlines, lap
            # offsets, edge returns, and isolated repair colors prevent "one long roof slab".
            roof_layout = (
                ("Root", -1.62, -0.18, 0.62, 0.56, 0.54, 0.48,
                 hull),
                ("Service", 0.18, 1.62, 0.60, 0.53, 0.49, 0.43,
                 primer if side == "P" else hull),
                ("Forward", 1.98, 3.48, 0.55, 0.48, 0.45, 0.38,
                 hull),
                ("Trunnion", 3.82, 5.28, 0.50, 0.42, 0.42, 0.34,
                 hull),
            )
            for panel_id, x0, x1, y0, y1, half_width0, half_width1, panel_material in roof_layout:
                panel_center_z = z + outward * 0.03
                outline = [
                    (x0 + 0.10, panel_center_z - half_width0),
                    (x1 - 0.16, panel_center_z - half_width1),
                    (x1, panel_center_z - half_width1 * 0.62),
                    (x1 - 0.05, panel_center_z + half_width1),
                    (x0 + 0.20, panel_center_z + half_width0),
                    (x0, panel_center_z + half_width0 * 0.45),
                ]
                out.append(make_plate_outline_y(
                    f"Lode_CasemateShell_Roof_{side}_{panel_id}",
                    outline, max(y0, y1), max(y0, y1) + 0.065,
                    panel_material, coll, component=component,
                ))
                out.append(make_chamfered_prism_x(
                    f"Lode_CasemateShell_RoofFlange_{side}_{panel_id}",
                    x0 + 0.05, x1 - 0.10,
                    min(y0, y1) - 0.045, min(y0, y1) - 0.035,
                    panel_center_z + outward * (half_width0 + 0.035),
                    panel_center_z + outward * (half_width1 + 0.035),
                    0.09, 0.08, 0.10, 0.09, 0.22,
                    mech, coll, detail=2, close_only=True, component=component,
                ))
                for fastener_id, (fastener_x, fastener_z) in enumerate((
                    (x0 + (x1 - x0) * 0.24, panel_center_z + outward * half_width0 * 0.70),
                    (x0 + (x1 - x0) * 0.76, panel_center_z + outward * half_width1 * 0.70),
                )):
                    out.append(make_revolved_profile_y(
                        f"Lode_CasemateShell_RoofFastener_{side}_{panel_id}_{fastener_id}",
                        [(max(y0, y1) + 0.060, 0.050),
                         (max(y0, y1) + 0.115, 0.050)],
                        fastener_x, fastener_z, heat, coll, sides=8,
                        detail=2, close_only=True, component=component,
                    ))

            # A low sill and two open perimeter rails expose the working mechanism. Small local
            # guards replace the former featureless wall panels.
            out.append(make_chamfered_prism_x(
                f"Lode_CasemateShell_FloorSill_{side}",
                -1.48, 5.42, -0.56, -0.42, z, z,
                0.18, 0.14, 1.36, 1.02, 0.18,
                hull, coll, component=component,
            ))
            for rail_id, y0, y1, width0, width1 in (
                ("UpperOuter", 0.48, 0.36, 0.17, 0.13),
                ("LowerOuter", -0.46, -0.36, 0.20, 0.15),
            ):
                out.append(make_chamfered_prism_x(
                    f"Lode_CasemateShell_FrameRail_{side}_{rail_id}",
                    -1.36, 5.38, y0, y1,
                    z + outward * 0.79, z + outward * 0.58,
                    0.18, 0.14, width0, width1, 0.22,
                    mech, coll, detail=1, component=component,
                ))
            for post_index, (x, lower_y, upper_y, outside_z) in enumerate((
                (-1.10, -0.43, 0.51, 0.77),
                (1.72, -0.41, 0.47, 0.69),
                (4.35, -0.36, 0.40, 0.60),
            )):
                out.append(make_service_line(
                    f"Lode_CasemateShell_FramePost_{side}_{post_index}",
                    [
                        (x - 0.20, lower_y, z + outward * outside_z),
                        (x + 0.02, (lower_y + upper_y) * 0.35,
                         z + outward * (outside_z + 0.06)),
                        (x + 0.26, upper_y, z + outward * (outside_z - 0.03)),
                    ],
                    0.075, mech, coll, detail=1, close_only=False,
                ))
                for bolt_y in (lower_y + 0.09, upper_y - 0.09):
                    cap_z0 = z + outward * (outside_z + 0.07)
                    cap_z1 = z + outward * (outside_z + 0.14)
                    out.append(make_revolved_profile_z(
                        f"Lode_CasemateShell_FrameBolt_{side}_{post_index}_{'U' if bolt_y > 0 else 'L'}",
                        [(min(cap_z0, cap_z1), 0.075), (max(cap_z0, cap_z1), 0.075)],
                        x, bolt_y, mech, coll, sides=8,
                        detail=2, close_only=True, component=component,
                    ))
            out.append(make_plate_outline_y(
                f"Lode_CasemateShell_AccessPanel_{side}",
                [
                    (-0.74, z - 0.31), (0.96, z - 0.27),
                    (1.22, z - 0.12), (1.14, z + 0.28),
                    (-0.52, z + 0.34), (-0.82, z + 0.13),
                ],
                0.705, 0.785,
                red if side == "P" else primer, coll,
                detail=1, component=component,
            ))

            # Faceted receiver, removable feed cassette, trunnion bearings, and exposed fasteners.
            out.append(make_chamfered_prism_x(
                f"Lode_AutocannonBreech_{side}",
                3.20, 5.78, 0.02, 0.02, z, z,
                1.18, 0.86, 1.22, 0.94, 0.20,
                mech, coll, component=component,
            ))
            out.append(make_chamfered_prism_x(
                f"Lode_AutocannonFeedHousing_{side}",
                2.42, 3.42, 0.08, 0.04,
                z - outward * 0.04, z - outward * 0.02,
                0.92, 1.06, 1.05, 1.14, 0.18,
                mech, coll, detail=1, component=component,
            ))
            for trunnion_index, x in enumerate((3.58, 5.18)):
                out.append(make_segmented_clamp_x(
                    f"Lode_AutocannonTrunnion_{side}_{trunnion_index}",
                    x, 0.22, 0.02, z, 0.59, 0.75, mech, coll,
                    segments=8, fill_ratio=0.64, detail=1, component=component,
                ))
                for bearing_side, bearing_outward in (("Outer", outward), ("Inner", -outward)):
                    bearing_z0 = z + bearing_outward * 0.58
                    bearing_z1 = z + bearing_outward * 0.82
                    out.append(make_revolved_profile_z(
                        f"Lode_AutocannonTrunnionCap_{side}_{trunnion_index}_{bearing_side}",
                        [(min(bearing_z0, bearing_z1), 0.18),
                         (max(bearing_z0, bearing_z1), 0.18)],
                        x, 0.02, mech, coll, sides=10,
                        detail=1, close_only=False, component=component,
                    ))
                    pin_center = (bearing_z0 + bearing_z1) * 0.5
                    pin_half = 0.15
                    out.append(make_revolved_profile_z(
                        f"Lode_AutocannonTrunnionPin_{side}_{trunnion_index}_{bearing_side}",
                        [(pin_center - pin_half, 0.085), (pin_center + pin_half, 0.085)],
                        x, 0.02, heat, coll, sides=8,
                        detail=2, close_only=True, component=component,
                    ))
            out.append(make_chamfered_prism_x(
                f"Lode_AutocannonCassetteDoor_{side}",
                2.50, 3.30, 0.48, 0.50,
                z + outward * 0.10, z + outward * 0.10,
                0.13, 0.11, 0.76, 0.64, 0.18,
                primer if side == "S" else red, coll,
                detail=1, component=component,
            ))
            for fastener_index, (x, y) in enumerate((
                (2.62, 0.43), (3.14, 0.43), (2.64, -0.30), (3.16, -0.30),
            )):
                cap_z0 = z + outward * 0.58
                cap_z1 = z + outward * 0.69
                out.append(make_revolved_profile_z(
                    f"Lode_AutocannonReceiverFastener_{side}_{fastener_index}",
                    [(min(cap_z0, cap_z1), 0.065), (max(cap_z0, cap_z1), 0.065)],
                    x, y, heat, coll, sides=8, component=component,
                ))

            # Paired hydraulic dampers sit outside the receiver silhouette so the recoil path reads.
            for damper_index, (y, z_offset) in enumerate(((0.46, -0.48), (-0.43, 0.48))):
                damper_z = z + z_offset
                out.append(make_revolved_profile_x(
                    f"Lode_RecoilDamper_{side}_{damper_index}",
                    [(1.92, 0.12), (2.08, 0.20), (4.08, 0.20), (4.24, 0.14)],
                    y, damper_z, heat, coll, sides=10,
                    detail=1, component=component,
                ))
                out.append(make_revolved_profile_x(
                    f"Lode_RecoilDamper_Rod_{side}_{damper_index}",
                    [(4.18, 0.070), (5.34, 0.070)],
                    y, damper_z, mech, coll, sides=10,
                    detail=1, component=component,
                ))
                out.append(make_segmented_clamp_x(
                    f"Lode_RecoilDamper_Gland_{side}_{damper_index}",
                    4.15, 0.13, y, damper_z, 0.18, 0.25, mech, coll,
                    segments=8, fill_ratio=0.70, detail=2, close_only=True,
                ))
                out.append(make_service_line(
                    f"Lode_RecoilDamper_Service_{side}_{damper_index}",
                    [(2.08, y, damper_z), (1.56, y * 1.10, damper_z),
                     (0.82, y * 1.12, z + outward * 0.69)],
                    0.035, mech, coll,
                ))

            # Stepped barrel, replaceable heat shroud, and actual bore depth.
            out.append(make_revolved_profile_x(
                f"Lode_AutocannonBarrel_{side}",
                [(5.45, 0.34), (5.72, 0.42), (6.15, 0.38), (8.90, 0.28),
                 (10.36, 0.24)],
                0.02, z, mech, coll, sides=12, component=component,
            ))
            out.append(make_revolved_shell_x(
                f"Lode_AutocannonHeatShroud_{side}",
                [(6.02, 0.49, 0.40), (6.32, 0.50, 0.40), (8.72, 0.40, 0.32),
                 (8.96, 0.36, 0.29)],
                0.02, z, heat, coll, sides=12, component=component,
            ))
            for rib_index, (x, depth, outer, fill) in enumerate((
                (6.38, 0.13, 0.54, 0.70),
                (7.42, 0.09, 0.49, 0.46),
                (8.48, 0.16, 0.51, 0.60),
            )):
                out.append(make_segmented_clamp_x(
                    f"Lode_AutocannonCoolingRib_{side}_{rib_index}",
                    x, depth, 0.02, z, 0.42, outer, heat, coll,
                    segments=10, fill_ratio=fill, detail=2, close_only=True,
                ))
            for rail_index, (y_offset, z_offset) in enumerate((
                (0.36, 0.0), (-0.36, 0.0), (0.0, -0.36), (0.0, 0.36),
            )):
                out.append(make_service_line(
                    f"Lode_AutocannonShroudStringer_{side}_{rail_index}",
                    [(6.10, 0.02 + y_offset, z + z_offset),
                     (7.42, 0.02 + y_offset * 0.92, z + z_offset * 0.92),
                     (8.84, 0.02 + y_offset * 0.76, z + z_offset * 0.76)],
                    0.028, heat, coll, detail=2, close_only=True,
                ))
            out.append(make_revolved_shell_x(
                f"Lode_AutocannonMuzzle_{side}",
                [(10.24, 0.34, 0.19), (10.53, 0.36, 0.19), (10.82, 0.29, 0.18)],
                0.02, z, heat, coll, sides=12, component=component,
            ))

            # Two triangular trunnion cheeks leave the barrel, rods, and bearing caps visible.
            for cheek_id, cheek_z in (
                ("Outer", z + outward * 0.66),
                ("Inner", z - outward * 0.66),
            ):
                out.append(make_gusset(
                    f"Lode_AutocannonMantlet_{side}_{cheek_id}_Upper",
                    ((4.92, 0.17), (5.64, 0.15), (5.08, 0.48)),
                    cheek_z, 0.13, mech, coll, detail=1,
                ))
                out.append(make_gusset(
                    f"Lode_AutocannonMantlet_{side}_{cheek_id}_Lower",
                    ((4.94, -0.15), (5.66, -0.13), (5.10, -0.46)),
                    cheek_z, 0.13, mech, coll, detail=1,
                ))
                out.append(make_revolved_profile_z(
                    f"Lode_AutocannonMantletPivot_{side}_{cheek_id}",
                    [(cheek_z - 0.11, 0.20), (cheek_z + 0.11, 0.20)],
                    5.20, 0.02, heat, coll, sides=10,
                    detail=1, close_only=False, component=component,
                ))

        # Compact central pulse projector terminating immediately behind the existing socket.
        out.append(make_tapered_prism_x(
            "Lode_PulseProjector_LoadSaddle",
            7.85, 8.48,
            0.22, 0.29, 0.0, 0.0,
            0.46, 0.36, 0.78, 0.64,
            mech, coll, detail=1, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Lode_PulseProjector_OpticalBody",
            [(8.18, 0.22), (8.32, 0.30), (9.42, 0.30), (9.62, 0.23)],
            0.35, 0.0, mech, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Lode_PulseProjector_CoolingJacket",
            [(8.72, 0.31), (8.82, 0.37), (9.44, 0.37), (9.60, 0.26)],
            0.35, 0.0, heat, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_shell_x(
            "Lode_PulseProjector_RefractoryCollimator",
            [(9.58, 0.25, 0.14), (9.82, 0.23, 0.12), (10.02, 0.18, 0.09)],
            0.35, 0.0, refractory, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Lode_PulseProjector_RecessedAperture",
            [(9.83, 0.052), (9.87, 0.052)],
            0.35, 0.0, cyan, coll, sides=10, detail=2, close_only=True,
        ))
        out.append(make_service_line(
            "Lode_PulseProjector_PowerService",
            [(7.82, 0.58, -0.22), (8.24, 0.53, -0.18), (8.78, 0.46, -0.13)],
            0.038, heat, coll,
        ))
        out.append(make_service_line(
            "Lode_PulseProjector_CoolantService",
            [(7.76, 0.10, 0.30), (8.24, 0.14, 0.26), (8.76, 0.22, 0.18)],
            0.032, mech, coll,
        ))

        # Single open-cycle torch: explicit hot/cold sections, hollow bell, thrust frame,
        # asymmetric service packs, and a tiny energy cue buried inside the flow path.
        out.append(make_revolved_profile_x(
            "Lode_TorchPressureCase",
            [(-10.28, 0.82), (-10.10, 1.02), (-8.72, 1.08), (-8.42, 0.84)],
            0.0, 0.0, mech, coll, sides=14, component="drive",
        ))
        out.append(make_revolved_profile_x(
            "Lode_TorchHotJacket",
            [(-10.72, 0.66), (-10.58, 0.85), (-10.20, 0.92), (-10.04, 0.76)],
            0.0, 0.0, heat, coll, sides=14, component="drive",
        ))
        out.append(make_revolved_shell_x(
            "Lode_TorchBell",
            [(-11.82, 1.20, 0.94), (-11.34, 1.06, 0.78), (-10.62, 0.69, 0.49)],
            0.0, 0.0, heat, coll, sides=14, component="drive",
        ))
        out.append(make_revolved_shell_x(
            "Lode_TorchRefractoryThroat",
            [(-11.78, 0.91, 0.72), (-11.32, 0.75, 0.57), (-10.66, 0.47, 0.32)],
            0.0, 0.0, refractory, coll, sides=14, component="drive",
        ))
        out.append(make_revolved_shell_x(
            "Lode_TorchSootedInnerLiner",
            [(-11.70, 0.69, 0.60), (-11.27, 0.54, 0.46), (-10.70, 0.29, 0.21)],
            0.0, 0.0, heat, coll, sides=14, detail=1, component="drive",
        ))
        out.append(make_revolved_profile_x(
            "Lode_TorchRecessedEnergyCue",
            [(-10.50, 0.035), (-10.46, 0.035)],
            0.0, 0.0, cyan, coll, sides=12, detail=2, close_only=True,
        ))
        for clamp_index, x in enumerate((-10.20, -8.80)):
            out.append(make_revolved_profile_x(
                f"Lode_TorchClamp_Band_{clamp_index}",
                [(x - 0.07, 1.105), (x + 0.07, 1.105)],
                0.0, 0.0, mech, coll, sides=14, detail=1, component="drive",
            ))
            for latch_id, y, z in (
                ("Upper", 1.12, 0.0),
                ("Lower", -1.12, 0.0),
                ("Port", 0.0, -1.12),
                ("Starboard", 0.0, 1.12),
            ):
                out.append(make_tapered_prism_x(
                    f"Lode_TorchClamp_Latch_{clamp_index}_{latch_id}",
                    x - 0.13, x + 0.13,
                    y, y * 1.02, z, z * 1.02,
                    0.20 if y else 0.26, 0.16 if y else 0.22,
                    0.26 if z else 0.20, 0.22 if z else 0.16,
                    mech, coll, detail=2, close_only=True, component="drive",
                ))
        for side, z in (("P", -1.20), ("S", 1.20)):
            out.append(make_tapered_prism_x(
                f"Lode_TorchThrustSaddle_{side}",
                -9.20, -7.65,
                -0.52, -0.40, z, z * 0.76,
                0.40, 0.30, 0.38, 0.32,
                mech, coll, detail=1, component="drive",
            ))
            out.append(make_gusset(
                f"Lode_TorchThrustGusset_{side}",
                ((-9.15, -0.40), (-7.45, -0.40), (-8.05, 0.34)),
                z, 0.18, mech, coll, detail=1,
            ))
        # The three pump/valve stations are mounted equipment, not anonymous boxes. Each station
        # has a faceted manifold, cylindrical accumulator, split clamp, valves, and rooted lines.
        for pack_id, y, z, size in (
            ("A", 0.72, -1.08, (0.62, 0.44, 0.42)),
            ("B", -0.56, 1.16, (0.54, 0.40, 0.52)),
            ("C", 0.36, 1.32, (0.44, 0.34, 0.34)),
        ):
            pack_material = heat if pack_id == "A" else mech
            out.append(make_chamfered_prism_x(
                f"Lode_TorchServicePack_{pack_id}",
                -9.76, -9.76 + size[0],
                y, y * 0.92, z, z,
                size[1], size[1] * 0.82, size[2], size[2] * 0.84, 0.24,
                pack_material, coll,
                detail=1, component="drive",
            ))
            accumulator_z = z + (0.26 if z < 0 else -0.26)
            out.append(make_revolved_profile_x(
                f"Lode_TorchAccumulator_{pack_id}",
                [(-9.70, 0.12), (-9.62, 0.17), (-9.22, 0.17), (-9.14, 0.12)],
                y * 0.82, accumulator_z, heat, coll, sides=10,
                detail=1, component="drive",
            ))
            out.append(make_segmented_clamp_x(
                f"Lode_TorchAccumulatorClamp_{pack_id}",
                -9.44, 0.10, y * 0.82, accumulator_z, 0.16, 0.21,
                mech, coll, segments=8, fill_ratio=0.66,
                detail=2, close_only=True, component="drive",
            ))
            for valve_index, (valve_x, valve_y) in enumerate((
                (-9.60, y + 0.22), (-9.28, y - 0.20),
            )):
                out.append(make_revolved_profile_z(
                    f"Lode_TorchValve_{pack_id}_{valve_index}",
                    [(z - 0.12, 0.075), (z + 0.12, 0.075)],
                    valve_x, valve_y, heat, coll, sides=8,
                    detail=2, close_only=True, component="drive",
                ))
            out.append(make_service_line(
                f"Lode_TorchServiceLine_{pack_id}",
                [(-8.16, y * 0.58, z * 0.52), (-8.72, y * 0.72, z * 0.72),
                 (-9.45, y, z)],
                0.045 if pack_id == "A" else 0.035,
                pack_material,
                coll, detail=1, close_only=False,
            ))
            out.append(make_service_line(
                f"Lode_TorchReturnLine_{pack_id}",
                [(-8.08, y * 0.48, z * 0.42), (-8.64, y * 0.58, z * 0.62),
                 (-9.18, y * 0.72, accumulator_z)],
                0.028, mech, coll, detail=2, close_only=True,
            ))

        # Longitudinal jacket stringers and inspection lugs break the "smooth leather tube"
        # reading while remaining visibly attached to the thrust case.
        for stringer_index, (y_factor, z_factor) in enumerate((
            (0.78, 0.0), (-0.78, 0.0), (0.0, 0.78), (0.0, -0.78),
            (0.55, 0.55), (-0.55, 0.55),
        )):
            out.append(make_service_line(
                f"Lode_TorchJacketStringer_{stringer_index}",
                [(-10.50, y_factor * 0.92, z_factor * 0.92),
                 (-9.62, y_factor * 1.02, z_factor * 1.02),
                 (-8.62, y_factor * 0.86, z_factor * 0.86)],
                0.035, mech, coll, detail=2, close_only=True,
            ))
        for lug_index, (x, y, z) in enumerate((
            (-10.08, 1.08, 0.36), (-10.08, -1.08, -0.36),
            (-8.92, 0.36, 1.08), (-8.92, -0.36, -1.08),
        )):
            out.append(make_runtime_beveled_box(
                f"Lode_TorchInspectionLug_{lug_index}",
                (0.24, 0.18, 0.14), (x, y, z), mech, coll,
                bevel=0.025, detail=2, close_only=True, component="drive",
            ))
    else:
        apply_rig_material_treatment(mats)
        # Two fabricated side girders carry the capture tool.  Each side is assembled from a
        # broad-root/narrow-tip upper and lower flange plus three unequal plate separators, leaving
        # four large irregular voids.  This follows the component study's plate-girder logic and
        # deliberately retires both the constant-section rail and repeated X-lattice reads.
        boom_x0, boom_x1 = -0.46, 7.58
        side_specs = (
            ("Port", -3.62, -3.12),
            ("Starboard", -1.48, -2.18),
        )
        for side, z_root, z_tip in side_specs:
            def boom_z(x: float) -> float:
                t = (x - boom_x0) / (boom_x1 - boom_x0)
                # The root stays buried into the donor load band while the girder itself becomes
                # the deep tapered pylon that raises the working machine. No blanket object lift.
                return z_root + (z_tip - z_root) * t

            def boom_y(x: float, base_y: float) -> float:
                # Keep the doubler end in the donor frame, then lift only the authored chord/web
                # centerline toward the exposed service band. This is component-local re-spacing,
                # not another uniform translation of the capture machine.
                t = max(0.0, min(1.0, (x - boom_x0) / (boom_x1 - boom_x0)))
                return base_y + 0.64 * t

            upper_sections = [
                (-0.46, boom_y(-0.46, 0.10), boom_z(-0.46), 0.62),
                (0.12, boom_y(0.12, 0.08), boom_z(0.12), 0.62),
                (0.24, boom_y(0.24, 0.03), boom_z(0.24), 0.48),
                (2.10, boom_y(2.10, -0.02), boom_z(2.10), 0.45),
                (2.24, boom_y(2.24, -0.08), boom_z(2.24), 0.34),
                (4.18, boom_y(4.18, -0.14), boom_z(4.18), 0.32),
                (4.34, boom_y(4.34, -0.20), boom_z(4.34), 0.26),
                (6.12, boom_y(6.12, -0.27), boom_z(6.12), 0.24),
                (6.28, boom_y(6.28, -0.33), boom_z(6.28), 0.20),
                (7.58, boom_y(7.58, -0.39), boom_z(7.58), 0.18),
            ]
            lower_sections = [
                (-0.46, boom_y(-0.46, -1.68), boom_z(-0.46), 0.58),
                (0.12, boom_y(0.12, -1.64), boom_z(0.12), 0.58),
                (0.24, boom_y(0.24, -1.54), boom_z(0.24), 0.44),
                (2.10, boom_y(2.10, -1.40), boom_z(2.10), 0.42),
                (2.24, boom_y(2.24, -1.34), boom_z(2.24), 0.34),
                (4.18, boom_y(4.18, -1.20), boom_z(4.18), 0.32),
                (4.34, boom_y(4.34, -1.14), boom_z(4.34), 0.27),
                (6.12, boom_y(6.12, -1.02), boom_z(6.12), 0.24),
                (6.28, boom_y(6.28, -0.98), boom_z(6.28), 0.20),
                (7.58, boom_y(7.58, -0.91), boom_z(7.58), 0.18),
            ]
            out.append(make_profiled_plate_chord(
                f"Hook_BoomChord_Upper_{side}",
                upper_sections, 0.18, hull, coll,
                detail=0, component="capture_boom",
            ))
            out.append(make_profiled_plate_chord(
                f"Hook_BoomChord_Lower_{side}",
                lower_sections, 0.18, hull, coll,
                detail=0, component="capture_boom",
            ))
            for web_id, start, end, widths in (
                (
                    "Root",
                    (0.34, boom_y(0.34, -1.49), boom_z(0.34)),
                    (1.92, boom_y(1.92, -0.01), boom_z(1.92)),
                    (0.34, 0.22),
                ),
                (
                    "Mid",
                    (2.34, boom_y(2.34, -0.10), boom_z(2.34)),
                    (4.06, boom_y(4.06, -1.19), boom_z(4.06)),
                    (0.27, 0.21),
                ),
                (
                    "Tip",
                    (4.42, boom_y(4.42, -1.12), boom_z(4.42)),
                    (6.12, boom_y(6.12, -0.29), boom_z(6.12)),
                    (0.24, 0.18),
                ),
            ):
                out.append(make_tapered_plate_strap(
                    f"Hook_BoomWeb_{side}_{web_id}",
                    start, end, widths[0], widths[1],
                    0.16, mech, coll, detail=1, component="capture_boom",
                ))
                # Compact node doublers identify welded load intersections while preserving the
                # large negative-space openings and quiet chord spans.
                node_x, node_y, node_z = start
                out.append(make_plate_outline_z(
                    f"Hook_BoomWebFrame_{side}_{web_id}",
                    [
                        (node_x - 0.24, node_y - 0.10), (node_x + 0.28, node_y - 0.04),
                        (node_x + 0.22, node_y + 0.28), (node_x - 0.18, node_y + 0.24),
                    ],
                    node_z - 0.13, node_z + 0.13, hull, coll,
                    detail=1, component="capture_boom",
                ))
            for chord_id, sections in (("Upper", upper_sections), ("Lower", lower_sections)):
                for splice_index, section_index in enumerate((2, 4, 6, 8)):
                    x, y, z, width = sections[section_index]
                    out.append(make_plate_outline_z(
                        f"Hook_BoomSplice_{side}_{chord_id}_{splice_index}",
                        [
                            (x - 0.11, y - width * 0.62),
                            (x + 0.13, y - width * 0.56),
                            (x + 0.13, y + width * 0.56),
                            (x - 0.11, y + width * 0.62),
                        ],
                        z - 0.13, z + 0.13, mech, coll,
                        detail=1, component="capture_boom",
                    ))
            # Heavy root cheeks overlap the donor structure and flare into both chord ends.  The
            # lower heel, upper shoulder, and two triangular gussets make the hull transition part
            # of the force path instead of a surface-mounted tab.
            out.append(make_plate_frame_z(
                f"Hook_BoomRootDoubler_{side}",
                [
                    (-0.88, -1.84), (0.78, -1.78), (1.30, -1.26),
                    (0.90, 0.30), (-0.64, 0.28),
                ],
                [
                    (-0.48, -1.42), (0.48, -1.38), (0.82, -1.08),
                    (0.52, -0.18), (-0.38, -0.14),
                ],
                z_root - 0.16, z_root + 0.16, mech, coll,
                detail=1, component="capture_boom",
            ))
            out.append(make_plate_outline_z(
                f"Hook_BoomRootGusset_{side}",
                [(-0.62, -1.62), (0.94, -1.48), (0.26, -0.38)],
                z_root - 0.27, z_root - 0.15, hull, coll,
                detail=1, component="capture_boom",
            ))
            out.append(make_plate_outline_z(
                f"Hook_BoomRootTransition_{side}",
                [(-1.18, -1.54), (-0.58, -1.82), (0.14, -1.42), (-0.54, -0.48)],
                z_root + 0.15, z_root + 0.27, hull, coll,
                detail=1, component="capture_boom",
            ))
            out.append(make_plate_frame_z(
                f"Hook_BoomJawTransition_{side}",
                [
                    (6.78, -1.18), (7.66, -1.06), (7.98, -0.72),
                    (7.90, -0.06), (7.40, 0.06), (6.94, -0.28),
                ],
                [
                    (7.10, -0.86), (7.54, -0.80), (7.69, -0.62),
                    (7.64, -0.31), (7.39, -0.24), (7.17, -0.42),
                ],
                boom_z(boom_x1) - 0.16, boom_z(boom_x1) + 0.16, mech, coll,
                detail=1, component="capture_boom",
            ))

        # Each arm has a narrow two-ear clevis and a visible pin. This keeps the jaw replaceable
        # in close view instead of collapsing its whole root into a single front clamp.
        jaw_center_z = -2.65
        for side, sign in (("Port", -1.0), ("Starboard", 1.0)):
            clevis_z = jaw_center_z + sign * 0.82
            clevis_outline = [
                (7.16, clevis_z - 0.30), (7.66, clevis_z - 0.37),
                (7.98, clevis_z - 0.16), (7.94, clevis_z + 0.20),
                (7.58, clevis_z + 0.35), (7.20, clevis_z + 0.20),
            ]
            for ear_id, y0, y1 in (("Outboard", -1.42, -1.20), ("Inboard", -0.30, -0.08)):
                out.append(make_plate_outline_y(
                    f"Hook_ClevisEar_{side}_{ear_id}", clevis_outline, y0, y1,
                    mech, coll, detail=1, component="capture_jaw",
                ))
            out.append(make_revolved_profile_y(
                f"Hook_ClevisPin_{side}",
                [(-1.52, 0.17), (-1.42, 0.27), (-0.08, 0.27), (0.02, 0.17)],
                7.62, clevis_z, mech, coll, sides=10, detail=1,
                close_only=False, component="capture_jaw",
            ))
            # The pin carries a shoulder collar and an outboard retainer; neither is a decorative
            # button.  The visible separation gives the tool a serviceable, replaceable hinge.
            out.append(make_revolved_profile_y(
                f"Hook_ClevisCollar_{side}",
                [(-1.46, 0.29), (-1.32, 0.34), (-1.19, 0.27)],
                7.62, clevis_z, mech, coll, sides=10, detail=1,
                close_only=False, component="capture_jaw",
            ))
            out.append(make_revolved_profile_y(
                f"Hook_ClevisRetainer_{side}",
                [(-0.31, 0.30), (-0.18, 0.30), (-0.05, 0.20)],
                7.62, clevis_z, polished, coll, sides=8, detail=2,
                close_only=True, component="capture_jaw",
            ))

        # Each forged jaw arm is a separate hooked cheek with a narrow root, broad curved shoulder,
        # and inward-facing service tip.  The two parts never bridge the central capture void.
        # Replaceable hardface pads sit on that inward face behind independent keeper plates.
        for side, sign in (("Port", -1.0), ("Starboard", 1.0)):
            def jaw_z(offset: float) -> float:
                return jaw_center_z + sign * offset

            arm_outline = [
                (7.42, jaw_z(0.38)), (7.70, jaw_z(0.84)), (8.12, jaw_z(1.18)),
                (8.58, jaw_z(1.40)), (8.98, jaw_z(1.25)), (9.20, jaw_z(0.92)),
                (9.18, jaw_z(0.46)), (8.94, jaw_z(0.54)), (8.58, jaw_z(0.72)),
                (8.08, jaw_z(0.62)), (7.64, jaw_z(0.34)),
            ]
            out.append(make_plate_outline_y(
                f"Hook_JawArm_{side}", arm_outline, -1.18, -0.16,
                mech, coll, detail=0, component="capture_jaw",
            ))
            out.append(make_tapered_plate_strap(
                f"Hook_JawForging_{side}",
                (7.62, -0.12, jaw_z(0.70)), (8.98, -0.12, jaw_z(0.82)),
                0.58, 0.34, 0.36,
                mech, coll, detail=1, component="capture_jaw",
            ))
            keeper_outline = [
                (8.48, jaw_z(0.70)), (9.08, jaw_z(0.58)), (9.20, jaw_z(0.45)),
                (9.04, jaw_z(0.34)), (8.54, jaw_z(0.50)),
            ]
            out.append(make_plate_outline_y(
                f"Hook_JawKeeper_{side}", keeper_outline, -1.31, -1.18,
                hull, coll, detail=1, close_only=False, component="capture_jaw",
            ))
            for tooth_index, x in enumerate((8.56, 8.78, 9.00)):
                pad_outline = [
                    (x, jaw_z(0.55)), (x + 0.14, jaw_z(0.50)),
                    (x + 0.23, jaw_z(0.42)), (x + 0.16, jaw_z(0.36)),
                    (x + 0.02, jaw_z(0.42)),
                ]
                out.append(make_plate_outline_y(
                    f"Hook_JawPad_{side}_{tooth_index}", pad_outline, -1.42, -1.18,
                    hardface, coll, detail=1, component="capture_jaw",
                ))
            for pin_index, x in enumerate((7.83, 8.62)):
                out.append(make_revolved_profile_y(
                    f"Hook_JawPin_{side}_{pin_index}",
                    [(-1.22, 0.12), (-1.12, 0.17), (-0.18, 0.17), (-0.08, 0.12)],
                    x, jaw_z(0.32), mech, coll, sides=8, detail=2,
                    close_only=True, component="capture_jaw",
                ))
            out.append(make_revolved_profile_y(
                f"Hook_JawPivotBoss_{side}",
                [(-1.20, 0.34), (-1.08, 0.43), (-0.28, 0.43), (-0.16, 0.34)],
                7.66, clevis_z, mech, coll, sides=10, detail=1,
                close_only=False, component="capture_jaw",
            ))
            out.append(make_revolved_profile_y(
                f"Hook_JawActuatorEnd_{side}",
                [(-1.22, 0.21), (-1.10, 0.28), (0.66, 0.28), (0.78, 0.21)],
                7.94, jaw_z(0.76), mech, coll, sides=10, detail=1,
                close_only=False, component="capture_jaw",
            ))

        # The tether drum is a stepped fabricated assembly. Radius changes are actual rope grooves,
        # not texture noise on a naked cylinder; flanges, shaft, bearing blocks, and brake guard
        # tell the player where the cable load goes.
        drum_x, drum_y = 1.72, 0.16
        drum_profile = [
            (-4.02, 1.02), (-3.84, 1.02), (-3.76, 0.86),
            (-3.64, 0.86), (-3.58, 0.80), (-3.48, 0.80),
            (-3.42, 0.86), (-3.30, 0.86), (-3.24, 0.80),
            (-3.12, 0.80), (-3.06, 0.86), (-2.94, 0.86),
            (-2.88, 0.80), (-2.76, 0.80), (-2.70, 0.86),
            (-2.58, 0.86), (-2.52, 0.80), (-2.40, 0.80),
            (-2.34, 0.86), (-2.22, 0.86), (-2.16, 0.80),
            (-2.04, 0.80), (-1.98, 0.86), (-1.78, 0.86),
            (-1.70, 1.02), (-1.50, 1.02),
        ]
        out.append(make_revolved_profile_z(
            "Hook_TetherDrum_Grooved", drum_profile, drum_x, drum_y,
            mech, coll, sides=16, detail=0, close_only=False, component="tether_drum",
        ))
        out.append(make_revolved_profile_z(
            "Hook_TetherDrum_KeyedShaft",
            [(-4.28, 0.21), (-4.10, 0.31), (-1.42, 0.31), (-1.20, 0.21)],
            drum_x, drum_y, polished, coll, sides=8, detail=1,
            close_only=False, component="tether_drum",
        ))
        out.append(make_braided_drum_wrap_z(
            "Hook_TetherDrum_CableWrap", drum_x, drum_y, -3.72, -1.80, 0.905,
            cable, coll, wraps=10.0, strand_radius=0.036, detail=1,
        ))
        for bearing_id, z in (("Port", -4.12), ("Starboard", -1.38)):
            out.append(make_plate_outline_z(
                f"Hook_TetherDrum_Bearing_{bearing_id}",
                [
                    (0.86, -1.22), (2.58, -1.22), (2.52, -0.18),
                    (2.16, 0.36), (1.28, 0.36), (0.92, -0.18),
                ],
                z - 0.16, z + 0.16, mech, coll,
                detail=1, component="tether_drum",
            ))
            out.append(make_revolved_profile_z(
                f"Hook_TetherBearingCap_{bearing_id}",
                [(z - 0.20, 0.33), (z - 0.10, 0.44), (z + 0.10, 0.44), (z + 0.20, 0.33)],
                drum_x, drum_y, mech, coll, sides=10, detail=2,
                close_only=True, component="tether_drum",
            ))
        out.append(make_segmented_clamp_z(
            "Hook_TetherDrum_BrakeBand", -3.82, 0.18, drum_x, drum_y, 0.91, 1.04,
            mech, coll, segments=7, fill_ratio=0.48, detail=1,
            close_only=False, component="tether_drum",
        ))
        out.append(make_plate_frame_z(
            "Hook_TetherBrake_ServiceCover",
            [(0.68, -0.72), (0.76, 0.32), (0.98, 0.76),
             (1.20, 0.66), (1.08, 0.18), (0.96, -0.68)],
            [(0.82, -0.46), (0.86, 0.18), (0.97, 0.46),
             (1.07, 0.40), (1.00, 0.10), (0.94, -0.43)],
            -4.30, -4.14, red, coll, detail=1, component="tether_guard",
        ))
        out.append(make_tapered_plate_strap(
            "Hook_TetherDrum_ClutchLever",
            (2.52, 0.02, -4.20), (2.94, 0.56, -4.20),
            0.13, 0.09, 0.10, mech, coll,
            detail=2, close_only=True, component="tether_drum",
        ))
        # The base rails pass bearing and brake reactions into both boom roots.  Two thin guard
        # cheeks leave the broad cable-filled drum face open instead of hiding it behind a cage.
        for rail_id, z in (("Port", -4.10), ("Starboard", -1.38)):
            out.append(make_tapered_plate_strap(
                f"Hook_TetherBaseFrame_{rail_id}",
                (0.34, -1.26, z), (2.96, -1.26, z),
                0.34, 0.24, 0.22, hull, coll,
                detail=1, component="tether_drum",
            ))
            out.append(make_plate_outline_z(
                f"Hook_TetherGuard_{rail_id}",
                [(0.56, -1.16), (0.72, 0.18), (1.04, 0.86),
                 (1.26, 0.86), (1.02, 0.08), (0.92, -1.14)],
                z - 0.09, z + 0.09, mech, coll,
                detail=1, close_only=False, component="tether_guard",
            ))

        # The cable path has a visible drum exit, paired fairlead rollers, a grooved sheave, and
        # two swaged terminals.  Its transverse drum axis and rooted bearing pedestals now match
        # the mechanical reference rather than reading as a hidden vertical spring.
        out.append(make_revolved_profile_z(
            "Hook_TetherFairlead_Sheave",
            [(-3.78, 0.42), (-3.66, 0.54), (-2.78, 0.54), (-2.66, 0.42)],
            3.54, 0.02, mech, coll, sides=10, detail=1,
            close_only=False, component="tether_fairlead",
        ))
        for roller_id, roller_y in (("Upper", 0.42), ("Lower", -0.24)):
            out.append(make_revolved_profile_z(
                f"Hook_TetherFairlead_Roller_{roller_id}",
                [(-3.72, 0.22), (-3.62, 0.31), (-2.82, 0.31), (-2.72, 0.22)],
                2.94, roller_y, mech, coll, sides=10, detail=1,
                close_only=False, component="tether_fairlead",
            ))
        for side, z in (("Port", -3.80), ("Starboard", -2.64)):
            out.append(make_plate_outline_z(
                f"Hook_TetherFairlead_Guide_{side}",
                [(2.58, -0.68), (3.90, -0.68), (4.08, -0.08),
                 (3.78, 0.76), (2.76, 0.76), (2.50, -0.04)],
                z - 0.09, z + 0.09, hull, coll,
                detail=1, component="tether_fairlead",
            ))
        out.append(make_service_line(
            "Hook_TetherFairlead_DrumRun",
            [(2.62, 0.12, -3.20), (3.02, 0.42, -3.20), (3.52, 0.02, -3.20)],
            0.060, cable, coll, detail=1, close_only=False,
        ))
        out.append(make_braided_tether_x(
            "Hook_TetherFairlead_BraidedRun", 3.58, 7.76,
            0.02, -0.12, -3.20, -2.65, cable, coll,
            braid_radius=0.060, strand_radius=0.026, turns=11.0,
        ))
        for fitting_id, x, y, z in (("Fairlead", 3.58, 0.02, -3.20), ("Jaw", 7.76, -0.12, -2.65)):
            out.append(make_revolved_profile_x(
                f"Hook_TetherFairlead_Terminal_{fitting_id}",
                [(x - 0.09, 0.105), (x - 0.03, 0.105), (x + 0.03, 0.078), (x + 0.09, 0.078)],
                y, z, mech, coll, sides=8, detail=2,
                close_only=False, component="tether_fairlead",
            ))

        # Closing cylinders, polished rods, and rooted braided service runs make the jaw motion
        # explainable without introducing a gameplay socket or an unowned hose bundle.
        for side, z in (("Port", -3.47), ("Starboard", -1.83)):
            out.append(make_revolved_profile_x(
                f"Hook_JawHydraulicCase_{side}",
                [(4.52, 0.18), (4.66, 0.29), (6.18, 0.29), (6.34, 0.20)],
                0.18, z, mech, coll, sides=12, detail=1,
                close_only=False, component="hydraulics",
            ))
            out.append(make_revolved_profile_x(
                f"Hook_JawHydraulicRod_{side}",
                [(6.24, 0.10), (7.78, 0.10)],
                0.18, z, polished, coll, sides=10, detail=1,
                close_only=False, component="hydraulics",
            ))
            out.append(make_segmented_clamp_x(
                f"Hook_JawHydraulicGland_{side}",
                6.26, 0.14, 0.18, z, 0.22, 0.33, mech, coll,
                segments=8, fill_ratio=0.68, detail=1,
                close_only=False, component="hydraulics",
            ))
            out.append(make_revolved_profile_y(
                f"Hook_JawHydraulicClevis_{side}",
                [(0.20, 0.17), (0.32, 0.24), (0.64, 0.24), (0.76, 0.17)],
                7.84, z, mech, coll, sides=8, detail=1,
                close_only=False, component="hydraulics",
            ))
            out.append(make_revolved_profile_y(
                f"Hook_JawHydraulicRootPin_{side}",
                [(0.22, 0.14), (0.34, 0.21), (0.62, 0.21), (0.74, 0.14)],
                4.48, z, mech, coll, sides=8, detail=1,
                close_only=False, component="hydraulics",
            ))
            out.append(make_service_line(
                f"Hook_JawHydraulicHose_{side}",
                [(4.66, 0.40, z), (4.18, 0.52, z), (3.78, 0.24, z * 0.96)],
                0.044, cable, coll, detail=2, close_only=True,
            ))

        # Paired reaction drives follow the shared Ashline material language: faceted cold cases,
        # nickel hot sections, hollow bells, dry ceramic throats, thrust saddles, and valve service.
        for drive_id, z in (("Port", -2.00), ("Starboard", 1.70)):
            out.append(make_multisection_chamfered_prism_x(
                f"Hook_DrivePressureCase_{drive_id}",
                [
                    (-8.46, 0.0, z, 0.78, 1.10),
                    (-8.34, 0.0, z, 0.92, 1.28),
                    (-8.12, 0.0, z, 1.02, 1.38),
                    (-7.68, 0.0, z, 1.02, 1.38),
                    (-7.56, 0.0, z, 0.92, 1.24),
                    (-7.24, 0.0, z, 0.88, 1.18),
                    (-7.08, 0.0, z, 0.74, 1.00),
                    (-6.90, 0.0, z, 0.56, 0.80),
                ],
                0.18, mech, coll, detail=0,
                close_only=False, component="drive",
            ))
            out.append(make_revolved_profile_x(
                f"Hook_DriveHotSection_{drive_id}",
                [(-8.78, 0.38), (-8.72, 0.46), (-8.60, 0.50),
                 (-8.46, 0.50), (-8.34, 0.43), (-8.26, 0.35)],
                0.0, z, hot_section, coll, sides=16, detail=1,
                close_only=False, component="drive",
            ))
            out.append(make_revolved_shell_x(
                f"Hook_DriveBell_{drive_id}",
                [(-9.17, 0.68, 0.55), (-9.08, 0.78, 0.63), (-8.94, 0.74, 0.58),
                 (-8.76, 0.60, 0.45), (-8.55, 0.43, 0.30), (-8.36, 0.30, 0.18)],
                0.0, z, hot_section, coll, sides=16, detail=0,
                close_only=False, component="drive",
            ))
            # The rolled bell gets a separate dark, nested liner.  Keep its front edge behind the
            # bell lip, but leave a broad enough visual throat through the liner for the recessed
            # ceramic to read at a supported three-quarter camera.  The liner remains a distinct
            # inner wall; it is not a black cap hiding the functional throat.
            out.append(make_revolved_shell_x(
                f"Hook_DriveCavityLiner_{drive_id}",
                [(-9.08, 0.54, 0.45), (-8.94, 0.56, 0.48),
                 (-8.76, 0.43, 0.40), (-8.58, 0.31, 0.30)],
                0.0, z, mech, coll, sides=16, detail=1,
                close_only=False, component="drive",
            ))
            # The dry alumina/zirconia throat stays recessed behind the lip, with an open center
            # and a shallow taper toward the protected internal cue.  Its wider annulus preserves
            # a legible manufactured refractory register at game scale without changing the
            # bell's exterior, mounting geometry, or any frozen ship envelope.
            out.append(make_revolved_shell_x(
                f"Hook_DriveRefractoryThroat_{drive_id}",
                [(-9.10, 0.50, 0.24), (-8.92, 0.42, 0.20),
                 (-8.73, 0.30, 0.14), (-8.58, 0.20, 0.10)],
                0.0, z, refractory, coll, sides=16, detail=1,
                close_only=False, component="drive",
            ))
            out.append(make_revolved_profile_x(
                f"Hook_DriveInternalCue_{drive_id}",
                [(-8.92, 0.042), (-8.87, 0.034)],
                0.0, z, cyan, coll, sides=12, detail=2,
                close_only=True, component="drive",
            ))
            for clamp_index, x in enumerate((-8.14, -7.54)):
                out.append(make_segmented_clamp_x(
                    f"Hook_DriveClamp_{drive_id}_{clamp_index}",
                    x, 0.075, 0.0, z, 0.68 if clamp_index == 0 else 0.60,
                    0.75 if clamp_index == 0 else 0.67, mech, coll,
                    segments=7, fill_ratio=0.46, detail=1,
                    close_only=False, component="drive",
                ))
            # One continuous 1.95 m triangular saddle per drive wraps the lower pressure case and
            # exposes a large service/load aperture. A matching inboard cheek, transverse feet,
            # cheek-plane webs, and overlapping root links carry the visible load path into hull
            # doublers. Buried center-plane straps/gussets are deliberately absent.
            saddle_outer = [
                (-8.38, -1.08), (-6.28, -1.08), (-6.34, -0.56),
                (-6.96, 0.24), (-7.84, 0.26),
            ]
            saddle_inner = [
                (-7.88, -0.80), (-6.74, -0.80), (-6.76, -0.60),
                (-7.16, -0.14), (-7.62, -0.12),
            ]
            out.append(make_plate_frame_z(
                f"Hook_DriveThrustSaddle_{drive_id}",
                saddle_outer, saddle_inner,
                z - 0.70, z - 0.50, hull, coll,
                detail=1, component="drive",
            ))
            out.append(make_plate_frame_z(
                f"Hook_DriveSaddleCheek_{drive_id}_Inboard",
                saddle_outer, saddle_inner,
                z + 0.50, z + 0.70, hull, coll,
                detail=1, component="drive",
            ))
            for cheek_id, cheek_z in (("Outboard", z - 0.60), ("Inboard", z + 0.60)):
                out.append(make_plate_outline_z(
                    f"Hook_DriveSaddleFoot_{drive_id}_{cheek_id}",
                    [
                        (-8.30, -1.18), (-6.18, -1.18), (-6.08, -0.96),
                        (-6.34, -0.82), (-8.22, -0.86),
                    ],
                    cheek_z - 0.12, cheek_z + 0.12, mech, coll,
                    detail=1, component="drive",
                ))
                out.append(make_tapered_plate_strap(
                    f"Hook_DriveSaddleWeb_{drive_id}_{cheek_id}",
                    (-7.82, -0.88, cheek_z), (-6.62, -0.10, cheek_z),
                    0.28, 0.18, 0.15, mech, coll,
                    detail=1, component="drive",
                ))
                out.append(make_plate_outline_z(
                    f"Hook_DriveRootDoubler_{drive_id}_{cheek_id}",
                    [
                        (-5.18, -1.00), (-4.18, -1.02), (-3.68, -0.62),
                        (-3.72, -0.10), (-4.22, 0.14), (-5.08, -0.20),
                    ],
                    cheek_z - 0.13, cheek_z + 0.13, hull, coll,
                    detail=1, component="drive",
                ))
                out.append(make_tapered_plate_strap(
                    f"Hook_DriveRootLink_{drive_id}_{cheek_id}",
                    (-6.34, -0.88, cheek_z), (-4.44, -0.46, cheek_z),
                    0.32, 0.50, 0.18, mech, coll,
                    detail=1, component="drive",
                ))
            out.append(make_revolved_profile_x(
                f"Hook_DriveValvePack_{drive_id}",
                [(-7.76, 0.14), (-7.68, 0.24), (-7.34, 0.24), (-7.24, 0.16)],
                0.54 if drive_id == "Port" else -0.54, z + 0.38,
                mech, coll, sides=8, detail=1, component="drive",
            ))
            for fitting_index, fitting_x in enumerate((-7.62, -7.42)):
                out.append(make_revolved_profile_y(
                    f"Hook_DriveValveFitting_{drive_id}_{fitting_index}",
                    [(0.44, 0.055), (0.56, 0.072), (0.64, 0.050)],
                    fitting_x, z + 0.38, polished, coll, sides=8, detail=2,
                    close_only=True, component="drive",
                ))
            out.append(make_service_line(
                f"Hook_DriveServiceLine_{drive_id}",
                [(-7.18, 0.42 if drive_id == "Port" else -0.42, z + 0.26),
                 (-7.72, 0.60 if drive_id == "Port" else -0.60, z + 0.34),
                 (-8.42, 0.34 if drive_id == "Port" else -0.34, z + 0.12)],
                0.034, mech, coll, detail=2, close_only=True,
            ))
            out.append(make_plate_outline_y(
                f"Hook_ServiceTag_Drive_{drive_id}",
                [(-7.74, z + 0.62), (-7.50, z + 0.64), (-7.38, z + 0.53),
                 (-7.56, z + 0.46), (-7.78, z + 0.50)],
                0.58 if drive_id == "Port" else -0.66,
                0.64 if drive_id == "Port" else -0.60,
                red, coll, detail=1, component="drive_service_tag",
            ))

        # This is only a generic rooted hardpoint. `SOCKET_Weapon_Front` remains unchanged and the
        # shared reaver/corsair runtime role is intentionally not invented into a bespoke weapon.
        out.append(make_chamfered_prism_x(
            "Hook_ForwardMountSaddle", 5.82, 6.68,
            0.45, 0.45, 0.70, 0.70, 0.34, 0.28, 0.62, 0.48, 0.22,
            mech, coll, detail=1, component="generic_forward_mount",
        ))
        for z in (0.44, 0.96):
            out.append(make_gusset(
                f"Hook_ForwardMountGusset_{z:+.2f}",
                ((5.92, 0.26), (6.42, 0.78), (6.66, 0.26)),
                z, 0.07, hull, coll, detail=1,
            ))
    if ship_key == "rig":
        # Component-local service offsets keep the jaw and winch exposed while preserving fixed
        # boom roots. They intentionally differ, so there is no blanket capture-machine lift.
        component_y_offsets = (
            (("Hook_Clevis", "Hook_Jaw"), 0.64),
            (("Hook_Tether",), 0.54),
        )
        for obj in out:
            for prefixes, y_offset in component_y_offsets:
                if obj.name.startswith(prefixes):
                    obj.location.z += y_offset
                    break
    for obj in out:
        obj["sf_source_adaptation_detail"] = True
    return out


def create_compound_collision(export_coll: bpy.types.Collection, root: bpy.types.Object,
                              mesh_objects: list[bpy.types.Object]) -> bpy.types.Object | None:
    lod0 = [o for o in mesh_objects if o.type == 'MESH' and 'lod0' in o.name.lower()]
    if not lod0:
        return None
    points = []
    for obj in lod0:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    size = hi - lo
    segment = size.x / 3.0
    helpers = []
    for index in range(3):
        center = Vector((lo.x + segment * (index + 0.5), (lo.y + hi.y) * 0.5, (lo.z + hi.z) * 0.5))
        bpy.ops.mesh.primitive_cube_add(size=2.0, location=center)
        helper = bpy.context.active_object
        helper.name = f'COLLISION_HULL_{index:02d}'
        # Slight overlap prevents high-speed seams while remaining far tighter than one AABB.
        helper.scale = (segment * 0.54, size.y * (0.42 + 0.04 * (index == 1)), size.z * (0.42 + 0.04 * (index == 1)))
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        for owner in list(helper.users_collection):
            owner.objects.unlink(helper)
        export_coll.objects.link(helper)
        base.set_parent_keep_world(helper, root)
        helper.hide_render = True
        helper['spaceface'] = {
            'collision': True, 'compound': True, 'compoundIndex': index,
            'compoundCount': 3, 'helper': True, 'nonRender': True, 'role': 'collision',
        }
        helper['sf_collision'] = True
        helper['sf_non_render'] = True
        base.ensure_uvs_force(helper)
        base.triangulate_object(helper)
        helpers.append(helper)
    return helpers[0]


ORIGINAL_EXPORT_GLB = base.export_glb
ORIGINAL_CREATE_ROOT_AND_SOCKETS = base.create_root_and_sockets


def rig_root_material_truth_contract() -> dict[str, Any]:
    if RIG_COMPONENT_INVENTORY is None:
        raise RuntimeError("Rig component inventory missing before root creation")
    if RIG_SEMANTIC_BOUNDS is None:
        raise RuntimeError("Rig semantic bounds missing before root creation")
    return {
        "revision": "rig-material-truth-2026-07-29-v5",
        "components": [
            "capture-boom-a-frame",
            "forged-two-arm-jaw",
            "grooved-tether-drum-and-fairlead",
            "paired-reaction-drives",
            "generic-forward-mount",
        ],
        "componentInventory": copy.deepcopy(RIG_COMPONENT_INVENTORY),
        "componentInventoryDigest": RIG_COMPONENT_INVENTORY["digest"],
        "semanticBounds": copy.deepcopy(RIG_SEMANTIC_BOUNDS),
        "collisionContract": copy.deepcopy(RIG_COLLISION_CONTRACT),
        "collisionContractDigest": RIG_COLLISION_CONTRACT_DIGEST,
        "manufacturedNormalPolicy": copy.deepcopy(MANUFACTURED_NORMAL_POLICY),
        "materialMapPolicy": {
            "mode": "role-specific-deterministic-base-orm-normal",
            "resolution": 256,
            "materialCount": 9,
            "imageCount": 27,
            "universalRecipe": False,
            "plateFastenersEmbeddedInMaps": False,
            "roleMicrostructure": {
                "Material_Hull": "phosphate-coated-plate-without-global-grid",
                "Material_Mechanical": "directional-machining",
                "Material_Red_Paint": "dielectric-coating-with-localized-steel-chips",
                "Material_PolishedSteel": "fine-turned-shaft-lines-and-rubbed-interfaces",
                "Material_CableSteel": "crossed-braided-strand-breakup",
                "Material_Hardface": "irregular-contact-abrasion-and-dark-alloy-grain",
                "Material_HotSection": "axial-nickel-heat-and-flow-bands",
                "Material_Refractory": "dry-granular-ceramic-with-sparse-cracks",
                "Material_Cyan": "smooth-protected-indicator",
            },
        },
        "materialRoles": {
            "Material_Hull": "phosphate-coated-structural-plate-and-donor-frame",
            "Material_Mechanical": "nitrided-cold-housings-bearings-and-pressure-cases",
            "Material_Red_Paint": "oxide-red-dielectric-guards-and-service-markings-only",
            "Material_PolishedSteel": "turned-shafts-rods-retainers-and-service-interfaces",
            "Material_CableSteel": "braided-tether-wrap-and-hydraulic-service-lines",
            "Material_Hardface": "replaceable-jaw-contact-pads-only",
            "Material_HotSection": "nickel-drive-hot-jackets-and-rolled-bells-only",
            "Material_Cyan": "small-recessed-internal-drive-cue-only",
            "Material_Refractory": "dry-dielectric-alumina-zirconia-throat",
        },
        "promotionBlockers": [
            "reaver-pirate-and-corsair-raider-share-one-rig-needs-accepted-variant-decision",
            "v2-has-no-socket-tether-front-needs-runtime-tool-and-vfx-contract-decision",
            "single-central-engine-trail-sockets-versus-two-visible-drive-bells-needs-runtime-vfx-proof",
        ],
    }


def create_root_with_material_truth(
    export_coll: bpy.types.Collection,
    spec: dict[str, Any],
) -> bpy.types.Object:
    root = ORIGINAL_CREATE_ROOT_AND_SOCKETS(export_coll, spec)
    if spec["id"] == "ashline_v2_dart":
        asset = dict(root.get("spacefaceAsset", {}))
        asset["materialTruthRevision"] = "dart-material-truth-2026-07-28-v1"
        asset["driveProfileId"] = "drive_reaction_s"
        asset["weaponId"] = "wpn_pulse_laser_s"
        asset["weaponKind"] = "pulse_projector"
        root["spacefaceAsset"] = asset
        spaceface = dict(root.get("spaceface", {}))
        spaceface["materialTruth"] = {
            "revision": "dart-material-truth-2026-07-28-v1",
            "components": [
                "vector-reaction-drive-s-twin",
                "folded-feed-spines",
                "fixed-pulse-projector-s",
            ],
        }
        root["spaceface"] = spaceface
    elif spec["id"] == "ashline_v2_lode":
        asset = dict(root.get("spacefaceAsset", {}))
        asset["materialTruthRevision"] = "lode-material-truth-2026-07-28-v1"
        asset["driveProfileId"] = "drive_torch_l"
        asset["weaponIds"] = [
            "wpn_autocannon_m",
            "wpn_autocannon_m",
            "wpn_pulse_laser_s",
        ]
        root["spacefaceAsset"] = asset
        spaceface = dict(root.get("spaceface", {}))
        spaceface["materialTruth"] = {
            "revision": "lode-material-truth-2026-07-28-v1",
            "components": [
                "paired-heavy-autocannon-casemates",
                "radial-recoil-load-frames",
                "fixed-pulse-projector-s",
                "open-cycle-torch-l",
            ],
        }
        root["spaceface"] = spaceface
    elif spec["id"] == "ashline_v2_rig":
        asset = dict(root.get("spacefaceAsset", {}))
        asset["materialTruthRevision"] = "rig-material-truth-2026-07-29-v5"
        asset["captureProfileId"] = "capture_hook_tether_control"
        asset["weaponMountKind"] = "generic_shared_forward_mount"
        asset["manufacturedNormalPolicy"] = copy.deepcopy(MANUFACTURED_NORMAL_POLICY)
        root["spacefaceAsset"] = asset
        spaceface = dict(root.get("spaceface", {}))
        spaceface["materialTruth"] = rig_root_material_truth_contract()
        root["spaceface"] = spaceface
    return root


def export_with_compound_collision(path: Path, objects: list[bpy.types.Object]) -> None:
    expanded = list(objects)
    known = {o.name for o in expanded if o}
    for obj in bpy.data.objects:
        if obj.get('sf_collision') and obj.name not in known:
            expanded.append(obj)
    ORIGINAL_EXPORT_GLB(path, expanded)


base.create_collision_hull = create_compound_collision
base.export_glb = export_with_compound_collision
base.create_root_and_sockets = create_root_with_material_truth


def adapt_donor(ship_key: str, coll: bpy.types.Collection,
                mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    global RIG_COMPONENT_INVENTORY, RIG_SEMANTIC_BOUNDS
    source = resolve_donor(ship_key)
    imported = import_source(source)
    hull = join_imported(imported, coll)
    orient_and_scale(hull, ship_key)

    hull.data.materials.clear()
    hull.data.materials.append(mats["Material_Hull"])
    hull["sf_detail_level"] = 0
    hull["sf_lod2_core"] = True
    hull["sf_source_family"] = "Quaternius Ultimate Spaceships Pack"
    hull["sf_source_file"] = str(source.relative_to(ROOT)).replace("\\", "/")
    hull["sf_source_sha256"] = sha256(source)
    base.bevel_object(hull, 0.055 if ship_key == "dart" else 0.075, 3)

    # Add only restrained functional hardware; the source mesh remains the macro authority.
    parts = [hull]
    parts.extend(add_source_role_layer(ship_key, coll, mats))
    for obj in parts:
        if obj.type == "MESH":
            base.ensure_uvs_force(obj)
            base.ensure_normals(obj)
    if ship_key == "rig":
        RIG_COMPONENT_INVENTORY = audit_rig_component_inventory(parts)
        RIG_SEMANTIC_BOUNDS = build_rig_semantic_bounds(parts)
    return parts


for key, config in SHIP_CONFIG.items():
    spec = copy.deepcopy(base.SHIP_SPECS[key])
    spec["id"] = f"ashline_v2_{key}"
    spec["assetId"] = f"SF_WHOLESHIP_ASHLINE_V2_{key.upper()}"
    spec["partId"] = f"wholeship_ashline_v2_{key}"
    spec["title"] = config["title"]
    spec["rootName"] = f"SF_M4_ASHLINE_V2_{key.upper()}_ROOT"
    # Keep exactly the stable nine-socket contract. The Hook spool is visual-only.
    spec["sockets"] = [s for s in spec["sockets"] if s[0] != "SOCKET_Tether_Front"]
    base.SHIP_SPECS[key] = spec
    base.BUILDERS[key] = lambda coll, mats, k=key: adapt_donor(k, coll, mats)


# The base build adds its parity layer after BUILDERS; our adapter already added it once.
base.add_quality_parity_layer = lambda ship_key, coll, mats: []


def write_source_receipt() -> None:
    path = FAMILY_ROOT / "SOURCE_ADAPTATION.json"
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if path.exists():
        previous = json.loads(path.read_text(encoding="utf-8"))
        if previous.get("createdAt"):
            created_at = previous["createdAt"]
    receipt: dict[str, Any] = {
        "schema": "spaceface.sourceAdaptationReceipt.v1",
        "packet": PACKET,
        "createdAt": created_at,
        "sourceFamily": "Quaternius Ultimate Spaceships Pack",
        "sourcePage": "https://quaternius.com/packs/ultimatespaceships.html",
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "ships": {},
        "isolation": {
            "root": "assets/ships/m4_ashline_v2",
            "runtimePromotion": False,
            "touchesExistingAshline": False,
        },
    }
    for key in SHIP_CONFIG:
        donor = resolve_donor(key)
        receipt["ships"][key] = {
            "donor": str(donor.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(donor),
            "hints": list(SHIP_CONFIG[key]["donorHints"]),
        }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


def write_material_truth_receipt(ship_key: str) -> None:
    if ship_key not in {"dart", "lode", "rig"}:
        return
    summary_path = FAMILY_ROOT / "evidence" / ship_key / "build_summary.json"
    source_path = FAMILY_ROOT / "source" / "wholeships" / f"ashline_v2_{ship_key}.glb"
    if not summary_path.exists() or not source_path.exists():
        raise FileNotFoundError(f"{ship_key.title()} material-truth receipt inputs are missing")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if ship_key == "lode":
        summary["materialTruth"] = {
            "revision": "lode-material-truth-2026-07-28-v1",
            "sourceSha256": sha256(source_path),
            "driveProfileId": "drive_torch_l",
            "weaponIds": [
                "wpn_autocannon_m",
                "wpn_autocannon_m",
                "wpn_pulse_laser_s",
            ],
            "components": [
                "paired-heavy-autocannon-casemates",
                "radial-recoil-load-frames",
                "fixed-pulse-projector-s",
                "open-cycle-torch-l",
            ],
            "fictionalMaterials": {
                "Material_Hull": "coated-or-oxidized-armor-and-donor-structure",
                "Material_Mechanical": "nitrided-load-frame-trunnion-and-service-steel",
                "Material_Red_Paint": "non-metallic-reach-oxide-red-coating",
                "Material_RepairPrimer": "chalked-zinc-phosphate-dielectric-primer",
                "Material_HeatMetal": "nickel-hot-sections-and-heat-darkened-stainless",
                "Material_Refractory": "alumina-zirconia-ceramic",
                "Material_Cyan": "recessed-internal-energy-cue",
            },
            "acceptedComponentRoles": [
                "armor-shell", "autocannon-barrel", "autocannon-breech",
                "cassette-access", "hydraulic-recoil-damper", "mantlet",
                "open-cycle-torch", "pulse-projector", "radial-load-frame",
                "refractory-throat", "service-pack", "thrust-saddle", "trunnion",
            ],
            "lodPolicy": {
                "lod0": "full-component-construction",
                "lod1": "load-path-and-material-boundaries",
                "lod2": "donor-macro-hull-only",
            },
            "references": [
                "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
                "lode_autocannon_casemate_reference.png",
                "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
                "lode_open_cycle_torch_reference.png",
            ],
            "promotionBlockers": [
                "single-central-weapon-socket-versus-three-visible-weapons-needs-runtime-vfx-proof",
                "browser-electron-and-lod-transition-evidence-remains-external",
            ],
        }
        summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        return
    if ship_key == "rig":
        source_sha256 = sha256(source_path)
        root_contract = rig_root_material_truth_contract()
        summary["materialTruth"] = {
            **copy.deepcopy(root_contract),
            "sourceSha256": source_sha256,
            "sourceHashBinding": {
                "sourceSha256": source_sha256,
                "componentInventoryDigest": root_contract["componentInventoryDigest"],
                "collisionContractDigest": root_contract["collisionContractDigest"],
            },
            "captureProfileId": "capture_hook_tether_control",
            "weaponMountKind": "generic_shared_forward_mount",
            "fictionalMaterials": {
                "Material_Hull": "phosphate-coated-welded-high-strength-plate-girder-and-donor-structure",
                "Material_Mechanical": "nitrided-tool-steel-pins-drum-bearings-and-pressure-cases",
                "Material_Red_Paint": "non-metallic-oxide-red-guards-and-service-markings-only",
                "Material_PolishedSteel": "turned-shafts-hydraulic-rods-retainers-and-service-fittings",
                "Material_CableSteel": "braided-high-carbon-tether-wrap-and-hydraulic-service-lines",
                "Material_Hardface": "heat-darkened-replaceable-jaw-contact-pads",
                "Material_HotSection": "nickel-drive-hot-jackets-and-rolled-bells",
                "Material_Refractory": "dry-alumina-zirconia-drive-throats",
                "Material_Cyan": "small-recessed-internal-drive-cue-only",
            },
            "authoredComponentRoles": [
                "a-frame-boom", "band-brake", "bearing-block", "braided-tether",
                "capture-clevis", "drive-pressure-case", "forged-jaw", "hollow-bell",
                "hydraulic-cylinder", "jaw-keeper", "refractory-throat", "rope-fairlead",
                "serrated-hardface-pad", "split-bearing", "thrust-saddle", "valve-pack",
            ],
            "forbiddenReads": [
                "box-boom", "box-jaw", "bright-engine-disk", "glowing-disk", "naked-cylinder",
                "smooth-lump", "torus", "tube", "unrooted-threat-rail",
            ],
            "lodPolicy": {
                "lod0": "full-capture-machinery-and-drive-construction",
                "lod1": "capture-load-path-drive-cases-and-material-boundaries",
                "lod2": "donor-macro-hull-only",
            },
            "references": [
                "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
                "rig_capture_assembly_reference.png",
                "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
                "rig_tether_winch_reference.png",
                "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
                "rig_paired_reaction_drive_reference.png",
            ],
            "producer": {
                "path": "tools/blender/build_m4_ashline_v2.py",
                "sha256": sha256(Path(__file__)),
            },
            "materialBill": "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
                            "RIG_COMPONENT_MATERIAL_BILL.md",
            "promotionBlockers": [
                *root_contract["promotionBlockers"],
                "browser-electron-cost-and-independent-g7-evidence-remain-external",
            ],
        }
        summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        return
    summary["materialTruth"] = {
        "revision": "dart-material-truth-2026-07-28-v1",
        "sourceSha256": sha256(source_path),
        "driveProfileId": "drive_reaction_s",
        "weaponId": "wpn_pulse_laser_s",
        "weaponKind": "pulse_projector",
        "components": [
            "fixed-pulse-projector-s",
            "folded-feed-spines",
            "vector-reaction-drive-s-twin",
        ],
        "fictionalMaterials": {
            "Material_Hull": "oxidized-or-coated-structural-steel",
            "Material_Mechanical": "nitrided-structural-steel",
            "Material_Red_Paint": "non-metallic-oxide-red-coating",
            "Material_HeatMetal": "nickel-superalloy-and-heat-darkened-stainless",
            "Material_Refractory": "alumina-zirconia-ceramic",
            "Material_Cyan": "recessed-internal-energy-cue",
        },
        "acceptedComponentRoles": [
            "cold-pressure-case",
            "cooling-jacket",
            "coolant-service",
            "feed-spine-cover",
            "feed-spine-mount",
            "feed-spine-pipe",
            "fixed-pulse-projector",
            "hot-section",
            "load-clevis-and-saddle",
            "optical-collimator",
            "power-service",
            "refractory-nozzle-throat",
            "segmented-clamp",
            "thermal-shield",
        ],
        "forbiddenWeaponRoles": [
            "ammo", "autocannon", "coilgun", "magazine",
            "projectile-accelerator", "recoil",
        ],
        "driveCentersRuntime": [
            {"x": -7.25, "y": 0.0, "z": -2.15},
            {"x": -7.25, "y": 0.0, "z": 2.15},
        ],
        "serviceTypes": ["coolant", "power"],
        "lodPolicy": {
            "lod0": "full-component-construction",
            "lod1": "load-path-and-material-boundaries",
            "lod2": "donor-macro-hull-only",
        },
        "references": [
            "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
            "dart_twin_drive_component_reference.png",
            "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
            "dart_forward_pulse_projector_reference.png",
        ],
    }
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def requested_ship_keys() -> list[str]:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = base.parse_args(argv)
    return [args["only"]] if args["only"] else list(SHIP_CONFIG)


def family_metric_row(ship_key: str) -> dict[str, Any]:
    metrics_path = FAMILY_ROOT / "evidence" / ship_key / "production_metrics.json"
    if not metrics_path.exists():
        raise FileNotFoundError(f"missing {ship_key} production metrics: {metrics_path}")
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    report = metrics["report"]
    lod_breakdown = report["lodBreakdown"]
    source_path = FAMILY_ROOT / "source" / "wholeships" / f"ashline_v2_{ship_key}.glb"
    return {
        "key": ship_key,
        "id": f"ashline_v2_{ship_key}",
        "role": base.SHIP_SPECS[ship_key]["role"],
        "totalTriangles": report["totalTriangles"],
        "hullTriangles": report["hullTriangles"],
        "lodTriangles": {
            lod: lod_breakdown[lod]["triangles"]
            for lod in ("lod0", "lod1", "lod2")
        },
        "lod0AabbSize": report["lod0AabbSize"],
        "collisionBounds": report["collisionBounds"],
        "sockets": report["sockets"],
        "materials": report["materials"],
        "sha256": sha256(source_path),
        "sourceGlb": str(source_path.relative_to(ROOT)).replace("\\", "/"),
        "blend": metrics["blend"],
        "sourceBytes": source_path.stat().st_size,
        "evidenceEpoch": metrics.get("evidenceEpoch", {
            "status": "requires-post-finalize-epoch",
        }),
    }


def normalize_family_metrics() -> None:
    family_metrics = FAMILY_ROOT / "evidence" / "family" / "family_metrics.json"
    if not family_metrics.exists():
        raise FileNotFoundError(f"missing family metrics: {family_metrics}")
    data = json.loads(family_metrics.read_text(encoding="utf-8"))
    data["schema"] = "spaceface.m4AshlineSourceFamilyMetrics.v1"
    data["packet"] = PACKET
    data["familyId"] = "ashline_v2"
    data["ships"] = [family_metric_row(key) for key in SHIP_CONFIG]
    data["sourceAdaptationReceipt"] = "assets/ships/m4_ashline_v2/SOURCE_ADAPTATION.json"
    data["isolation"]["root"] = "assets/ships/m4_ashline_v2"
    family_metrics.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    built_keys = requested_ship_keys()
    scoped_build = len(built_keys) != len(SHIP_CONFIG)
    if not scoped_build:
        write_source_receipt()
    original_argv = sys.argv
    if scoped_build:
        # Suppress the shared builder's one-ship rollup at the producer. Restoring a pre-build
        # snapshot after a long Blender run can erase a concurrent finalizer's newer family epoch.
        sys.argv = [*sys.argv, "--no-family-metrics"] if "--" in sys.argv else [
            *sys.argv, "--", "--no-family-metrics",
        ]
    try:
        code = int(base.main())
    finally:
        sys.argv = original_argv
    if code == 0:
        for ship_key in built_keys:
            write_material_truth_receipt(ship_key)
        if not scoped_build:
            normalize_family_metrics()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
