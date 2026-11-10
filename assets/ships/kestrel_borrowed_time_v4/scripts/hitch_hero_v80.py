"""Hitch hero V80 / cycle 71: two overlapping cone bands, no stamp lids.

Cycle 70's hatches read, but they sit as stamps on one wide ribbon.
Hide those lids and the single-band courses. Rebuild as inboard and
outboard lapped bands so the cone is shingled plate. Stay outboard of
the canopy and casemate. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v79 import (
    COURSES,
    apply_hitch_hero_v79,
    _cone_point,
)
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _finish, _materials, _mesh_object, _root, _source

PASS_ID = "kestrel-hitch-hero-v80"
COLLECTION_NAME = "KESTREL_V80_SHINGLE_CONE"
PREFIX = "V80_"
HIDE_PREFIXES = (
    "V79_Course_",
    "V79_Seam_",
    "V79_Hatch_",
)

SEGMENTS_Y = 4
BANDS = (
    ("In", 0.00, 0.58, 0.076),
    ("Out", 0.40, 1.00, 0.060),
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


def _hide_stamps():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _rolled_band(collection, name, x0, x1, t0, t1, sign, thickness, material, bill, function):
    half = float(thickness) * 0.5
    verts = []
    for x in (x0, x1):
        for step in range(SEGMENTS_Y + 1):
            t = t0 + (t1 - t0) * (step / SEGMENTS_Y)
            y, z, ny, nz = _cone_point(x, t, sign)
            verts.append((x, y + ny * half, z + nz * half))
        for step in range(SEGMENTS_Y + 1):
            t = t0 + (t1 - t0) * (step / SEGMENTS_Y)
            y, z, ny, nz = _cone_point(x, t, sign)
            verts.append((x, y - ny * half, z - nz * half))
    ring = SEGMENTS_Y + 1
    faces = []
    for i in range(SEGMENTS_Y):
        faces.append((i, i + 1, 2 * ring + i + 1, 2 * ring + i))
        faces.append((ring + i + 1, ring + i, 3 * ring + i, 3 * ring + i + 1))
        faces.append((i, ring + i, ring + i + 1, i + 1))
        faces.append((2 * ring + i + 1, 3 * ring + i + 1, 3 * ring + i, 2 * ring + i))
    faces.append((0, ring, 3 * ring, 2 * ring))
    faces.append((SEGMENTS_Y, 2 * ring + SEGMENTS_Y, 3 * ring + SEGMENTS_Y, ring + SEGMENTS_Y))
    obj = _mesh_object(collection, name, verts, faces)
    return _stamp(_finish(obj, material, bill, function, bevel=0.005, detail=1))


def _seam(collection, name, x, t0, t1, sign, materials):
    steel = materials["service_steel"]
    a = _cone_point(x - 0.016, t0 + 0.04, sign)
    b = _cone_point(x + 0.016, t0 + 0.04, sign)
    c = _cone_point(x + 0.016, t1 - 0.04, sign)
    d = _cone_point(x - 0.016, t1 - 0.04, sign)
    lift = 0.044
    pts = []
    xs = (x - 0.016, x + 0.016, x + 0.016, x - 0.016)
    for point, xi in zip((a, b, c, d), xs):
        y, z, ny, nz = point
        pts.append((xi, y + ny * lift, z + nz * lift))
    return _folded_plate(
        collection, name,
        pts[0], pts[1], pts[2], pts[3],
        0.032, steel, "structural_metal",
        "upper-cone standing seam",
    )


def _side_armor(collection, materials, sign, side):
    armor = materials["armor"]
    objects = []
    for band_name, t0, t1, thickness in BANDS:
        for name, x0, x1 in COURSES:
            objects.append(_rolled_band(
                collection, f"{PREFIX}Course_{side}_{band_name}_{name}",
                x0, x1, t0, t1, sign, thickness, armor, "armor_plate",
                f"{side.lower()} {band_name.lower()} {name.lower()} shingled cone course",
            ))
            if name != "Nose":
                objects.append(_seam(
                    collection, f"{PREFIX}Seam_{side}_{band_name}_{name}",
                    x1 - 0.04, t0, t1, sign, materials,
                ))
    return objects


def apply_hitch_hero_v80() -> dict:
    prior = apply_hitch_hero_v79()
    collection = _collection()
    materials = _materials()
    hidden = _hide_stamps()
    objects = []
    objects.extend(_side_armor(collection, materials, -1.0, "Port"))
    objects.extend(_side_armor(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v80",
        "passId": PASS_ID,
        "method": "two overlapping rolled cone bands instead of stamp lids",
        "priorPass": "v79",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV80"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
