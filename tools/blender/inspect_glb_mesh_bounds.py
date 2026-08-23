"""Dump world-space mesh bounds after GLB import."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args(argv):
    glb = Path(argv[argv.index("--") + 1]) if "--" in argv else Path(argv[-1])
    return glb


def mesh_bounds(obj):
    low = Vector((1e12, 1e12, 1e12))
    high = Vector((-1e12, -1e12, -1e12))
    for corner in obj.bound_box:
        point = obj.matrix_world @ Vector(corner)
        for axis in range(3):
            low[axis] = min(low[axis], point[axis])
            high[axis] = max(high[axis], point[axis])
    size = high - low
    return {
        "name": obj.name,
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "min": [round(float(v), 4) for v in low],
        "max": [round(float(v), 4) for v in high],
        "size": [round(float(v), 4) for v in size],
        "center": [round(float(v), 4) for v in (low + high) * 0.5],
        "triangles": len(obj.data.polygons),
    }


def main():
    glb = parse_args(sys.argv).resolve()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and "COLLISION" not in obj.name.upper()]
    report = {
        "glb": str(glb),
        "empties": [
            {
                "name": obj.name,
                "location": [round(float(v), 4) for v in obj.location],
            }
            for obj in bpy.data.objects if obj.type == "EMPTY"
        ],
        "meshes": [mesh_bounds(obj) for obj in meshes],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
