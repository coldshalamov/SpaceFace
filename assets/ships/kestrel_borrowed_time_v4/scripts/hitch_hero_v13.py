"""Hitch hero V13: open the throat. Hide the plates that rebuilt the slab."""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix

from hitch_hero_v12 import apply_hitch_hero_v12
from hitch_hero_v10 import _stamp
from material_truth_v6 import _finish, _materials, _root, _source


PASS_ID = "kestrel-hitch-hero-v13"
COLLECTION_NAME = "KESTREL_V13_OPEN_THROAT"
PREFIX = "V13_"
HIDE_PREFIXES = (
    "V11_SponsonBand",
    "V10_Oleo",
    "V10_OleoRod",
    "V10_Pad",
    "V10_Scissor",
    "V10_DragLink",
    "V10_GearDoor",
    "V12_DriveThroat",
    "V12_DriveThroatInner",
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


def _hide_prefixes() -> list[str]:
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(p) for p in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            obj["sf_v13_cut"] = PASS_ID
            hidden.append(name)
    return hidden


def _open_pipe(collection, name, center, radius, depth, material, bill, function, segments=16):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=False, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius * 0.72, depth=depth,
    )
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(90.0), 4, "Y"), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = center
    return _stamp(_finish(obj, material, bill, function, bevel=0.010, detail=1))


def apply_hitch_hero_v13() -> dict:
    prior = apply_hitch_hero_v12()
    hidden = _hide_prefixes()
    collection = _collection()
    materials = _materials()
    dark = materials.get("dark_aperture") or materials["ceramic"]
    ceramic = materials["ceramic"]
    objects = []
    objects.append(_open_pipe(
        collection, f"{PREFIX}OpenThroat",
        (-13.35, 0.0, 0.05), 0.95, 2.20, dark,
        "active_aperture", "open exhaust throat you can look into",
    ))
    objects.append(_open_pipe(
        collection, f"{PREFIX}OpenThroatInner",
        (-13.55, 0.0, 0.05), 0.62, 1.70, ceramic,
        "ceramic_isolator", "ceramic inner liner",
    ))
    root = _root()
    report = {
        "schema": "spaceface.hitchHero.v13",
        "passId": PASS_ID,
        "prior": prior,
        "hidden": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    root["hitchHeroPassV13"] = report
    return report
