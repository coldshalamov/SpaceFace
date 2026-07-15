#!/usr/bin/env python3
from pathlib import Path
p = Path(__file__).resolve().parents[2] / "tools/blender/build_m4_helios_hub_v8.py"
t = p.read_text(encoding="utf-8")
old = """    total = sum(base.tri_count_object(obj) for obj in objects)
    budget = 16000 if mode == \"station\" else 7000
    if total > budget:
        for obj in sorted(objects, key=base.tri_count_object, reverse=True):
            tris = base.tri_count_object(obj)
            target = max(64, int(tris * budget / total))
            base.decimate_to_max_tris(obj, target, label=f\"V8 donor:{obj.name}\")
            base.ensure_uvs_force(obj)
            base.triangulate_object(obj)"""
# handle both escaped and unescaped forms
old2 = old.replace('\\"', '"')
new = """    total = sum(base.tri_count_object(obj) for obj in objects)
    # REPAIR1b: keep continuous donor dense enough to read as industrial macro
    budget = 22000 if mode == \"station\" else 9000
    min_keep = 1200 if mode == \"station\" else 600
    if total > budget:
        for obj in sorted(objects, key=base.tri_count_object, reverse=True):
            tris = base.tri_count_object(obj)
            target = max(min_keep, int(tris * budget / max(total, 1)))
            if tris > target:
                base.decimate_to_max_tris(obj, target, label=f\"V8 donor:{obj.name}\")
                base.ensure_uvs_force(obj)
                base.triangulate_object(obj)"""
new2 = new.replace('\\"', '"')
if old2 not in t:
    # try find approximate
    idx = t.find("budget = 16000 if mode")
    print("idx", idx)
    if idx < 0:
        idx = t.find("budget = 22000 if mode")
        print("already patched?", idx)
        raise SystemExit(0 if idx >= 0 else "budget block missing")
    raise SystemExit("exact old block missing")
p.write_text(t.replace(old2, new2, 1), encoding="utf-8")
print("OK donor budget")
