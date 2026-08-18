"""Hitch hero V11: break the slab-sponson and floating-rail read.

Cycle 02. Applies V10 first. Hides leftover unrooted rails, covers the beam
with overlapping plate bands, and makes landing gear and bow cheeks read at
play size.
"""
from __future__ import annotations

import bpy

from hitch_hero_v10 import apply_hitch_hero_v10, _folded_plate, _stamp
from material_truth_v6 import (
    _axial_cylinder,
    _materials,
    _profile_prism,
    _root,
    _source,
    _strut_between,
)


PASS_ID = "kestrel-hitch-hero-v11"
COLLECTION_NAME = "KESTREL_V11_HITCH_HERO"
PREFIX = "V11_"
HIDE_NAME_PARTS = (
    "GrabRail",
    "Radiator_Lip",
    "ShoulderEdgeRail",
    "CanopyRail_Port",
    "CanopyRail_Starboard",
)


def _collection() -> bpy.types.Collection:
    source = _source()
    prior = bpy.data.collections.get(COLLECTION_NAME)
    if prior is not None:
        for obj in list(prior.all_objects):
            data = obj.data
            obj_type = obj.type
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


def _hide_unrooted_rails() -> list[str]:
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(part in name for part in HIDE_NAME_PARTS):
            obj.hide_render = True
            obj.hide_set(True)
            obj["sf_v11_replaced"] = PASS_ID
            hidden.append(name)
    return hidden


def _build_sponson_bands(collection, materials):
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        bands = (
            (8.40, 2.6, 0.95, 0.22),
            (5.60, 3.1, 1.15, 0.26),
            (2.40, 3.4, 1.25, 0.28),
            (-0.80, 3.5, 1.20, 0.26),
            (-4.10, 3.2, 1.10, 0.24),
            (-7.20, 2.7, 0.95, 0.22),
        )
        for i, (x, half, z, thick) in enumerate(bands):
            y0 = 1.55 * sign
            y1 = (1.55 + half) * sign
            objects.append(_folded_plate(
                collection, f"{PREFIX}SponsonBand_{side}_{i}",
                (x + 1.35, y0, z - 0.22), (x - 1.35, y0, z - 0.18),
                (x - 1.35, y1, z + 0.18), (x + 1.35, y1, z + 0.14),
                thick, armor if i % 2 == 0 else steel, "armor_plate",
                "telescoping sponson plate band",
            ))
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}SponsonCleat_{side}_{i}",
                (x, y1 * 0.92, z + 0.08), 0.028, 0.07, steel,
                "structural_metal", "sponson band cleat",
                segments=8, detail=2, axis="Y",
            )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Scupper_{side}",
            (1.10, 2.85 * sign, 0.42), 0.55, 0.22, 0.18, 0.16, 0.12,
            steel, "structural_metal",
            "sponson scupper opening",
            detail=1, bevel=0.006,
        )))
    return objects


def _build_visible_gear(collection, materials):
    objects = []
    steel = materials["service_steel"]
    armor = materials["armor"]
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}GearHouse_{side}",
            (1.55, 1.55 * sign, -1.55), 2.20, 0.55, 0.42, 0.28, 0.22,
            armor, "armor_plate",
            "retract bay / gear house",
            detail=1, bevel=0.010,
        )))
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}MainOleo_{side}",
            (1.55, 1.55 * sign, -2.25), 0.09, 1.15, steel,
            "structural_metal", "main oleo visible at play size",
            segments=12, detail=1, axis="Z",
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}MainPad_{side}",
            (1.55, 1.55 * sign, -2.95), 0.72, 0.42, 0.32, 0.08, 0.06,
            armor, "armor_plate",
            "main landing pad",
            detail=1, bevel=0.008,
        )))
        objects.append(_stamp(_strut_between(
            collection, f"{PREFIX}MainScissor_{side}",
            (2.15, 1.25 * sign, -1.85), (1.55, 1.55 * sign, -2.55),
            0.03, steel, "structural_metal",
            "visible torque link",
        )))
    return objects


def _build_bow_cheeks(collection, materials):
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}BowCheek_{side}",
            (12.40, 0.35 * sign, -0.15), (9.20, 1.55 * sign, -0.05),
            (9.20, 1.55 * sign, 0.95), (12.40, 0.35 * sign, 0.85),
            0.055, armor, "armor_plate",
            "bow cheek armor course",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}BowHardpoint_{side}",
            (11.10, 0.95 * sign, 0.35), 0.42, 0.22, 0.18, 0.16, 0.12,
            steel, "structural_metal",
            "bow hardpoint for the weapon spine",
            detail=1, bevel=0.006,
        )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}KeelRam",
        (11.80, 0.0, -0.85), 2.20, 0.55, 0.42, 0.18, 0.14,
        armor, "armor_plate",
        "keel ram / icebreaker shoe",
        detail=1, bevel=0.010,
    )))
    return objects


def apply_hitch_hero_v11() -> dict:
    prior = apply_hitch_hero_v10()
    hidden = _hide_unrooted_rails()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_build_sponson_bands(collection, materials))
    objects.extend(_build_visible_gear(collection, materials))
    objects.extend(_build_bow_cheeks(collection, materials))
    root = _root()
    report = {
        "schema": "spaceface.hitchHero.v11",
        "passId": PASS_ID,
        "prior": prior,
        "hiddenRails": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "assemblies": [
            "hide leftover grab/edge rails",
            "six telescoping sponson plate bands per side",
            "play-size oleo houses and pads",
            "bow cheek courses and keel ram",
        ],
    }
    root["hitchHeroPassV11"] = report
    return report
