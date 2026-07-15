"""Helios V5 visual candidate: V4 macro donor topology with Borrowed Time PBR language.

This wrapper intentionally keeps V5 isolated from V4 and from all live asset paths. It reuses
the proven V4 geometry/composition code but replaces the provisional dark materials with the
user-provided K0 Borrowed Time texture family that defines the minimum craft bar.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.blender import build_m4_helios_hub_v4 as base


OUT = ROOT / "assets" / "ships" / "m4_helios_hub_v5"
K0 = (
    ROOT / "assets" / "ships" / "revamp-evidence" / "_k0_inspect" / "revamp"
    / "SpaceFace_SF-K0_Borrowed-Time_Revamp" / "textures"
)
K0_HULL = K0.parent / "exports" / "SF_K0_hull.glb"

base.OUT = OUT
base.EVIDENCE = OUT / "evidence" / "renders"
base.BLENDS = OUT / "blender"
base.LOCK = OUT / "authoring.__lock"


def k0_pbr_material(name: str, prefix: str, *, fallback: tuple[float, float, float, float],
                    emission_strength: float = 0.0, use_color_texture: bool = False) -> bpy.types.Material:
    mat = base.principled_material(
        name, fallback, metallic=0.68, roughness=0.34,
        emission=fallback if emission_strength else None,
        emission_strength=emission_strength,
    )
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (2.6, 2.6, 2.6)
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])

    def image(suffix: str, colorspace: str) -> bpy.types.Node | None:
        path = K0 / f"{prefix}_{suffix}.png"
        if not path.exists():
            return None
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(path), check_existing=True)
        node.image.colorspace_settings.name = colorspace
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    color = image("basecolor", "sRGB")
    orm = image("orm", "Non-Color")
    normal = image("normal", "Non-Color")
    # Borrowed Time color maps were authored for its ship UV islands. Helios keeps the proven
    # K0 normal/ORM response, but uses explicit semantic station base factors unless this is an
    # identity-neutral emissive role. This prevents zero-UV/custom meshes sampling one black texel.
    if color and use_color_texture:
        links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
        if emission_strength:
            emission_key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
            links.new(color.outputs["Color"], bsdf.inputs[emission_key])
    if orm:
        sep = nodes.new("ShaderNodeSeparateColor")
        sep.mode = "RGB"
        links.new(orm.outputs["Color"], sep.inputs["Color"])
        links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if normal:
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.5
        links.new(normal.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    mat["sf_texture_source"] = f"K0 Borrowed Time/{prefix}"
    mat["sf_internal_reference"] = True
    return mat


def create_k0_materials() -> dict[str, bpy.types.Material]:
    return {
        "armor": k0_pbr_material("HeliosV5_K0_Hull", "hull", fallback=(0.52, 0.58, 0.62, 1)),
        "steel": k0_pbr_material("HeliosV5_K0_BrushedMetal", "brushed_metal", fallback=(0.3, 0.36, 0.4, 1)),
        "dark": k0_pbr_material("HeliosV5_K0_Mechanical", "mechanical", fallback=(0.075, 0.105, 0.14, 1)),
        "accent": k0_pbr_material(
            "HeliosV5_K0_WarningOrange", "warning_orange", fallback=(0.92, 0.26, 0.03, 1),
            emission_strength=2.2, use_color_texture=True,
        ),
        "cyan": k0_pbr_material(
            "HeliosV5_K0_FrontierCyan", "frontier_cyan", fallback=(0.0, 0.78, 0.92, 1),
            emission_strength=5.5, use_color_texture=True,
        ),
    }


_original_stamp_root = base.stamp_root


def stamp_v5_root(asset_id: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    root = _original_stamp_root(asset_id, objects)
    root.name = "ROOT_HeliosHubV5" if asset_id == "helios_hub_station" else "ROOT_HeliosGateV5"
    metadata = dict(root.get("spacefaceAsset") or {})
    metadata.update({
        "family": "HELIOS_HUB_V5_K0_PBR",
        "packet": "PROFESSIONAL-HELIOS-HUB-VISUAL-V5",
        "wiringStatus": "candidate_visual_review_only",
        "materialReference": "K0 Borrowed Time authored PBR texture family",
    })
    root["spacefaceAsset"] = metadata
    return root


base.create_materials = create_k0_materials
base.stamp_root = stamp_v5_root


_original_add_docking_mass = base.add_docking_mass


def _create_lofted_module(name: str, center: Vector, angle: float, length: float, width: float,
                          height: float, mat: bpy.types.Material,
                          collection: bpy.types.Collection) -> bpy.types.Object:
    """Create an authored four-section pressure hull inspired by K0's layered armor language."""
    sections = (
        (-length * 0.5, 0.58),
        (-length * 0.31, 1.0),
        (length * 0.31, 1.0),
        (length * 0.5, 0.58),
    )
    profile = (
        (-0.5, -0.5), (0.5, -0.5), (0.66, -0.22), (0.66, 0.22),
        (0.5, 0.5), (-0.5, 0.5), (-0.66, 0.22), (-0.66, -0.22),
    )
    verts = []
    for local_x, scale in sections:
        for py, pz in profile:
            verts.append((local_x, py * width * scale, pz * height * scale))
    faces = []
    ring = len(profile)
    faces.append(tuple(range(ring - 1, -1, -1)))
    faces.append(tuple(range((len(sections) - 1) * ring, len(sections) * ring)))
    for section_i in range(len(sections) - 1):
        a0, b0 = section_i * ring, (section_i + 1) * ring
        for i in range(ring):
            j = (i + 1) % ring
            faces.append((a0 + i, a0 + j, b0 + j, b0 + i))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = center
    obj.rotation_euler.z = angle + math.pi / 2
    base.assign_material(obj, mat)
    obj["sf_component"] = "custom_inhabited_pressure_hull"
    obj["sf_material_reference"] = "K0 Borrowed Time hull PBR"
    return obj


def add_k0_habitation_modules(mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Build distributed station masses with original topology and K0-authorized PBR surfaces."""
    coll = bpy.data.collections.new("HELIOS_V5_HABITATION_MODULES")
    bpy.context.scene.collection.children.link(coll)
    module_angles = (math.radians(70), math.radians(142), math.radians(214), math.radians(286))
    made: list[bpy.types.Object] = []
    for module_i, angle in enumerate(module_angles):
        radial = Vector((math.cos(angle), math.sin(angle), 0.0))
        tangent = Vector((-math.sin(angle), math.cos(angle), 0.0))
        center = radial * 35.5 + Vector((0, 0, 1.0 if module_i % 2 == 0 else -1.0))
        role = "Habitation" if module_i % 2 == 0 else "Service"
        hull = _create_lofted_module(
            f"{role}Module_{module_i}_PressureHull", center, angle,
            16.5 if role == "Habitation" else 14.0,
            7.2 if role == "Habitation" else 6.4,
            5.2 if role == "Habitation" else 4.6,
            mats["armor"] if role == "Habitation" else mats["dark"], coll,
        )
        made.append(hull)
        # Raised mechanical spine and side armor rails provide K0-like layered body hierarchy.
        spine_start = center - tangent * 5.0 + Vector((0, 0, 2.8))
        spine_end = center + tangent * 5.0 + Vector((0, 0, 2.8))
        made.append(base.create_beam_between(
            f"{role}Module_{module_i}_MechanicalSpine", tuple(spine_start), tuple(spine_end),
            0.72, 0.42, mats["dark"], coll,
        ))
        for side in (-1.0, 1.0):
            rail_start = center - tangent * 5.7 + radial * (side * 2.7) + Vector((0, 0, 0.7))
            rail_end = center + tangent * 5.7 + radial * (side * 2.7) + Vector((0, 0, 0.7))
            made.append(base.create_beam_between(
                f"{role}Module_{module_i}_ArmorRail_{side:+.0f}", tuple(rail_start), tuple(rail_end),
                0.38, 0.28, mats["steel"], coll,
            ))
        # Repeated window/task lights are explicit scale anchors, not a continuous neon outline.
        for window_i, offset in enumerate((-4.5, -2.25, 0.0, 2.25, 4.5)):
            p = center + tangent * offset + radial * 3.45 + Vector((0, 0, 0.65))
            q = p + tangent * 0.42
            made.append(base.create_beam_between(
                f"{role}Module_{module_i}_Window_{window_i}", tuple(p), tuple(q),
                0.16, 0.12, mats["cyan"] if role == "Habitation" else mats["accent"], coll,
            ))
        # Two radial load paths visibly tie each pressure hull into separate ring nodes.
        for side in (-1.0, 1.0):
            start = radial * 30.8 + tangent * (side * 2.4) + Vector((0, 0, -0.8))
            end = radial * 33.3 + tangent * (side * 2.4) + Vector((0, 0, -0.8))
            made.append(base.create_beam_between(
                f"{role}Module_{module_i}_LoadPath_{side:+.0f}", tuple(start), tuple(end),
                0.52, 0.45, mats["steel"], coll,
            ))
    return made


def add_v5_docking_and_habitation(mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    made = _original_add_docking_mass(mats)
    made.extend(add_k0_habitation_modules(mats))
    for obj in made:
        if obj.type != "MESH":
            continue
        if not obj.data.uv_layers:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            try:
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.mesh.select_all(action="SELECT")
                bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
                bpy.ops.object.mode_set(mode="OBJECT")
            finally:
                if obj.mode != "OBJECT":
                    bpy.ops.object.mode_set(mode="OBJECT")
                obj.select_set(False)
        obj["sf_uv_contract"] = "smart_project_for_k0_normal_orm"
    return made


base.add_docking_mass = add_v5_docking_and_habitation


def main() -> int:
    code = base.main()
    # Correct inherited report identity without altering the source geometry receipts.
    summary = OUT / "evidence" / "build_summary.json"
    if summary.exists():
        data = json.loads(summary.read_text(encoding="utf-8"))
        data["schema"] = "spaceface.heliosV5.k0PbrVisualCandidate.v1"
        data["livePromotion"] = False
        data["materialReference"] = "K0 Borrowed Time authored PBR texture family"
        summary.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
