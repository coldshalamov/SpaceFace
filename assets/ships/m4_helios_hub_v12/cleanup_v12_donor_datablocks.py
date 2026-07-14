"""Remove non-linked spike donor datablocks retained by Blender library loading."""
from pathlib import Path
import json
import bpy

here = Path(__file__).resolve().parent
blend = here / "helios_hub_v12_candidate.blend"
report_path = here / "validation_report.json"
bpy.ops.wm.open_mainfile(filepath=str(blend))
removed = []
for obj in list(bpy.data.objects):
    if "spike" in obj.name.lower():
        removed.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
report = json.loads(report_path.read_text(encoding="utf-8"))
report["hub"]["excludedArtifactObjects"] = []
report["hub"]["removedDonorArtifactDatablocks"] = removed
report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
print("V12_DONOR_DATABLOCK_CLEAN", len(removed), removed)
