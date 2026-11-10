"""Deterministic golden-asset polish for the Borrowed Time Kestrel.

This pass preserves the supplied macro silhouette and adds only functional,
camera-readable construction detail. It is deliberately data-driven so the
same plate/vent/fastener vocabulary can be reused across related ships without
turning into random greeble scatter.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import mathutils

sys.path.insert(0, str(Path(__file__).resolve().parent))
from surface_maps_v2 import REMASTER_ID, apply_to_blender_images


GOLDEN_PASS_ID = "kestrel-golden-asset-v5"
COLLECTION_NAME = "KESTREL_V5_GOLDEN_DETAIL"
PREFIX = "V5_"


PLATE_RECIPE = (
    # Large shoulder overlays reinforce the existing armor shell and preserve
    # the Kestrel's swept silhouette at every LOD.
    dict(name="ShoulderOverlay_Port", center=(0.15, -4.20, 0.88), length=7.20,
         aft_width=1.05, fore_width=0.72, thickness=0.18, material="Material_Hull",
         bevel=0.075, detail=0, component="armor_shell", function="replaceable shoulder armor"),
    dict(name="ShoulderOverlay_Starboard", center=(0.15, 4.20, 0.88), length=7.20,
         aft_width=1.05, fore_width=0.72, thickness=0.18, material="Material_Hull",
         bevel=0.075, detail=0, component="armor_shell", function="replaceable shoulder armor"),
    # The axial drive gets a materially distinct refractory shroud rather than
    # sharing the same gray response as hull and machinery.
    dict(name="EngineHeatShield_Port", center=(-10.35, -2.28, 0.02), length=3.85,
         aft_width=0.34, fore_width=0.42, thickness=1.58, material="Material_EngineCeramic",
         bevel=0.065, detail=0, component="propulsion", function="refractory drive heat shield"),
    dict(name="EngineHeatShield_Starboard", center=(-10.35, 2.28, 0.02), length=3.85,
         aft_width=0.34, fore_width=0.42, thickness=1.58, material="Material_EngineCeramic",
         bevel=0.065, detail=0, component="propulsion", function="refractory drive heat shield"),
    # Paired hatches sit beside the dorsal spine, leaving a readable dark seam
    # and a deliberate maintenance zone at the default game camera.
    dict(name="DorsalHatch_Port", center=(-1.05, -1.56, 1.93), length=3.40,
         aft_width=1.18, fore_width=0.94, thickness=0.17, material="Material_Hull",
         bevel=0.055, detail=1, component="maintenance", function="pressure hull service hatch"),
    dict(name="DorsalHatch_Starboard", center=(-1.05, 1.56, 1.93), length=3.40,
         aft_width=1.18, fore_width=0.94, thickness=0.17, material="Material_Hull",
         bevel=0.055, detail=1, component="maintenance", function="pressure hull service hatch"),
    # Armor roots visually explain how the broad shoulders transfer load into
    # the central pressure hull rather than looking like floating slabs.
    dict(name="ShoulderRoot_Port", center=(-4.55, -3.12, 1.20), length=2.55,
         aft_width=0.68, fore_width=0.52, thickness=0.36, material="Material_ArmorDark",
         bevel=0.070, detail=1, component="structure", function="shoulder load-transfer collar"),
    dict(name="ShoulderRoot_Starboard", center=(-4.55, 3.12, 1.20), length=2.55,
         aft_width=0.68, fore_width=0.52, thickness=0.36, material="Material_ArmorDark",
         bevel=0.070, detail=1, component="structure", function="shoulder load-transfer collar"),
)


BOX_RECIPE = (
    # Dark under-plates establish visible recess depth around the service hatches.
    dict(name="DorsalHatchRecess_Port", center=(-1.05, -1.56, 1.815), dimensions=(3.72, 1.46, 0.12),
         material="Material_Mechanical", bevel=0.035, detail=1, component="maintenance",
         function="service hatch recess"),
    dict(name="DorsalHatchRecess_Starboard", center=(-1.05, 1.56, 1.815), dimensions=(3.72, 1.46, 0.12),
         material="Material_Mechanical", bevel=0.035, detail=1, component="maintenance",
         function="service hatch recess"),
    # Non-emissive manufacturer/service stripes remain paint, not glow.
    dict(name="ServiceStripe_Port", center=(-0.30, -1.56, 2.025), dimensions=(1.20, 1.00, 0.055),
         material="Material_Accent_FrontierCyan", bevel=0.018, detail=1, component="identity",
         function="manufacturer service marking"),
    dict(name="ServiceStripe_Starboard", center=(-1.78, 1.56, 2.025), dimensions=(0.46, 1.00, 0.055),
         material="Material_Accent_WarningOrange", bevel=0.018, detail=1, component="identity",
         function="maintainer hazard marking"),
    # Radiator face caps are large enough to survive the normal game camera and
    # establish a separate heat-management material language.
    dict(name="RadiatorFace_Port", center=(-3.50, -6.31, 1.08), dimensions=(2.85, 0.42, 0.16),
         material="Material_Radiator", bevel=0.030, detail=1, component="heat_management",
         function="radiator service manifold"),
    dict(name="RadiatorFace_Starboard", center=(-3.50, 6.31, 1.08), dimensions=(2.85, 0.42, 0.16),
         material="Material_Radiator", bevel=0.030, detail=1, component="heat_management",
         function="radiator service manifold"),
    # Canopy edge rails strengthen material separation between glass and hull.
    dict(name="CanopyRail_Port", center=(4.35, -1.34, 1.93), dimensions=(3.80, 0.20, 0.24),
         material="Material_ArmorDark", bevel=0.045, detail=1, component="crew_control",
         function="canopy pressure frame"),
    dict(name="CanopyRail_Starboard", center=(4.35, 1.34, 1.93), dimensions=(3.80, 0.20, 0.24),
         material="Material_ArmorDark", bevel=0.045, detail=1, component="crew_control",
         function="canopy pressure frame"),
    # The field-repair pod keeps its useful asymmetry but gains an engineered
    # cap and two load straps so it no longer reads as a bright toy box.
    dict(name="UtilityPodTopCap", center=(-1.45, 3.80, 1.825), dimensions=(2.82, 1.48, 0.12),
         material="Material_ArmorDark", bevel=0.035, detail=1, component="utility",
         function="field-repair pod armor cap"),
    dict(name="UtilityPodClamp_Aft", center=(-2.55, 3.80, 1.910), dimensions=(0.18, 1.68, 0.10),
         material="Material_BrushedMetal", bevel=0.020, detail=1, component="utility",
         function="field-repair pod restraint"),
    dict(name="UtilityPodClamp_Fore", center=(-0.35, 3.80, 1.910), dimensions=(0.18, 1.68, 0.10),
         material="Material_BrushedMetal", bevel=0.020, detail=1, component="utility",
         function="field-repair pod restraint"),
    # Narrow composite inlays interrupt the otherwise broad shoulder slabs at a scale that survives
    # the gameplay camera. They are access tracks with deliberate end clearances, not surface noise.
    dict(name="ShoulderInlay_Port", center=(0.55, -4.22, 1.015), dimensions=(4.60, 0.44, 0.075),
         material="Material_ArmorDark", bevel=0.022, detail=1, component="maintenance",
         function="shoulder armor access track"),
    dict(name="ShoulderInlay_Starboard", center=(0.55, 4.22, 1.015), dimensions=(4.60, 0.44, 0.075),
         material="Material_ArmorDark", bevel=0.022, detail=1, component="maintenance",
         function="shoulder armor access track"),
    # Four cross-hull bridge shoes visibly seat the outer armor into the pressure hull. Their spacing
    # follows the forward and aft load paths instead of distributing identical greebles everywhere.
    dict(name="ShoulderBridge_Aft_Port", center=(-4.92, -3.18, 1.16), dimensions=(0.32, 1.06, 0.12),
         material="Material_BrushedMetal", bevel=0.045, detail=1, component="structure",
         function="aft shoulder load bridge"),
    dict(name="ShoulderBridge_Aft_Starboard", center=(-4.92, 3.18, 1.16), dimensions=(0.32, 1.06, 0.12),
         material="Material_BrushedMetal", bevel=0.045, detail=1, component="structure",
         function="aft shoulder load bridge"),
    dict(name="ShoulderBridge_Fore_Port", center=(2.70, -3.42, 1.075), dimensions=(0.28, 0.88, 0.11),
         material="Material_ArmorDark", bevel=0.040, detail=1, component="structure",
         function="forward shoulder load bridge"),
    dict(name="ShoulderBridge_Fore_Starboard", center=(2.70, 3.42, 1.075), dimensions=(0.28, 0.88, 0.11),
         material="Material_ArmorDark", bevel=0.040, detail=1, component="structure",
         function="forward shoulder load bridge"),
    # Paired dark wells and anisotropic radiator faces give the engine/pressure-hull interface a
    # readable cooling system rather than another stack of same-finish gray boxes.
    dict(name="ThermalIntakeRecess_Port", center=(-6.78, -1.30, 1.72), dimensions=(2.00, 0.82, 0.11),
         material="Material_Mechanical", bevel=0.032, detail=1, component="heat_management",
         function="dorsal thermal intake well"),
    dict(name="ThermalIntakeRecess_Starboard", center=(-6.78, 1.30, 1.72), dimensions=(2.00, 0.82, 0.11),
         material="Material_Mechanical", bevel=0.032, detail=1, component="heat_management",
         function="dorsal thermal intake well"),
    dict(name="ThermalIntakeFace_Port", center=(-6.72, -1.30, 1.805), dimensions=(1.58, 0.54, 0.12),
         material="Material_Radiator", bevel=0.026, detail=1, component="heat_management",
         function="dorsal thermal intake face"),
    dict(name="ThermalIntakeFace_Starboard", center=(-6.72, 1.30, 1.805), dimensions=(1.58, 0.54, 0.12),
         material="Material_Radiator", bevel=0.026, detail=1, component="heat_management",
         function="dorsal thermal intake face"),
    # The long nose gains one continuous service keel and a compact sensor-access cap. This reinforces
    # the Kestrel's centerline without turning the armored brow into a uniform painted slab.
    dict(name="NoseServiceKeel", center=(6.82, 0.0, 2.095), dimensions=(4.10, 0.24, 0.075),
         material="Material_ArmorDark", bevel=0.026, detail=1, component="sensors",
         function="armored sensor service keel"),
)


VENT_RECIPE = (
    dict(name="DriveVent_Port", origin=(-8.20, -2.48, 1.10), count=5, step=(0.48, 0.0, 0.0),
         dimensions=(0.26, 0.30, 0.88), material="Material_Radiator", detail=1,
         component="propulsion", function="drive heat rejection louver"),
    dict(name="DriveVent_Starboard", origin=(-8.20, 2.48, 1.10), count=5, step=(0.48, 0.0, 0.0),
         dimensions=(0.26, 0.30, 0.88), material="Material_Radiator", detail=1,
         component="propulsion", function="drive heat rejection louver"),
)


CONDUIT_RECIPE = (
    dict(name="DriveManifold_Port", center=(-7.18, -2.02, 1.52), length=2.75, radius=0.080,
         material="Material_BrushedMetal", detail=1, component="propulsion",
         function="drive coolant feed manifold"),
    dict(name="DriveManifold_Starboard", center=(-7.18, 2.02, 1.52), length=2.75, radius=0.080,
         material="Material_BrushedMetal", detail=1, component="propulsion",
         function="drive coolant feed manifold"),
)


FASTENER_RECIPE = (
    # Twelve deliberately placed fasteners, clustered at serviceable panels;
    # no uniform rivet wallpaper.
    (-2.45, -2.08, 2.045), (0.35, -2.02, 2.045),
    (-2.45, -1.04, 2.045), (0.35, -1.10, 2.045),
    (-2.45, 2.08, 2.045), (0.35, 2.02, 2.045),
    (-2.45, 1.04, 2.045), (0.35, 1.10, 2.045),
    (-2.75, -4.55, 1.01), (2.80, -4.43, 1.01),
    (-2.75, 4.55, 1.01), (2.80, 4.43, 1.01),
)


def _remove_prior_pass() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREFIX) or obj.get("sf_golden_pass") == GOLDEN_PASS_ID:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data and getattr(data, "users", 1) == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
    old = bpy.data.collections.get(COLLECTION_NAME)
    if old is not None:
        bpy.data.collections.remove(old)


def _material_from_role(name: str, donor: str, role: str) -> bpy.types.Material:
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    source = bpy.data.materials.get(donor)
    if source is None:
        raise RuntimeError(f"missing material donor {donor}")
    material = source.copy()
    material.name = name
    material["spacefaceMaterialRole"] = role
    material["spacefaceSurfaceRemaster"] = REMASTER_ID
    for node in material.node_tree.nodes if material.node_tree else ():
        if node.type != "TEX_IMAGE" or node.image is None:
            continue
        token = node.image.name.lower()
        channel = "basecolor" if "basecolor" in token else "normal" if "normal" in token else "orm" if "orm" in token else None
        if channel is not None:
            image = bpy.data.images.get(f"{role}_{channel}.png")
            if image is None:
                raise RuntimeError(f"missing generated image {role}_{channel}.png")
            node.image = image
    return material


def ensure_golden_materials() -> dict[str, bpy.types.Material]:
    _material_from_role("Material_EngineCeramic", "Material_ArmorDark", "engine_ceramic")
    _material_from_role("Material_Radiator", "Material_BrushedMetal", "radiator")
    required = {
        name: bpy.data.materials.get(name)
        for name in (
            "Material_Hull", "Material_ArmorDark", "Material_Mechanical",
            "Material_BrushedMetal", "Material_Accent_FrontierCyan",
            "Material_Accent_WarningOrange", "Material_RepairGreen", "Material_Rubber",
            "Material_Glass_Canopy",
            "Material_EngineCeramic", "Material_Radiator",
        )
    }
    missing = [name for name, material in required.items() if material is None]
    if missing:
        raise RuntimeError(f"missing golden materials: {', '.join(missing)}")
    return required


def _principled(material: bpy.types.Material):
    if not material.use_nodes or material.node_tree is None:
        raise RuntimeError(f"material is not node based: {material.name}")
    node = next((item for item in material.node_tree.nodes if item.type == "BSDF_PRINCIPLED"), None)
    if node is None:
        raise RuntimeError(f"Principled BSDF missing: {material.name}")
    return node


def _set_inputs(material: bpy.types.Material, values: dict[str, object]) -> None:
    node = _principled(material)
    for name, value in values.items():
        socket = node.inputs.get(name)
        if socket is None:
            raise RuntimeError(f"{material.name} missing Principled input {name}")
        socket.default_value = value


def configure_pbr_extensions(materials: dict[str, bpy.types.Material]) -> dict:
    """Author extension-tier responses that survive Blender glTF export.

    Coating is confined to maintained paint, anisotropy to directionally
    manufactured metal, and transmission/IOR to the canopy. These are material
    identities, not a global shininess multiplier.
    """
    coating = {
        "Material_Hull": (0.20, 0.34),
        "Material_ArmorDark": (0.07, 0.46),
        "Material_Accent_FrontierCyan": (0.24, 0.30),
        "Material_Accent_WarningOrange": (0.18, 0.38),
        "Material_RepairGreen": (0.055, 0.58),
        "Material_EngineCeramic": (0.035, 0.62),
    }
    anisotropy = {
        "Material_Mechanical": 0.22,
        "Material_BrushedMetal": 0.52,
        "Material_Radiator": 0.70,
    }
    for name, (weight, roughness) in coating.items():
        _set_inputs(materials[name], {
            "Coat Weight": weight,
            "Coat Roughness": roughness,
        })
        materials[name]["spacefaceCoatingRole"] = "maintained_paint" if "Ceramic" not in name else "sealed_refractory"
    for name, strength in anisotropy.items():
        _set_inputs(materials[name], {
            "Anisotropic": strength,
            "Anisotropic Rotation": 0.0,
            # Keep the exporter from emitting a no-op clearcoat extension
            # inherited from the donor Principled defaults.
            "Coat Weight": 0.0,
            "Coat Roughness": 0.0,
        })
        materials[name]["spacefaceManufacturingGrain"] = "directional"

    _set_inputs(materials["Material_Rubber"], {"Coat Weight": 0.0, "Coat Roughness": 0.0})

    glass = materials["Material_Glass_Canopy"]
    _set_inputs(glass, {
        "Metallic": 0.0,
        "Roughness": 0.14,
        "IOR": 1.47,
        "Transmission Weight": 0.70,
        "Coat Weight": 0.34,
        "Coat Roughness": 0.055,
        # Cockpit displays already own emissive feedback. The canopy itself is
        # reflective glass, not a full-surface cyan lamp.
        "Emission Strength": 0.0,
    })
    glass["spacefaceGlassRole"] = "sensor_canopy_reflective_nonemissive"
    return {
        "coating": {name: {"weight": values[0], "roughness": values[1]} for name, values in coating.items()},
        "anisotropy": anisotropy,
        "glass": {
            "ior": 1.47, "transmission": 0.70, "coatWeight": 0.34,
            "roughness": 0.14, "wholeSurfaceEmission": 0.0,
        },
    }


def _tag(obj: bpy.types.Object, *, detail: int, component: str, function: str) -> None:
    obj["sf_golden_pass"] = GOLDEN_PASS_ID
    obj["sf_detail_level"] = detail
    obj["sf_component"] = component
    obj["sf_function"] = function


def _assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True


def _unwrap(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.025)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def _finish(obj: bpy.types.Object, material: bpy.types.Material, bevel_width: float,
            *, detail: int, component: str, function: str) -> bpy.types.Object:
    _assign_material(obj, material)
    _unwrap(obj)
    bevel = obj.modifiers.new("SF_V5_Bevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(24.0)
    if hasattr(bevel, "harden_normals"):
        bevel.harden_normals = True
    weighted = obj.modifiers.new("SF_V5_WeightedNormal", "WEIGHTED_NORMAL")
    if hasattr(weighted, "keep_sharp"):
        weighted.keep_sharp = True
    _tag(obj, detail=detail, component=component, function=function)
    return obj


def _prism(collection: bpy.types.Collection, materials: dict, spec: dict) -> bpy.types.Object:
    length = float(spec["length"])
    aft = float(spec["aft_width"]) * 0.5
    fore = float(spec["fore_width"]) * 0.5
    half_z = float(spec["thickness"]) * 0.5
    half_x = length * 0.5
    verts = (
        (-half_x, -aft, -half_z), (-half_x, aft, -half_z),
        (half_x, -fore, -half_z), (half_x, fore, -half_z),
        (-half_x, -aft, half_z), (-half_x, aft, half_z),
        (half_x, -fore, half_z), (half_x, fore, half_z),
    )
    faces = (
        (0, 2, 3, 1), (4, 5, 7, 6), (0, 4, 6, 2),
        (1, 3, 7, 5), (0, 1, 5, 4), (2, 6, 7, 3),
    )
    mesh = bpy.data.meshes.new(f"{PREFIX}{spec['name']}_Mesh")
    mesh.from_pydata(verts, (), faces)
    mesh.update()
    obj = bpy.data.objects.new(f"{PREFIX}{spec['name']}", mesh)
    collection.objects.link(obj)
    obj.location = spec["center"]
    return _finish(obj, materials[spec["material"]], spec["bevel"], detail=spec["detail"],
                   component=spec["component"], function=spec["function"])


def _box(collection: bpy.types.Collection, materials: dict, spec: dict) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{PREFIX}{spec['name']}_Mesh")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(mesh)
    bm.free()
    dimensions = spec["dimensions"]
    for vertex in mesh.vertices:
        vertex.co.x *= dimensions[0]
        vertex.co.y *= dimensions[1]
        vertex.co.z *= dimensions[2]
    mesh.update()
    obj = bpy.data.objects.new(f"{PREFIX}{spec['name']}", mesh)
    collection.objects.link(obj)
    obj.location = spec["center"]
    return _finish(obj, materials[spec["material"]], spec["bevel"], detail=spec["detail"],
                   component=spec["component"], function=spec["function"])


def _fastener(collection: bpy.types.Collection, material: bpy.types.Material,
              index: int, center: tuple[float, float, float]) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{PREFIX}ServiceFastener_{index:02d}_Mesh")
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=True, segments=12,
        radius1=0.105, radius2=0.105, depth=0.075,
    )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(f"{PREFIX}ServiceFastener_{index:02d}", mesh)
    collection.objects.link(obj)
    obj.location = center
    return _finish(obj, material, 0.016, detail=2, component="maintenance",
                   function="serviceable panel fastener")


def _axial_conduit(collection: bpy.types.Collection, materials: dict, spec: dict) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{PREFIX}{spec['name']}_Mesh")
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=True, segments=16,
        radius1=spec["radius"], radius2=spec["radius"], depth=spec["length"],
    )
    # BMesh cylinders are created along local Z; rotate the mesh data so transforms remain applied
    # and the exported coolant line follows the Kestrel's longitudinal +X axis.
    rotation = mathutils.Matrix.Rotation(math.radians(90.0), 4, "Y")
    bmesh.ops.transform(bm, matrix=rotation, verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(f"{PREFIX}{spec['name']}", mesh)
    collection.objects.link(obj)
    obj.location = spec["center"]
    return _finish(obj, materials[spec["material"]], 0.012, detail=spec["detail"],
                   component=spec["component"], function=spec["function"])


def _reassign_existing(materials: dict) -> list[dict]:
    reassigned = []
    for obj in bpy.data.objects:
        target = None
        role = None
        if obj.type == "MESH" and obj.name.startswith("Engine_NozzlePetal_"):
            target = materials["Material_EngineCeramic"]
            role = "engine ceramic"
        elif obj.type == "MESH" and (obj.name.startswith("Engine_HeatVane_") or obj.name == "Radiator_Fin_Array_Source"):
            target = materials["Material_Radiator"]
            role = "radiator"
        if target is None:
            continue
        prior = [material.name for material in obj.data.materials]
        _assign_material(obj, target)
        reassigned.append({"object": obj.name, "from": prior, "to": target.name, "role": role})
    return reassigned


def apply_golden_asset_v5() -> dict:
    source = bpy.data.collections.get("KESTREL_V4_PRODUCTION_SOURCE") or bpy.data.collections.get("SOURCE_HERO_LOD0")
    root = bpy.data.objects.get("SF_K0_BORROWED_TIME_ROOT")
    if source is None or root is None:
        raise RuntimeError("Kestrel source collection/root missing")
    _remove_prior_pass()
    materials = ensure_golden_materials()
    pbr_extensions = configure_pbr_extensions(materials)
    collection = bpy.data.collections.new(COLLECTION_NAME)
    source.children.link(collection)
    objects = []
    for spec in PLATE_RECIPE:
        objects.append(_prism(collection, materials, spec))
    for spec in BOX_RECIPE:
        objects.append(_box(collection, materials, spec))
    for bank in VENT_RECIPE:
        origin = bank["origin"]
        step = bank["step"]
        for index in range(bank["count"]):
            spec = dict(
                name=f"{bank['name']}_{index:02d}",
                center=tuple(origin[axis] + step[axis] * index for axis in range(3)),
                dimensions=bank["dimensions"], material=bank["material"], bevel=0.026,
                detail=bank["detail"], component=bank["component"], function=bank["function"],
            )
            objects.append(_box(collection, materials, spec))
    for spec in CONDUIT_RECIPE:
        objects.append(_axial_conduit(collection, materials, spec))
    for index, center in enumerate(FASTENER_RECIPE):
        objects.append(_fastener(collection, materials["Material_BrushedMetal"], index, center))
    for obj in objects:
        obj.parent = root
    reassigned = _reassign_existing(materials)
    report = {
        "schema": "spaceface.kestrelGoldenAsset.v1",
        "goldenPassId": GOLDEN_PASS_ID,
        "surfaceRemasterId": REMASTER_ID,
        "objectsAdded": len(objects),
        "lod0OnlyMicroObjects": sum(1 for obj in objects if int(obj.get("sf_detail_level", 0)) == 2),
        "lod0AndLod1MesoObjects": sum(1 for obj in objects if int(obj.get("sf_detail_level", 0)) == 1),
        "allLodMacroObjects": sum(1 for obj in objects if int(obj.get("sf_detail_level", 0)) == 0),
        "materialsAdded": ["Material_EngineCeramic", "Material_Radiator"],
        "pbrExtensions": pbr_extensions,
        "reassigned": reassigned,
        "objects": [obj.name for obj in objects],
    }
    root["goldenAssetPass"] = report
    return report


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    apply_to_blender_images(bpy)
    report = apply_golden_asset_v5()
    for image in bpy.data.images:
        if image.source == "FILE" and image.size[0] > 0 and not image.packed_file:
            image.pack()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("KESTREL_GOLDEN_V5=" + json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
