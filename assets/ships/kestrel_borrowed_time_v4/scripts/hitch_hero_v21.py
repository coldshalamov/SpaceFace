"""Hitch hero V21 / cycle 12: hide the DIE LAUGHING card that still lids the sponson."""
from __future__ import annotations

import bpy

from hitch_hero_v20 import apply_hitch_hero_v20
from hitch_hero_v16 import _stamp
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v21"
COLLECTION_NAME = "KESTREL_V21_OPEN_DECK"
PREFIX = "V21_"
HIDE_PREFIXES = (
    "V7_HeroMark_DieLaughing",
    "V6_RadiatorCassetteBase_",
    "V6_RadiatorFinPack_",
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


def apply_hitch_hero_v21() -> dict:
    prior = apply_hitch_hero_v20()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    collection = _collection()
    materials = _materials()
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []
    # Put the stencil on a vertical web so it is not a lid.
    objects.append(_folded_plate(
        collection, f"{PREFIX}NameWeb",
        (-8.20, -5.55, 0.35), (-5.40, -5.55, 0.35),
        (-5.40, -5.55, 1.05), (-8.20, -5.55, 1.05),
        0.035, armor, "armor_plate",
        "vertical name web, not a deck lid",
    ))
    # Extra outboard openings so starboard looks into the pits.
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        for index, x in enumerate((3.55, 0.35, -2.85, -6.35)):
            objects.append(_stamp(_profile_prism(
                collection, f"{PREFIX}PitMouth_{side}_{index}",
                (x, 5.55 * sign, 0.68), 1.35, 0.08, 0.08, 0.62, 0.62,
                steel, "structural_metal",
                "outboard pit mouth with no fill",
                detail=2, bevel=0.004,
            )))
    report = {
        "schema": "spaceface.hitchHero.v21",
        "passId": PASS_ID,
        "method": "hide DIE LAUGHING card; vertical name web; open outboard pit mouths",
        "hidden": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV21"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenCount": int(len(hidden)),
    }
    return report
