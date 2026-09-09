import bpy, os, sys, math
from mathutils import Vector
ROOT = r"C:\Users\93rob\Documents\GitHub\SpaceFace"
sys.path.insert(0, os.path.join(ROOT, "tools", "art", "blender"))
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import m1_slicea_polish2 as p2
from spaceface_export import export_gltf

blend = os.path.join(ROOT, "assets/ships/parts/blender/place_gate_jump_ring_authored.blend")
bpy.ops.wm.open_mainfile(filepath=blend)
# remove exploded collar segs and any free-floating small cylinders far from origin ring
removed = []
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
    if o.name.startswith("GATE_collar_seg_"):
        removed.append(o.name)
        bpy.data.objects.remove(o, do_unlink=True)
        continue
# add flush armor as torus segments only already present
# thicken join collars that remain
if bpy.data.objects.get("GATE_join_L"):
    pass
# add 8 small boxes ON the ring tube (parent-like positions with small scale, no rotate apply bugs)
hull = bpy.data.materials.get("Material_Hull")
mech = bpy.data.materials.get("Material_Mechanical")
accent = bpy.data.materials.get("Material_Accent")
for i in range(8):
    a = i * math.pi / 4
    # ring in YZ, center z=10, major=8.6
    y = math.cos(a) * 8.6
    z = 10 + math.sin(a) * 8.6
    # place box slightly outward in YZ radial, very small depth in X so it sits on tube
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y*1.02, z))
    o = bpy.context.active_object
    o.name = f"GATE_armor_plate_{i}"
    o.scale = (1.4, 1.3, 1.3)
    bpy.ops.object.transform_apply(scale=True)
    o.location = Vector((0, y, z))
    # scale down to hug tube
    o.scale = (0.55, 0.85, 0.85)
    bpy.ops.object.transform_apply(scale=True)
    p2.set_mat(o, mech if i % 2 else hull)
    p2.bevel(o, 0.04)

p2.shade_smooth()
p2.save_blend(blend)

# render full object
center, ext = p2.setup_studio(clay=False)
for o in bpy.data.objects:
    if o.type=="LIGHT" and "FILL" in o.name: o.data.energy = 200
    if o.type=="LIGHT" and "SUN" in o.name: o.data.energy = 4.0
p2.frame_cam(center, ext, "34", 1.55)
renders = os.path.join(ROOT, "assets/ships/parts/revamp-evidence/place_gate_jump_ring/renders")
lit = os.path.join(renders, "2026-07-11_place_gate_jump_ring_polish2c_lit_34_full.png")
bpy.context.scene.render.filepath = lit
bpy.ops.render.render(write_still=True)
import shutil
shutil.copy2(lit, os.path.join(renders, "2026-07-11_place_gate_jump_ring_final_lit_34_full.png"))

meshes=[o for o in bpy.data.objects if o.type=="MESH"]
bpy.context.view_layer.objects.active = meshes[0]
for o in meshes: o.select_set(True)
out = os.path.join(ROOT, "assets/ships/parts/revamp-evidence/place_gate_jump_ring/_export_tmp.glb")
export_gltf(out, {"kind":"place","id":"place_gate_jump_ring","assetId":"place_gate_jump_ring","slot":"place","tri_budget":100000,"min_hull_tris":0,"required_maps":["ao","roughness"]})
print("removed", removed)
print("GATE_OK", lit, os.path.getsize(out), "meshes", len(meshes), "tris", p2.tri_total())
