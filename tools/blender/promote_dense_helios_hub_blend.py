"""Stamp and save the accepted dense Helios hub as canonical Blender authoring sources.

Run with the accepted candidate blend already open. The script adds contract-only helpers and
metadata; it does not modify render geometry, materials, lights, cameras, or accepted evidence.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
FAMILY_BLEND = ROOT / "assets/ships/m4_helios_hub/blender/helios_hub_station_production.blend"
LIVE_BLEND = ROOT / "assets/ships/parts/blender/place_station_trade_hub_authored.blend"
REPORT = ROOT / "assets/ships/m4_helios_dense_candidate/evidence/blend_promotion.json"


def render_bounds() -> tuple[list[float], list[float]]:
    minimum = Vector((float("inf"),) * 3)
    maximum = Vector((float("-inf"),) * 3)
    found = False
    for obj in bpy.data.objects:
        if obj.type not in {"MESH", "CURVE"} or obj.name == "COLLISION_HULL":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, world.x)
            minimum.y = min(minimum.y, world.y)
            minimum.z = min(minimum.z, world.z)
            maximum.x = max(maximum.x, world.x)
            maximum.y = max(maximum.y, world.y)
            maximum.z = max(maximum.z, world.z)
            found = True
    if not found:
        raise RuntimeError("accepted dense hub scene has no render geometry")
    return list(minimum), list(maximum)


minimum, maximum = render_bounds()
size = [maximum[i] - minimum[i] for i in range(3)]
center = [(maximum[i] + minimum[i]) * 0.5 for i in range(3)]
collision_bounds = {"min": minimum, "max": maximum, "size": size, "center": center}

metadata = {
    "contractVersion": 1,
    "assetId": "SF_PLACE_STATION_TRADE_HUB",
    "partId": "place_station_trade_hub",
    "liveId": "place_station_trade_hub",
    "slot": "place",
    "forward": "+X",
    "up": "+Y",
    "starboard": "+Z",
    "unit": "metre",
    "normalConvention": "OpenGL",
    "ormChannels": "R=AO,G=Roughness,B=Metallic",
    "textureCompression": "PNG-source",
    "textureSize": 4096,
    "chamfered": True,
    "bevelRadiusM": 0.05,
    "family": "helios_dense_macro",
    "packet": "M4-HELIOS-HUB-ENV-VISUAL-FAMILY-001",
    "role": "hub_station_focal",
    "title": "Helios Dense Trade Hub",
    "kind": "landmark",
    "deliverableRole": "production_multi_lod",
    "lods": ["lod0", "lod1", "lod2"],
    "wiringStatus": "promoted_live_place",
    "lod0AabbSize": size,
    "collisionBounds": collision_bounds,
}

for scene in bpy.data.scenes:
    scene["spacefaceAsset"] = metadata

socket = bpy.data.objects.get("SOCKET_Structure_Core")
if socket is None:
    socket = bpy.data.objects.new("SOCKET_Structure_Core", None)
    bpy.context.scene.collection.objects.link(socket)
socket.location = center
socket["spaceface"] = {"socket": True, "keep": True, "role": "structure_core"}

collision = bpy.data.objects.get("COLLISION_HULL")
if collision is None:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    collision = bpy.context.object
    collision.name = "COLLISION_HULL"
collision.location = center
collision.dimensions = size
bpy.context.view_layer.objects.active = collision
collision.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
collision.hide_render = True
collision.display_type = "WIRE"
collision["spaceface"] = {
    "collision": True,
    "helper": True,
    "nonRender": True,
    "keep": True,
    "role": "collision",
    "bounds": collision_bounds,
}
collision["collision"] = True
collision["nonRender"] = True

roots = [obj for obj in bpy.data.objects if obj.parent is None and obj not in {socket, collision}]
if roots:
    roots[0]["spacefaceAsset"] = metadata

FAMILY_BLEND.parent.mkdir(parents=True, exist_ok=True)
LIVE_BLEND.parent.mkdir(parents=True, exist_ok=True)
REPORT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(FAMILY_BLEND))
shutil.copy2(FAMILY_BLEND, LIVE_BLEND)

report = {
    "assetId": metadata["assetId"],
    "familyBlend": str(FAMILY_BLEND.relative_to(ROOT)).replace("\\", "/"),
    "liveBlend": str(LIVE_BLEND.relative_to(ROOT)).replace("\\", "/"),
    "renderGeometryChanged": False,
    "contractHelpers": ["SOCKET_Structure_Core", "COLLISION_HULL"],
    "collisionBounds": collision_bounds,
}
REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("SF_DENSE_BLEND_PROMOTION " + json.dumps(report))
