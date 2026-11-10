"""Hitch hero V88 / cycle 79: discrete gapped cone plates.

Cycles 75-78 stacked overlapping sausages. The 3Q still reads one
long cone skin because those courses overlap in X. Hide the bands,
laps, and clips. Rebuild as brickwork plates with 70 mm gaps so the
store-shot sees plate ends. Leave the inspection wells open. No hull
boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v87 import apply_hitch_hero_v87
from hitch_hero_v80 import _rolled_band
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v88"
COLLECTION_NAME = "KESTREL_V88_GAPPED_PLATES"
PREFIX = "V88_"
HIDE_PREFIXES = (
    "V84_Course_",
    "V84_Seam_",
    "V86_Clip_",
    "V87_Lap_",
)

# Non-overlapping X spans. Gaps sit on the inspection wells so those
# cavities stay open. Mid row is staggered for brickwork.
ROWS = (
    (
        "In",
        0.02,
        0.38,
        0.070,
        (
            ("Aft", 2.98, 3.76),
            ("AftMid", 3.83, 4.64),
            ("Mid", 5.16, 5.94),
            ("MidFore", 6.01, 6.80),
            ("Fore", 7.32, 8.10),
            ("ForeOut", 8.17, 8.96),
            ("Nose", 9.48, 10.12),
        ),
    ),
    (
        "Mid",
        0.30,
        0.68,
        0.062,
        (
            ("Aft", 2.63, 3.63),
            ("AftMid", 3.70, 4.70),
            ("Mid", 4.77, 5.77),
            ("MidFore", 5.84, 6.84),
            ("Fore", 6.91, 7.91),
            ("ForeOut", 7.98, 8.98),
            ("Nose", 9.05, 10.12),
        ),
    ),
    (
        "Out",
        0.60,
        0.98,
        0.054,
        (
            ("Aft", 2.18, 2.84),
            ("AftMid", 2.91, 3.56),
            ("Mid", 4.08, 4.88),
            ("MidFore", 4.95, 5.74),
            ("Fore", 6.26, 7.06),
            ("ForeOut", 7.13, 7.92),
            ("NoseA", 8.44, 9.26),
            ("NoseB", 9.33, 10.12),
        ),
    ),
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


def _hide_sausages():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side(collection, materials, sign, side):
    armor = materials["armor"]
    objects = []
    for row_name, t0, t1, thickness, plates in ROWS:
        for plate_name, x0, x1 in plates:
            objects.append(_rolled_band(
                collection, f"{PREFIX}Plate_{side}_{row_name}_{plate_name}",
                x0, x1, t0, t1, sign, thickness, armor, "armor_plate",
                f"{side.lower()} {row_name.lower()} {plate_name.lower()} gapped cone plate",
            ))
    return objects


def apply_hitch_hero_v88() -> dict:
    prior = apply_hitch_hero_v87()
    collection = _collection()
    materials = _materials()
    hidden = _hide_sausages()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v88",
        "passId": PASS_ID,
        "method": "hide overlapping sausages; brickwork plates with 70 mm gaps",
        "priorPass": "v87",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV88"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
