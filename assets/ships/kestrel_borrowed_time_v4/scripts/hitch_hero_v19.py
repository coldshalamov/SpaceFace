"""Hitch hero V19 / cycle 10: real empty holes.

Cycle 09 proved the tunnel can recede, but dark_aperture is an emissive
cyan and HOOK_DRIVE_CORE is the orange button. V6 shoulder armor plates
are the remaining sponson lids. Cut those plates, hide the glowing core,
and rebuild the tunnel in non-emissive ceramic.
"""
from __future__ import annotations

import math

import bpy

from hitch_hero_v16 import _boolean_difference, _cut_box, _open_pipe, _stamp
from hitch_hero_v18 import apply_hitch_hero_v18
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v19"
COLLECTION_NAME = "KESTREL_V19_TRUE_HOLES"
PREFIX = "V19_"
HIDE_EXACT = {
    "HOOK_DRIVE_CORE",
    "HOOK_DRIVE_CORE_Mesh",
    "HOOK_DRIVE_CORE_Mesh.001",
}
HIDE_PREFIXES = (
    "HOOK_DRIVE_CORE",
    "V18_Tunnel",
    "V18_Ring_",
    "V16_HouseShell",
    "V16_BarrelOuter",
    "V16_MouthRing",
    "V16_Stator_",
    "V18_Pit_",
)


def _collection():
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


def _hide():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        base = name.split(".")[0]
        if name in HIDE_EXACT or base in HIDE_EXACT:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
            continue
        if any(name.startswith(prefix) or base.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def apply_hitch_hero_v19() -> dict:
    prior = apply_hitch_hero_v18()
    hidden = _hide()
    collection = _collection()
    materials = _materials()
    objects = []
    cuts = []
    ceramic = materials["ceramic"]
    steel = materials["service_steel"]
    armor = materials["armor"]
    # Non-emissive tunnel. Ceramic is gray and does not glow cyan.
    objects.append(_open_pipe(
        collection, f"{PREFIX}Tunnel",
        (-13.60, 0.0, 0.05), 1.35, 1.08, 3.20, ceramic,
        "ceramic_isolator", "non-emissive ceramic tunnel",
        segments=24,
    ))
    objects.append(_open_pipe(
        collection, f"{PREFIX}TunnelDeep",
        (-14.00, 0.0, 0.05), 0.88, 0.42, 2.50, steel,
        "structural_metal", "deep unlit tunnel",
        segments=20,
    ))
    for i, (x, r) in enumerate(((-12.55, 1.55), (-13.25, 1.22), (-13.95, 0.90))):
        objects.append(_open_pipe(
            collection, f"{PREFIX}Ring_{i}",
            (x, 0.0, 0.05), r, r - 0.07, 0.055, steel,
            "structural_metal", "unlit receding ring",
            segments=22,
        ))
    # Punch the remaining V6 shoulder lids so the table camera looks down into pits.
    well_xs = (3.55, 0.35, -2.85, -6.35)
    for obj in list(bpy.data.objects):
        name = obj.name or ""
        if not name.startswith("V6_ShoulderArmor_"):
            continue
        if obj.hide_render:
            continue
        for index, x in enumerate(well_xs):
            sign = 1.0 if "Starboard" in name else -1.0
            ok = _cut_box(
                obj, f"{PREFIX}ArmorCut_{name}_{index}",
                (x, 4.50 * sign, 0.82), (0.85, 0.95, 0.40),
            )
            cuts.append((name, index, ok))
    # Open pits: floor + inboard + fore + aft. NO outboard wall, NO roof.
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        y = 5.05 * sign
        for index, x in enumerate(well_xs):
            name = f"{PREFIX}Pit_{side}_{index}"
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Floor",
                (x, y, 0.28), 1.55, 0.95, 0.95, 0.05, 0.05,
                steel, "structural_metal", "pit floor",
                detail=1, bevel=0.004,
            )))
            objects.append(_folded_plate(
                collection, f"{name}_Inboard",
                (x - 0.75, 4.45 * sign, 0.28), (x + 0.75, 4.45 * sign, 0.28),
                (x + 0.75, 4.45 * sign, 1.05), (x - 0.75, 4.45 * sign, 1.05),
                0.040, armor, "armor_plate",
                "pit inboard wall",
            ))
            objects.append(_folded_plate(
                collection, f"{name}_Fore",
                (x + 0.75, 4.45 * sign, 0.28), (x + 0.75, 5.70 * sign, 0.28),
                (x + 0.75, 5.70 * sign, 1.05), (x + 0.75, 4.45 * sign, 1.05),
                0.040, steel, "structural_metal",
                "pit fore wall",
            ))
            objects.append(_folded_plate(
                collection, f"{name}_Aft",
                (x - 0.75, 4.45 * sign, 0.28), (x - 0.75, 4.45 * sign, 1.05),
                (x - 0.75, 5.70 * sign, 1.05), (x - 0.75, 5.70 * sign, 0.28),
                0.040, steel, "structural_metal",
                "pit aft wall",
            ))
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Pump",
                (x, y, 0.42), 0.55, 0.28, 0.22, 0.18, 0.14,
                steel, "structural_metal", "pump sitting in the open pit",
                detail=2, bevel=0.006,
            )))
    report = {
        "schema": "spaceface.hitchHero.v19",
        "passId": PASS_ID,
        "method": "non-emissive tunnel; cut V6 shoulder lids; pits with no outboard wall",
        "hidden": hidden,
        "booleanCuts": [f"{row[0]}:{row[1]}={row[2]}" for row in cuts],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV19"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenCount": int(len(hidden)),
        "cuts": int(len(cuts)),
    }
    return report
