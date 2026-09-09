"""Hitch hero V18 / cycle 09: empty the holes.

Cycle 08 still failed the two named reads: the teal liner is a disk, and the
new cassettes are boxes with painted dark faces. Hide those fillers. Leave
dark empty throats the table camera can look into.
"""
from __future__ import annotations

import bpy

from hitch_hero_v17 import apply_hitch_hero_v17, _open_well, _stamp
from hitch_hero_v16 import _open_pipe
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v18"
COLLECTION_NAME = "KESTREL_V18_EMPTY_HOLES"
PREFIX = "V18_"
HIDE_PREFIXES = (
    "V16_BarrelLiner",
    "V16_DeepCore",
    "V16_BarrelThroat",
    "V17_Cassette_",
    "V17_Baffle_",
    "V16_Well_",
)
# Keep V17 window frames and deck strips. Hide every cassette lid/box.


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
        if name.startswith("V17_Cassette_") and (
            name.endswith("_WindowFrame") or name.endswith("_WindowDark")
        ):
            continue
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def apply_hitch_hero_v18() -> dict:
    prior = apply_hitch_hero_v17()
    hidden = _hide()
    collection = _collection()
    materials = _materials()
    objects = []
    dark = materials["dark_aperture"]
    ceramic = materials["ceramic"]
    steel = materials["service_steel"]
    # Dark cylindrical tunnel. No bright liner. No candy core on the face.
    objects.append(_open_pipe(
        collection, f"{PREFIX}Tunnel",
        (-13.55, 0.0, 0.05), 1.28, 1.05, 3.10, dark,
        "active_aperture", "empty dark drive tunnel",
        segments=24,
    ))
    objects.append(_open_pipe(
        collection, f"{PREFIX}TunnelInner",
        (-13.85, 0.0, 0.05), 0.82, 0.48, 2.40, dark,
        "active_aperture", "deeper tunnel receding to black",
        segments=20,
    ))
    for i, (x, r) in enumerate(((-12.70, 1.42), (-13.40, 1.12), (-14.10, 0.78))):
        objects.append(_open_pipe(
            collection, f"{PREFIX}Ring_{i}",
            (x, 0.0, 0.05), r, r - 0.06, 0.06, ceramic if i else steel,
            "ceramic_isolator" if i else "structural_metal",
            "receding tunnel ring",
            segments=22,
        ))
    # True open pits in the sponson deck: walls only, dark floor deep down.
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        y = 5.15 * sign
        for index, x in enumerate((3.55, 0.35, -2.85, -6.35)):
            name = f"{PREFIX}Pit_{side}_{index}"
            objects.extend(_open_well(
                collection, name, (x, y, 0.72),
                1.70, 1.05, 0.85, 0.045,
                steel, "structural_metal",
                f"{side.lower()} open sponson pit",
            ))
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Void",
                (x, y, 0.38), 1.40, 0.78, 0.78, 0.06, 0.06,
                dark, "active_aperture",
                "pit void",
                detail=2, bevel=0.0,
            )))
    report = {
        "schema": "spaceface.hitchHero.v18",
        "passId": PASS_ID,
        "method": "empty the drive and sponson holes",
        "hidden": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV18"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenCount": int(len(hidden)),
    }
    return report
