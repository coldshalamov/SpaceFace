"""List visible meshes at the dorsal close look-at AFTER the V58 trench furniture."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hitch_hero_v58 import apply_hitch_hero_v58

BASELINE = Path(__file__).resolve().parents[1] / "blender" / "kestrel_hitch_polish_v7_production.blend"
bpy.ops.wm.open_mainfile(filepath=str(BASELINE))
apply_hitch_hero_v58()
cx, cy, cz = -1.6, 0.0, 2.2
rows = []
for obj in bpy.data.objects:
    if obj.type != "MESH" or obj.hide_render:
        continue
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    if max(xs) < cx - 1.8 or min(xs) > cx + 1.8:
        continue
    if max(ys) < cy - 1.0 or min(ys) > cy + 1.0:
        continue
    if max(zs) < 1.7 or min(zs) > 2.6:
        continue
    rows.append((
        (max(xs) - min(xs)) * (max(ys) - min(ys)) * max(0.01, max(zs) - min(zs)),
        obj.name,
        (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)),
    ))
rows.sort(reverse=True)
print(f"count={len(rows)}")
for vol, name, box in rows[:60]:
    print(
        f"{name:56s} vol={vol:7.2f} "
        f"x=({box[0]:6.2f},{box[1]:6.2f}) "
        f"y=({box[2]:6.2f},{box[3]:6.2f}) "
        f"z=({box[4]:6.2f},{box[5]:6.2f})"
    )
