"""Deterministic semantic geometry recipe for the Helios trade hub.

This module deliberately has no top-level Blender dependency.  Its recipe data and
contract validator can be exercised by normal Python, while ``apply_golden_station``
is called from Blender authoring/build tooling with an explicit ``bpy`` module.

The recipe layers functional construction onto the existing cross-and-tower station and
reversibly rebinds only the twelve audited donor-trim LOD objects.  It does not replace
the macro silhouette, save a source file, export a GLB, edit a manifest, or touch release
outputs.  Those remain explicit controller-owned integration steps.
"""
from __future__ import annotations

import argparse
import base64
from collections import Counter
from dataclasses import asdict, dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
import traceback
from typing import Any, Callable, Iterable, Mapping, Sequence
import zlib


RECIPE_ID = "helios-golden-station-v4"
REPORT_SCHEMA = "spaceface.heliosGoldenStationRecipe.v1"
COLLECTION_NAME = "SF_GOLDEN_HELIOS_V4"
OBJECT_PREFIX = "SFHG4_"

# Runtime/glTF axes: +X forward, +Y up, +Z starboard.
# Blender authoring axes: +X forward, +Z up, +Y port (-runtime Z).
RUNTIME_BOUNDS_M = {
    "min": (-19.8, -4.6, -19.8),
    "max": (19.8, 17.45, 19.8),
}

# These roles already exist in the current Helios surface foundry.  The aliases let
# the recipe operate on either the canonical builder source or its PBR-remastered
# derivative without silently creating another generic material family.
MATERIAL_ALIASES: Mapping[str, tuple[str, ...]] = {
    "coated_structural": ("SF_StructuralLight_PBR", "SF_HeliosCoatedStructural_PBR"),
    "hull": ("SF_HullMid_K0PBR", "Material_Hull"),
    "armor": ("SF_Armor_K0PBR", "Material_Armor", "Material_Hull"),
    "armor_dark": ("SF_HullDark_K0PBR", "Material_ArmorDark", "Material_Mechanical"),
    "mechanical": ("SF_Machinery_K0PBR", "Material_Mechanical"),
    "radiator": ("SF_Radiator_PBR", "Material_Radiator", "Material_Mechanical"),
    "docking": ("SF_DockingContact_PBR", "Material_Docking", "Material_Mechanical"),
    "service": ("SF_ServiceAccess_PBR", "Material_Service", "Material_Hull"),
    "marking": ("SF_IndustrialMarking_PBR",),
    "window": ("SF_Window_PBR", "Material_Window", "Material_Glass"),
    # The production Helios blend names its localized signal materials by function,
    # rather than by the canonical family builder's generic role names.
    "accent": ("SF_CyanEmission", "Material_Accent"),
    "warm": ("SF_AmberEmission", "Material_Warm"),
}

# A topology-only preview can opt into the legacy aliases, but production integration is
# strict by default so docking, radiator, service, armor, and window systems cannot collapse
# back into one smooth hull/mechanical response.
REQUIRED_DISTINCT_PBR_ROLES = frozenset({
    "coated_structural", "armor", "armor_dark", "mechanical", "radiator", "docking", "service", "marking", "window",
})

# Controller-facing look-development targets.  These are ranges, not hard-coded shader
# values: the geometry recipe records which existing PBR maps need retuning when a capture
# crushes all structure to black or leaves the shell as uniform white plastic.
MATERIAL_RESPONSE_GUIDANCE: Mapping[str, Mapping[str, Any]] = {
    "coated_structural": {
        "baseColorLinearLuminance": (0.27, 0.43),
        "roughness": (0.48, 0.76),
        "metallic": (0.015, 0.10),
        "purpose": "off-white coated structural shell with nonuniform roughness; replaces the flat donor trim response",
    },
    "armor": {
        "baseColorLinearLuminance": (0.13, 0.24),
        "roughness": (0.48, 0.66),
        "metallic": (0.03, 0.12),
        "purpose": "mid-value coated construction plates; distinct from both white hull and black framing",
    },
    "armor_dark": {
        "baseColorLinearLuminance": (0.065, 0.13),
        "roughness": (0.50, 0.70),
        "metallic": (0.18, 0.42),
        "purpose": "recess backing and shadow framing that retains readable reflected detail",
    },
    "mechanical": {
        "baseColorLinearLuminance": (0.09, 0.18),
        "roughness": (0.34, 0.54),
        "metallic": (0.62, 0.90),
        "purpose": "exposed structure, manifolds, rails, and load paths with metal response",
    },
    "radiator": {
        "baseColorLinearLuminance": (0.10, 0.23),
        "roughness": (0.50, 0.74),
        "metallic": (0.48, 0.76),
        "purpose": "oxidized thermally cycled fins; never a flat chocolate-brown tile",
    },
    "docking": {
        "baseColorLinearLuminance": (0.12, 0.25),
        "roughness": (0.38, 0.68),
        "metallic": (0.42, 0.76),
        "purpose": "impact-polished contact metal and sacrificial shoes with directional wear",
    },
    "service": {
        "baseColorLinearLuminance": (0.16, 0.29),
        "roughness": (0.52, 0.72),
        "metallic": (0.03, 0.14),
        "purpose": "maintained mid-value access housings and equipment frames",
    },
    "marking": {
        "baseColorLinearLuminance": (0.23, 0.47),
        "roughness": (0.48, 0.74),
        "metallic": (0.01, 0.08),
        "purpose": "non-emissive abraded safety ochre for bay identity, hazard graphics, and service orientation",
    },
    "accent": {
        "emissiveCoverageMax": 0.08,
        "emissionStrength": (0.55, 1.35),
        "purpose": "sparse cyan wayfinding lamps inside opaque physical housings",
    },
    "warm": {
        "emissiveCoverageMax": 0.10,
        "emissionStrength": (0.45, 1.20),
        "purpose": "sparse amber hazard or access state, not a structural rail material",
    },
}

DONOR_TRIM_MATERIAL = "SF_QuaterniusTrim_CC0"
PREBOUND_DONOR_MATERIAL_BY_ZONE = {
    "citadel": "SF_StructuralLight_PBR",
    "habitat": "SF_StructuralLight_PBR",
    "docking": "SF_DockingContact_PBR",
    "industrial": "SF_ServiceAccess_PBR",
}
DONOR_TRIM_OBJECT_PATTERN = re.compile(
    r"^LOD(?P<lod>[012])_(?P<zone>citadel|docking|habitat|industrial)_SF_QuaterniusTrim_CC0$"
)
DONOR_TRIM_EXPECTED_OBJECTS = tuple(
    f"LOD{lod}_{zone}_{DONOR_TRIM_MATERIAL}"
    for lod in range(3)
    for zone in ("citadel", "docking", "habitat", "industrial")
)
LEGACY_DOCKING_SIGNAL_OBJECTS = tuple(
    f"LOD{lod}_{zone}_SF_CyanEmission"
    for lod in range(3)
    for zone in ("docking", "industrial")
)
DONOR_ROLE_BLOCKER = {
    "material": DONOR_TRIM_MATERIAL,
    "objects": DONOR_TRIM_EXPECTED_OBJECTS,
    "observedFailure": "dominant white barrels remain uniform low-roughness plastic across all LODs",
    "candidateRepair": "reversible per-face functional rebind with coated shell, contact, service, and machinery roles",
}

VALID_LODS = ("lod0", "lod1", "lod2")


@dataclass(frozen=True)
class AssemblyRecipe:
    id: str
    builder: str
    purpose: str
    repairs: tuple[str, ...]
    material_roles: tuple[str, ...]
    lods: tuple[str, ...]
    parameters: Mapping[str, Any]


ASSEMBLY_RECIPES: tuple[AssemblyRecipe, ...] = (
    AssemblyRecipe(
        id="shell_articulation",
        builder="shell_articulation",
        purpose="Expose tower load paths and break the white-cylinder stack into maintained armor courses.",
        repairs=("repeated white cylinders", "uninterrupted civic hull", "missing structural hierarchy"),
        material_roles=("coated_structural", "armor", "armor_dark", "mechanical", "service", "docking"),
        lods=("lod0", "lod1", "lod2"),
        parameters={
            "cardinal_faces": 4,
            "course_heights_m": (4.9, 8.0),
            "diagonal_spines": 4,
            "pad_module_variants": ("freight", "passenger", "maintenance", "utility"),
            "tower_collar_arcs": ((12.0, 116.0), (139.0, 246.0), (268.0, 350.0)),
        },
    ),
    AssemblyRecipe(
        id="docking_contact_system",
        builder="docking_contact_system",
        purpose="Give every radial arm a readable capture lane, sacrificial contact shoes, and approach logic.",
        repairs=("generic arm boxes", "missing docking wear/contact identity", "no operational approach cue"),
        material_roles=("docking", "mechanical", "service", "marking", "armor_dark", "accent", "warm"),
        lods=("lod0", "lod1", "lod2"),
        parameters={
            "arms": 4,
            "lane_radius_m": (7.2, 13.2),
            "contact_radius_m": 17.7,
            "signal_housing_role": "service",
            "signal_lamp_role": "accent",
            "signal_lamps_per_arm": 3,
        },
    ),
    AssemblyRecipe(
        id="thermal_rejection",
        builder="thermal_rejection",
        purpose="Add copper-toned radiator cassettes with manifolds at thermally credible tower quadrants.",
        repairs=("missing radiator structure", "black cage silhouette", "undifferentiated mechanical material"),
        material_roles=("radiator", "mechanical", "armor_dark", "service", "docking"),
        lods=("lod0", "lod1"),
        parameters={
            "quadrants": 4,
            "cassette_width_m": 2.8,
            "cassette_height_m": 2.5,
            "thermal_zones": (
                {"id": "habitation", "fin_offsets_m": (-1.10, -0.72, -0.34, 0.34, 0.72, 1.10)},
                {"id": "freight", "fin_offsets_m": (-1.12, -0.84, -0.56, -0.28, 0.28, 0.56, 0.84, 1.12)},
                {"id": "habitation", "fin_offsets_m": (-1.10, -0.72, -0.34, 0.34, 0.72, 1.10)},
                {"id": "utilities", "fin_offsets_m": (-1.08, -0.65, -0.22, 0.22, 0.65, 1.08)},
            ),
        },
    ),
    AssemblyRecipe(
        id="inhabited_window_bays",
        builder="inhabited_window_bays",
        purpose="Replace the cage-like broad glass read with repeated occupied window bays, mullions, and sun brows.",
        repairs=("black glass cages", "missing inhabited windows", "no deck rhythm"),
        material_roles=("window", "armor", "mechanical"),
        lods=("lod0", "lod1", "lod2"),
        parameters={"decks": (3.5, 6.5, 9.5), "faces": 4, "windows_per_bank": 3},
    ),
    AssemblyRecipe(
        id="orientation_signage",
        builder="orientation_signage",
        purpose="Establish Helios H-mark and numbered bay orientation without relying on a cyan color swap.",
        repairs=("missing signage/orientation", "color-only identity", "indistinguishable radial arms"),
        material_roles=("service", "marking", "accent", "warm"),
        lods=("lod0", "lod1"),
        parameters={"bay_labels": ("1", "2", "3", "4"), "mark": "H"},
    ),
    AssemblyRecipe(
        id="maintenance_access",
        builder="maintenance_access",
        purpose="Place framed pressure doors, split leaves, controls, and access hatches at credible service roots.",
        repairs=("missing maintenance access", "featureless arm roots", "details placed without assembly logic"),
        material_roles=("service", "mechanical", "armor_dark", "warm"),
        lods=("lod0", "lod1"),
        parameters={"airlocks": 4, "arm_hatches": 4, "door_height_m": 2.1},
    ),
    AssemblyRecipe(
        id="service_routes",
        builder="service_routes",
        purpose="Route paired utility pipes below selected freight arms with clamps and expansion joints.",
        repairs=("missing service clutter", "random black attachments", "no visible systems routing"),
        material_roles=("mechanical", "service", "docking", "warm"),
        lods=("lod0", "lod1"),
        parameters={"routed_arms": (0, 2), "pipe_diameter_m": 0.18, "clamp_spacing_m": 2.6},
    ),
    AssemblyRecipe(
        id="human_scale_safety",
        builder="human_scale_safety",
        purpose="Add one-metre dock rails, posts, kick plates, and a service ladder as unmistakable human-scale cues.",
        repairs=("missing human-scale cues", "toy-like scale ambiguity", "empty dock edges"),
        material_roles=("mechanical", "service"),
        lods=("lod0",),
        parameters={"rail_height_m": 1.05, "post_spacing_m": 1.8, "ladder_rung_spacing_m": 0.32},
    ),
)


REVIEW_REQUIREMENTS = (
    "Verify the twelve Quaternius donor objects report nonzero coated/contact/service/machinery face counts at every LOD.",
    "Generate and bind the dedicated coated_structural texture set; the candidate clone proves topology/material routing, not final map authorship.",
    "Confirm the existing shell surface heights before accepting deck-lane offsets; the recipe targets the audited v3 shell.",
    "Inspect all four approaches for collision/socket clearance, especially SOCKET_Dock_North and SOCKET_Dock_South.",
    "Review radiator cassette occlusion from the normal player camera and move only as a system, not as decorative pieces.",
    "Bake or author object/orientation-driven grime masks after UV review; geometry material roles only establish the wear zones.",
    "Check window-bank emission and exposure in the real game; this recipe does not edit scene lighting or postprocessing.",
    "Run LOD silhouette/contact-sheet review after the owning builder honors sf_lod_membership.",
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def validate_recipe_contracts() -> dict[str, Any]:
    """Validate semantic, material, LOD, and physical-scale recipe invariants."""
    errors: list[str] = []
    ids = [recipe.id for recipe in ASSEMBLY_RECIPES]
    duplicates = sorted(item for item, count in Counter(ids).items() if count > 1)
    if duplicates:
        errors.append(f"duplicate assembly ids: {duplicates}")
    if len(ASSEMBLY_RECIPES) < 8:
        errors.append("recipe does not cover all eight required station systems")

    required_repairs = {
        "repeated white cylinders",
        "generic arm boxes",
        "missing docking wear/contact identity",
        "missing radiator structure",
        "missing inhabited windows",
        "missing signage/orientation",
        "missing maintenance access",
        "missing service clutter",
        "missing human-scale cues",
    }
    covered = {repair for recipe in ASSEMBLY_RECIPES for repair in recipe.repairs}
    missing_repairs = sorted(required_repairs - covered)
    if missing_repairs:
        errors.append(f"uncovered audit defects: {missing_repairs}")

    for recipe in ASSEMBLY_RECIPES:
        if not recipe.purpose or len(recipe.purpose) < 24:
            errors.append(f"{recipe.id}: purpose is not specific")
        if not recipe.repairs:
            errors.append(f"{recipe.id}: no named defect repaired")
        if not recipe.material_roles:
            errors.append(f"{recipe.id}: no material roles")
        unknown_roles = sorted(set(recipe.material_roles) - set(MATERIAL_ALIASES))
        if unknown_roles:
            errors.append(f"{recipe.id}: unknown material roles {unknown_roles}")
        if not recipe.lods or any(lod not in VALID_LODS for lod in recipe.lods):
            errors.append(f"{recipe.id}: invalid LOD membership {recipe.lods}")
        if tuple(lod for lod in VALID_LODS if lod in recipe.lods) != recipe.lods:
            errors.append(f"{recipe.id}: LOD membership must be ordered and contiguous")

    rail_height = float(next(r for r in ASSEMBLY_RECIPES if r.id == "human_scale_safety").parameters["rail_height_m"])
    if not 0.95 <= rail_height <= 1.20:
        errors.append(f"human-scale rail height is implausible: {rail_height}")
    pipe_diameter = float(next(r for r in ASSEMBLY_RECIPES if r.id == "service_routes").parameters["pipe_diameter_m"])
    if not 0.10 <= pipe_diameter <= 0.35:
        errors.append(f"service pipe diameter is implausible: {pipe_diameter}")
    door_height = float(next(r for r in ASSEMBLY_RECIPES if r.id == "maintenance_access").parameters["door_height_m"])
    if not 1.8 <= door_height <= 2.5:
        errors.append(f"pressure-door height is implausible: {door_height}")

    response_roles = {role for role in MATERIAL_RESPONSE_GUIDANCE}
    required_response_roles = {
        "coated_structural", "armor", "armor_dark", "mechanical", "radiator",
        "docking", "service", "marking", "accent", "warm",
    }
    if response_roles != required_response_roles:
        errors.append(
            f"material response guidance mismatch: missing={sorted(required_response_roles - response_roles)} "
            f"extra={sorted(response_roles - required_response_roles)}"
        )
    for role, guidance in MATERIAL_RESPONSE_GUIDANCE.items():
        for key in ("baseColorLinearLuminance", "roughness", "metallic", "emissionStrength"):
            if key not in guidance:
                continue
            lower, upper = guidance[key]
            if not (0.0 <= float(lower) < float(upper)):
                errors.append(f"{role}: invalid {key} range {guidance[key]}")
        if "emissiveCoverageMax" in guidance and not 0.0 < float(guidance["emissiveCoverageMax"]) <= 0.10:
            errors.append(f"{role}: emissive coverage is not subordinate")

    return {
        "schema": REPORT_SCHEMA,
        "recipeId": RECIPE_ID,
        "ok": not errors,
        "errors": errors,
        "assemblyCount": len(ASSEMBLY_RECIPES),
        "materialRoles": sorted({role for recipe in ASSEMBLY_RECIPES for role in recipe.material_roles}),
        "materialResponseGuidance": MATERIAL_RESPONSE_GUIDANCE,
        "donorRoleBlocker": DONOR_ROLE_BLOCKER,
        "coveredAuditDefects": sorted(covered),
        "recipes": [asdict(recipe) for recipe in ASSEMBLY_RECIPES],
    }


def _v_add(a: Sequence[float], b: Sequence[float]) -> tuple[float, float, float]:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _v_sub(a: Sequence[float], b: Sequence[float]) -> tuple[float, float, float]:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _v_mul(a: Sequence[float], scalar: float) -> tuple[float, float, float]:
    return (a[0] * scalar, a[1] * scalar, a[2] * scalar)


def _v_dot(a: Sequence[float], b: Sequence[float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _v_cross(a: Sequence[float], b: Sequence[float]) -> tuple[float, float, float]:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _v_norm(a: Sequence[float]) -> tuple[float, float, float]:
    length = math.sqrt(max(_v_dot(a, a), 1e-18))
    return (a[0] / length, a[1] / length, a[2] / length)


def _runtime_to_blender(point: Sequence[float]) -> tuple[float, float, float]:
    return (float(point[0]), float(-point[2]), float(point[1]))


def _cardinal(index: int) -> tuple[float, float, float]:
    return ((1.0, 0.0, 0.0), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), (0.0, 0.0, -1.0))[index]


def _radial_frame(radial: Sequence[float]) -> tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]:
    normal = _v_norm(radial)
    tangent = _v_norm((-normal[2], 0.0, normal[0]))
    return tangent, (0.0, 1.0, 0.0), normal


def _find_material(bpy_module: Any, role: str) -> tuple[Any, str]:
    aliases = MATERIAL_ALIASES[role]
    for name in aliases:
        material = bpy_module.data.materials.get(name)
        if material is not None:
            return material, name
    raise RuntimeError(f"{RECIPE_ID}: missing material for role {role}; tried {aliases}")


def _find_principled(material: Any) -> Any | None:
    if material is None or material.node_tree is None:
        return None
    return next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)


def _ensure_coated_structural_material(bpy_module: Any) -> dict[str, Any]:
    """Use the dedicated foundry role, falling back to a candidate-only hull-graph clone."""
    preferred_name, fallback_name = MATERIAL_ALIASES["coated_structural"]
    material = bpy_module.data.materials.get(preferred_name)
    dedicated_maps = material is not None
    created = False
    template_name = None
    if material is None:
        material = bpy_module.data.materials.get(fallback_name)
    if material is None:
        template = bpy_module.data.materials.get("SF_HullMid_K0PBR")
        if template is None or template.node_tree is None:
            raise RuntimeError(
                f"{RECIPE_ID}: missing SF_HullMid_K0PBR template for {fallback_name}; "
                "the donor trim cannot be safely remastered from a flat material"
            )
        material = template.copy()
        material.name = fallback_name
        created = True
        template_name = "SF_HullMid_K0PBR"
    material["spacefaceMaterialRole"] = "structure_light" if dedicated_maps else "coated_structural"
    material["spacefaceFunctionalRole"] = "coated_structural"
    material["spacefaceGoldenRecipe"] = RECIPE_ID
    material["spacefaceControllerRetuneRequired"] = not dedicated_maps
    material["spacefaceResponseGuidance"] = json.dumps(
        MATERIAL_RESPONSE_GUIDANCE["coated_structural"], sort_keys=True
    )
    principled = _find_principled(material)
    if principled is not None:
        # The inherited base/normal/ORM graph remains authoritative and nonuniform.  Coat
        # adds a restrained painted-shell lobe without converting the whole station to metal.
        if principled.inputs.get("Coat Weight"):
            principled.inputs["Coat Weight"].default_value = 0.12
        if principled.inputs.get("Coat Roughness"):
            principled.inputs["Coat Roughness"].default_value = 0.36
        if principled.inputs.get("Coat IOR"):
            principled.inputs["Coat IOR"].default_value = 1.46
    return {
        "material": material.name,
        "created": created,
        "template": template_name,
        "dedicatedFoundryMaps": dedicated_maps,
        "inheritsNonuniformPbrGraph": not dedicated_maps,
        "controllerRetuneRequired": not dedicated_maps,
        "requiredMaps": ("basecolor", "normal", "orm:R=AO,G=roughness,B=metallic"),
        "targetResponse": MATERIAL_RESPONSE_GUIDANCE["coated_structural"],
    }


def _encode_face_material_indices(indices: Sequence[int]) -> str:
    payload = struct.pack(f"<{len(indices)}H", *(int(index) for index in indices)) if indices else b""
    return base64.b64encode(zlib.compress(payload, level=9)).decode("ascii")


def _decode_face_material_indices(payload: str, count: int) -> tuple[int, ...]:
    decoded = zlib.decompress(base64.b64decode(payload.encode("ascii")))
    expected = count * 2
    if len(decoded) != expected:
        raise RuntimeError(f"donor material backup length mismatch: expected {expected}, got {len(decoded)}")
    return struct.unpack(f"<{count}H", decoded) if count else ()


def _restore_or_backup_donor_material_state(bpy_module: Any, obj: Any) -> dict[str, Any]:
    slots_key = "sf_golden_original_material_slots"
    faces_key = "sf_golden_original_face_material_indices_zlib_u16"
    count_key = "sf_golden_original_face_count"
    if slots_key not in obj:
        original_names = [slot.material.name if slot.material else None for slot in obj.material_slots]
        original_indices = [int(polygon.material_index) for polygon in obj.data.polygons]
        obj[slots_key] = json.dumps(original_names)
        obj[faces_key] = _encode_face_material_indices(original_indices)
        obj[count_key] = len(original_indices)
        return {"mode": "backed-up", "materialSlots": original_names, "faceCount": len(original_indices)}

    original_names = json.loads(str(obj[slots_key]))
    original_count = int(obj[count_key])
    if original_count != len(obj.data.polygons):
        raise RuntimeError(
            f"{obj.name}: donor topology changed after golden backup "
            f"({original_count} -> {len(obj.data.polygons)} faces)"
        )
    original_indices = _decode_face_material_indices(str(obj[faces_key]), original_count)
    obj.data.materials.clear()
    for name in original_names:
        material = bpy_module.data.materials.get(name) if name else None
        if material is None:
            raise RuntimeError(f"{obj.name}: cannot restore missing original material {name!r}")
        obj.data.materials.append(material)
    for polygon, material_index in zip(obj.data.polygons, original_indices):
        polygon.material_index = int(material_index)
    return {"mode": "restored", "materialSlots": original_names, "faceCount": original_count}


def _mesh_component_receipt(obj: Any) -> tuple[list[int], dict[int, tuple[float, float, float]], int]:
    """Return deterministic connected-component membership and runtime-space centers."""
    vertex_count = len(obj.data.vertices)
    parents = list(range(vertex_count))

    def find(value: int) -> int:
        while parents[value] != value:
            parents[value] = parents[parents[value]]
            value = parents[value]
        return value

    def union(left: int, right: int) -> None:
        left_root, right_root = find(left), find(right)
        if left_root == right_root:
            return
        if left_root < right_root:
            parents[right_root] = left_root
        else:
            parents[left_root] = right_root

    for edge in obj.data.edges:
        union(int(edge.vertices[0]), int(edge.vertices[1]))
    roots = [find(index) for index in range(vertex_count)]
    ordered_roots = {root: index for index, root in enumerate(sorted(set(roots)))}
    component_by_vertex = [ordered_roots[root] for root in roots]
    sums: dict[int, list[float]] = {}
    counts: Counter[int] = Counter()
    for vertex, component in zip(obj.data.vertices, component_by_vertex):
        world = obj.matrix_world @ vertex.co
        runtime = (float(world.x), float(world.z), float(-world.y))
        target = sums.setdefault(component, [0.0, 0.0, 0.0])
        for axis in range(3):
            target[axis] += runtime[axis]
        counts[component] += 1
    centers = {
        component: tuple(value / counts[component] for value in total)
        for component, total in sums.items()
    }
    return component_by_vertex, centers, len(ordered_roots)


def _donor_face_role(
    zone: str,
    center: Sequence[float],
    normal: Sequence[float],
    component_center: Sequence[float],
) -> str:
    relative = _v_sub(center, component_center)
    angle = math.atan2(relative[2], relative[0])
    side = abs(normal[1]) < 0.52
    bottom = normal[1] < -0.52
    seam = side and abs(math.sin(angle * 4.0 + {"citadel": 0.35, "docking": 0.0, "habitat": 0.65, "industrial": 0.95}[zone])) < 0.15
    if bottom:
        return "mechanical"
    if seam:
        return "service" if zone in {"citadel", "habitat"} else "armor_dark"
    if zone == "docking" and side and center[1] <= component_center[1] + 0.28:
        return "docking"
    if zone == "industrial" and side and center[1] <= component_center[1] + 0.05:
        return "mechanical"
    if zone == "habitat" and normal[1] > 0.62:
        return "armor"
    if zone == "citadel" and side and center[1] < component_center[1] - 0.35:
        return "armor"
    return "coated_structural"


def _rebind_donor_trim_objects(bpy_module: Any, materials: Mapping[str, Any]) -> dict[str, Any]:
    found = {name: bpy_module.data.objects.get(name) for name in DONOR_TRIM_EXPECTED_OBJECTS}
    missing = sorted(name for name, obj in found.items() if obj is None)
    if missing:
        raise RuntimeError(
            f"{RECIPE_ID}: audited donor-trim LOD set is incomplete; missing {missing}. "
            "Refuse partial barrel remaster because it would break LOD parity."
        )
    role_order = ("coated_structural", "armor", "service", "docking", "mechanical", "armor_dark")
    objects_report = []
    aggregate_faces: Counter[str] = Counter()
    parity: dict[str, set[int]] = {zone: set() for zone in ("citadel", "docking", "habitat", "industrial")}
    for name in DONOR_TRIM_EXPECTED_OBJECTS:
        obj = found[name]
        match = DONOR_TRIM_OBJECT_PATTERN.fullmatch(name)
        if obj is None or match is None or obj.type != "MESH":
            raise RuntimeError(f"{name}: donor trim contract mismatch")
        if obj.data.users != 1:
            raise RuntimeError(
                f"{name}: donor trim mesh has {obj.data.users} users; refuse a shared-mesh face rebind"
            )
        backup = _restore_or_backup_donor_material_state(bpy_module, obj)
        original_materials = list(backup["materialSlots"])
        zone = match.group("zone")
        allowed_sources = {DONOR_TRIM_MATERIAL, PREBOUND_DONOR_MATERIAL_BY_ZONE[zone]}
        if not set(original_materials).intersection(allowed_sources):
            raise RuntimeError(
                f"{name}: expected donor material in {sorted(allowed_sources)}, got {original_materials}"
            )
        obj.data.materials.clear()
        slot_by_role = {}
        for role in role_order:
            slot_by_role[role] = len(obj.data.materials)
            obj.data.materials.append(materials[role])

        component_by_vertex, component_centers, component_count = _mesh_component_receipt(obj)
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        face_counts: Counter[str] = Counter()
        lod = int(match.group("lod"))
        parity[zone].add(lod)
        for polygon in obj.data.polygons:
            world_center = obj.matrix_world @ polygon.center
            runtime_center = (float(world_center.x), float(world_center.z), float(-world_center.y))
            world_normal = normal_matrix @ polygon.normal
            runtime_normal = _v_norm((float(world_normal.x), float(world_normal.z), float(-world_normal.y)))
            component = component_by_vertex[int(polygon.vertices[0])]
            role = _donor_face_role(zone, runtime_center, runtime_normal, component_centers[component])
            polygon.material_index = slot_by_role[role]
            face_counts[role] += 1
            aggregate_faces[role] += 1
        obj["spacefaceGoldenDonorRebind"] = RECIPE_ID
        obj["sf_functional_zone"] = zone
        obj["sf_lod_parity"] = f"lod{lod}"
        obj["sf_donor_rebind_face_counts"] = json.dumps(dict(sorted(face_counts.items())), sort_keys=True)
        objects_report.append({
            "object": name,
            "lod": f"lod{lod}",
            "functionalZone": zone,
            "connectedComponents": component_count,
            "faceCount": len(obj.data.polygons),
            "originalMaterials": original_materials,
            "reboundFaceCounts": dict(sorted(face_counts.items())),
            "backupMode": backup["mode"],
        })
    bad_parity = {zone: sorted(lods) for zone, lods in parity.items() if lods != {0, 1, 2}}
    if bad_parity:
        raise RuntimeError(f"donor trim LOD parity failure: {bad_parity}")
    return {
        "blocker": DONOR_ROLE_BLOCKER,
        "objectCount": len(objects_report),
        "objects": objects_report,
        "aggregateReboundFaceCounts": dict(sorted(aggregate_faces.items())),
        "lodParity": {zone: ["lod0", "lod1", "lod2"] for zone in sorted(parity)},
        "reversibleBackup": "compressed original material slots and per-face material indices on each named object",
    }


def _subdue_legacy_docking_signal_rails(bpy_module: Any, service_material: Any) -> dict[str, Any]:
    """Replace the inherited continuous cyan dock bracket with maintained housings.

    The source asset used large docking and industrial meshes as emissive identity
    rails, which read like floating HUD brackets from the gameplay camera.  Golden
    Station adds small shielded guide lamps, so those legacy strips remain physical
    geometry but are rebound to the rough service coating at every LOD.  The original
    binding is recorded on the objects before mutation for provenance and auditability.
    """
    receipts = []
    for name in LEGACY_DOCKING_SIGNAL_OBJECTS:
        obj = bpy_module.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"{RECIPE_ID}: missing legacy docking signal object {name}")
        original = [material.name if material else "" for material in obj.data.materials]
        prior = str(obj.get("sf_golden_original_materials", ""))
        if not prior:
            if "SF_CyanEmission" not in original:
                raise RuntimeError(f"{name}: expected SF_CyanEmission before signal-rail rebind, got {original}")
            obj["sf_golden_original_materials"] = json.dumps(original)
        obj.data.materials.clear()
        obj.data.materials.append(service_material)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        obj["spacefaceGoldenSignalRebind"] = RECIPE_ID
        obj["sf_functional_zone"] = "docking-wayfinding-housing"
        receipts.append({
            "object": name,
            "faceCount": len(obj.data.polygons),
            "originalMaterials": json.loads(prior) if prior else original,
            "reboundMaterial": service_material.name,
        })
    return {
        "objects": receipts,
        "lodParity": ["lod0", "lod1", "lod2"],
        "observableIntent": "continuous cyan bracket removed; only bounded shielded guide lamps remain emissive",
    }


def _remove_collection(bpy_module: Any, name: str) -> None:
    collection = bpy_module.data.collections.get(name)
    if collection is None:
        return
    for obj in list(collection.objects):
        mesh = obj.data if obj.type == "MESH" else None
        bpy_module.data.objects.remove(obj, do_unlink=True)
        if mesh is not None and mesh.users == 0:
            bpy_module.data.meshes.remove(mesh)
    bpy_module.data.collections.remove(collection)


def _ensure_collection(bpy_module: Any, parent_collection: Any | None) -> Any:
    _remove_collection(bpy_module, COLLECTION_NAME)
    collection = bpy_module.data.collections.new(COLLECTION_NAME)
    if parent_collection is None:
        parent_collection = bpy_module.context.scene.collection
    parent_collection.children.link(collection)
    return collection


def _stamp_object(
    obj: Any,
    *,
    assembly: str,
    role: str,
    lods: Sequence[str],
    purpose: str,
    wear_driver: str = "none",
) -> None:
    obj["spacefaceGoldenRecipe"] = RECIPE_ID
    obj["sf_semantic_assembly"] = assembly
    obj["sf_surface_role"] = role
    obj["sf_lod_membership"] = ",".join(lods)
    obj["sf_detail_level"] = 2 if tuple(lods) == ("lod0",) else (1 if "lod2" not in lods else 0)
    obj["sf_close_only"] = tuple(lods) == ("lod0",)
    obj["sf_function"] = purpose
    obj["sf_wear_driver"] = wear_driver
    obj["sf_uv_mode"] = "world-box-2m-per-tile"


def _box_project_uv(mesh: Any, metres_per_tile: float = 2.0) -> None:
    """Create deterministic world-scale box UVs suitable for the station's tileable PBR roles."""
    uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    mesh.update()
    for polygon in mesh.polygons:
        nx, ny, nz = (abs(value) for value in polygon.normal)
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if nx >= ny and nx >= nz:
                u, v = vertex.y, vertex.z
            elif ny >= nx and ny >= nz:
                u, v = vertex.x, vertex.z
            else:
                u, v = vertex.x, vertex.y
            uv_layer.data[loop_index].uv = (u / metres_per_tile, v / metres_per_tile)


def _finish_mesh(
    bpy_module: Any,
    collection: Any,
    name: str,
    vertices_runtime: Sequence[Sequence[float]],
    faces: Sequence[Sequence[int]],
    material: Any,
    *,
    assembly: str,
    role: str,
    lods: Sequence[str],
    purpose: str,
    bevel_m: float,
    wear_driver: str = "none",
) -> Any:
    mesh = bpy_module.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([_runtime_to_blender(vertex) for vertex in vertices_runtime], [], [tuple(face) for face in faces])
    mesh.validate(clean_customdata=False)
    mesh.update()
    _box_project_uv(mesh)
    obj = bpy_module.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    _stamp_object(obj, assembly=assembly, role=role, lods=lods, purpose=purpose, wear_driver=wear_driver)
    if bevel_m > 0.0:
        bevel = obj.modifiers.new("SFHG4_PhysicalEdgeBevel", "BEVEL")
        bevel.width = float(bevel_m)
        bevel.segments = 2
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(24.0)
    try:
        weighted = obj.modifiers.new("SFHG4_FaceWeightedNormals", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
        weighted.weight = 50
    except Exception:
        # Blender versions that bake normal weighting through smooth-by-angle still retain
        # the explicit bevel and authored face normals; integration validation records this.
        obj["sf_weighted_normal_fallback"] = "exporter-recalculate"
    return obj


def _cuboid(
    bpy_module: Any,
    collection: Any,
    name: str,
    center: Sequence[float],
    size: Sequence[float],
    axes: Sequence[Sequence[float]],
    material: Any,
    **meta: Any,
) -> Any:
    half = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    vertices = []
    for su, sv, sw in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                       (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)):
        point = tuple(center)
        point = _v_add(point, _v_mul(axes[0], su * half[0]))
        point = _v_add(point, _v_mul(axes[1], sv * half[1]))
        point = _v_add(point, _v_mul(axes[2], sw * half[2]))
        vertices.append(point)
    faces = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))
    return _finish_mesh(bpy_module, collection, name, vertices, faces, material, **meta)


def _oriented_box(
    bpy_module: Any,
    collection: Any,
    name: str,
    center: Sequence[float],
    size: Sequence[float],
    radial: Sequence[float],
    material: Any,
    **meta: Any,
) -> Any:
    return _cuboid(bpy_module, collection, name, center, size, _radial_frame(radial), material, **meta)


def _trapezoid_deck(
    bpy_module: Any,
    collection: Any,
    name: str,
    radial: Sequence[float],
    r0: float,
    r1: float,
    width0: float,
    width1: float,
    y_center: float,
    height: float,
    material: Any,
    **meta: Any,
) -> Any:
    tangent, _, normal = _radial_frame(radial)
    outline: list[tuple[float, float, float]] = []
    for radius, width in ((r0, width0), (r1, width1)):
        center = _v_mul(normal, radius)
        outline.append(_v_add(center, _v_mul(tangent, -width * 0.5)))
        outline.append(_v_add(center, _v_mul(tangent, width * 0.5)))
    bottom = [(x, y_center - height * 0.5, z) for x, _, z in outline]
    top = [(x, y_center + height * 0.5, z) for x, _, z in outline]
    vertices = bottom + top
    faces = ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
             (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6))
    return _finish_mesh(bpy_module, collection, name, vertices, faces, material, **meta)


def _ring_arc(
    bpy_module: Any,
    collection: Any,
    name: str,
    center_xz: Sequence[float],
    inner_radius: float,
    outer_radius: float,
    y_center: float,
    height: float,
    start_degrees: float,
    end_degrees: float,
    material: Any,
    *,
    segments: int = 18,
    **meta: Any,
) -> Any:
    """Build a physically thick partial collar; gaps keep segmentation asymmetric and legible."""
    if end_degrees <= start_degrees:
        raise ValueError(f"{name}: ring arc end must follow start")
    vertices: list[tuple[float, float, float]] = []
    for index in range(segments + 1):
        angle = math.radians(start_degrees + (end_degrees - start_degrees) * index / segments)
        cosine, sine = math.cos(angle), math.sin(angle)
        for y in (y_center - height * 0.5, y_center + height * 0.5):
            vertices.append((center_xz[0] + cosine * inner_radius, y, center_xz[1] + sine * inner_radius))
            vertices.append((center_xz[0] + cosine * outer_radius, y, center_xz[1] + sine * outer_radius))
    faces: list[tuple[int, ...]] = []
    for index in range(segments):
        a = index * 4
        b = (index + 1) * 4
        faces.extend((
            (a, b, b + 2, a + 2),
            (a + 1, a + 3, b + 3, b + 1),
            (a + 2, b + 2, b + 3, a + 3),
            (a, a + 1, b + 1, b),
        ))
    faces.extend(((0, 2, 3, 1),
                  (segments * 4, segments * 4 + 1, segments * 4 + 3, segments * 4 + 2)))
    return _finish_mesh(bpy_module, collection, name, vertices, faces, material, **meta)


def _beam(
    bpy_module: Any,
    collection: Any,
    name: str,
    start: Sequence[float],
    end: Sequence[float],
    radius: float,
    material: Any,
    *,
    sides: int = 10,
    **meta: Any,
) -> Any:
    axis = _v_norm(_v_sub(end, start))
    reference = (1.0, 0.0, 0.0) if abs(axis[0]) < 0.75 else (0.0, 1.0, 0.0)
    basis_u = _v_norm(_v_cross(axis, reference))
    basis_v = _v_norm(_v_cross(axis, basis_u))
    vertices = []
    for point in (start, end):
        for index in range(sides):
            angle = math.tau * index / sides
            offset = _v_add(_v_mul(basis_u, math.cos(angle) * radius), _v_mul(basis_v, math.sin(angle) * radius))
            vertices.append(_v_add(point, offset))
    start_center_index = len(vertices)
    vertices.append(tuple(start))
    end_center_index = len(vertices)
    vertices.append(tuple(end))
    faces: list[tuple[int, ...]] = []
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((start_center_index, nxt, index))
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((end_center_index, sides + index, sides + nxt))
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((index, nxt, sides + nxt, sides + index))
    obj = _finish_mesh(bpy_module, collection, name, vertices, faces, material, **meta)
    # Arbitrarily oriented pipes cannot use dominant-axis box projection reliably:
    # one face can collapse to a UV line and invalidate the tangent basis.  Give the
    # tube a deterministic cylindrical unwrap with planar caps instead.
    uv_layer = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
    for polygon in obj.data.polygons:
        if polygon.index < sides * 2:
            for loop_index in polygon.loop_indices:
                source_index = obj.data.loops[loop_index].vertex_index
                if source_index >= sides * 2:
                    uv_layer.data[loop_index].uv = (0.5, 0.5)
                    continue
                vertex_index = source_index % sides
                angle = math.tau * vertex_index / sides
                uv_layer.data[loop_index].uv = (0.5 + math.cos(angle) * 0.5, 0.5 + math.sin(angle) * 0.5)
            continue
        side_index = polygon.index - sides * 2
        nxt = (side_index + 1) % sides
        for loop_index in polygon.loop_indices:
            vertex_index = obj.data.loops[loop_index].vertex_index
            ring_index = vertex_index % sides
            if ring_index == side_index:
                u = side_index / sides
            elif nxt == 0:
                u = 1.0
            else:
                u = nxt / sides
            v = 1.0 if vertex_index >= sides else 0.0
            uv_layer.data[loop_index].uv = (u, v)
    obj.data.update()
    obj["sf_uv_mode"] = "cylindrical-axis-with-planar-caps"
    return obj


def _radial_center(radial: Sequence[float], radius: float, y: float, tangent_offset: float = 0.0) -> tuple[float, float, float]:
    tangent, _, normal = _radial_frame(radial)
    return _v_add(_v_add(_v_mul(normal, radius), (0.0, y, 0.0)), _v_mul(tangent, tangent_offset))


def _common_meta(recipe: AssemblyRecipe, role: str, *, wear_driver: str = "none", lods: Sequence[str] | None = None) -> dict[str, Any]:
    return {
        "assembly": recipe.id,
        "role": role,
        "lods": tuple(lods or recipe.lods),
        "purpose": recipe.purpose,
        "wear_driver": wear_driver,
    }


def _build_shell_articulation(ctx: dict[str, Any], recipe: AssemblyRecipe) -> list[Any]:
    bpy_module, collection, mats = ctx["bpy"], ctx["collection"], ctx["materials"]
    made = []
    for face in range(4):
        radial = _cardinal(face)
        for course, y in enumerate(recipe.parameters["course_heights_m"]):
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}TowerArmor_{face}_{course}",
                _radial_center(radial, 4.27, y), (3.05, 1.28, 0.16), radial, mats["armor"],
                bevel_m=0.045, **_common_meta(recipe, "armor", wear_driver="exposure-and-access"),
            ))
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}TowerArmorSpine_{face}_{course}",
                _radial_center(radial, 4.39, y, 0.0), (0.34, 1.55, 0.09), radial, mats["armor_dark"],
                bevel_m=0.022, **_common_meta(recipe, "armor_dark", wear_driver="panel-contact"),
            ))
    for diagonal in range(int(recipe.parameters["diagonal_spines"])):
        angle = math.radians(45.0 + diagonal * 90.0)
        radial = (math.cos(angle), 0.0, math.sin(angle))
        made.append(_oriented_box(
            bpy_module, collection, f"{OBJECT_PREFIX}LoadSpine_{diagonal}",
            _radial_center(radial, 4.48, 6.7), (0.62, 8.35, 0.30), radial, mats["mechanical"],
            bevel_m=0.04, **_common_meta(recipe, "mechanical", wear_driver="recess-accumulation"),
        ))
    # Broken collar arcs hide the donor cylinder's raw facet bands while leaving visible
    # maintenance gaps.  The three unequal spans deliberately avoid a cloned full-ring trim.
    for course, y in enumerate((4.05, 7.05, 10.05)):
        start, end = recipe.parameters["tower_collar_arcs"][course]
        made.append(_ring_arc(
            bpy_module, collection, f"{OBJECT_PREFIX}TowerServiceCollar_{course}",
            (0.0, 0.0), 4.26, 4.52, y, 0.28, start, end, mats["service"], segments=22,
            bevel_m=0.025, **_common_meta(recipe, "service", wear_driver="course-joint"),
        ))
    # Four outer round modules receive different functional articulation patterns.  Their
    # medium-distance read is now collar + seam + supported vessel, not repeated white barrel.
    seam_offsets = {
        "freight": (-58.0, -8.0, 42.0),
        "passenger": (-32.0, 62.0),
        "maintenance": (-78.0, -24.0, 28.0, 82.0),
        "utility": (-92.0, -2.0, 88.0),
    }
    collar_arcs = {
        "freight": ((8.0, 154.0), (184.0, 342.0)),
        "passenger": ((24.0, 204.0),),
        "maintenance": ((4.0, 88.0), (112.0, 224.0), (252.0, 348.0)),
        "utility": ((42.0, 318.0),),
    }
    for arm, variant in enumerate(recipe.parameters["pad_module_variants"]):
        radial = _cardinal(arm)
        tangent = _radial_frame(radial)[0]
        pad_center = _v_mul(radial, 16.2)
        base_heading = math.degrees(math.atan2(radial[2], radial[0]))
        for collar, (start, end) in enumerate(collar_arcs[variant]):
            made.append(_ring_arc(
                bpy_module, collection, f"{OBJECT_PREFIX}PadCollar_{variant}_{collar}",
                (pad_center[0], pad_center[2]), 3.57, 3.82, -0.38 + collar * 0.34,
                0.25, base_heading + start, base_heading + end, mats["service"], segments=20,
                bevel_m=0.028, **_common_meta(recipe, "service", wear_driver=f"{variant}-course-joint"),
            ))
        for seam, offset in enumerate(seam_offsets[variant]):
            angle = math.radians(base_heading + offset)
            outward = (math.cos(angle), 0.0, math.sin(angle))
            seam_center = _v_add(pad_center, _v_mul(outward, 3.69))
            seam_center = _v_add(seam_center, (0.0, -0.38, 0.0))
            role = "docking" if variant in {"freight", "maintenance"} and seam == 0 else "mechanical"
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}PadAxialSeam_{variant}_{seam}", seam_center,
                (0.24 if role == "mechanical" else 0.34, 1.22, 0.17), outward, mats[role],
                bevel_m=0.025, **_common_meta(recipe, role, wear_driver=f"{variant}-access-seam"),
            ))
        for foot_side in (-1.0, 1.0):
            foot_center = _v_add(pad_center, _v_mul(tangent, foot_side * 1.65))
            foot_center = _v_add(foot_center, (0.0, -1.27, 0.0))
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}PadLoadFoot_{variant}_{'L' if foot_side < 0 else 'R'}",
                foot_center, (0.82, 0.54, 1.36), radial, mats["docking"], bevel_m=0.07,
                **_common_meta(recipe, "docking", wear_driver="load-transfer-and-contact"),
            ))
    return made


def _build_docking_contact_system(ctx: dict[str, Any], recipe: AssemblyRecipe) -> list[Any]:
    bpy_module, collection, mats = ctx["bpy"], ctx["collection"], ctx["materials"]
    made = []
    for arm in range(int(recipe.parameters["arms"])):
        radial = _cardinal(arm)
        made.append(_trapezoid_deck(
            bpy_module, collection, f"{OBJECT_PREFIX}DockContactLane_{arm}", radial,
            7.2, 13.2, 2.55, 1.75, 1.49, 0.075, mats["docking"], bevel_m=0.018,
            **_common_meta(recipe, "docking", wear_driver="traffic-direction-and-contact"),
        ))
        for side in (-1.0, 1.0):
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}CaptureShoe_{arm}_{'L' if side < 0 else 'R'}",
                _radial_center(radial, 17.55, 0.72, side * 2.15), (0.92, 0.72, 1.62), radial, mats["docking"],
                bevel_m=0.08, **_common_meta(recipe, "docking", wear_driver="sacrificial-contact"),
            ))
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}CaptureJaw_{arm}_{'L' if side < 0 else 'R'}",
                _radial_center(radial, 18.15, 0.88, side * 2.15), (0.54, 0.46, 0.78), radial, mats["mechanical"],
                bevel_m=0.045, **_common_meta(recipe, "mechanical", wear_driver="actuator-contact"),
            ))
        # Enclose the original continuous cyan identity rail inside an opaque, maintained
        # channel.  Only small, shielded cyan lamps remain visible on the housing.
        tangent, up, normal = _radial_frame(radial)
        channel_center = _radial_center(radial, 8.0, 2.60)
        made.append(_cuboid(
            bpy_module, collection, f"{OBJECT_PREFIX}SignalChannelHousing_{arm}", channel_center,
            (0.42, 0.38, 12.30), (tangent, up, normal), mats["service"], bevel_m=0.055,
            **_common_meta(recipe, "service", wear_driver="maintained-wayfinding-channel"),
        ))
        for lip_side in (-1.0, 1.0):
            lip_center = _v_add(channel_center, _v_mul(tangent, lip_side * 0.255))
            made.append(_cuboid(
                bpy_module, collection, f"{OBJECT_PREFIX}SignalChannelLip_{arm}_{'L' if lip_side < 0 else 'R'}",
                lip_center, (0.09, 0.44, 12.42), (tangent, up, normal), mats["armor_dark"], bevel_m=0.022,
                **_common_meta(recipe, "armor_dark", wear_driver="recess-edge"),
            ))
        lamp_count = int(recipe.parameters["signal_lamps_per_arm"])
        for lamp in range(lamp_count):
            radius = 4.85 + lamp * (6.30 / max(1, lamp_count - 1))
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}ShieldedGuideLamp_{arm}_{lamp}",
                _radial_center(radial, radius, 2.825), (0.22, 0.075, 0.32), radial, mats["accent"],
                bevel_m=0.014, **_common_meta(recipe, "accent", lods=("lod0", "lod1")),
            ))
        # Approach bars are abraded physical inlays.  Amber is confined to two tiny state lamps.
        for marker in range(3):
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}ApproachBar_{arm}_{marker}",
                _radial_center(radial, 8.45 + marker * 1.55, 1.545), (1.18, 0.055, 0.16), radial, mats["marking"],
                bevel_m=0.01, **_common_meta(recipe, "marking", wear_driver="approach-footfall", lods=("lod0", "lod1")),
            ))
        for state_lamp, radius in enumerate((7.65, 12.25)):
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}ApproachStateLamp_{arm}_{state_lamp}",
                _radial_center(radial, radius, 1.61, -0.82), (0.22, 0.07, 0.18), radial, mats["warm"],
                bevel_m=0.012, **_common_meta(recipe, "warm", lods=("lod0", "lod1")),
            ))
    return made


def _build_thermal_rejection(ctx: dict[str, Any], recipe: AssemblyRecipe) -> list[Any]:
    bpy_module, collection, mats = ctx["bpy"], ctx["collection"], ctx["materials"]
    made = []
    for quadrant in range(int(recipe.parameters["quadrants"])):
        angle = math.radians(45.0 + quadrant * 90.0)
        radial = (math.cos(angle), 0.0, math.sin(angle))
        zone = recipe.parameters["thermal_zones"][quadrant]
        zone_id = str(zone["id"])
        center_y = {"habitation": 7.55, "freight": 7.35, "utilities": 7.72}[zone_id]
        fin_height = {"habitation": 2.04, "freight": 2.34, "utilities": 1.82}[zone_id]
        center = _radial_center(radial, 4.91, center_y)
        tangent, up, normal = _radial_frame(radial)
        # Four mid-value frame members replace the previous plain brown backing slab.
        for frame_side in (-1.0, 1.0):
            side_center = _v_add(center, _v_mul(tangent, frame_side * 1.34))
            frame = _cuboid(
                bpy_module, collection, f"{OBJECT_PREFIX}RadiatorFrameSide_{zone_id}_{quadrant}_{frame_side:+.0f}",
                side_center, (0.18, fin_height + 0.40, 0.30), (tangent, up, normal), mats["service"],
                bevel_m=0.025, **_common_meta(recipe, "service", wear_driver=f"{zone_id}-frame-access"),
            )
            frame["sf_thermal_zone"] = zone_id
            made.append(frame)
        for frame_edge in (-1.0, 1.0):
            edge_center = _v_add(center, _v_mul(up, frame_edge * (fin_height * 0.5 + 0.12)))
            frame = _cuboid(
                bpy_module, collection, f"{OBJECT_PREFIX}RadiatorFrameRail_{zone_id}_{quadrant}_{frame_edge:+.0f}",
                edge_center, (2.86, 0.18, 0.30), (tangent, up, normal), mats["service"],
                bevel_m=0.025, **_common_meta(recipe, "service", wear_driver=f"{zone_id}-frame-access"),
            )
            frame["sf_thermal_zone"] = zone_id
            made.append(frame)
        fin_offsets = tuple(float(value) for value in zone["fin_offsets_m"])
        fin_width = 0.15 if len(fin_offsets) >= 8 else 0.19
        for fin, tangent_offset in enumerate(fin_offsets):
            fin_center = _v_add(center, _v_mul(_radial_frame(radial)[0], tangent_offset))
            fin_center = _v_add(fin_center, _v_mul(radial, 0.17))
            fin_obj = _oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}RadiatorFin_{quadrant}_{fin}", fin_center,
                (fin_width, fin_height, 0.34), radial, mats["radiator"], bevel_m=0.014,
                **_common_meta(recipe, "radiator", wear_driver=f"{zone_id}-thermal-cycling"),
            )
            fin_obj["sf_thermal_zone"] = zone_id
            made.append(fin_obj)
        # Four offset mounts make the air gap and load path visible at medium distance.
        for mount_y in (-0.72, 0.72):
            for mount_tangent in (-1.05, 1.05):
                start = _v_add(_radial_center(radial, 4.22, center_y + mount_y), _v_mul(tangent, mount_tangent))
                end = _v_add(_radial_center(radial, 4.77, center_y + mount_y), _v_mul(tangent, mount_tangent))
                mount = _beam(
                    bpy_module, collection, f"{OBJECT_PREFIX}RadiatorMount_{zone_id}_{quadrant}_{mount_y:+.2f}_{mount_tangent:+.2f}",
                    start, end, 0.12, mats["mechanical"], sides=10, bevel_m=0.0,
                    **_common_meta(recipe, "mechanical", wear_driver="shielded-contact"),
                )
                mount["sf_thermal_zone"] = zone_id
                made.append(mount)
        for edge in (-1.0, 1.0):
            manifold = _beam(
                bpy_module, collection, f"{OBJECT_PREFIX}RadiatorManifold_{quadrant}_{edge}",
                _v_add(_v_add(center, _v_mul(tangent, edge * 1.18)), (0.0, -fin_height * 0.45, 0.0)),
                _v_add(_v_add(center, _v_mul(tangent, edge * 1.18)), (0.0, fin_height * 0.45, 0.0)),
                0.145, mats["docking"], sides=12, bevel_m=0.0,
                **_common_meta(recipe, "docking", wear_driver=f"{zone_id}-manifold-service"),
            )
            manifold["sf_thermal_zone"] = zone_id
            made.append(manifold)
        feed = _beam(
            bpy_module, collection, f"{OBJECT_PREFIX}RadiatorFeed_{zone_id}_{quadrant}",
            _radial_center(radial, 4.18, center_y - fin_height * 0.42),
            _radial_center(radial, 4.94, center_y - fin_height * 0.42),
            0.16, mats["mechanical"], sides=12, bevel_m=0.0,
            **_common_meta(recipe, "mechanical", wear_driver=f"{zone_id}-fluid-feed"),
        )
        feed["sf_thermal_zone"] = zone_id
        made.append(feed)

    # Two opposing utility arms carry top-facing deployable thermal blankets.  Their
    # broad copper response remains legible from the normal elevated game camera,
    # while the outboard placement keeps the central approach lanes unobstructed.
    for arm in (1, 3):
        radial = _cardinal(arm)
        tangent, up, _normal = _radial_frame(radial)
        for side in (-1.0, 1.0):
            center = _v_add(_radial_center(radial, 10.6, 2.02), _v_mul(tangent, side * 2.72))
            blanket = _cuboid(
                bpy_module, collection, f"{OBJECT_PREFIX}UtilityThermalBlanket_{arm}_{'L' if side < 0 else 'R'}",
                center, (2.26, 4.35, 0.16), (tangent, radial, up), mats["radiator"], bevel_m=0.025,
                **_common_meta(recipe, "radiator", wear_driver="utility-arm-thermal-cycling", lods=("lod0", "lod1")),
            )
            blanket["sf_thermal_zone"] = "utility-arm"
            made.append(blanket)
            for rib in (-0.72, -0.24, 0.24, 0.72):
                rib_center = _v_add(center, _v_mul(tangent, rib))
                made.append(_cuboid(
                    bpy_module, collection, f"{OBJECT_PREFIX}UtilityThermalRib_{arm}_{side:+.0f}_{rib:+.2f}",
                    _v_add(rib_center, _v_mul(up, 0.105)), (0.08, 4.42, 0.10),
                    (tangent, radial, up), mats["service"], bevel_m=0.012,
                    **_common_meta(recipe, "service", wear_driver="thermal-blanket-frame", lods=("lod0", "lod1")),
                ))
            for edge in (-1.0, 1.0):
                edge_center = _v_add(center, _v_mul(radial, edge * 2.14))
                made.append(_cuboid(
                    bpy_module, collection, f"{OBJECT_PREFIX}UtilityThermalEdge_{arm}_{side:+.0f}_{edge:+.0f}",
                    _v_add(edge_center, _v_mul(up, 0.105)), (2.36, 0.09, 0.10),
                    (tangent, radial, up), mats["service"], bevel_m=0.012,
                    **_common_meta(recipe, "service", wear_driver="thermal-blanket-frame", lods=("lod0", "lod1")),
                ))
    return made


def _build_inhabited_window_bays(ctx: dict[str, Any], recipe: AssemblyRecipe) -> list[Any]:
    bpy_module, collection, mats = ctx["bpy"], ctx["collection"], ctx["materials"]
    made = []
    count = int(recipe.parameters["windows_per_bank"])
    for deck, y in enumerate(recipe.parameters["decks"]):
        for face in range(int(recipe.parameters["faces"])):
            radial = _cardinal(face)
            tangent = _radial_frame(radial)[0]
            for window in range(count):
                offset = (window - (count - 1) * 0.5) * 0.84
                center = _v_add(_radial_center(radial, 4.34, float(y)), _v_mul(tangent, offset))
                made.append(_oriented_box(
                    bpy_module, collection, f"{OBJECT_PREFIX}HabWindow_{deck}_{face}_{window}", center,
                    (0.66, 0.64, 0.09), radial, mats["window"], bevel_m=0.025,
                    **_common_meta(recipe, "window", wear_driver="light-scuffing"),
                ))
            bank_center = _radial_center(radial, 4.46, float(y) + 0.46)
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}HabSunBrow_{deck}_{face}", bank_center,
                (2.78, 0.15, 0.30), radial, mats["armor"], bevel_m=0.025,
                **_common_meta(recipe, "armor", wear_driver="exposed-leading-edge"),
            ))
            for jamb in (-1.0, 1.0):
                jamb_center = _v_add(_radial_center(radial, 4.43, float(y)), _v_mul(tangent, jamb * 1.34))
                made.append(_oriented_box(
                    bpy_module, collection, f"{OBJECT_PREFIX}HabJamb_{deck}_{face}_{'L' if jamb < 0 else 'R'}", jamb_center,
                    (0.12, 0.98, 0.16), radial, mats["mechanical"], bevel_m=0.015,
                    **_common_meta(recipe, "mechanical", wear_driver="window-recess"),
                ))
    return made


GLYPH_SEGMENTS: Mapping[str, tuple[tuple[float, float, float, float], ...]] = {
    "H": ((-0.32, 0.0, 0.12, 0.86), (0.32, 0.0, 0.12, 0.86), (0.0, 0.0, 0.58, 0.12)),
    "1": ((0.0, 0.0, 0.12, 0.86), (-0.12, 0.33, 0.24, 0.12)),
    "2": ((0.0, 0.37, 0.58, 0.12), (0.24, 0.18, 0.12, 0.34),
          (0.0, 0.0, 0.58, 0.12), (-0.24, -0.18, 0.12, 0.34), (0.0, -0.37, 0.58, 0.12)),
    "3": ((0.0, 0.37, 0.58, 0.12), (0.24, 0.18, 0.12, 0.34),
          (0.0, 0.0, 0.58, 0.12), (0.24, -0.18, 0.12, 0.34), (0.0, -0.37, 0.58, 0.12)),
    "4": ((-0.24, 0.20, 0.12, 0.40), (0.24, 0.0, 0.12, 0.86), (0.0, 0.0, 0.58, 0.12)),
}


def _glyph(
    bpy_module: Any,
    collection: Any,
    prefix: str,
    glyph: str,
    center: Sequence[float],
    radial: Sequence[float],
    material: Any,
    recipe: AssemblyRecipe,
) -> list[Any]:
    tangent, up, normal = _radial_frame(radial)
    made = []
    for index, (u, v, width, height) in enumerate(GLYPH_SEGMENTS[glyph]):
        segment_center = _v_add(_v_add(center, _v_mul(tangent, u)), _v_mul(up, v))
        made.append(_cuboid(
            bpy_module, collection, f"{prefix}_{index}", segment_center, (width, height, 0.055),
            (tangent, up, normal), material, bevel_m=0.012,
            **_common_meta(recipe, "marking", wear_driver="exposed-signage-face"),
        ))
    return made


def _build_orientation_signage(ctx: dict[str, Any], recipe: AssemblyRecipe) -> list[Any]:
    bpy_module, collection, mats = ctx["bpy"], ctx["collection"], ctx["materials"]
    made = []
    for arm, bay in enumerate(recipe.parameters["bay_labels"]):
        radial = _cardinal(arm)
        board_center = _radial_center(radial, 4.42, 4.88)
        made.append(_oriented_box(
            bpy_module, collection, f"{OBJECT_PREFIX}WayfindingBoard_{arm}", board_center,
            (2.05, 1.25, 0.12), radial, mats["service"], bevel_m=0.045,
            **_common_meta(recipe, "service", wear_driver="maintenance-access"),
        ))
        tangent = _radial_frame(radial)[0]
        made.extend(_glyph(
            bpy_module, collection, f"{OBJECT_PREFIX}HeliosMark_{arm}", "H",
            _v_add(_v_add(board_center, _v_mul(tangent, -0.49)), _v_mul(radial, 0.095)),
            radial, mats["marking"], recipe,
        ))
        made.extend(_glyph(
            bpy_module, collection, f"{OBJECT_PREFIX}BayNumber_{arm}", str(bay),
            _v_add(_v_add(board_center, _v_mul(tangent, 0.49)), _v_mul(radial, 0.098)),
            radial, mats["marking"], recipe,
        ))
        made.append(_oriented_box(
            bpy_module, collection, f"{OBJECT_PREFIX}WayfindingStateLamp_{arm}",
            _v_add(_v_add(board_center, _v_mul(tangent, 0.90)), _v_mul(radial, 0.102)),
            (0.13, 0.13, 0.08), radial, mats["accent"], bevel_m=0.012,
            **_common_meta(recipe, "accent", lods=("lod0", "lod1")),
        ))
    return made


def _build_maintenance_access(ctx: dict[str, Any], recipe: AssemblyRecipe) -> list[Any]:
    bpy_module, collection, mats = ctx["bpy"], ctx["collection"], ctx["materials"]
    made = []
    for face in range(int(recipe.parameters["airlocks"])):
        radial = _cardinal(face)
        tangent = _radial_frame(radial)[0]
        for leaf in (-1.0, 1.0):
            center = _v_add(_radial_center(radial, 5.66, 1.45), _v_mul(tangent, leaf * 0.40))
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}PressureDoor_{face}_{'L' if leaf < 0 else 'R'}", center,
                (0.74, 2.10, 0.10), radial, mats["service"], bevel_m=0.035,
                **_common_meta(recipe, "service", wear_driver="frequent-touch-and-seal"),
            ))
        for jamb in (-1.0, 1.0):
            center = _v_add(_radial_center(radial, 5.72, 1.45), _v_mul(tangent, jamb * 0.88))
            made.append(_oriented_box(
                bpy_module, collection, f"{OBJECT_PREFIX}DoorJamb_{face}_{'L' if jamb < 0 else 'R'}", center,
                (0.14, 2.40, 0.18), radial, mats["mechanical"], bevel_m=0.022,
                **_common_meta(recipe, "mechanical", wear_driver="seal-recess"),
            ))
        made.append(_oriented_box(
            bpy_module, collection, f"{OBJECT_PREFIX}DoorHeader_{face}", _radial_center(radial, 5.72, 2.64),
            (1.90, 0.18, 0.18), radial, mats["armor_dark"], bevel_m=0.02,
            **_common_meta(recipe, "armor_dark", wear_driver="recess-accumulation"),
        ))
        made.append(_oriented_box(
            bpy_module, collection, f"{OBJECT_PREFIX}DoorControl_{face}",
            _v_add(_radial_center(radial, 5.74, 1.65), _v_mul(tangent, 1.12)),
            (0.22, 0.34, 0.12), radial, mats["warm"], bevel_m=0.018,
            **_common_meta(recipe, "warm", lods=("lod0",)),
        ))
        hatch_center = _radial_center(radial, 10.1, 1.50, -1.45)
        tangent, up, normal = _radial_frame(radial)
        made.append(_cuboid(
            bpy_module, collection, f"{OBJECT_PREFIX}ArmAccessHatch_{face}", hatch_center,
            (1.20, 0.07, 1.65), (tangent, up, normal), mats["service"], bevel_m=0.025,
            **_common_meta(recipe, "service", wear_driver="maintenance-footfall", lods=("lod0", "lod1")),
        ))
    return made


def _build_service_routes(ctx: dict[str, Any], recipe: AssemblyRecipe) -> list[Any]:
    bpy_module, collection, mats = ctx["bpy"], ctx["collection"], ctx["materials"]
    made = []
    pipe_radius = float(recipe.parameters["pipe_diameter_m"]) * 0.5
    for arm in recipe.parameters["routed_arms"]:
        radial = _cardinal(int(arm))
        tangent = _radial_frame(radial)[0]
        for lane in (-1.0, 1.0):
            start = _v_add(_radial_center(radial, 4.9, -1.34), _v_mul(tangent, lane * 1.02))
            end = _v_add(_radial_center(radial, 13.4, -1.34), _v_mul(tangent, lane * 1.02))
            made.append(_beam(
                bpy_module, collection, f"{OBJECT_PREFIX}UtilityPipe_{arm}_{'L' if lane < 0 else 'R'}",
                start, end, pipe_radius, mats["mechanical"], sides=12, bevel_m=0.0,
                **_common_meta(recipe, "mechanical", wear_driver="underside-accumulation"),
            ))
            for clamp_index, radius in enumerate((6.0, 8.6, 11.2, 13.0)):
                clamp_center = _v_add(_radial_center(radial, radius, -1.34), _v_mul(tangent, lane * 1.02))
                made.append(_oriented_box(
                    bpy_module, collection, f"{OBJECT_PREFIX}PipeClamp_{arm}_{'L' if lane < 0 else 'R'}_{clamp_index}",
                    clamp_center, (0.34, 0.34, 0.18), radial, mats["service"], bevel_m=0.018,
                    **_common_meta(recipe, "service", wear_driver="underside-accumulation"),
                ))
        made.append(_oriented_box(
            bpy_module, collection, f"{OBJECT_PREFIX}ExpansionJoint_{arm}", _radial_center(radial, 9.8, -1.34),
            (2.55, 0.48, 0.44), radial, mats["docking"], bevel_m=0.025,
            **_common_meta(recipe, "docking", wear_driver="thermal-expansion-contact", lods=("lod0",)),
        ))
        made.append(_oriented_box(
            bpy_module, collection, f"{OBJECT_PREFIX}ExpansionJointMarker_{arm}",
            _radial_center(radial, 9.8, -1.07, -0.62), (0.24, 0.06, 0.16), radial, mats["warm"],
            bevel_m=0.01, **_common_meta(recipe, "warm", lods=("lod0",)),
        ))
    return made


def _build_human_scale_safety(ctx: dict[str, Any], recipe: AssemblyRecipe) -> list[Any]:
    bpy_module, collection, mats = ctx["bpy"], ctx["collection"], ctx["materials"]
    made = []
    rail_y = 1.48
    height = float(recipe.parameters["rail_height_m"])
    # Rails stay off the approach centerline; each occupies a lateral edge of two primary docks.
    for arm in (0, 2):
        radial = _cardinal(arm)
        tangent = _radial_frame(radial)[0]
        for side in (-1.0, 1.0):
            posts = []
            for post_index, radius in enumerate((9.0, 10.8, 12.6, 14.4)):
                base = _v_add(_radial_center(radial, radius, rail_y), _v_mul(tangent, side * 2.05))
                top = _v_add(base, (0.0, height, 0.0))
                posts.append(top)
                made.append(_beam(
                    bpy_module, collection, f"{OBJECT_PREFIX}RailPost_{arm}_{side:+.0f}_{post_index}",
                    base, top, 0.055, mats["mechanical"], sides=8, bevel_m=0.0,
                    **_common_meta(recipe, "mechanical"),
                ))
            for index in range(len(posts) - 1):
                made.append(_beam(
                    bpy_module, collection, f"{OBJECT_PREFIX}Handrail_{arm}_{side:+.0f}_{index}",
                    posts[index], posts[index + 1], 0.065, mats["mechanical"], sides=8, bevel_m=0.0,
                    **_common_meta(recipe, "mechanical", wear_driver="hand-contact"),
                ))
            kick_center = _v_add(_radial_center(radial, 11.7, rail_y + 0.10), _v_mul(tangent, side * 2.05))
            made.append(_cuboid(
                bpy_module, collection, f"{OBJECT_PREFIX}KickPlate_{arm}_{side:+.0f}", kick_center,
                (0.10, 0.20, 5.65), (tangent, (0.0, 1.0, 0.0), radial), mats["service"], bevel_m=0.015,
                **_common_meta(recipe, "service", wear_driver="foot-contact"),
            ))

    # One vertical service ladder on the sheltered side of the central tower.
    radial = _cardinal(1)
    tangent = _radial_frame(radial)[0]
    for side in (-1.0, 1.0):
        center = _v_add(_radial_center(radial, 4.58, 5.3), _v_mul(tangent, side * 0.34))
        made.append(_beam(
            bpy_module, collection, f"{OBJECT_PREFIX}LadderRail_{'L' if side < 0 else 'R'}",
            _v_add(center, (0.0, -1.6, 0.0)), _v_add(center, (0.0, 1.6, 0.0)),
            0.045, mats["mechanical"], sides=8, bevel_m=0.0, **_common_meta(recipe, "mechanical"),
        ))
    for rung, y in enumerate(tuple(3.7 + index * 0.32 for index in range(11))):
        center = _radial_center(radial, 4.62, y)
        made.append(_beam(
            bpy_module, collection, f"{OBJECT_PREFIX}LadderRung_{rung}",
            _v_add(center, _v_mul(tangent, -0.34)), _v_add(center, _v_mul(tangent, 0.34)),
            0.035, mats["mechanical"], sides=8, bevel_m=0.0,
            **_common_meta(recipe, "mechanical", wear_driver="hand-and-boot-contact"),
        ))
    return made


BUILDERS: Mapping[str, Callable[[dict[str, Any], AssemblyRecipe], list[Any]]] = {
    "shell_articulation": _build_shell_articulation,
    "docking_contact_system": _build_docking_contact_system,
    "thermal_rejection": _build_thermal_rejection,
    "inhabited_window_bays": _build_inhabited_window_bays,
    "orientation_signage": _build_orientation_signage,
    "maintenance_access": _build_maintenance_access,
    "service_routes": _build_service_routes,
    "human_scale_safety": _build_human_scale_safety,
}


def _object_world_runtime_bounds(objects: Iterable[Any]) -> dict[str, list[float]]:
    points: list[tuple[float, float, float]] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            blender = obj.matrix_world @ vertex.co
            points.append((float(blender.x), float(blender.z), float(-blender.y)))
    if not points:
        return {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0]}
    return {
        "min": [min(point[axis] for point in points) for axis in range(3)],
        "max": [max(point[axis] for point in points) for axis in range(3)],
    }


def apply_golden_station(
    bpy_module: Any,
    *,
    parent_collection: Any | None = None,
    require_distinct_pbr_roles: bool = True,
) -> dict[str, Any]:
    """Replace this recipe's prior output and author one deterministic Helios detail layer.

    The function intentionally does not save, export, or rebuild LODs.  New geometry is
    collection-idempotent.  The only existing-object mutation is a reversible, parity-checked
    per-face material rebind on the twelve exact audited Quaternius donor-trim objects.
    """
    validation = validate_recipe_contracts()
    if not validation["ok"]:
        raise RuntimeError(f"invalid {RECIPE_ID} contract: {validation['errors']}")

    collection = _ensure_collection(bpy_module, parent_collection)
    coated_structural_receipt = _ensure_coated_structural_material(bpy_module)
    materials: dict[str, Any] = {}
    material_bindings: dict[str, str] = {}
    for role in validation["materialRoles"]:
        material, name = _find_material(bpy_module, role)
        materials[role] = material
        material_bindings[role] = name
    generic_fallbacks = {
        role: name
        for role, name in material_bindings.items()
        if role in REQUIRED_DISTINCT_PBR_ROLES and name != MATERIAL_ALIASES[role][0]
    }
    if require_distinct_pbr_roles and generic_fallbacks:
        raise RuntimeError(
            f"{RECIPE_ID}: distinct PBR station roles are not bound: {generic_fallbacks}; "
            "run the Helios surface-remaster role binding before this geometry recipe"
        )

    donor_trim_rebind = _rebind_donor_trim_objects(bpy_module, materials)
    legacy_signal_rebind = _subdue_legacy_docking_signal_rails(bpy_module, materials["service"])

    ctx = {"bpy": bpy_module, "collection": collection, "materials": materials}
    objects: list[Any] = []
    by_assembly: dict[str, int] = {}
    for recipe in ASSEMBLY_RECIPES:
        generated = BUILDERS[recipe.builder](ctx, recipe)
        by_assembly[recipe.id] = len(generated)
        objects.extend(generated)

    bpy_module.context.view_layer.update()
    by_role = Counter(str(obj.get("sf_surface_role", "unknown")) for obj in objects)
    by_lod_membership = Counter(str(obj.get("sf_lod_membership", "")) for obj in objects)
    modifier_counts = Counter(modifier.type for obj in objects for modifier in obj.modifiers)
    report = {
        "schema": REPORT_SCHEMA,
        "recipeId": RECIPE_ID,
        "status": "authored_candidate_requires_blender_and_game_review",
        "collection": COLLECTION_NAME,
        "objectPrefix": OBJECT_PREFIX,
        "objectCount": len(objects),
        "objects": [obj.name for obj in objects],
        "objectsByAssembly": dict(sorted(by_assembly.items())),
        "objectsByMaterialRole": dict(sorted(by_role.items())),
        "objectsByLodMembership": dict(sorted(by_lod_membership.items())),
        "modifierCounts": dict(sorted(modifier_counts.items())),
        "materialBindings": material_bindings,
        "genericMaterialFallbacks": generic_fallbacks,
        "coatedStructuralCandidate": coated_structural_receipt,
        "donorRoleBlocker": DONOR_ROLE_BLOCKER,
        "donorTrimRebind": donor_trim_rebind,
        "legacyDockingSignalRebind": legacy_signal_rebind,
        "materialResponseGuidance": MATERIAL_RESPONSE_GUIDANCE,
        "controllerSurfaceFoundryReceipt": {
            "affectedRoles": (
                "coated_structural", "armor", "armor_dark", "mechanical", "radiator", "docking", "service",
            ),
            "emissiveRoles": ("accent", "warm"),
            "blockingRole": None if coated_structural_receipt["dedicatedFoundryMaps"] else "coated_structural",
            "requiredTextureSet": ("basecolor", "normal", "orm:R=AO,G=roughness,B=metallic"),
            "requiredSourceChange": (
                "retain the dedicated structure_light base/normal/ORM set on SF_StructuralLight_PBR "
                "and preserve the reported functional-zone face split through LOD construction"
            ),
            "acceptance": (
                "all twelve donor objects retain lod0/lod1/lod2 parity; structural shell is mid-value, "
                "nonuniform in roughness, and visually separate from contact, service, and machinery faces"
            ),
        },
        "runtimeBoundsM": _object_world_runtime_bounds(objects),
        "sourceMacroBoundsM": RUNTIME_BOUNDS_M,
        "uvContract": "UVMap; deterministic world-space box projection; 2 metres per tile",
        "transformContract": "identity object transforms; geometry authored in runtime metres then converted to Blender Z-up",
        "idempotenceContract": (
            f"replace collection {COLLECTION_NAME}; restore and deterministically rebind only "
            f"the {len(DONOR_TRIM_EXPECTED_OBJECTS)} named donor-trim LOD objects"
        ),
        "lodContract": "sf_lod_membership is authoritative; sf_close_only remains compatible with the existing builder",
        "orientationWearSources": sorted({str(obj.get("sf_wear_driver")) for obj in objects if obj.get("sf_wear_driver") != "none"}),
        "reviewRequirements": list(REVIEW_REQUIREMENTS),
        "knownDefects": [
            "The donor connected-component face split and added collar positions require regenerated Blender and gameplay-camera inspection.",
            "The former continuous cyan docking strip is now a rough service housing; confirm only bounded guide lamps remain emissive from all approaches.",
        ],
        "visualAcceptance": False,
    }
    for scene in bpy_module.data.scenes:
        scene["spacefaceGoldenStationRecipe"] = RECIPE_ID
    collection["spacefaceGoldenStationRecipe"] = RECIPE_ID
    collection["spacefaceGoldenStationReport"] = json.dumps({
        "objectCount": report["objectCount"],
        "objectsByAssembly": report["objectsByAssembly"],
        "materialBindings": report["materialBindings"],
    }, sort_keys=True)
    return report


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-blend", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args(list(argv))


def _main() -> int:
    # Blender passes script options after `--`; keep normal-Python import/check dependency-free.
    import bpy  # type: ignore

    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = _parse_args(tail)
    source = Path(bpy.data.filepath).resolve()
    output = args.output_blend.resolve()
    if not source.is_file():
        raise RuntimeError("open an explicit Helios production blend before applying the recipe")
    if source == output:
        raise RuntimeError("non-destructive contract: --output-blend must differ from the opened source blend")
    parent = bpy.data.collections.get("AUTHORING")
    report = apply_golden_station(bpy, parent_collection=parent)
    report["sourceBlend"] = str(source)
    report["sourceBlendSha256"] = _sha256(source)
    report["candidateBlend"] = str(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    args.report.resolve().parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
    report["candidateBlendSha256"] = _sha256(output)
    report["recipeScriptSha256"] = _sha256(Path(__file__).resolve())
    args.report.resolve().write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "report": str(args.report.resolve()), "candidateBlend": str(output)}))
    return 0


if __name__ == "__main__":
    try:
        status = _main()
    except BaseException:
        # Blender's --python runner otherwise logs a traceback but can still return process
        # status 0.  Flush the actionable traceback before forcing a controller-detectable
        # failure status.  The success receipt in _main is emitted only after save + report.
        traceback.print_exc()
        sys.stderr.flush()
        sys.stdout.flush()
        os._exit(1)
    if status:
        sys.stderr.flush()
        sys.stdout.flush()
        os._exit(int(status))
