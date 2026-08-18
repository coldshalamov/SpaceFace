"""Dump sponson / radiator / identity lid bounds from the V7 production blend."""
from pathlib import Path
import bpy
from mathutils import Vector

BASELINE = Path(__file__).resolve().parents[1] / "blender" / "kestrel_hitch_polish_v7_production.blend"
KEYS = (
    "sponson", "radiator", "shoulder", "die", "laugh", "hero", "pod",
    "underframe", "armor", "deck", "cassette", "fin",
)


def world_bbox(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


bpy.ops.wm.open_mainfile(filepath=str(BASELINE))
rows = []
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    name = obj.name or ""
    key = name.lower()
    if not any(token in key for token in KEYS):
        continue
    minx, maxx, miny, maxy, minz, maxz = world_bbox(obj)
    rows.append((
        (maxx - minx) * (maxy - miny) * (maxz - minz),
        name,
        obj.hide_render,
        (minx, maxx, miny, maxy, minz, maxz),
        tuple(round(v, 3) for v in obj.dimensions),
        tuple(round(v, 3) for v in obj.location),
    ))
rows.sort(reverse=True)
print(f"count={len(rows)}")
for volume, name, hidden, box, dims, loc in rows[:120]:
    print(
        f"{name:56s} hide={int(hidden)} vol={volume:8.1f} "
        f"x=[{box[0]:6.2f},{box[1]:6.2f}] y=[{box[2]:6.2f},{box[3]:6.2f}] "
        f"z=[{box[4]:6.2f},{box[5]:6.2f}] dim={dims} loc={loc}"
    )
