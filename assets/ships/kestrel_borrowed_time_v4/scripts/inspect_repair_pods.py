"""Print meshes that look like the green repair packs."""
from pathlib import Path
import bpy

BASELINE = Path(__file__).resolve().parents[1] / "blender" / "kestrel_hitch_polish_v7_production.blend"
bpy.ops.wm.open_mainfile(filepath=str(BASELINE))
needles = ("REPAIR", "POD", "SECONDARY", "GREEN", "CASSETTE", "HOOK_SECONDARY")
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    names = [obj.name]
    names.extend(mat.name for mat in (obj.data.materials or []) if mat)
    blob = " ".join(names).upper()
    if not any(n in blob for n in needles):
        continue
    mats = [mat.name for mat in (obj.data.materials or []) if mat]
    print(
        f"{obj.name:50s} hide={int(obj.hide_render)} dim={tuple(round(v, 3) for v in obj.dimensions)} "
        f"loc={tuple(round(v, 3) for v in obj.location)} mats={mats}"
    )
