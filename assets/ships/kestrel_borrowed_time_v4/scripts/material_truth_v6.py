"""Deterministic material-truth and shape-grammar pass for the Kestrel.

This pass replaces camera-prominent default primitives with manufactured components whose
geometry and shader response agree with the in-fiction component bill. It is deliberately
idempotent so it can be iterated in a connected Blender session and replayed by build_v4.py.
"""
from __future__ import annotations

import json
import math

import bpy
import bmesh
from mathutils import Matrix


PASS_ID = "kestrel-material-truth-v6"
COLLECTION_NAME = "KESTREL_V6_MATERIAL_TRUTH"
PREFIX = "V6_"

LEGACY_EXACT = {
    "Engine_Aft_LoadRing",
    "Engine_CoolingRing",
    "Engine_Forward_LoadRing",
    "Engine_Core",
    "Antenna_Loop",
    "Antenna_Mast",
    "Decal_BorrowedTime",
    "Radiator_Fin_Array_Source",
    "UtilityPod_Starboard",
    "UtilityPod_HazardBand",
    "V5_UtilityPodTopCap",
    "V5_UtilityPodClamp_Aft",
    "V5_UtilityPodClamp_Fore",
    "V5_RadiatorFace_Port",
    "V5_RadiatorFace_Starboard",
    "Nose_Armored_Brow",
    "Nose_Sensor_Slit_0",
    "Nose_Sensor_Slit_1",
    "Pulse_Gimbal_Base",
    "Pulse_Gimbal_Ring",
    "Pulse_Receiver",
    "Hull_Shoulder_Armor_Pair",
}
LEGACY_PREFIXES = (
    "Engine_NozzlePetal_",
    "Engine_HeatVane_",
    "V5_DriveVent_",
    "V5_ShoulderOverlay_",
    "V5_ShoulderInlay_",
    "Pulse_Coil_",
)

MATERIAL_BILLS = {
    "drive_alloy": {
        "substrate": "cast and finish-machined nickel-chromium drive alloy",
        "manufacture": "segmented casting, machined bearing faces, drilled clamp roots",
        "finish": "heat-darkened conversion finish with directional service polish",
        "interface": "bolted clamp segments over ceramic isolators and aft casing flange",
        "response": "dark metallic broad highlights with restrained directional micrograin",
        "history": "repeated hot-cycle discoloration and tool contact at service fasteners",
        "forbidden": "cyan tire, rubber ring, molded plastic torus",
    },
    "ceramic_isolator": {
        "substrate": "alumina-silicate electrical and thermal isolation ceramic",
        "manufacture": "pressed segment, sintered, ground at clamp interfaces",
        "finish": "unpainted warm-gray ceramic with localized soot",
        "interface": "captured between drive casing and metallic load-clamp segments",
        "response": "nonmetallic diffuse response with tight low-amplitude surface variation",
        "history": "protected faces remain clean; exposed aft edges carry carbon haze",
        "forbidden": "rubber gasket, plastic spacer, leather grain",
    },
    "refractory_vane": {
        "substrate": "refractory superalloy skin over ceramic laminate",
        "manufacture": "taper-formed vane with machined pivot root and folded stiffening edges",
        "finish": "oxide-darkened hot face and cooler machined root",
        "interface": "individual root pivots around the aft drive casing",
        "response": "thin hard vanes with rough hot faces and metallic root glints",
        "history": "aft-edge heat staining and unequal replacement age",
        "forbidden": "rectangular chocolate block, LEGO chiclet, painted cube",
    },
    "pressure_shell": {
        "substrate": "rolled and longitudinally welded low-alloy pressure shell",
        "manufacture": "formed shell courses with welded seams and frame saddles",
        "finish": "dark conversion coat with patch primer and restrained orange peel",
        "interface": "captured by shoulder roots, keel, dorsal spine and drive bulkhead",
        "response": "broad coated-metal response with shallow formed waviness only",
        "history": "service access polish and local patching, not universal noise",
        "forbidden": "rubber tube, leather wrap, clay cylinder",
    },
    "radiator": {
        "substrate": "folded high-temperature metallic radiator sheet",
        "manufacture": "corrugated louvers in a welded recessed frame",
        "finish": "oxidized dark metal with directional thermal grain",
        "interface": "replaceable bank seated into shoulder heat-transfer rails",
        "response": "thin rhythmic blades, dark recesses and directional metal highlights",
        "history": "leading-edge dust and uneven oxidation from repeated heat cycles",
        "forbidden": "floating rectangle sticks, rubber comb, solid plastic bars",
    },
    "sensor": {
        "substrate": "machined aluminum-magnesium gimbal and conductive composite dish",
        "manufacture": "ribbed shallow dish, pivot yoke and replaceable feed horn",
        "finish": "dark low-glare coating with bare bearing faces",
        "interface": "bolted dorsal pedestal with visible yoke pivots and service lead",
        "response": "directional instrument; only the feed aperture emits",
        "history": "salvaged dish with one mismatched yoke arm and field-aligned stops",
        "forbidden": "neon hoop, lightbulb ring, decorative antenna circle",
    },
    "marking": {
        "substrate": "stencil paint over the existing coated pressure shell",
        "manufacture": "crew-cut stencil applied between service seams",
        "finish": "dirty warm-ivory aerosol marking paint with chipped hard edges",
        "interface": "conformal paint layer on the aft port armor course, clear of the inspection hatch",
        "response": "legible ship identity without a floating plaque",
        "history": "crew-applied gallows humor, edge overspray and scrape-local paint loss",
        "forbidden": "inventory label, orange censor block, generated gibberish",
    },
    "coated_hull_panel": {
        "substrate": "formed aluminum-steel aerospace hull panel",
        "manufacture": "cut, brake-formed and mounted to the pressure-frame structure",
        "finish": "dark conversion coat or locally renewed primer",
        "interface": "bolted or welded to named frame, hatch, keel or armor interface",
        "response": "coated metal with broad highlights and restrained paint microstructure",
        "history": "localized maintenance and contact wear only",
        "forbidden": "clay slab, plastic shell, leather skin",
    },
    "armor_plate": {
        "substrate": "high-toughness steel/aluminum laminate armor plate",
        "manufacture": "cut and brake-formed replaceable plate",
        "finish": "ceramic-rich matte protective coating over metallic substrate",
        "interface": "stood off from the pressure shell on visible load roots",
        "response": "hard planar response with distinct edge wear and no molded softness",
        "history": "impact repair and replacement age vary by plate",
        "forbidden": "toy wing, rubber slab, one-piece molded plastic",
    },
    "structural_metal": {
        "substrate": "machined or welded structural aerospace alloy",
        "manufacture": "section-appropriate extrusion, machining, tube forming or weldment",
        "finish": "dark passivation or directional service-polished bare metal",
        "interface": "fastened, welded or pivoted into a named load/service path",
        "response": "metallic response whose grain and edge scale follow manufacture",
        "history": "tool contact and joint-local grime, not wallpaper scratches",
        "forbidden": "default gray plastic, floating bar, unexplained cube",
    },
    "cable_elastomer": {
        "substrate": "braided conductor/line inside aerospace elastomer insulation",
        "manufacture": "extruded insulation over reinforced service line",
        "finish": "matte flexible jacket with metal terminations",
        "interface": "clamped at both ends and routed away from heat/contact zones",
        "response": "localized flexible nonmetal, used only at true cable/hose scale",
        "history": "compression and handling scuffs at clamps",
        "forbidden": "rubber hull, tire-like structure, leather grain",
    },
    "canopy": {
        "substrate": "laminated transparent ceramic pressure glazing",
        "manufacture": "hot-formed laminate with conductive and radiation-control layers",
        "finish": "dark conductive coating inside a metallic pressure frame",
        "interface": "captured by canopy rails and pressure seals",
        "response": "dense dark glazing with selective reflection and preserved depth",
        "history": "cleaned view sector with edge abrasion at the frame",
        "forbidden": "glowing plastic bubble, opaque toy glass",
    },
    "repair_panel": {
        "substrate": "salvaged formed alloy replacement panel",
        "manufacture": "field-cut and adapted to the original mounting pattern",
        "finish": "rough green patch primer over mismatched substrate",
        "interface": "clamps and adapter plates reveal the non-original fit",
        "response": "coated metal distinct from factory hull without becoming plastic",
        "history": "brush/roller application and localized grime around altered fasteners",
        "forbidden": "random green LEGO block, generic plastic box",
    },
    "active_aperture": {
        "substrate": "glass/ceramic optical aperture in a metallic or ceramic housing",
        "manufacture": "small replaceable lens, lamp or emitter module",
        "finish": "clear or coated aperture with non-emissive surrounding hardware",
        "interface": "recessed into a named navigation, sensor, weapon or drive function",
        "response": "emission confined to the active aperture and readable without bloom",
        "history": "clean aperture, worn surrounding mount",
        "forbidden": "glowing structural hoop, whole-surface neon decoration",
    },
}


def _source() -> bpy.types.Collection:
    value = (
        bpy.data.collections.get("KESTREL_V4_PRODUCTION_SOURCE")
        or bpy.data.collections.get("SOURCE_HERO_LOD0")
    )
    if value is None:
        raise RuntimeError("Kestrel production source collection missing")
    return value


def _root() -> bpy.types.Object:
    value = bpy.data.objects.get("SF_K0_BORROWED_TIME_ROOT")
    if value is None:
        raise RuntimeError("Kestrel root missing")
    return value


def _remove_object(obj: bpy.types.Object) -> None:
    data = obj.data
    kind = obj.type
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is None or getattr(data, "users", 1) != 0:
        return
    bucket = {
        "MESH": bpy.data.meshes,
        "CURVE": bpy.data.curves,
        "FONT": bpy.data.curves,
    }.get(kind)
    if bucket is not None:
        bucket.remove(data)


def _reset_collection(source: bpy.types.Collection) -> bpy.types.Collection:
    prior = bpy.data.collections.get(COLLECTION_NAME)
    if prior is not None:
        for obj in list(prior.all_objects):
            _remove_object(obj)
        for parent in bpy.data.collections:
            if prior.name in parent.children:
                parent.children.unlink(prior)
        if prior.name in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.unlink(prior)
        bpy.data.collections.remove(prior)
    collection = bpy.data.collections.new(COLLECTION_NAME)
    source.children.link(collection)
    return collection


def _hide_legacy() -> list[str]:
    hidden = []
    for obj in bpy.data.objects:
        if obj.name in LEGACY_EXACT or any(obj.name.startswith(prefix) for prefix in LEGACY_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            obj["sf_v6_replaced_by"] = PASS_ID
            hidden.append(obj.name)
    return sorted(hidden)


def _set_bill(obj: bpy.types.Object, bill_id: str, function: str, detail: int = 0) -> None:
    bill = MATERIAL_BILLS[bill_id]
    obj["sf_material_bill_id"] = bill_id
    obj["sf_substrate"] = bill["substrate"]
    obj["sf_manufacture"] = bill["manufacture"]
    obj["sf_finish"] = bill["finish"]
    obj["sf_interface"] = bill["interface"]
    obj["sf_optical_response"] = bill["response"]
    obj["sf_service_history"] = bill["history"]
    obj["sf_forbidden_read"] = bill["forbidden"]
    obj["sf_function"] = function
    obj["sf_detail_level"] = detail
    obj["sf_material_truth_pass"] = PASS_ID


def _principled_material(
    name: str,
    base: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    *,
    anisotropic: float = 0.0,
    micro_scale: float = 0.0,
    micro_strength: float = 0.0,
    surface_model: str = "coated",
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = base
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Anisotropic"].default_value = anisotropic
    shader.inputs["Coat Weight"].default_value = 0.0
    if emission is not None:
        shader.inputs["Emission Color"].default_value = emission
        shader.inputs["Emission Strength"].default_value = emission_strength
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if micro_scale > 0.0 and micro_strength > 0.0:
        tex = nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = micro_scale
        tex.inputs["Detail"].default_value = 2.0
        tex.inputs["Roughness"].default_value = 0.38
        source = tex.outputs["Fac"]
        bump_source = source
        if surface_model == "machined":
            # A dense noise-times-wave bump reads as woven carbon or leather
            # on the large drive casing. Machined alloy gets only extremely
            # shallow broad variation; Principled anisotropy carries its grain.
            tex.inputs["Scale"].default_value = 6.0
            tex.inputs["Detail"].default_value = 1.2
            tex.inputs["Roughness"].default_value = 0.25
            source = tex.outputs["Fac"]
            bump_source = source
        elif surface_model == "radiator":
            wave = nodes.new("ShaderNodeTexWave")
            wave.wave_type = "BANDS"
            wave.bands_direction = "X"
            wave.inputs["Scale"].default_value = micro_scale * 0.055
            wave.inputs["Distortion"].default_value = 0.35
            wave.inputs["Detail"].default_value = 2.0
            combine = nodes.new("ShaderNodeMixRGB")
            combine.blend_type = "MULTIPLY"
            combine.inputs["Fac"].default_value = 0.62
            links.new(tex.outputs["Fac"], combine.inputs[1])
            links.new(wave.outputs["Color"], combine.inputs[2])
            source = combine.outputs["Color"]
        elif surface_model in {"ceramic", "rubber"}:
            cells = nodes.new("ShaderNodeTexVoronoi")
            cells.distance = "EUCLIDEAN"
            cells.feature = "DISTANCE_TO_EDGE" if surface_model == "rubber" else "F1"
            cells.inputs["Scale"].default_value = micro_scale * (0.18 if surface_model == "rubber" else 0.12)
            combine = nodes.new("ShaderNodeMixRGB")
            combine.blend_type = "MULTIPLY" if surface_model == "rubber" else "SOFT_LIGHT"
            combine.inputs["Fac"].default_value = 0.38 if surface_model == "rubber" else 0.22
            links.new(tex.outputs["Fac"], combine.inputs[1])
            links.new(cells.outputs["Distance"], combine.inputs[2])
            source = combine.outputs["Color"]
        elif surface_model == "coated":
            broad = nodes.new("ShaderNodeTexNoise")
            broad.inputs["Scale"].default_value = max(3.0, micro_scale * 0.045)
            broad.inputs["Detail"].default_value = 4.0
            broad.inputs["Roughness"].default_value = 0.68
            combine = nodes.new("ShaderNodeMixRGB")
            combine.blend_type = "SOFT_LIGHT"
            combine.inputs["Fac"].default_value = 0.18
            links.new(broad.outputs["Fac"], combine.inputs[1])
            links.new(tex.outputs["Fac"], combine.inputs[2])
            source = combine.outputs["Color"]
        if surface_model != "machined":
            bump_source = source
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.28
        roughness_delta = 0.025 if surface_model == "machined" else 0.07
        ramp.color_ramp.elements[0].color = (max(0.0, roughness - roughness_delta),) * 3 + (1.0,)
        ramp.color_ramp.elements[1].position = 0.72
        ramp.color_ramp.elements[1].color = (min(1.0, roughness + roughness_delta),) * 3 + (1.0,)
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = (
            min(micro_strength, 0.004)
            if surface_model == "machined"
            else micro_strength
        )
        bump.inputs["Distance"].default_value = 0.003 if surface_model == "machined" else 0.012
        links.new(source, ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], shader.inputs["Roughness"])
        links.new(bump_source, bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    material["spacefaceMaterialTruthPass"] = PASS_ID
    return material


def _materials() -> dict[str, bpy.types.Material]:
    return {
        "drive": _principled_material(
            "Material_V6_DriveAlloy", (0.105, 0.115, 0.124, 1.0), 0.88, 0.29,
            anisotropic=0.42, micro_scale=210.0, micro_strength=0.055, surface_model="machined",
        ),
        "service_steel": _principled_material(
            "Material_V6_ServiceSteel", (0.36, 0.31, 0.255, 1.0), 0.91, 0.25,
            anisotropic=0.50, micro_scale=240.0, micro_strength=0.045, surface_model="machined",
        ),
        "ceramic": _principled_material(
            "Material_V6_CeramicIsolator", (0.105, 0.092, 0.078, 1.0), 0.0, 0.59,
            micro_scale=260.0, micro_strength=0.025, surface_model="ceramic",
        ),
        "vane": _principled_material(
            "Material_V6_RefractoryVane", (0.29, 0.255, 0.205, 1.0), 0.63, 0.39,
            anisotropic=0.28, micro_scale=175.0, micro_strength=0.025, surface_model="ceramic",
        ),
        "radiator": _principled_material(
            "Material_V6_RadiatorSheet", (0.082, 0.088, 0.092, 1.0), 0.72, 0.47,
            anisotropic=0.58, micro_scale=230.0, micro_strength=0.035, surface_model="radiator",
        ),
        "sensor": _principled_material(
            "Material_V6_SensorCoat", (0.092, 0.098, 0.104, 1.0), 0.72, 0.32,
            anisotropic=0.22, micro_scale=190.0, micro_strength=0.028, surface_model="coated",
        ),
        "cable": _principled_material(
            "Material_V6_CableJacket", (0.012, 0.016, 0.018, 1.0), 0.0, 0.82,
            micro_scale=310.0, micro_strength=0.035, surface_model="rubber",
        ),
        "armor": _principled_material(
            "Material_V6_FormedArmor", (0.095, 0.108, 0.119, 1.0), 0.24, 0.52,
            micro_scale=235.0, micro_strength=0.020,
        ),
        "repair": _principled_material(
            "Material_V6_RepairPrimer", (0.035, 0.105, 0.052, 1.0), 0.025, 0.64,
            micro_scale=190.0, micro_strength=0.030,
        ),
        "hazard": _principled_material(
            "Material_V6_HazardPaint", (0.43, 0.085, 0.012, 1.0), 0.02, 0.58,
            micro_scale=220.0, micro_strength=0.018,
        ),
        "marking": _principled_material(
            "Material_V6_MarkingIvory", (0.62, 0.50, 0.31, 1.0), 0.0, 0.82,
            micro_scale=185.0, micro_strength=0.020,
        ),
        "lens": _principled_material(
            "Material_V6_SensorLens", (0.008, 0.055, 0.072, 1.0), 0.12, 0.24,
            emission=(0.02, 0.54, 0.72, 1.0), emission_strength=2.2,
        ),
        "dark_aperture": _principled_material(
            "Material_V6_DarkOpticalAperture", (0.006, 0.026, 0.033, 1.0), 0.18, 0.30,
            emission=(0.01, 0.10, 0.13, 1.0), emission_strength=0.20,
        ),
        "hotcore": _principled_material(
            "Material_V6_DriveHotCore", (0.15, 0.018, 0.002, 1.0), 0.0, 0.42,
            emission=(1.0, 0.075, 0.004, 1.0), emission_strength=0.25,
        ),
    }


def _finish(
    obj: bpy.types.Object,
    material: bpy.types.Material,
    bill_id: str,
    function: str,
    *,
    bevel: float = 0.0,
    detail: int = 0,
) -> bpy.types.Object:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = False
    _apply_world_box_uv(obj)
    if bevel > 0.0:
        modifier = obj.modifiers.new(f"{PREFIX}EdgeRadius", "BEVEL")
        modifier.width = bevel
        # One authored hard-surface chamfer is enough at this ship's supported screen sizes.
        # A two-segment default multiplied across hundreds of micro parts added cost without
        # changing the perceived manufacturing read.
        modifier.segments = 1
        modifier.limit_method = "ANGLE"
    _set_bill(obj, bill_id, function, detail)
    obj.parent = _root()
    return obj


def _apply_world_box_uv(obj: bpy.types.Object, metres_per_tile: float = 2.5) -> None:
    """Give every authored V6 face a real, scale-aware UV basis.

    Runtime export intentionally reuses the proven Kestrel PBR role materials.
    A material name is not surfacing: the new geometry must therefore carry
    non-degenerate coordinates at a known physical scale.  World-box
    projection is deterministic, appropriate for the tileable role maps, and
    avoids making Blender primitive defaults part of the finished asset.
    """
    if obj.type != "MESH" or not obj.data.polygons:
        return
    mesh = obj.data
    uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    world = obj.matrix_world
    normal_matrix = world.to_3x3().inverted_safe().transposed()
    frequency = 1.0 / metres_per_tile
    for polygon in mesh.polygons:
        normal = (normal_matrix @ polygon.normal).normalized()
        axis = max(range(3), key=lambda item: abs(normal[item]))
        projection_axes = ((1, 2), (0, 2), (0, 1))[axis]
        flip = normal[axis] < 0.0
        for loop_index in polygon.loop_indices:
            coordinate = world @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
            u = coordinate[projection_axes[0]] * frequency
            v = coordinate[projection_axes[1]] * frequency
            uv_layer.data[loop_index].uv = ((-u if flip else u), v)
    mesh.update()
    obj["sf_uv_projection"] = "world-box-2.5m-v1"


def _mesh_object(
    collection: bpy.types.Collection,
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def _ring_segment(
    collection: bpy.types.Collection,
    name: str,
    x: float,
    thickness: float,
    inner: float,
    outer: float,
    angle_start: float,
    angle_end: float,
    material: bpy.types.Material,
    bill_id: str,
    function: str,
    *,
    angular_steps: int = 3,
    detail: int = 0,
) -> bpy.types.Object:
    vertices = []
    for x_pos in (x - thickness * 0.5, x + thickness * 0.5):
        for radius in (inner, outer):
            for step in range(angular_steps + 1):
                angle = angle_start + (angle_end - angle_start) * step / angular_steps
                vertices.append((x_pos, math.cos(angle) * radius, math.sin(angle) * radius))
    row = angular_steps + 1
    faces: list[tuple[int, ...]] = []
    for side in range(2):
        base = side * row * 2
        for radial in range(2):
            offset = base + radial * row
            for step in range(angular_steps):
                nxt = offset + step + 1
                other = (1 - side) * row * 2 + radial * row
                if side == 0:
                    faces.append((offset + step, nxt, other + step + 1, other + step))
        for step in range(angular_steps):
            faces.append((base + step, base + row + step, base + row + step + 1, base + step + 1))
    # angular end caps
    for step in (0, angular_steps):
        faces.append((step, row + step, row * 3 + step, row * 2 + step))
    obj = _mesh_object(collection, name, vertices, faces)
    return _finish(obj, material, bill_id, function, bevel=0.018, detail=detail)


def _nozzle_vane(
    collection: bpy.types.Collection,
    name: str,
    angle_start: float,
    angle_end: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    sections = (
        (-13.23, 1.52, 2.16),
        (-14.18, 1.38, 1.94),
    )
    vertices = []
    for x_pos, inner, outer in sections:
        for radius in (inner, outer):
            for angle in (angle_start, angle_end):
                vertices.append((x_pos, math.cos(angle) * radius, math.sin(angle) * radius))
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5),
        (0, 4, 5, 1), (2, 3, 7, 6),
        (0, 2, 6, 4), (1, 5, 7, 3),
    ]
    obj = _mesh_object(collection, name, vertices, faces)
    return _finish(
        obj, material, "refractory_vane", "individually pivoted variable exhaust vane",
        bevel=0.025, detail=0,
    )


def _nozzle_vane_panel(
    collection: bpy.types.Collection,
    name: str,
    angle_start: float,
    angle_end: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    sections = (
        (-13.245, 1.61, 2.19),
        (-14.205, 1.47, 1.97),
    )
    vertices = []
    for x_pos, inner, outer in sections:
        for radius in (inner, outer):
            for angle in (angle_start, angle_end):
                vertices.append((x_pos, math.cos(angle) * radius, math.sin(angle) * radius))
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5),
        (0, 4, 5, 1), (2, 3, 7, 6),
        (0, 2, 6, 4), (1, 5, 7, 3),
    ]
    obj = _mesh_object(collection, name, vertices, faces)
    return _finish(
        obj, material, "refractory_vane", "replaceable nozzle-vane hot-face panel",
        bevel=0.015, detail=1,
    )


def _strut_between(
    collection: bpy.types.Collection,
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    bill_id: str,
    function: str,
    *,
    segments: int = 8,
    detail: int = 1,
) -> bpy.types.Object:
    from mathutils import Vector
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    length = direction.length
    if length <= 1e-6:
        raise ValueError(f"zero-length strut {name}")
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=length,
    )
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = (a + b) * 0.5
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return _finish(obj, material, bill_id, function, bevel=0.008, detail=detail)


def _axial_cylinder(
    collection: bpy.types.Collection,
    name: str,
    center: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    bill_id: str,
    function: str,
    *,
    segments: int = 12,
    detail: int = 1,
    axis: str = "X",
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=depth,
    )
    if axis == "X":
        rotation = Matrix.Rotation(math.radians(90.0), 4, "Y")
    elif axis == "Y":
        rotation = Matrix.Rotation(math.radians(90.0), 4, "X")
    elif axis == "Z":
        rotation = Matrix.Identity(4)
    else:
        raise ValueError(f"unsupported cylinder axis {axis}")
    bmesh.ops.transform(bm, matrix=rotation, verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = center
    return _finish(obj, material, bill_id, function, bevel=0.012, detail=detail)


def _profile_prism(
    collection: bpy.types.Collection,
    name: str,
    center: tuple[float, float, float],
    length: float,
    aft_width: float,
    fore_width: float,
    aft_height: float,
    fore_height: float,
    material: bpy.types.Material,
    bill_id: str,
    function: str,
    *,
    detail: int = 0,
    bevel: float = 0.025,
) -> bpy.types.Object:
    x0 = -length * 0.5
    x1 = length * 0.5
    vertices = [
        (x0, -aft_width * 0.5, -aft_height * 0.5),
        (x0, aft_width * 0.5, -aft_height * 0.5),
        (x0, aft_width * 0.42, aft_height * 0.5),
        (x0, -aft_width * 0.42, aft_height * 0.5),
        (x1, -fore_width * 0.5, -fore_height * 0.5),
        (x1, fore_width * 0.5, -fore_height * 0.5),
        (x1, fore_width * 0.42, fore_height * 0.5),
        (x1, -fore_width * 0.42, fore_height * 0.5),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2),
        (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    obj = _mesh_object(collection, name, vertices, faces)
    obj.location = center
    return _finish(obj, material, bill_id, function, bevel=bevel, detail=detail)


def _vertical_frustum(
    collection: bpy.types.Collection,
    name: str,
    center: tuple[float, float, float],
    height: float,
    base_x: float,
    base_y: float,
    top_x: float,
    top_y: float,
    material: bpy.types.Material,
    bill_id: str,
    function: str,
    *,
    bevel: float = 0.025,
    detail: int = 0,
) -> bpy.types.Object:
    z0 = -height * 0.5
    z1 = height * 0.5
    vertices = [
        (-base_x * 0.5, -base_y * 0.5, z0),
        (base_x * 0.5, -base_y * 0.5, z0),
        (base_x * 0.5, base_y * 0.5, z0),
        (-base_x * 0.5, base_y * 0.5, z0),
        (-top_x * 0.5, -top_y * 0.5, z1),
        (top_x * 0.5, -top_y * 0.5, z1),
        (top_x * 0.5, top_y * 0.5, z1),
        (-top_x * 0.5, top_y * 0.5, z1),
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5),
        (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    obj = _mesh_object(collection, name, vertices, faces)
    obj.location = center
    return _finish(obj, material, bill_id, function, bevel=bevel, detail=detail)


def _chamfered_pressure_case(
    collection: bpy.types.Collection,
    name: str,
    center: tuple[float, float, float],
    length: float,
    width: float,
    height: float,
    chamfer: float,
    material: bpy.types.Material,
    bill_id: str,
    function: str,
    *,
    detail: int = 0,
) -> bpy.types.Object:
    """Eight-sided rolled case: the chamfers are authored faces, not a rounded software-default cube."""
    half_width = width * 0.5
    half_height = height * 0.5
    corner = min(chamfer, half_width * 0.48, half_height * 0.48)
    cross_section = (
        (-half_width + corner, -half_height),
        (half_width - corner, -half_height),
        (half_width, -half_height + corner),
        (half_width, half_height - corner),
        (half_width - corner, half_height),
        (-half_width + corner, half_height),
        (-half_width, half_height - corner),
        (-half_width, -half_height + corner),
    )
    vertices = [
        (x, y, z)
        for x in (-length * 0.5, length * 0.5)
        for y, z in cross_section
    ]
    faces: list[tuple[int, ...]] = [
        tuple(range(7, -1, -1)),
        tuple(range(8, 16)),
    ]
    for index in range(8):
        nxt = (index + 1) % 8
        faces.append((index, nxt, 8 + nxt, 8 + index))
    obj = _mesh_object(collection, name, vertices, faces)
    obj.location = center
    return _finish(obj, material, bill_id, function, bevel=0.018, detail=detail)


def _radiator_fin_pack(
    collection: bpy.types.Collection,
    name: str,
    center: tuple[float, float, float],
    length: float,
    width: float,
    height: float,
    count: int,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """One efficient mesh containing many thin sheet-metal fins."""
    if count < 2:
        raise ValueError("radiator fin pack requires at least two fins")
    step = length / count
    thickness = min(0.032, step * 0.26)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for index in range(count):
        x = -length * 0.5 + (index + 0.5) * step
        x0 = x - thickness * 0.5
        x1 = x + thickness * 0.5
        y0 = -width * 0.5
        y1 = width * 0.5
        z0 = -height * 0.5
        z1 = height * 0.5
        base = len(vertices)
        vertices.extend((
            (x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1),
            (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1),
        ))
        faces.extend((
            (base + 0, base + 1, base + 2, base + 3),
            (base + 4, base + 7, base + 6, base + 5),
            (base + 0, base + 4, base + 5, base + 1),
            (base + 1, base + 5, base + 6, base + 2),
            (base + 2, base + 6, base + 7, base + 3),
            (base + 3, base + 7, base + 4, base + 0),
        ))
    obj = _mesh_object(collection, name, vertices, faces)
    obj.location = center
    return _finish(
        obj, material, "radiator",
        "dense folded-sheet radiator fin pack inside a service cassette",
        bevel=0.0, detail=1,
    )


def _beam_between(
    collection: bpy.types.Collection,
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    width: float,
    height: float,
    material: bpy.types.Material,
    bill_id: str,
    function: str,
    *,
    detail: int = 1,
) -> bpy.types.Object:
    from mathutils import Vector
    a = Vector(start)
    b = Vector(end)
    vector = b - a
    length = vector.length
    if length <= 1e-6:
        raise ValueError(f"zero-length beam {name}")
    obj = _profile_prism(
        collection, name, (0.0, 0.0, 0.0), length,
        width, width * 0.84, height, height * 0.82,
        material, bill_id, function, detail=detail, bevel=min(width, height) * 0.12,
    )
    obj.location = (a + b) * 0.5
    obj.rotation_euler = vector.to_track_quat("X", "Z").to_euler()
    return obj


def _dish(
    collection: bpy.types.Collection,
    name: str,
    center: tuple[float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    radial_steps = 5
    segments = 24
    radius = 0.52
    depth = 0.22
    vertices = [(0.0, 0.0, 0.0)]
    for ring in range(1, radial_steps + 1):
        r = radius * ring / radial_steps
        x = -depth * (r / radius) ** 2
        for segment in range(segments):
            angle = math.tau * segment / segments
            vertices.append((x, math.cos(angle) * r, math.sin(angle) * r))
    faces = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(1, radial_steps):
        a = 1 + (ring - 1) * segments
        b = 1 + ring * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((a + segment, b + segment, b + nxt, a + nxt))
    obj = _mesh_object(collection, name, vertices, faces)
    obj.location = center
    obj.rotation_euler = (math.radians(4.0), 0.0, math.radians(-90.0))
    solid = obj.modifiers.new(f"{PREFIX}DishThickness", "SOLIDIFY")
    solid.thickness = 0.035
    solid.offset = 0.0
    return _finish(
        obj, material, "sensor", "directional salvage-band sensor dish",
        bevel=0.012, detail=0,
    )


def _reshape_pressure_shell() -> dict:
    obj = bpy.data.objects.get("LOD0_HULL_Kestrel_PressureHull")
    if obj is None or obj.type != "MESH":
        raise RuntimeError("pressure hull missing")
    mesh = obj.data
    key = "sf_v6_original_vertices"
    if key not in mesh:
        mesh[key] = json.dumps([[float(v.co.x), float(v.co.y), float(v.co.z)] for v in mesh.vertices])
    original = json.loads(mesh[key])
    if len(original) != len(mesh.vertices):
        raise RuntimeError("pressure hull vertex baseline mismatch")
    for vertex, coords in zip(mesh.vertices, original):
        vertex.co = coords
    rings: dict[float, list] = {}
    for vertex in mesh.vertices:
        rings.setdefault(round(float(vertex.co.x), 4), []).append(vertex)
    for vertices in rings.values():
        max_y = max(abs(float(v.co.y)) for v in vertices) or 1.0
        max_z = max(float(v.co.z) for v in vertices)
        min_z = min(float(v.co.z) for v in vertices)
        for vertex in vertices:
            y_ratio = abs(float(vertex.co.y)) / max_y
            if y_ratio > 0.87:
                vertex.co.y = math.copysign(max_y, float(vertex.co.y))
            if max_z > 0.5 and float(vertex.co.z) > max_z * 0.79:
                vertex.co.z = max_z * 0.965
            if min_z < -0.5 and float(vertex.co.z) < min_z * 0.79:
                vertex.co.z = min_z * 0.955
            if 0.46 < y_ratio < 0.82 and float(vertex.co.z) > 0.2:
                vertex.co.y *= 1.035
                vertex.co.z *= 0.97
    mesh.update()
    obj["sf_shape_grammar"] = (
        "rolled pressure shell with flattened dorsal/ventral courses, side flats and shoulder chines"
    )
    _set_bill(obj, "pressure_shell", "habitable pressure vessel and primary longitudinal shell", 0)
    return {"object": obj.name, "vertices": len(mesh.vertices), "rings": len(rings)}


def _build_drive(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    segment_count = 12
    gap = math.radians(2.6)
    for index in range(segment_count):
        a0 = math.tau * index / segment_count + gap
        a1 = math.tau * (index + 1) / segment_count - gap
        objects.append(_ring_segment(
            collection, f"{PREFIX}DriveCollar_Segment_{index:02d}",
            -13.08, 0.46, 2.30, 2.62, a0, a1, materials["drive"],
            "drive_alloy", "segmented aft drive load clamp", angular_steps=4,
        ))
        objects.append(_ring_segment(
            collection, f"{PREFIX}DriveIsolator_Segment_{index:02d}",
            -12.92, 0.24, 2.20, 2.32, a0 + 0.015, a1 - 0.015, materials["ceramic"],
            "ceramic_isolator", "thermal and electrical clamp isolator", angular_steps=3,
        ))
        objects.append(_ring_segment(
            collection, f"{PREFIX}DriveCollar_FacePanel_{index:02d}",
            -13.33, 0.075, 2.36, 2.57, a0 + 0.022, a1 - 0.022, materials["service_steel"],
            "drive_alloy", "replaceable machined clamp face panel", angular_steps=5, detail=1,
        ))
        mid = (a0 + a1) * 0.5
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}DriveClampBolt_{index:02d}",
            (-13.40, math.cos(mid) * 2.47, math.sin(mid) * 2.47),
            0.085, 0.16, materials["service_steel"], "drive_alloy", "serviceable clamp root fastener",
            segments=10, detail=1,
        ))
        for edge_index, edge_angle in enumerate((a0 + 0.055, a1 - 0.055)):
            objects.append(_axial_cylinder(
                collection, f"{PREFIX}DriveClampEdgeBolt_{index:02d}_{edge_index}",
                (-13.40, math.cos(edge_angle) * 2.50, math.sin(edge_angle) * 2.50),
                0.052, 0.14, materials["service_steel"], "drive_alloy",
                "paired clamp-face fastener", segments=10, detail=2,
            ))
        vane_gap = math.radians(3.2)
        va0 = math.tau * index / segment_count + vane_gap
        va1 = math.tau * (index + 1) / segment_count - vane_gap
        objects.append(_nozzle_vane(
            collection, f"{PREFIX}NozzleVane_{index:02d}", va0, va1, materials["vane"],
        ))
        objects.append(_nozzle_vane_panel(
            collection, f"{PREFIX}NozzleVaneHotFace_{index:02d}",
            va0 + math.radians(1.25), va1 - math.radians(1.25), materials["service_steel"],
        ))
        objects.append(_nozzle_vane(
            collection, f"{PREFIX}NozzleVaneEdgeA_{index:02d}",
            va0, va0 + math.radians(1.0), materials["drive"],
        ))
        objects.append(_nozzle_vane(
            collection, f"{PREFIX}NozzleVaneEdgeB_{index:02d}",
            va1 - math.radians(1.0), va1, materials["drive"],
        ))
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}NozzlePivot_{index:02d}",
            (-13.18, math.cos(mid) * 1.82, math.sin(mid) * 1.82),
            0.075, 0.20, materials["drive"], "drive_alloy", "nozzle-vane pivot root",
            segments=10, detail=1,
        ))
        bracket = _profile_prism(
            collection, f"{PREFIX}VaneActuatorBracket_{index:02d}",
            (-13.36, math.cos(mid) * 2.72, math.sin(mid) * 2.72),
            0.46, 0.22, 0.16, 0.16, 0.11, materials["service_steel"],
            "drive_alloy", "nozzle-vane actuator link bracket", detail=1, bevel=0.018,
        )
        bracket.rotation_euler.x = mid
        objects.append(bracket)
        for link_index, delta in enumerate((-0.075, 0.075)):
            angle = mid + delta
            objects.append(_strut_between(
                collection, f"{PREFIX}VaneActuatorLink_{index:02d}_{link_index}",
                (-13.40, math.cos(angle) * 2.60, math.sin(angle) * 2.60),
                (-13.76, math.cos(angle) * 2.08, math.sin(angle) * 2.08),
                0.036, materials["service_steel"], "drive_alloy",
                "paired variable-nozzle actuator linkage", segments=8, detail=2,
            ))
    for ring_name, x, inner, outer, count in (
        ("ForwardBulkhead", -8.10, 2.10, 2.30, 10),
        ("CoolingManifold", -12.24, 2.38, 2.56, 10),
    ):
        gap = math.radians(3.5)
        for index in range(count):
            a0 = math.tau * index / count + gap
            a1 = math.tau * (index + 1) / count - gap
            objects.append(_ring_segment(
                collection, f"{PREFIX}{ring_name}_{index:02d}", x,
                0.28 if ring_name == "ForwardBulkhead" else 0.16,
                inner, outer, a0, a1,
                materials["drive"] if ring_name == "ForwardBulkhead" else materials["radiator"],
                "drive_alloy" if ring_name == "ForwardBulkhead" else "radiator",
                "segmented drive bulkhead" if ring_name == "ForwardBulkhead" else "segmented cooling manifold",
                angular_steps=3, detail=0 if ring_name == "ForwardBulkhead" else 1,
            ))
    # Segmented casing courses and load rails turn the old cylinder into an inspectable assembly.
    for course, (x, inner, outer) in enumerate((
        (-11.72, 2.24, 2.49),
        (-10.28, 2.26, 2.51),
        (-8.86, 2.22, 2.47),
    )):
        count = 8
        gap = math.radians(4.0)
        for index in range(count):
            a0 = math.tau * index / count + gap
            a1 = math.tau * (index + 1) / count - gap
            objects.append(_ring_segment(
                collection, f"{PREFIX}DriveCasingCourse_{course:02d}_{index:02d}", x,
                0.24, inner, outer, a0, a1,
                materials["service_steel"] if (course + index) % 2 == 0 else materials["drive"],
                "drive_alloy", "segmented drive-casing inspection course",
                angular_steps=4, detail=1,
            ))
    for index in range(8):
        angle = math.tau * index / 8
        radius = 2.53
        rib = _profile_prism(
            collection, f"{PREFIX}DriveCasingRail_{index:02d}",
            (-10.28, math.cos(angle) * radius, math.sin(angle) * radius),
            3.05, 0.18, 0.13, 0.14, 0.10, materials["drive"],
            "drive_alloy", "longitudinal drive-casing load and service rail",
            detail=1, bevel=0.018,
        )
        rib.rotation_euler.x = angle
        objects.append(rib)
    # Recessed throat rings and a small hot core replace the featureless white emissive disc.
    throat_count = 16
    for index in range(throat_count):
        gap = math.radians(1.8)
        a0 = math.tau * index / throat_count + gap
        a1 = math.tau * (index + 1) / throat_count - gap
        objects.append(_ring_segment(
            collection, f"{PREFIX}NozzleThroatRib_{index:02d}", -13.72,
            0.24, 0.78, 1.18, a0, a1, materials["drive"],
            "drive_alloy", "recessed exhaust-throat rib", angular_steps=3, detail=1,
        ))
    objects.append(_axial_cylinder(
        collection, f"{PREFIX}DriveHotCore", (-13.68, 0.0, 0.0),
        0.24, 0.08, materials["hotcore"], "active_aperture",
        "shielded hydrogen-drive ignition core", segments=24, detail=1,
    ))
    return objects


def _tune_existing_material_response() -> dict[str, float]:
    strengths = {
        "Material_Hull": 0.16,
        "Material_ArmorDark": 0.16,
        "Material_Mechanical": 0.18,
        "Material_BrushedMetal": 0.22,
        "Material_RepairGreen": 0.18,
        "Material_Rubber": 0.20,
        "Material_EngineCeramic": 0.20,
        "Material_Radiator": 0.20,
    }
    applied = {}
    for material_name, strength in strengths.items():
        material = bpy.data.materials.get(material_name)
        if material is None or not material.use_nodes or material.node_tree is None:
            continue
        normal = next((node for node in material.node_tree.nodes if node.type == "NORMAL_MAP"), None)
        if normal is None:
            continue
        normal.inputs["Strength"].default_value = strength
        material["spacefaceMaterialTruthPass"] = PASS_ID
        applied[material_name] = strength
    return applied


def _assign_existing_material_bills() -> dict:
    mapping = {
        "Material_Hull": "coated_hull_panel",
        "Material_ArmorDark": "armor_plate",
        "Material_Mechanical": "structural_metal",
        "Material_BrushedMetal": "structural_metal",
        "Material_Rubber": "cable_elastomer",
        "Material_Glass_Canopy": "canopy",
        "Material_RepairGreen": "repair_panel",
        "Material_EngineCeramic": "refractory_vane",
        "Material_Radiator": "radiator",
        "Material_Accent_FrontierCyan": "marking",
        "Material_Accent_WarningOrange": "marking",
        "Material_Decal_BorrowedTime": "marking",
        "Material_Decal_Hazard": "marking",
        "Material_Decal_Stencils": "marking",
        "Material_Emissive_Cyan": "active_aperture",
        "Material_Emissive_DriveCore": "active_aperture",
        "Material_Emissive_Orange": "active_aperture",
        "Material_V6_DriveAlloy": "drive_alloy",
        "Material_V6_ServiceSteel": "drive_alloy",
        "Material_V6_CeramicIsolator": "ceramic_isolator",
        "Material_V6_RefractoryVane": "refractory_vane",
        "Material_V6_RadiatorSheet": "radiator",
        "Material_V6_SensorCoat": "sensor",
        "Material_V6_MarkingIvory": "marking",
        "Material_V6_SensorLens": "active_aperture",
        "Material_V6_DarkOpticalAperture": "active_aperture",
        "Material_V6_DriveHotCore": "active_aperture",
        "Material_V6_CableJacket": "cable_elastomer",
        "Material_V6_FormedArmor": "armor_plate",
        "Material_V6_RepairPrimer": "repair_panel",
        "Material_V6_HazardPaint": "marking",
    }
    covered = []
    missing = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.hide_render or obj.hide_get() or obj.name.startswith(PREFIX):
            continue
        material_names = [material.name for material in obj.data.materials if material is not None]
        bill_id = next((mapping[name] for name in material_names if name in mapping), None)
        if bill_id is None:
            missing.append({"object": obj.name, "materials": material_names})
            continue
        function = str(obj.get("sf_function") or obj.get("sf_component") or obj.name)
        _set_bill(obj, bill_id, function, int(obj.get("sf_detail_level", 0)))
        covered.append(obj.name)
    if missing:
        raise RuntimeError(f"visible Kestrel objects lack material bills: {missing[:8]}")
    return {"covered": len(covered), "missing": 0}


def _build_radiators(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    for side, y in (("Port", -5.83), ("Starboard", 5.83)):
        objects.append(_profile_prism(
            collection, f"{PREFIX}RadiatorCassetteBase_{side}", (-7.45, y, 0.73),
            8.10, 0.90, 0.72, 0.14, 0.12, materials["drive"],
            "radiator", "recessed welded radiator cassette base",
            detail=0, bevel=0.022,
        ))
        objects.append(_profile_prism(
            collection, f"{PREFIX}RadiatorCoreRecess_{side}", (-7.45, y, 0.82),
            7.48, 0.66, 0.58, 0.055, 0.050, materials["drive"],
            "radiator", "shadowed recess behind the folded-sheet heat exchanger",
            detail=1, bevel=0.010,
        ))
        objects.append(_radiator_fin_pack(
            collection, f"{PREFIX}RadiatorFinPack_{side}", (-7.45, y, 0.92),
            7.18, 0.54, 0.18, 72, materials["radiator"],
        ))
        # Slotted protective ribs divide the cassette into serviceable bays without becoming a comb.
        for rib, x in enumerate(-10.70 + index * 0.92 for index in range(8)):
            objects.append(_profile_prism(
                collection, f"{PREFIX}RadiatorCoverRib_{side}_{rib:02d}",
                (x, y, 1.02), 0.11, 0.72, 0.66, 0.10, 0.085,
                materials["service_steel"], "radiator",
                "protective radiator cassette cover rib",
                detail=1, bevel=0.010,
            ))
            objects.append(_axial_cylinder(
                collection, f"{PREFIX}RadiatorCoverBolt_{side}_{rib:02d}",
                (x, y + (-0.30 if side == "Port" else 0.30), 1.075),
                0.032, 0.045, materials["service_steel"],
                "radiator", "radiator cover-rib fastener",
                segments=10, detail=2, axis="Z",
            ))
        for rail_id, rail_y in (
            ("Inner", y + (0.36 if side == "Port" else -0.36)),
            ("Outer", y + (-0.36 if side == "Port" else 0.36)),
        ):
            objects.append(_profile_prism(
                collection, f"{PREFIX}RadiatorFrameRail_{side}_{rail_id}",
                (-7.45, rail_y, 0.99), 7.76, 0.10, 0.08, 0.11, 0.09,
                materials["service_steel"], "radiator",
                "welded radiator cassette perimeter rail",
                detail=1, bevel=0.012,
            ))
        for manifold, x in enumerate((-10.98, -3.92)):
            objects.append(_profile_prism(
                collection, f"{PREFIX}RadiatorManifold_{side}_{manifold:02d}",
                (x, y, 0.91), 0.38, 0.72, 0.64, 0.24, 0.20,
                materials["service_steel"], "radiator",
                "radiator-bank feed or return manifold",
                detail=1, bevel=0.018,
            ))
        for end, x in (("Aft", -11.55), ("Fore", -3.35)):
            objects.append(_axial_cylinder(
                collection, f"{PREFIX}RadiatorHinge_{side}_{end}",
                (x, y, 0.78), 0.080, 0.34, materials["service_steel"],
                "drive_alloy", "radiator bank hinge and coolant union",
                segments=14, detail=1,
            ))
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}RadiatorCoolantRail_{side}",
            (-7.45, y + (-0.47 if side == "Port" else 0.47), 0.84),
            0.052, 7.42, materials["service_steel"], "radiator",
            "outer radiator coolant distribution rail",
            segments=14, detail=1, axis="X",
        ))
        for coupling, x in enumerate((-9.25, -5.65)):
            objects.append(_axial_cylinder(
                collection, f"{PREFIX}RadiatorRailCoupling_{side}_{coupling:02d}",
                (x, y + (-0.47 if side == "Port" else 0.47), 0.84),
                0.072, 0.16, materials["service_steel"], "radiator",
                "coolant-rail service coupling",
                segments=14, detail=2, axis="X",
            ))
    return objects


def _build_midship_armor(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    # The original 18.5-m mirrored slab is replaced by five manufactured sponson sections per side.
    # Their seams, tapers and different service histories make the load path readable in clay.
    sponson_specs = (
        ("Aft", -8.35, 2.55, 1.26, 1.66, 0.42, 0.48),
        ("AftMid", -5.45, 3.10, 1.66, 2.04, 0.48, 0.50),
        ("Mid", -1.85, 4.05, 2.04, 2.14, 0.50, 0.48),
        ("ForeMid", 2.05, 3.75, 2.14, 1.72, 0.48, 0.40),
        ("Fore", 5.05, 2.25, 1.72, 0.86, 0.40, 0.28),
    )
    plate_specs = (
        ("Aft", -5.15, 4.05, 1.74, 2.08, 0.34, 0.30),
        ("Mid", -0.65, 4.55, 2.16, 2.04, 0.32, 0.28),
        ("Fore", 3.95, 4.15, 2.00, 1.30, 0.28, 0.18),
    )
    for side, sign in (("Port", -1.0), ("Starboard", 1.0)):
        center_y = sign * 4.24
        for section_index, (
            section, center_x, length, aft_width, fore_width, aft_h, fore_h,
        ) in enumerate(sponson_specs):
            material = (
                materials["repair"]
                if side == "Starboard" and section == "Mid"
                else materials["drive"]
            )
            bill = "repair_panel" if material == materials["repair"] else "drive_alloy"
            objects.append(_profile_prism(
                collection, f"{PREFIX}SponsonUnderframe_{side}_{section}",
                (center_x, center_y, 0.49),
                length, aft_width, fore_width, aft_h, fore_h,
                material, bill, f"{section.lower()} shoulder sponson load section",
                detail=0, bevel=0.032,
            ))
            outer_width = max(aft_width, fore_width)
            outer_y = center_y + sign * outer_width * 0.47
            objects.append(_profile_prism(
                collection, f"{PREFIX}SponsonOuterPlate_{side}_{section}",
                (center_x, outer_y, 0.51),
                length * 0.90, 0.075, 0.060, aft_h * 0.78, fore_h * 0.72,
                materials["armor"], "armor_plate",
                f"replaceable {section.lower()} sponson outer-wall armor",
                detail=1, bevel=0.014,
            ))
            for fastener, x_sign in enumerate((-1.0, 1.0)):
                objects.append(_axial_cylinder(
                    collection, f"{PREFIX}SponsonSideBolt_{side}_{section}_{fastener}",
                    (
                        center_x + x_sign * length * 0.34,
                        outer_y + sign * 0.048,
                        0.52,
                    ),
                    0.040, 0.055, materials["service_steel"],
                    "structural_metal", "sponson outer-wall through fastener",
                    segments=10, detail=2, axis="Y",
                ))
        for plate_index, (course, center_x, length, aft_width, fore_width, aft_h, fore_h) in enumerate(plate_specs):
            material = (
                materials["repair"]
                if side == "Starboard" and course == "Mid"
                else materials["armor"]
            )
            bill = "repair_panel" if material == materials["repair"] else "armor_plate"
            plate = _profile_prism(
                collection, f"{PREFIX}ShoulderArmor_{side}_{course}",
                (center_x, sign * 4.42, 0.82 if course != "Fore" else 0.72),
                length, aft_width, fore_width, aft_h, fore_h,
                material, bill, f"replaceable {course.lower()} shoulder armor course",
                detail=0, bevel=0.055,
            )
            plate.rotation_euler.x = math.radians(-2.8 * sign)
            objects.append(plate)
            # Four conventional fasteners at load-bearing corners, not uniform surface scatter.
            for fastener, (x_sign, y_sign) in enumerate((
                (-1, -1), (-1, 1), (1, -1), (1, 1),
            )):
                x = center_x + x_sign * length * 0.36
                width = aft_width if x_sign < 0 else fore_width
                y = sign * 4.42 + y_sign * width * 0.34
                objects.append(_axial_cylinder(
                    collection, f"{PREFIX}ShoulderFastener_{side}_{course}_{fastener}",
                    (x, y, 1.01 if course != "Fore" else 0.88),
                    0.060, 0.085, materials["service_steel"], "armor_plate",
                    "armor-course corner fastener", segments=10, detail=2, axis="Z",
                ))
        # A raised outer edge rail protects the plate seam and gives the armor a formed section.
        for rail_index, (x, length) in enumerate(((-5.15, 3.55), (-0.65, 4.05), (3.95, 3.65))):
            rail = _profile_prism(
                collection, f"{PREFIX}ShoulderEdgeRail_{side}_{rail_index:02d}",
                (x, sign * 4.42 + sign * 0.96, 1.00),
                length, 0.16, 0.11, 0.17, 0.11, materials["service_steel"],
                "armor_plate", "formed shoulder armor edge and service rail",
                detail=1, bevel=0.018,
            )
            objects.append(rail)
        # The central course receives a real inset inspection hatch with a dark underplate.
        objects.append(_profile_prism(
            collection, f"{PREFIX}ShoulderHatchRecess_{side}", (-0.45, sign * 4.42, 1.005),
            1.78, 0.96, 0.80, 0.055, 0.045, materials["drive"],
            "drive_alloy", "shoulder utility-bay recessed underplate",
            detail=1, bevel=0.018,
        ))
        objects.append(_profile_prism(
            collection, f"{PREFIX}ShoulderHatch_{side}", (-0.45, sign * 4.42, 1.055),
            1.52, 0.78, 0.64, 0.090, 0.070, materials["armor"],
            "armor_plate", "serviceable shoulder utility-bay hatch",
            detail=1, bevel=0.026,
        ))
        for recess_id, (x, length) in enumerate(((-5.45, 1.30), (1.10, 1.10))):
            outer_y = sign * 5.22
            objects.append(_profile_prism(
                collection, f"{PREFIX}SponsonServiceRecess_{side}_{recess_id:02d}",
                (x, outer_y, 0.55),
                length, 0.055, 0.050, 0.24, 0.20, materials["drive"],
                "structural_metal", "recessed sponson service bay",
                detail=1, bevel=0.010,
            ))
            for rib, rib_x in enumerate((x - length * 0.24, x, x + length * 0.24)):
                objects.append(_beam_between(
                    collection, f"{PREFIX}SponsonServiceRib_{side}_{recess_id:02d}_{rib}",
                    (rib_x, outer_y + sign * 0.04, 0.45),
                    (rib_x, outer_y + sign * 0.04, 0.65),
                    0.038, 0.026, materials["service_steel"],
                    "structural_metal", "service-bay protective rib",
                    detail=2,
                ))
    return objects


def _build_repair_pod(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    center = (-1.45, 3.80, 1.34)
    objects.append(_chamfered_pressure_case(
        collection, f"{PREFIX}RepairPodPressureCase", center,
        3.20, 1.48, 0.92, 0.18, materials["repair"],
        "repair_panel", "salvaged pressure-rated field-repair supply pod",
        detail=0,
    ))
    for end_id, x in (("Aft", -3.08), ("Fore", 0.18)):
        objects.append(_chamfered_pressure_case(
            collection, f"{PREFIX}RepairPodEndCap_{end_id}", (x, 3.80, 1.34),
            0.22, 1.55, 0.98, 0.17, materials["repair"],
            "repair_panel", "replaceable repair-pod pressure end cap",
            detail=1,
        ))
    objects.append(_profile_prism(
        collection, f"{PREFIX}RepairPodTopHatch", (-1.45, 3.80, 1.855),
        1.76, 1.12, 1.04, 0.105, 0.085, materials["armor"],
        "armor_plate", "replaceable repair-pod loading hatch",
        detail=1, bevel=0.026,
    ))
    objects.append(_profile_prism(
        collection, f"{PREFIX}RepairPodHatchInset", (-1.45, 3.80, 1.916),
        0.78, 0.52, 0.48, 0.026, 0.020, materials["drive"],
        "structural_metal", "recessed hand-access field in the loading hatch",
        detail=2, bevel=0.008,
    ))
    for clamp, x in enumerate((-2.57, -1.45, -0.33)):
        objects.append(_profile_prism(
            collection, f"{PREFIX}RepairPodBandTop_{clamp:02d}", (x, 3.80, 1.855),
            0.14, 1.66, 1.66, 0.085, 0.085, materials["service_steel"],
            "structural_metal", "repair-pod restraint band over pressure case",
            detail=1, bevel=0.012,
        ))
        for side_id, y in (("Port", 3.035), ("Starboard", 4.565)):
            objects.append(_beam_between(
                collection, f"{PREFIX}RepairPodBandSide_{side_id}_{clamp:02d}",
                (x, y, 0.94), (x, y, 1.76),
                0.14, 0.085, materials["service_steel"], "structural_metal",
                "repair-pod restraint band side leg and saddle tie", detail=1,
            ))
    for mount, (x, y) in enumerate((
        (-2.63, 3.12), (-0.27, 3.12), (-2.63, 4.48), (-0.27, 4.48),
    )):
        objects.append(_profile_prism(
            collection, f"{PREFIX}RepairPodMount_{mount:02d}", (x, y, 0.82),
            0.48, 0.30, 0.22, 0.20, 0.14, materials["drive"],
            "structural_metal", "repair-pod saddle and vibration isolator",
            detail=1, bevel=0.022,
        ))
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}RepairPodIsolator_{mount:02d}",
            (x, y, 0.96), 0.095, 0.075, materials["cable"],
            "cable_elastomer", "small elastomer vibration isolator captured in the saddle",
            segments=12, detail=2, axis="Z",
        ))
    objects.append(_profile_prism(
        collection, f"{PREFIX}RepairPodConnectorRecess", (0.305, 3.80, 1.34),
        0.10, 1.08, 1.08, 0.64, 0.58, materials["drive"],
        "structural_metal", "pod electrical and consumables connector panel",
        detail=1, bevel=0.018,
    ))
    for socket, (y, z, radius) in enumerate((
        (3.47, 1.35, 0.16),
        (3.82, 1.35, 0.13),
        (4.14, 1.35, 0.16),
    )):
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}RepairPodConnectorShell_{socket:02d}",
            (0.37, y, z), radius, 0.12, materials["service_steel"],
            "structural_metal", "machined repair-pod connector shell",
            segments=16, detail=1, axis="X",
        ))
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}RepairPodConnectorInsert_{socket:02d}",
            (0.44, y, z), radius * 0.68, 0.10, materials["ceramic"],
            "ceramic_isolator", "ceramic connector insert and contact carrier",
            segments=16, detail=2, axis="X",
        ))
    objects.append(_profile_prism(
        collection, f"{PREFIX}RepairPodSideAdapter", (-1.92, 4.565, 1.31),
        0.86, 0.048, 0.048, 0.38, 0.32, materials["service_steel"],
        "structural_metal", "welded field-adapter and connector access plate",
        detail=1, bevel=0.010,
    ))
    for bolt, x in enumerate((-2.22, -1.62)):
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}RepairPodSideAdapterBolt_{bolt:02d}",
            (x, 4.602, 1.31), 0.045, 0.06, materials["service_steel"],
            "structural_metal", "adapter-plate through fastener",
            segments=10, detail=2, axis="Y",
        ))
    for latch, (x, y) in enumerate(((-1.92, 3.47), (-0.98, 4.13))):
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}RepairPodHatchLatch_{latch:02d}",
            (x, y, 1.925), 0.060, 0.055, materials["service_steel"],
            "structural_metal", "quarter-turn loading-hatch latch",
            segments=12, detail=2, axis="Z",
        ))
    objects.append(_profile_prism(
        collection, f"{PREFIX}RepairPodHazardMark", (-0.54, 3.80, 1.916),
        0.24, 0.44, 0.40, 0.018, 0.016, materials["hazard"],
        "marking", "small service hazard paint on the pod hatch",
        detail=2, bevel=0.004,
    ))
    return objects


def _build_forward_weapon_spine(
    collection: bpy.types.Collection,
    materials: dict,
) -> list[bpy.types.Object]:
    """Rebuild the starter's twin-pulse deck as a manufactured recoil module, not a slab with rods."""
    objects = []
    objects.append(_profile_prism(
        collection, f"{PREFIX}WeaponSpineUnderframe", (7.86, 0.0, 1.34),
        4.30, 1.72, 1.42, 0.20, 0.16, materials["drive"],
        "structural_metal", "longitudinal twin-pulse recoil bed tied into the bow frames",
        detail=0, bevel=0.018,
    ))
    # Split, brake-formed armor courses preserve a service gap along the weapon centerline.
    for side_id, side in (("Port", -1.0), ("Starboard", 1.0)):
        for course_id, (x, length, width, z) in enumerate((
            (6.55, 1.38, 0.70, 1.66),
            (7.93, 1.24, 0.64, 1.69),
            (9.18, 1.02, 0.52, 1.67),
        )):
            objects.append(_profile_prism(
                collection, f"{PREFIX}WeaponArmor_{side_id}_{course_id:02d}",
                (x, side * (0.47 + width * 0.22), z),
                length, width, width * 0.84, 0.16, 0.12, materials["armor"],
                "armor_plate", "replaceable brake-formed weapon-spine armor course",
                detail=0 if course_id == 0 else 1, bevel=0.024,
            ))
            for bolt_id, bolt_x in enumerate((x - length * 0.34, x + length * 0.34)):
                objects.append(_axial_cylinder(
                    collection,
                    f"{PREFIX}WeaponArmorBolt_{side_id}_{course_id:02d}_{bolt_id}",
                    (bolt_x, side * (0.47 + width * 0.22), z + 0.095),
                    0.042, 0.050, materials["service_steel"],
                    "structural_metal", "weapon armor course fastener",
                    segments=10, detail=2, axis="Z",
                ))
        objects.append(_profile_prism(
            collection, f"{PREFIX}WeaponCheek_{side_id}", (7.76, side * 1.02, 1.40),
            3.45, 0.12, 0.09, 0.54, 0.40, materials["armor"],
            "armor_plate", "formed side cheek shielding the recoil and feed mechanisms",
            detail=0, bevel=0.018,
        ))
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}WeaponTrunnion_{side_id}",
            (7.16, side * 0.73, 1.43), 0.34, 0.22, materials["drive"],
            "structural_metal", "machined pulse-receiver elevation trunnion",
            segments=20, detail=0, axis="Y",
        ))
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}WeaponTrunnionCap_{side_id}",
            (7.16, side * 0.86, 1.43), 0.22, 0.08, materials["service_steel"],
            "structural_metal", "removable trunnion bearing service cap",
            segments=16, detail=1, axis="Y",
        ))
        objects.append(_beam_between(
            collection, f"{PREFIX}WeaponLoadGusset_{side_id}",
            (6.08, side * 1.48, 0.92), (6.72, side * 0.92, 1.36),
            0.12, 0.08, materials["service_steel"],
            "structural_metal", "weapon-spine load gusset into the shoulder frame",
            detail=1,
        ))
        objects.append(_beam_between(
            collection, f"{PREFIX}WeaponCableConduit_{side_id}",
            (6.34, side * 0.78, 1.12), (7.25, side * 0.58, 1.23),
            0.065, 0.055, materials["cable"],
            "cable_elastomer", "clamped pulse-power and coolant service conduit",
            detail=1,
        ))
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}WeaponOpticalPickup_{side_id}",
            (8.78, side * 1.085, 1.48), 0.070, 0.085, materials["dark_aperture"],
            "active_aperture", "recessed weapon boresight pickup",
            segments=14, detail=1, axis="Y",
        ))
    # Two distinct receiver housings leave the original barrel axes and weapon sockets unchanged.
    for barrel_id, y in (("Port", -0.30), ("Starboard", 0.30)):
        objects.append(_profile_prism(
            collection, f"{PREFIX}PulseReceiver_{barrel_id}", (7.88, y, 1.43),
            1.46, 0.42, 0.38, 0.54, 0.46, materials["drive"],
            "structural_metal", "machined pulse receiver and breech housing",
            detail=0, bevel=0.032,
        ))
        objects.append(_profile_prism(
            collection, f"{PREFIX}PulseReceiverAccess_{barrel_id}", (7.78, y, 1.72),
            0.74, 0.30, 0.27, 0.055, 0.045, materials["service_steel"],
            "structural_metal", "receiver removable service cover",
            detail=1, bevel=0.010,
        ))
        objects.append(_profile_prism(
            collection, f"{PREFIX}PulseRecoilRail_{barrel_id}", (8.10, y, 1.12),
            2.64, 0.16, 0.14, 0.10, 0.08, materials["service_steel"],
            "structural_metal", "hardened recoil slide seated in the weapon bed",
            detail=1, bevel=0.010,
        ))
        for sleeve_id, x in enumerate((9.00, 9.92, 10.84)):
            objects.append(_axial_cylinder(
                collection, f"{PREFIX}PulseBarrelJacket_{barrel_id}_{sleeve_id:02d}",
                (x, y, 1.43), 0.215, 0.46, materials["service_steel"],
                "structural_metal", "replaceable refractory barrel jacket and heat spreader",
                segments=20, detail=1, axis="X",
            ))
            objects.append(_axial_cylinder(
                collection, f"{PREFIX}PulseBarrelIsolator_{barrel_id}_{sleeve_id:02d}",
                (x - 0.27, y, 1.43), 0.235, 0.075, materials["ceramic"],
                "ceramic_isolator", "barrel-jacket electrical and thermal isolator",
                segments=20, detail=2, axis="X",
            ))
    objects.append(_profile_prism(
        collection, f"{PREFIX}WeaponCenterServiceHatch", (7.28, 0.0, 1.78),
        0.88, 0.48, 0.42, 0.075, 0.060, materials["service_steel"],
        "structural_metal", "central pulse feed and synchronization service hatch",
        detail=1, bevel=0.012,
    ))
    for name in ("Pulse_Barrel_-1", "Pulse_Barrel_1", "Pulse_MuzzleBrake_-1", "Pulse_MuzzleBrake_1"):
        obj = bpy.data.objects.get(name)
        if obj is not None and obj.type == "MESH":
            obj.data.materials.clear()
            obj.data.materials.append(materials["service_steel"])
            _set_bill(obj, "structural_metal", "pulse barrel or machined muzzle-brake hardware", 0)
    for name in ("Pulse_MuzzleGlow_-1", "Pulse_MuzzleGlow_1"):
        obj = bpy.data.objects.get(name)
        if obj is not None and obj.type == "MESH":
            obj.data.materials.clear()
            obj.data.materials.append(materials["dark_aperture"])
            _set_bill(obj, "active_aperture", "confined pulse-weapon muzzle aperture", 1)
    return objects


def _build_sensor(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    base_y = -1.28
    objects.append(_profile_prism(
        collection, f"{PREFIX}SensorBasePlate", (-3.15, base_y, 2.86),
        1.32, 0.92, 0.76, 0.18, 0.14,
        materials["drive"], "sensor", "bolted dorsal sensor foundation plate",
        detail=0, bevel=0.030,
    ))
    objects.append(_vertical_frustum(
        collection, f"{PREFIX}SensorPedestal", (-3.15, base_y, 3.24),
        0.78, 0.78, 0.62, 0.46, 0.40, materials["sensor"],
        "sensor", "tapered sensor pedestal with internal cable chase",
        bevel=0.035, detail=0,
    ))
    objects.append(_vertical_frustum(
        collection, f"{PREFIX}SensorCableChase", (-3.15, base_y - 0.315, 3.23),
        0.46, 0.28, 0.035, 0.20, 0.030, materials["cable"],
        "cable_elastomer", "recessed pedestal cable chase", bevel=0.008, detail=1,
    ))
    for bolt, (x, y) in enumerate((
        (-3.62, base_y - 0.30), (-2.68, base_y - 0.30),
        (-3.62, base_y + 0.30), (-2.68, base_y + 0.30),
    )):
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}SensorBaseBolt_{bolt:02d}", (x, y, 2.98),
            0.055, 0.09, materials["service_steel"], "sensor",
            "pedestal foundation fastener", segments=10, detail=2, axis="Z",
        ))
    for side, x in (("Aft", -3.67), ("Fore", -2.63)):
        objects.append(_beam_between(
            collection, f"{PREFIX}SensorYoke_{side}",
            (x + (0.10 if side == "Aft" else -0.10), base_y, 3.42),
            (x, base_y, 3.84),
            0.17, 0.13, materials["service_steel"], "sensor",
            "mismatched elevation-yoke arm", detail=0,
        ))
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}SensorBearing_{side}", (x, base_y - 0.02, 3.84),
            0.13, 0.36, materials["service_steel"], "sensor",
            "exposed machined dish bearing", segments=14, detail=1, axis="Y",
        ))
    objects.append(_dish(
        collection, f"{PREFIX}SensorDish", (-3.15, base_y - 0.08, 3.84), materials["sensor"],
    ))
    dish_center = (-3.15, base_y - 0.235, 3.84)
    for rib, angle in enumerate((math.radians(90), math.radians(210), math.radians(330))):
        objects.append(_beam_between(
            collection, f"{PREFIX}SensorDishRib_{rib:02d}", dish_center,
            (
                dish_center[0] + math.cos(angle) * 0.47,
                dish_center[1],
                dish_center[2] + math.sin(angle) * 0.47,
            ),
            0.045, 0.024, materials["service_steel"], "sensor",
            "dish-face stiffening rib", detail=1,
        ))
    for fastener, angle in enumerate(math.tau * index / 6 for index in range(6)):
        objects.append(_axial_cylinder(
            collection, f"{PREFIX}SensorRimFastener_{fastener:02d}",
            (
                -3.15 + math.cos(angle) * 0.49,
                base_y - 0.27,
                3.84 + math.sin(angle) * 0.49,
            ),
            0.035, 0.075, materials["service_steel"], "sensor",
            "dish-rim service fastener", segments=10, detail=2, axis="Y",
        ))
    objects.append(_axial_cylinder(
        collection, f"{PREFIX}SensorFeedHorn", (-3.15, base_y - 0.58, 3.84),
        0.085, 0.28, materials["sensor"], "sensor", "replaceable sensor feed horn",
        segments=12, detail=1, axis="Y",
    ))
    objects.append(_axial_cylinder(
        collection, f"{PREFIX}SensorActiveAperture", (-3.15, base_y - 0.74, 3.84),
        0.06, 0.035, materials["lens"], "sensor", "active narrow-band sensor aperture",
        segments=12, detail=1, axis="Y",
    ))
    objects.append(_strut_between(
        collection, f"{PREFIX}SensorServiceLead",
        (-3.02, base_y + 0.18, 3.12), (-2.77, base_y + 0.06, 3.72),
        0.030, materials["cable"], "cable_elastomer",
        "clamped sensor power/data service lead", segments=10, detail=2,
    ))
    return objects


def _build_shell_interfaces(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    # Broken partial saddles explain the pressure shell/armor interface without adding full toruses.
    for band, x in enumerate((-7.2, -2.6, 2.1, 6.5)):
        for sector, (a0, a1) in enumerate((
            (math.radians(34), math.radians(76)),
            (math.radians(104), math.radians(146)),
            (math.radians(214), math.radians(256)),
            (math.radians(284), math.radians(326)),
        )):
            objects.append(_ring_segment(
                collection, f"{PREFIX}PressureSaddle_{band:02d}_{sector:02d}", x,
                0.22, 2.62, 2.74, a0, a1, materials["drive"],
                "drive_alloy", "interrupted pressure-shell frame saddle",
                angular_steps=3, detail=1,
            ))
            for fastener, angle in enumerate((a0 + 0.07, a1 - 0.07)):
                objects.append(_axial_cylinder(
                    collection, f"{PREFIX}PressureSaddleBolt_{band:02d}_{sector:02d}_{fastener}",
                    (x - 0.135, math.cos(angle) * 2.70, math.sin(angle) * 2.70),
                    0.050, 0.11, materials["service_steel"],
                    "drive_alloy", "pressure-frame saddle fastener",
                    segments=10, detail=2,
                ))
    for side, y in (("Port", -3.02), ("Starboard", 3.02)):
        for index, x in enumerate((-5.6, -1.1, 3.6)):
            obj = _profile_prism(
                collection, f"{PREFIX}ShoulderGusset_{side}_{index:02d}", (x, y, 0.72),
                1.15, 0.48, 0.28, 0.62, 0.38, materials["drive"],
                "drive_alloy", "shoulder armor load-transfer gusset",
                detail=0, bevel=0.035,
            )
            obj.rotation_euler.x = math.radians(-8.0 if side == "Port" else 8.0)
            objects.append(obj)
    return objects


MARKING_GLYPHS = {
    "A": (
        ((0.08, 0.00), (0.48, 1.00)),
        ((0.48, 1.00), (0.92, 0.00)),
        ((0.25, 0.42), (0.75, 0.42)),
    ),
    "D": (
        ((0.08, 0.00), (0.08, 1.00)),
        ((0.08, 0.93), (0.62, 0.93)),
        ((0.62, 0.93), (0.90, 0.73)),
        ((0.90, 0.73), (0.90, 0.25)),
        ((0.90, 0.25), (0.62, 0.07)),
        ((0.62, 0.07), (0.08, 0.07)),
    ),
    "E": (
        ((0.08, 0.00), (0.08, 1.00)),
        ((0.08, 0.93), (0.90, 0.93)),
        ((0.08, 0.50), (0.72, 0.50)),
        ((0.08, 0.07), (0.90, 0.07)),
    ),
    "G": (
        ((0.83, 0.82), (0.62, 0.95)),
        ((0.62, 0.95), (0.23, 0.95)),
        ((0.23, 0.95), (0.07, 0.74)),
        ((0.07, 0.74), (0.07, 0.25)),
        ((0.07, 0.25), (0.25, 0.06)),
        ((0.25, 0.06), (0.67, 0.06)),
        ((0.67, 0.06), (0.88, 0.23)),
        ((0.88, 0.23), (0.88, 0.48)),
        ((0.88, 0.48), (0.55, 0.48)),
    ),
    "H": (
        ((0.08, 0.00), (0.08, 1.00)),
        ((0.92, 0.00), (0.92, 1.00)),
        ((0.08, 0.50), (0.92, 0.50)),
    ),
    "I": (
        ((0.08, 0.93), (0.92, 0.93)),
        ((0.50, 0.07), (0.50, 0.93)),
        ((0.08, 0.07), (0.92, 0.07)),
    ),
    "L": (
        ((0.08, 0.06), (0.08, 1.00)),
        ((0.08, 0.06), (0.90, 0.06)),
    ),
    "N": (
        ((0.08, 0.00), (0.08, 1.00)),
        ((0.08, 1.00), (0.92, 0.00)),
        ((0.92, 0.00), (0.92, 1.00)),
    ),
    "U": (
        ((0.08, 1.00), (0.08, 0.25)),
        ((0.08, 0.25), (0.25, 0.06)),
        ((0.25, 0.06), (0.72, 0.06)),
        ((0.72, 0.06), (0.92, 0.25)),
        ((0.92, 0.25), (0.92, 1.00)),
    ),
}

MARKING_WIDTHS = {
    "I": 0.44,
    "L": 0.68,
}


def _append_marking_quad(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    start: tuple[float, float],
    end: tuple[float, float],
    width_start: float,
    width_end: float,
    surface_z,
    surface_offset: float,
) -> None:
    """Append one conformal, one-sided paint stroke with no plaque sidewall."""
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.hypot(dx, dy)
    if length <= 1e-6:
        raise ValueError("zero-length marking stroke")
    px = -dy / length
    py = dx / length
    half_start = width_start * 0.5
    half_end = width_end * 0.5
    outline = (
        (start[0] + px * half_start, start[1] + py * half_start),
        (end[0] + px * half_end, end[1] + py * half_end),
        (end[0] - px * half_end, end[1] - py * half_end),
        (start[0] - px * half_start, start[1] - py * half_start),
    )
    base = len(vertices)
    vertices.extend((x, y, surface_z(x) + surface_offset) for x, y in outline)
    faces.append((base + 0, base + 3, base + 2, base + 1))


def _marking_transform(
    point: tuple[float, float],
    *,
    origin: tuple[float, float],
    scale: tuple[float, float],
    rotation: float,
) -> tuple[float, float]:
    x = (point[0] - 0.5) * scale[0]
    y = (point[1] - 0.5) * scale[1]
    cosine = math.cos(rotation)
    sine = math.sin(rotation)
    return (
        origin[0] + x * cosine - y * sine,
        origin[1] + x * sine + y * cosine,
    )


def _build_marking(
    collection: bpy.types.Collection,
    materials: dict,
) -> list[bpy.types.Object]:
    """Build the crew name as original protest-stencil paint, not desktop type.

    The generated component study guides energy and paint loss only. Exact
    glyphs, chips, bridges and edge-following overspray are conventionally authored
    here so no generated pixels or proprietary typeface enter the asset.
    """
    plate = bpy.data.objects.get(f"{PREFIX}ShoulderArmor_Port_Aft")
    if plate is None or plate.type != "MESH":
        raise RuntimeError("port aft shoulder armor missing for conformal marking")
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    wear_vertices: list[tuple[float, float, float]] = []
    wear_faces: list[tuple[int, ...]] = []
    wear_anchors: list[tuple[float, float]] = []
    surface_offset = 0.00030
    wear_surface_offset = 0.00036
    plate_half_length = 4.05 * 0.5

    def plate_top_z(local_x: float) -> float:
        t = max(0.0, min(1.0, (local_x + plate_half_length) / (plate_half_length * 2.0)))
        return 0.17 + (0.15 - 0.17) * t

    stroke_index = 0
    chip_count = 0

    # Two lines preserve the generated study's protest-poster hierarchy while
    # staying inside the existing port shoulder marking plate.
    lines = (
        ("DIE", (0.0, 0.23), 0.43, 0.31, 0.118, 0.10),
        ("LAUGHING", (0.0, -0.18), 0.45, 0.39, 0.112, 0.050),
    )
    chip_strokes = {1, 8, 16, 25, 34, 43, 47}

    for line_index, (text, center, nominal_width, height, stroke_width, spacing) in enumerate(lines):
        widths = [MARKING_WIDTHS.get(letter, 1.0) * nominal_width for letter in text]
        line_width = sum(widths) + spacing * (len(text) - 1)
        cursor = center[0] - line_width * 0.5
        for glyph_index, (letter, glyph_width) in enumerate(zip(text, widths, strict=True)):
            origin = (
                cursor + glyph_width * 0.5,
                center[1] + math.sin((glyph_index + 1) * 2.13 + line_index) * 0.008,
            )
            rotation = math.radians(
                math.sin((glyph_index + 2) * 1.71 + line_index * 0.83) * 2.2
            )
            scale = (
                glyph_width,
                height * (1.0 + math.sin((glyph_index + 4) * 1.19) * 0.025),
            )
            for local_start, local_end in MARKING_GLYPHS[letter]:
                start = _marking_transform(
                    local_start, origin=origin, scale=scale, rotation=rotation,
                )
                end = _marking_transform(
                    local_end, origin=origin, scale=scale, rotation=rotation,
                )
                wear_anchors.extend((
                    start,
                    end,
                    ((start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5),
                ))
                width = stroke_width * (
                    1.0 + math.sin((stroke_index + 1) * 4.17) * 0.08
                )
                width_end = width * (
                    1.0 + math.sin((stroke_index + 3) * 2.63) * 0.07
                )
                if stroke_index in chip_strokes:
                    # Missing paint rather than a dark overlay: the graphite
                    # substrate remains the actual visible chip material.
                    t0 = 0.43 + math.sin(stroke_index * 1.37) * 0.05
                    gap = 0.065
                    a = (
                        start[0] + (end[0] - start[0]) * (t0 - gap * 0.5),
                        start[1] + (end[1] - start[1]) * (t0 - gap * 0.5),
                    )
                    b = (
                        start[0] + (end[0] - start[0]) * (t0 + gap * 0.5),
                        start[1] + (end[1] - start[1]) * (t0 + gap * 0.5),
                    )
                    _append_marking_quad(
                        vertices, faces, start, a, width, width_end,
                        plate_top_z, surface_offset,
                    )
                    _append_marking_quad(
                        vertices, faces, b, end, width_end, width * 0.96,
                        plate_top_z, surface_offset,
                    )
                    chip_count += 1
                else:
                    _append_marking_quad(
                        vertices, faces, start, end, width, width_end,
                        plate_top_z, surface_offset,
                    )
                stroke_index += 1
            cursor += glyph_width + spacing

    # Sparse LOD0-only overspray follows actual glyph edges; it does not cluster
    # at the plate center or survive into normal-route LODs.
    overspray_count = 34
    for index in range(overspray_count):
        phase = index * 2.399963229728653
        anchor = wear_anchors[(index * 7) % len(wear_anchors)]
        center = (
            anchor[0] + math.cos(phase) * (0.020 + (index % 4) * 0.008),
            anchor[1] + math.sin(phase * 1.31) * (0.014 + (index % 3) * 0.006),
        )
        length = 0.015 + (index % 4) * 0.006
        angle = phase * 0.37
        end = (
            center[0] + math.cos(angle) * length,
            center[1] + math.sin(angle) * length,
        )
        width = 0.006 + (index % 3) * 0.003
        _append_marking_quad(
            wear_vertices, wear_faces, center, end, width, width * 0.72,
            plate_top_z, wear_surface_offset,
        )

    obj = _mesh_object(
        collection,
        f"{PREFIX}HeroMark_DieLaughing",
        vertices,
        faces,
    )
    obj = _finish(
        obj, materials["marking"], "marking",
        "crew-cut two-line protest stencil with chipped spray paint",
        bevel=0.0, detail=0,
    )
    obj.parent = plate
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj["sf_marking_text"] = "DIE LAUGHING"
    obj["sf_marking_method"] = "conventionally-authored-vector-stencil-v2"
    obj["sf_marking_style"] = "original-protest-punk-hand-cut-stencil"
    obj["sf_target_surface"] = plate.name
    obj["sf_surface_offset_m"] = surface_offset
    measured_offsets = [
        vertex.co.z - plate_top_z(vertex.co.x)
        for vertex in obj.data.vertices
    ]
    obj["sf_min_surface_offset_m"] = min(measured_offsets)
    obj["sf_max_surface_offset_m"] = max(measured_offsets)
    obj["sf_marking_reference_sha256"] = (
        "EB4CA35AE6B22817037FA7717C7C9CACEEEAB65965730F7F388A7FE5E5036ECF"
    )
    obj["sf_generated_pixels_shipped"] = False
    obj["sf_stencil_missing_paint_breaks"] = chip_count
    obj["sf_overspray_fragments"] = overspray_count

    wear = _mesh_object(
        collection,
        f"{PREFIX}HeroMark_DieLaughing_Wear",
        wear_vertices,
        wear_faces,
    )
    wear = _finish(
        wear, materials["marking"], "marking",
        "LOD0-only stencil overspray at crew-cut paint edges",
        bevel=0.0, detail=2,
    )
    wear.parent = plate
    wear.matrix_parent_inverse = Matrix.Identity(4)
    wear.location = (0.0, 0.0, 0.0)
    wear.rotation_euler = (0.0, 0.0, 0.0)
    wear.scale = (1.0, 1.0, 1.0)
    wear["sf_marking_text"] = "DIE LAUGHING"
    wear["sf_marking_method"] = "conventionally-authored-vector-overspray-v2"
    wear["sf_target_surface"] = plate.name
    wear["sf_surface_offset_m"] = wear_surface_offset
    wear_offsets = [
        vertex.co.z - plate_top_z(vertex.co.x)
        for vertex in wear.data.vertices
    ]
    wear["sf_min_surface_offset_m"] = min(wear_offsets)
    wear["sf_max_surface_offset_m"] = max(wear_offsets)
    wear["sf_lod_policy"] = "LOD0_only_detail2"
    wear["sf_generated_pixels_shipped"] = False
    wear["sf_overspray_fragments"] = overspray_count
    return [obj, wear]


def apply_material_truth_v6() -> dict:
    source = _source()
    collection = _reset_collection(source)
    materials = _materials()
    hidden = _hide_legacy()
    material_response = _tune_existing_material_response()
    existing_bill_coverage = _assign_existing_material_bills()
    pressure_shell = _reshape_pressure_shell()
    housing = bpy.data.objects.get("Engine_Main_Housing")
    if housing is None or housing.type != "MESH":
        raise RuntimeError("engine main housing missing")
    housing.data.materials.clear()
    housing.data.materials.append(materials["drive"])
    for polygon in housing.data.polygons:
        polygon.material_index = 0
    _set_bill(housing, "drive_alloy", "cast and machined axial-drive pressure casing", 0)
    objects = []
    objects.extend(_build_drive(collection, materials))
    objects.extend(_build_midship_armor(collection, materials))
    objects.extend(_build_repair_pod(collection, materials))
    objects.extend(_build_forward_weapon_spine(collection, materials))
    objects.extend(_build_radiators(collection, materials))
    objects.extend(_build_sensor(collection, materials))
    objects.extend(_build_shell_interfaces(collection, materials))
    marking_objects = _build_marking(collection, materials)
    objects.extend(marking_objects)
    root = _root()
    report = {
        "schema": "spaceface.kestrelMaterialTruth.v1",
        "passId": PASS_ID,
        "fictionDevelopmentAgreement": True,
        "hiddenLegacyObjects": hidden,
        "pressureShell": pressure_shell,
        "objectsAdded": len(objects),
        "visibleObjectCount": sum(
            1 for obj in bpy.data.objects
            if obj.type == "MESH" and not obj.hide_render and not obj.hide_get()
        ),
        "materialBills": MATERIAL_BILLS,
        "materialResponse": material_response,
        "existingMaterialBillCoverage": existing_bill_coverage,
        "objects": [obj.name for obj in objects],
        "heroMarking": "DIE LAUGHING",
        "heroMarkingContract": {
            "mainObject": marking_objects[0].name,
            "wearObject": marking_objects[1].name,
            "method": marking_objects[0]["sf_marking_method"],
            "style": marking_objects[0]["sf_marking_style"],
            "targetSurface": marking_objects[0]["sf_target_surface"],
            "generatedPixelsShipped": marking_objects[0]["sf_generated_pixels_shipped"],
            "mainDetailLevel": marking_objects[0]["sf_detail_level"],
            "wearDetailLevel": marking_objects[1]["sf_detail_level"],
            "wearLodPolicy": marking_objects[1]["sf_lod_policy"],
            "surfaceOffsetMeters": marking_objects[0]["sf_surface_offset_m"],
            "minMeasuredSurfaceOffsetMeters": marking_objects[0]["sf_min_surface_offset_m"],
            "maxMeasuredSurfaceOffsetMeters": marking_objects[0]["sf_max_surface_offset_m"],
            "missingPaintBreaks": marking_objects[0]["sf_stencil_missing_paint_breaks"],
            "oversprayFragments": marking_objects[1]["sf_overspray_fragments"],
            "referenceSha256": marking_objects[0]["sf_marking_reference_sha256"],
        },
    }
    root["materialTruthPass"] = report
    root["fictionName"] = "DIE LAUGHING"
    return report


if __name__ == "__main__":
    print("KESTREL_MATERIAL_TRUTH_V6=" + json.dumps(apply_material_truth_v6()))
