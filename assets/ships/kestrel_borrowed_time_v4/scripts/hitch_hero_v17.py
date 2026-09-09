"""Hitch hero V17 / cycle 08: take the roof off the sponson.

Cycle 07 opened the drive but put a hat-section lid over the new wells.
The table camera looks down, so the sponson still read as a sealed board.
Hide that lid, raise open cassette mouths through the deck, and put receding
baffles in the barrel so the teal liner is not a flat disk.
"""
from __future__ import annotations

import math

import bpy

from hitch_hero_v16 import apply_hitch_hero_v16, _open_pipe, _open_well, _stamp
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v17"
COLLECTION_NAME = "KESTREL_V17_OPEN_DECK"
PREFIX = "V17_"
HIDE_PREFIXES = (
    "V16_HatTop_",
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


def _hide_roofs():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def apply_hitch_hero_v17() -> dict:
    prior = apply_hitch_hero_v16()
    hidden = _hide_roofs()
    collection = _collection()
    materials = _materials()
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    radiator = materials["radiator"]
    dark = materials["dark_aperture"]
    ceramic = materials["ceramic"]
    # Receding baffles inside the already-open barrel.
    for i, (x, r) in enumerate(((-12.55, 1.48), (-13.15, 1.18), (-13.75, 0.88), (-14.25, 0.58))):
        objects.append(_open_pipe(
            collection, f"{PREFIX}Baffle_{i}",
            (x, 0.0, 0.05), r, r - 0.08, 0.07, ceramic if i % 2 else steel,
            "ceramic_isolator" if i % 2 else "structural_metal",
            "receding barrel baffle",
            segments=20,
        ))
    # Open cassette mouths that stand above the sponson deck so the table camera looks in.
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        y = 5.20 * sign
        for index, x in enumerate((3.55, 0.35, -2.85, -6.35)):
            name = f"{PREFIX}Cassette_{side}_{index}"
            objects.extend(_open_well(
                collection, name, (x, y, 1.05),
                1.85, 1.15, 0.55, 0.048,
                radiator, "radiator",
                f"{side.lower()} open cassette mouth",
            ))
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Lip",
                (x, y, 1.30), 1.95, 1.22, 1.22, 0.06, 0.06,
                armor, "armor_plate",
                "cassette mouth lip",
                detail=1, bevel=0.006,
            )))
            objects.append(_stamp(_axial_cylinder(
                collection, f"{name}_Core",
                (x, y, 0.88), 0.14, 0.38, steel,
                "structural_metal", "visible well machinery",
                segments=10, detail=2, axis="X",
            )))
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Dark",
                (x, y, 0.78), 1.55, 0.85, 0.85, 0.04, 0.04,
                dark, "active_aperture",
                "cassette depth shadow",
                detail=2, bevel=0.0,
            )))
            # Outboard window so starboard profile is not a sealed rail.
            objects.append(_folded_plate(
                collection, f"{name}_WindowFrame",
                (x - 0.70, 5.92 * sign, 0.35), (x + 0.70, 5.92 * sign, 0.35),
                (x + 0.70, 5.92 * sign, 0.95), (x - 0.70, 5.92 * sign, 0.95),
                0.030, steel, "structural_metal",
                "outboard well window frame",
            ))
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_WindowDark",
                (x, 5.88 * sign, 0.64), 1.20, 0.04, 0.04, 0.48, 0.48,
                dark, "active_aperture",
                "outboard well opening",
                detail=2, bevel=0.0,
            )))
        # Narrow leftover deck strips between cassettes, not a continuous lid.
        for strip_i, x in enumerate((-4.60, -1.25, 1.95)):
            objects.append(_folded_plate(
                collection, f"{PREFIX}DeckStrip_{side}_{strip_i}",
                (x - 0.35, 4.55 * sign, 1.08), (x + 0.35, 4.55 * sign, 1.08),
                (x + 0.35, 5.70 * sign, 1.12), (x - 0.35, 5.70 * sign, 1.12),
                0.032, armor, "armor_plate",
                "short deck strip between cassette mouths",
            ))
    report = {
        "schema": "spaceface.hitchHero.v17",
        "passId": PASS_ID,
        "method": "remove sponson roof; raise open cassette mouths; barrel baffles",
        "priorPass": prior.get("passId") if isinstance(prior, dict) else "v16",
        "hidden": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV17"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenCount": int(len(hidden)),
    }
    return report
