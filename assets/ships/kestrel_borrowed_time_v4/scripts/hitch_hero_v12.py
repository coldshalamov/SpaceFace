"""Hitch hero V12: subtract the slab, the skids, the rails, and the glow button.

Cycle 03. The V7 blend still carries Hull_Radiator_Pod_Pair (a 14 m plate),
Landing_Skid_*, V6 radiator cassette bars, and V6_DriveHotCore. Those objects
are the P0 read. Hide them so the already-authored V6 sponson sections and
drive vanes can be seen, then put a dark throat where the sticker was.
"""
from __future__ import annotations

import bpy

from hitch_hero_v11 import apply_hitch_hero_v11
from hitch_hero_v10 import _stamp
from material_truth_v6 import (
    _axial_cylinder,
    _materials,
    _profile_prism,
    _root,
    _source,
)


PASS_ID = "kestrel-hitch-hero-v12"
COLLECTION_NAME = "KESTREL_V12_HITCH_CUT"
PREFIX = "V12_"
HIDE_EXACT = {
    "Hull_Radiator_Pod_Pair",
    "Landing_Skid_1",
    "Landing_Skid_-1",
    "V6_RadiatorCassetteBase_Starboard",
    "V6_RadiatorCassetteBase_Port",
    "V6_RadiatorFinPack_Starboard",
    "V6_RadiatorFinPack_Port",
    "V6_DriveHotCore",
    "V6_DriveHotCore_Mesh",
    "V6_DriveHotCore_Mesh.001",
}
HIDE_PREFIXES = (
    "Hull_Radiator_Pod",
    "Landing_Skid",
    "V6_RadiatorCassetteBase",
    "V6_RadiatorFinPack",
    "V6_DriveHotCore",
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


def _hide_named() -> list[str]:
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        base = name.split(".")[0]
        if name in HIDE_EXACT or base in HIDE_EXACT or any(name.startswith(p) or base.startswith(p) for p in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            obj["sf_v12_cut"] = PASS_ID
            hidden.append(name)
    return hidden


def apply_hitch_hero_v12() -> dict:
    prior = apply_hitch_hero_v11()
    hidden = _hide_named()
    collection = _collection()
    materials = _materials()
    dark = materials.get("dark_aperture") or materials["ceramic"]
    ceramic = materials["ceramic"]
    steel = materials["service_steel"]
    objects = []
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}DriveThroat",
        (-13.15, 0.0, 0.05), 0.72, 1.85, dark,
        "active_aperture", "dark exhaust throat",
        segments=16, detail=1, axis="X",
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}DriveThroatInner",
        (-13.55, 0.0, 0.05), 0.42, 1.25, dark,
        "active_aperture", "inner throat cavity",
        segments=14, detail=2, axis="X",
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}DriveFlange",
        (-12.35, 0.0, 0.05), 1.05, 0.16, ceramic,
        "ceramic_isolator", "ceramic throat flange",
        segments=16, detail=1, axis="X",
    )))
    for i in range(8):
        ang = (i / 8.0) * 6.283185
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}TransomSkirt_{i}",
            (-12.05, 1.55 * __import__("math").sin(ang), 0.05 + 1.55 * __import__("math").cos(ang)),
            0.55, 0.42, 0.18, 0.08, 0.06,
            ceramic, "ceramic_isolator",
            "transom heat skirt segment",
            detail=1, bevel=0.006,
        )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}FlangeBoltRing",
        (-12.28, 0.0, 0.05), 1.18, 0.06, steel,
        "structural_metal", "throat flange bolt ring",
        segments=16, detail=2, axis="X",
    )))
    root = _root()
    report = {
        "schema": "spaceface.hitchHero.v12",
        "passId": PASS_ID,
        "prior": prior,
        "hidden": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "cut": [
            "hide Hull_Radiator_Pod_Pair slab",
            "hide Landing_Skid pair",
            "hide V6 radiator cassette bars",
            "hide orange drive core",
            "add dark throat and ceramic transom flange",
        ],
    }
    root["hitchHeroPassV12"] = report
    return report
