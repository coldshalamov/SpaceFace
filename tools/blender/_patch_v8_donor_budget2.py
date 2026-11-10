#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[2] / "tools/blender/build_m4_helios_hub_v8.py"
t = p.read_text(encoding="utf-8")
marker = "    total = sum(base.tri_count_object(obj) for obj in objects)"
i = t.find(marker)
if i < 0:
    raise SystemExit("marker missing")
j = t.find("    heartbeat_authoring_lock()\n    return objects", i)
if j < 0:
    raise SystemExit("end missing")
replacement = """    total = sum(base.tri_count_object(obj) for obj in objects)
    # REPAIR1b: preserve continuous industrial density — never crush shells to <1500 tris
    budget = 24000 if mode == \"station\" else 10000
    min_keep = 1500 if mode == \"station\" else 800
    if total > budget:
        for obj in sorted(objects, key=base.tri_count_object, reverse=True):
            cur = sum(base.tri_count_object(o) for o in objects)
            if cur <= budget:
                break
            tris = base.tri_count_object(obj)
            if tris <= min_keep:
                continue
            target = max(min_keep, int(tris * budget / max(cur, 1)))
            if target < tris:
                base.decimate_to_max_tris(obj, target, label=f\"V8 donor:{obj.name}\")
                base.ensure_uvs_force(obj)
                base.triangulate_object(obj)
"""
replacement = replacement.replace('\\"', '"')
t = t[:i] + replacement + t[j:]
p.write_text(t, encoding="utf-8")
print("OK donor budget rewrite")
