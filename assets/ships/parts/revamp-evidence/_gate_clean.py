import bpy, os, sys
ROOT = r"C:\Users\93rob\Documents\GitHub\SpaceFace"
sys.path.insert(0, os.path.join(ROOT, "tools", "art", "blender"))
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import m1_slicea_polish2 as p2
from spaceface_export import export_gltf
blend = os.path.join(ROOT, "assets/ships/parts/blender/place_gate_jump_ring_authored.blend")
bpy.ops.wm.open_mainfile(filepath=blend)
removed=[]
for o in list(bpy.data.objects):
    if o.type!="MESH": continue
    n=o.name
    if n.startswith("GATE_armor_plate_") or n.startswith("GATE_collar_seg_") or n.startswith("GATE_seg_") or n.startswith("GATE_svc_"):
        removed.append(n); bpy.data.objects.remove(o, do_unlink=True)
# also remove any mesh whose world-center is far from main structure (outside 14m of origin xz or weird)
from mathutils import Vector
for o in list(bpy.data.objects):
    if o.type!="MESH": continue
    if o.name.startswith("GATE_ring"): continue
    cs=[o.matrix_world @ Vector(c) for c in o.bound_box]
    c=sum(cs, Vector())/8
    # floating if high and not on ring path near yz ring
    if abs(c.x)>3.5 and abs(c.y)>3 and c.z>12:
        removed.append(o.name); bpy.data.objects.remove(o, do_unlink=True)
p2.save_blend(blend)
center,ext=p2.setup_studio(False)
for o in bpy.data.objects:
    if o.type=="LIGHT" and "FILL" in o.name: o.data.energy=220
    if o.type=="LIGHT" and "SUN" in o.name: o.data.energy=4.2
p2.frame_cam(center,ext,"34",1.5)
renders=os.path.join(ROOT,"assets/ships/parts/revamp-evidence/place_gate_jump_ring/renders")
lit=os.path.join(renders,"2026-07-11_place_gate_jump_ring_polish2d_lit_34_full.png")
bpy.context.scene.render.filepath=lit
bpy.ops.render.render(write_still=True)
import shutil
shutil.copy2(lit, os.path.join(renders,"2026-07-11_place_gate_jump_ring_final_lit_34_full.png"))
shutil.copy2(lit, os.path.join(ROOT,".devshots/slice-A/gate-approach.png"))
meshes=[o for o in bpy.data.objects if o.type=="MESH"]
bpy.context.view_layer.objects.active=meshes[0]
for o in meshes: o.select_set(True)
out=os.path.join(ROOT,"assets/ships/parts/revamp-evidence/place_gate_jump_ring/_export_tmp.glb")
export_gltf(out,{"kind":"place","id":"place_gate_jump_ring","assetId":"place_gate_jump_ring","slot":"place","tri_budget":100000,"min_hull_tris":0,"required_maps":["ao","roughness"]})
print("removed", removed)
print("OK", lit, "meshes", len(meshes), "tris", p2.tri_total())
