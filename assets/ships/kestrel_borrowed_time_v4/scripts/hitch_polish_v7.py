"""Hitch V7 polish: construction, damage hooks, canopy tags, and spray-paint identity.

Starts from the existing V6 remaster. Does not redesign Hitch. Adds manufactured drive/midship
detail toward the component mockups, HOOK_* meshes the live loader understands, and a dirtier
DIE LAUGHING stencil that stays paint, not a plaque.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Matrix, Vector

from material_truth_v6 import (
    MARKING_GLYPHS,
    MARKING_WIDTHS,
    _append_marking_quad,
    _axial_cylinder,
    _finish,
    _marking_transform,
    _materials,
    _mesh_object,
    _profile_prism,
    _ring_segment,
    _root,
    _set_bill,
    _source,
    _strut_between,
)


PASS_ID = "kestrel-hitch-polish-v7"
COLLECTION_NAME = "KESTREL_V7_HITCH_POLISH"
PREFIX = "V7_"


def _collection() -> bpy.types.Collection:
    source = _source()
    prior = bpy.data.collections.get(COLLECTION_NAME)
    if prior is not None:
        for obj in list(prior.all_objects):
            obj_type = obj.type
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and getattr(data, "users", 1) == 0 and obj_type == "MESH":
                bpy.data.meshes.remove(data)
        for parent in bpy.data.collections:
            if prior.name in parent.children:
                parent.children.unlink(prior)
        if prior.name in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.unlink(prior)
        bpy.data.collections.remove(prior)
    collection = bpy.data.collections.new(COLLECTION_NAME)
    source.children.link(collection)
    return collection


def _hide_replaced(prefixes: tuple[str, ...]) -> list[str]:
    hidden = []
    for obj in bpy.data.objects:
        if any(obj.name.startswith(prefix) for prefix in prefixes):
            obj.hide_render = True
            obj.hide_set(True)
            obj["sf_v7_replaced_by"] = PASS_ID
            hidden.append(obj.name)
    return hidden


def _stamp(obj: bpy.types.Object) -> bpy.types.Object:
    obj["sf_polish_pass"] = PASS_ID
    obj["sf_material_truth_pass"] = PASS_ID
    return obj


def _tapered_vane(
    collection: bpy.types.Collection,
    name: str,
    angle_start: float,
    angle_end: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    sections = (
        (-13.18, 1.50, 2.20),
        (-13.72, 1.22, 2.00),
        (-14.32, 0.86, 1.68),
    )
    vertices = []
    for x_pos, inner, outer in sections:
        for radius in (inner, outer):
            for angle in (angle_start, angle_end):
                vertices.append((x_pos, math.cos(angle) * radius, math.sin(angle) * radius))
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5), (8, 9, 11, 10),
        (0, 4, 5, 1), (4, 8, 9, 5),
        (2, 3, 7, 6), (6, 7, 11, 10),
        (0, 2, 6, 4), (4, 6, 10, 8),
        (1, 5, 7, 3), (5, 9, 11, 7),
    ]
    obj = _mesh_object(collection, name, vertices, faces)
    return _stamp(_finish(
        obj, material, "refractory_vane", "tapered pivoted exhaust vane with folded hot edge",
        bevel=0.018, detail=0,
    ))


def _build_drive(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    hidden = _hide_replaced((
        "V6_NozzleVane_", "V6_NozzleVaneHotFace_", "V6_NozzleVaneEdgeA_", "V6_NozzleVaneEdgeB_",
    ))
    segment_count = 12
    for index in range(segment_count):
        vane_gap = math.radians(2.4)
        va0 = math.tau * index / segment_count + vane_gap
        va1 = math.tau * (index + 1) / segment_count - vane_gap
        mid = (va0 + va1) * 0.5
        objects.append(_tapered_vane(
            collection, f"{PREFIX}NozzleVane_{index:02d}", va0, va1, materials["vane"],
        ))
        objects.append(_tapered_vane(
            collection, f"{PREFIX}NozzleVaneEdgeA_{index:02d}",
            va0, va0 + math.radians(0.7), materials["drive"],
        ))
        objects.append(_tapered_vane(
            collection, f"{PREFIX}NozzleVaneEdgeB_{index:02d}",
            va1 - math.radians(0.7), va1, materials["drive"],
        ))
        hinge = _profile_prism(
            collection, f"{PREFIX}NozzleHinge_{index:02d}",
            (-13.22, math.cos(mid) * 1.86, math.sin(mid) * 1.86),
            0.22, 0.16, 0.14, 0.11, 0.09, materials["service_steel"],
            "drive_alloy", "nozzle-vane hinge and actuator root",
            detail=1, bevel=0.012,
        )
        hinge.rotation_euler.x = mid
        objects.append(_stamp(hinge))
    for ring, (x, inner, outer) in enumerate((
        (-12.55, 2.42, 2.58),
        (-11.10, 2.44, 2.60),
        (-9.68, 2.40, 2.56),
    )):
        gap = math.radians(8.0)
        for index in range(8):
            a0 = math.tau * index / 8 + gap
            a1 = math.tau * (index + 1) / 8 - gap
            objects.append(_stamp(_ring_segment(
                collection, f"{PREFIX}DriveCoolantPipe_{ring:02d}_{index:02d}",
                x, 0.16, inner, outer, a0, a1, materials["service_steel"],
                "drive_alloy", "circumferential drive coolant and service pipe",
                angular_steps=6, detail=1,
            )))
            mid = (a0 + a1) * 0.5
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}DrivePipeClamp_{ring:02d}_{index:02d}",
                (x, math.cos(mid) * ((inner + outer) * 0.5), math.sin(mid) * ((inner + outer) * 0.5)),
                0.055, 0.16, materials["drive"], "drive_alloy",
                "pipe clamp on drive casing", segments=8, detail=2,
            )))
    objects.append(_stamp(_ring_segment(
        collection, f"{PREFIX}NozzleHeatCollar",
        -14.05, 0.10, 1.22, 1.58, 0.0, math.tau - 0.02, materials["ceramic"],
        "ceramic_isolator", "heat-darkened nozzle isolator collar",
        angular_steps=16, detail=1,
    )))
    return objects


def _build_sensor(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}SensorFeedHorn",
        (-3.15, -1.36, 3.84), 0.048, 0.20, materials["sensor"],
        "sensor", "machined dish feed horn",
        segments=12, detail=1, axis="Y",
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}SensorFeedCollar",
        (-3.15, -1.22, 3.84), 0.078, 0.06, materials["service_steel"],
        "sensor", "feed-horn clamp collar",
        segments=12, detail=1, axis="Y",
    )))
    return objects


def _build_radiators(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    for side, y in (("Port", -5.83), ("Starboard", 5.83)):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}RadiatorCassetteLip_{side}",
            (-7.45, y, 1.08), 7.30, 0.62, 0.58, 0.028, 0.022,
            materials["radiator"], "radiator",
            "folded-sheet cassette lip over the fin pack",
            detail=1, bevel=0.006,
        )))
        for index, x in enumerate((-10.4, -7.45, -4.5)):
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}RadiatorReturnStub_{side}_{index:02d}",
                (x, y + (-0.52 if side == "Port" else 0.52), 0.70),
                0.038, 0.18, materials["service_steel"], "radiator",
                "recessed cassette return stub",
                segments=8, detail=2, axis="Z",
            )))
    return objects


def _build_midship(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    for index, x in enumerate((-5.4, -3.2, -1.0, 1.2, 3.4)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}SpineConduit_{index:02d}",
            (x, 0.0, 2.42), 0.055, 1.85, materials["cable"], "cable_elastomer",
            "dorsal service conduit along the pressure spine", segments=8, detail=1, axis="X",
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}SpineClamp_{index:02d}",
            (x, 0.0, 2.58), 0.22, 0.28, 0.24, 0.08, 0.07, materials["service_steel"],
            "structural_metal", "spine conduit clamp and cover",
            detail=1, bevel=0.008,
        )))
    for side, sign in (("Port", -1.0), ("Starboard", 1.0)):
        objects.append(_stamp(_strut_between(
            collection, f"{PREFIX}ShoulderCable_{side}",
            (-4.8, sign * 3.6, 1.55), (2.4, sign * 4.15, 1.62),
            0.032, materials["cable"], "cable_elastomer",
            "protected shoulder service cable", segments=8, detail=2,
        )))
        for index, x in enumerate((-3.6, -0.4, 2.2)):
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}ShoulderStandoff_{side}_{index:02d}",
                (x, sign * 4.05, 0.72), 0.045, 0.22, materials["service_steel"],
                "structural_metal", "shoulder armor stand-off", segments=8, detail=2, axis="Z",
            )))
    return objects


def _build_hooks(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    objects = []
    specs = (
        ("HOOK_NAV_PORT", (2.15, -6.35, 0.42), materials["lens"], "active_aperture",
         "port navigation aperture", {"hook": "damage.navlight", "damageRole": "navLight"}),
        ("HOOK_NAV_STARBOARD", (2.15, 6.35, 0.42), materials["lens"], "active_aperture",
         "starboard navigation aperture", {"hook": "damage.navlight", "damageRole": "navLight"}),
        ("HOOK_DRIVE_CORE", (-13.68, 0.0, 0.0), materials["hotcore"], "active_aperture",
         "axial drive ignition core", {"hook": "drive.core", "damageRole": None}),
        ("HOOK_SENSOR_DISH", (-3.15, -0.08, 3.84), materials["lens"], "active_aperture",
         "dorsal sensor active aperture", {"hook": "damage.sensor", "damageRole": "sensor"}),
        ("HOOK_ARMOR_PORT", (-2.2, -4.42, 1.08), materials["armor"], "armor_plate",
         "port shoulder armor course", {"hook": "damage.armor", "damageRole": "armor"}),
        ("HOOK_SECONDARY_POD", (-1.45, 3.80, 1.34), materials["repair"], "repair_panel",
         "starboard field-repair pod", {"hook": "damage.secondary", "damageRole": "secondary"}),
    )
    for name, center, material, bill, function, extras in specs:
        radius = 0.11 if "NAV" in name or name.endswith("CORE") else 0.16
        obj = _stamp(_axial_cylinder(
            collection, name, center, radius, 0.12 if "NAV" in name else 0.18,
            material, bill, function, segments=10, detail=0,
        ))
        spaceface = {"canopy": False, **{key: value for key, value in extras.items() if value}}
        obj["spaceface"] = spaceface
        if extras.get("damageRole"):
            obj["sf_damage_role"] = extras["damageRole"]
        objects.append(obj)
    return objects


def _tag_canopy() -> list[str]:
    tagged = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        names = [material.name for material in obj.data.materials if material]
        if "Material_Glass_Canopy" not in names:
            continue
        extras = dict(obj.get("spaceface") or {})
        extras["canopy"] = True
        obj["spaceface"] = extras
        obj["sf_canopy"] = True
        tagged.append(obj.name)
    if not tagged:
        raise RuntimeError("no canopy mesh found to tag")
    return tagged


def _build_marking(collection: bpy.types.Collection, materials: dict) -> list[bpy.types.Object]:
    hidden = _hide_replaced(("V6_HeroMark_DieLaughing",))
    plate = bpy.data.objects.get("V6_ShoulderArmor_Port_Aft")
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
    lines = (
        ("DIE", (0.0, 0.23), 0.43, 0.31, 0.118, 0.10),
        ("LAUGHING", (0.0, -0.18), 0.45, 0.39, 0.112, 0.050),
    )
    chip_strokes = {1, 3, 4, 7, 8, 11, 12, 15, 16, 19, 21, 24, 25, 28, 30, 33, 34, 37, 39, 42, 43, 46, 47}

    for line_index, (text, center, nominal_width, height, stroke_width, spacing) in enumerate(lines):
        widths = [MARKING_WIDTHS.get(letter, 1.0) * nominal_width for letter in text]
        line_width = sum(widths) + spacing * (len(text) - 1)
        cursor = center[0] - line_width * 0.5
        for glyph_index, (letter, glyph_width) in enumerate(zip(text, widths, strict=True)):
            origin = (
                cursor + glyph_width * 0.5,
                center[1] + math.sin((glyph_index + 1) * 2.13 + line_index) * 0.010,
            )
            rotation = math.radians(math.sin((glyph_index + 2) * 1.71 + line_index * 0.83) * 2.8)
            scale = (
                glyph_width,
                height * (1.0 + math.sin((glyph_index + 4) * 1.19) * 0.03),
            )
            for local_start, local_end in MARKING_GLYPHS[letter]:
                start = _marking_transform(local_start, origin=origin, scale=scale, rotation=rotation)
                end = _marking_transform(local_end, origin=origin, scale=scale, rotation=rotation)
                wear_anchors.extend((start, end, ((start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5)))
                width = stroke_width * (1.0 + math.sin((stroke_index + 1) * 4.17) * 0.10)
                width_end = width * (1.0 + math.sin((stroke_index + 3) * 2.63) * 0.09)
                if stroke_index in chip_strokes:
                    t0 = 0.38 + math.sin(stroke_index * 1.37) * 0.10
                    gap = 0.14
                    a = (
                        start[0] + (end[0] - start[0]) * (t0 - gap * 0.5),
                        start[1] + (end[1] - start[1]) * (t0 - gap * 0.5),
                    )
                    b = (
                        start[0] + (end[0] - start[0]) * (t0 + gap * 0.5),
                        start[1] + (end[1] - start[1]) * (t0 + gap * 0.5),
                    )
                    _append_marking_quad(vertices, faces, start, a, width, width_end, plate_top_z, surface_offset)
                    _append_marking_quad(vertices, faces, b, end, width_end, width * 0.94, plate_top_z, surface_offset)
                    chip_count += 1
                else:
                    _append_marking_quad(vertices, faces, start, end, width, width_end, plate_top_z, surface_offset)
                stroke_index += 1
            cursor += glyph_width + spacing

    overspray_count = 72
    for index in range(overspray_count):
        phase = index * 2.399963229728653
        anchor = wear_anchors[(index * 7) % len(wear_anchors)]
        center = (
            anchor[0] + math.cos(phase) * (0.030 + (index % 5) * 0.014),
            anchor[1] + math.sin(phase * 1.31) * (0.022 + (index % 4) * 0.012),
        )
        length = 0.022 + (index % 5) * 0.012
        angle = phase * 0.41
        end = (center[0] + math.cos(angle) * length, center[1] + math.sin(angle) * length)
        width = 0.010 + (index % 4) * 0.006
        _append_marking_quad(
            wear_vertices, wear_faces, center, end, width, width * 0.68,
            plate_top_z, wear_surface_offset,
        )

    obj = _stamp(_finish(
        _mesh_object(collection, f"{PREFIX}HeroMark_DieLaughing", vertices, faces),
        materials["marking"], "marking",
        "crew-cut two-line protest stencil with chipped spray paint",
        bevel=0.0, detail=0,
    ))
    shader = next((node for node in materials["marking"].node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if shader:
        shader.inputs["Base Color"].default_value = (0.50, 0.40, 0.24, 1.0)
        shader.inputs["Roughness"].default_value = 0.90
    obj.parent = plate
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj["sf_marking_text"] = "DIE LAUGHING"
    obj["sf_marking_method"] = "conventionally-authored-vector-stencil-v7"
    obj["sf_marking_style"] = "original-protest-punk-hand-cut-stencil"
    obj["sf_target_surface"] = plate.name
    obj["sf_surface_offset_m"] = surface_offset
    measured = [vertex.co.z - plate_top_z(vertex.co.x) for vertex in obj.data.vertices]
    obj["sf_min_surface_offset_m"] = min(measured)
    obj["sf_max_surface_offset_m"] = max(measured)
    obj["sf_generated_pixels_shipped"] = False
    obj["sf_stencil_missing_paint_breaks"] = chip_count
    obj["sf_overspray_fragments"] = overspray_count
    obj["spaceface"] = {"decal": True}

    wear = _stamp(_finish(
        _mesh_object(collection, f"{PREFIX}HeroMark_DieLaughing_Wear", wear_vertices, wear_faces),
        materials["marking"], "marking",
        "LOD0-only stencil overspray at crew-cut paint edges",
        bevel=0.0, detail=2,
    ))
    wear.parent = plate
    wear.matrix_parent_inverse = Matrix.Identity(4)
    wear["sf_marking_text"] = "DIE LAUGHING"
    wear["sf_lod_policy"] = "LOD0_only_detail2"
    wear["sf_generated_pixels_shipped"] = False
    wear["sf_overspray_fragments"] = overspray_count
    wear["spaceface"] = {"decal": True}
    return [obj, wear]


def apply_hitch_polish_v7() -> dict:
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_build_drive(collection, materials))
    objects.extend(_build_sensor(collection, materials))
    objects.extend(_build_radiators(collection, materials))
    objects.extend(_build_midship(collection, materials))
    objects.extend(_build_hooks(collection, materials))
    marking = _build_marking(collection, materials)
    objects.extend(marking)
    canopy = _tag_canopy()
    root = _root()
    report = {
        "schema": "spaceface.hitchPolish.v7",
        "passId": PASS_ID,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "canopyTagged": canopy,
        "heroMarking": "DIE LAUGHING",
        "heroMarkingContract": {
            "mainObject": marking[0].name,
            "wearObject": marking[1].name,
            "method": marking[0]["sf_marking_method"],
            "style": marking[0]["sf_marking_style"],
            "targetSurface": marking[0]["sf_target_surface"],
            "generatedPixelsShipped": False,
            "mainDetailLevel": 0,
            "wearDetailLevel": 2,
            "wearLodPolicy": "LOD0_only_detail2",
            "surfaceOffsetMeters": 0.0003,
            "minMeasuredSurfaceOffsetMeters": marking[0]["sf_min_surface_offset_m"],
            "maxMeasuredSurfaceOffsetMeters": marking[0]["sf_max_surface_offset_m"],
            "missingPaintBreaks": marking[0]["sf_stencil_missing_paint_breaks"],
            "oversprayFragments": marking[1]["sf_overspray_fragments"],
        },
        "hooks": [name for name in (obj.name for obj in objects) if name.startswith("HOOK_")],
    }
    root["hitchPolishPass"] = report
    root["fictionName"] = "DIE LAUGHING"
    return report
