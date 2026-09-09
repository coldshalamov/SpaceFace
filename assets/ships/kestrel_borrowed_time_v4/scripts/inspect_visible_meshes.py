"""List visible mesh names and dimensions from the V7 production blend."""
from pathlib import Path
import bpy

BASELINE = Path(__file__).resolve().parents[1] / "blender" / "kestrel_hitch_polish_v7_production.blend"
bpy.ops.wm.open_mainfile(filepath=str(BASELINE))
rows = []
for obj in bpy.data.objects:
    if obj.type != "MESH" or obj.hide_render:
        continue
    d = obj.dimensions
    rows.append((d.x * d.y * d.z, obj.name, float(d.x), float(d.y), float(d.z), tuple(round(v, 2) for v in obj.location)))
rows.sort(reverse=True)
for _, name, x, y, z, loc in rows[:80]:
    print(f"{name:60s} {x:7.2f} {y:7.2f} {z:7.2f}  loc={loc}")
