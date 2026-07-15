import bpy, math, os, sys, json
from mathutils import Vector
ROOT = r"C:\Users\93rob\Documents\GitHub\SpaceFace"
sys.path.insert(0, os.path.join(ROOT, "tools", "art", "blender"))
import m1_slicea_polish2 as p2

def dark_studio():
    center, ext = p2.setup_studio(clay=False)
    for o in list(bpy.data.objects):
        if o.type=="LIGHT" and o.name.startswith("SF_"):
            if "FILL" in o.name: o.data.energy = 120
            if "SUN" in o.name: o.data.energy = 2.8
            if "RIM" in o.name: o.data.energy = 1.2
    return center, ext

def render_final(part_id, tag="polish2b"):
    evidence = os.path.join(ROOT, "assets/ships/parts/revamp-evidence", part_id, "renders")
    os.makedirs(evidence, exist_ok=True)
    center, ext = dark_studio()
    p2.frame_cam(center, ext, "34", 1.4)
    lit = os.path.join(evidence, f"2026-07-11_{part_id}_{tag}_lit_34_full.png")
    bpy.context.scene.render.filepath = lit
    bpy.ops.render.render(write_still=True)
    final = os.path.join(evidence, f"2026-07-11_{part_id}_final_lit_34_full.png")
    import shutil
    shutil.copy2(lit, final)
    # clay
    center, ext = p2.setup_studio(clay=True)
    p2.frame_cam(center, ext, "34", 1.4)
    clay = os.path.join(evidence, f"2026-07-11_{part_id}_{tag}_clay_34_full.png")
    # clay materials
    clay_mat = p2.ensure_mat("SF_CLAY", (0.88,0.88,0.9,1), metal=0, rough=0.9, use_noise=False)
    stash={}
    for o in bpy.data.objects:
        if o.type!="MESH": continue
        stash[o.name]=[s.material for s in o.material_slots]
        p2.set_mat(o, clay_mat)
    bpy.context.scene.render.filepath = clay
    bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        if o.type!="MESH" or o.name not in stash: continue
        o.data.materials.clear()
        for m in stash[o.name]:
            if m: o.data.materials.append(m)
    return lit, clay

# ===== GATE rebuild without floating cubes =====
p2.clear_meshes()
hull = p2.ensure_mat("Material_Hull", (0.30,0.33,0.38,1), metal=0.62, rough=0.34)
accent = p2.ensure_mat("Material_Accent", (0.25,0.85,1.0,1), metal=0.3, rough=0.2, emi=(0.35,0.9,1,1), emi_s=0.75, use_noise=False)
mech = p2.ensure_mat("Material_Mechanical", (0.10,0.10,0.12,1), metal=0.9, rough=0.5)
rr = (math.radians(90),0,0)
p2.torus("GATE_ring_main", (0,0,10), 8.6, 1.65, hull, 56, 22, rr, 0.05)
p2.torus("GATE_ring_outer", (0,0,10), 10.0, 0.75, mech, 48, 14, rr, 0.04)
p2.torus("GATE_ring_emitter", (0,0,10), 7.2, 0.42, accent, 48, 12, rr, 0.02)
p2.torus("GATE_ring_armor", (0,0,10), 8.6, 0.55, mech, 40, 12, rr, 0.03)
# ring armor as small torus-aligned cylinders (flush collars) not free cubes
for i in range(12):
    a = i * math.pi*2/12
    y = math.cos(a)*8.6
    z = 10+math.sin(a)*8.6
    # short radial cylinder pointing roughly outward in YZ
    o = p2.cyl(f"GATE_collar_seg_{i}", (0,y,z), 0.95, 1.35, mech if i%2 else hull, segs=14, bw=0.03)
    # orient cylinder axis along ring normal in YZ (radial)
    o.rotation_euler = (math.atan2(math.sin(a), math.cos(a)), 0, 0)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(rotation=True)
    o.select_set(False)
    o.location = Vector((0,y,z))
# integrated A-frame with continuous volumes
p2.box("GATE_base", (0,0,-1.7), (6.8,18,1.15), hull, bw=0.1)
p2.box("GATE_base_lip", (0,0,-1.05), (7.1,18.4,0.18), accent, bw=0.02)
p2.box("GATE_core", (0,0,-0.2), (4.4,7,1.8), mech, bw=0.08)
p2.box("GATE_control", (2.6,0,1.5), (1.9,3.0,2.6), hull, bw=0.06)
p2.box("GATE_control_win", (3.6,0,1.8), (0.12,2.0,1.3), accent, bw=0.02)
# left leg solid mass chain
p2.box("GATE_foot_L", (0,7.4,-1.0), (3.0,3.6,1.3), mech, bw=0.08)
p2.box("GATE_leg_L", (0,6.5,2.5), (2.3,2.6,8.0), hull, bw=0.09)
p2.box("GATE_leg_L_top", (0,5.6,7.2), (2.2,2.9,4.0), hull, bw=0.08)
p2.cyl("GATE_join_L", (0,5.7,5.0), 1.85, 2.8, hull, segs=18, bw=0.06)
# lattice on left
for k,z in enumerate([0.8,2.2,3.6,5.0,6.4,7.8]):
    p2.box(f"GATE_latL_h{k}", (0,6.2,z), (1.7,2.6,0.2), mech, bw=0.02)
for k in range(4):
    z0 = 0.5+k*1.8
    p2.box(f"GATE_latL_d{k}", (0.5,6.2,z0+0.9), (0.18,2.2,2.0), mech, rot=(math.radians(35 if k%2==0 else -35),0,0), bw=0.02)
# right leg
p2.box("GATE_foot_R", (0,-7.4,-1.0), (3.0,3.6,1.3), mech, bw=0.08)
p2.box("GATE_leg_R", (0,-6.5,2.5), (2.3,2.6,8.0), hull, bw=0.09)
p2.box("GATE_leg_R_top", (0,-5.6,7.2), (2.2,2.9,4.0), hull, bw=0.08)
p2.cyl("GATE_join_R", (0,-5.7,5.0), 1.85, 2.8, hull, segs=18, bw=0.06)
for k,z in enumerate([0.8,2.2,3.6,5.0,6.4,7.8]):
    p2.box(f"GATE_latR_h{k}", (0,-6.2,z), (1.7,2.6,0.2), mech, bw=0.02)
for k in range(4):
    z0 = 0.5+k*1.8
    p2.box(f"GATE_latR_d{k}", (-0.5,-6.2,z0+0.9), (0.18,2.2,2.0), mech, rot=(math.radians(35 if k%2==0 else -35),0,0), bw=0.02)
p2.box("GATE_brace", (0,0,2.6), (1.6,11.2,1.15), mech, bw=0.06)
p2.cyl("GATE_brace_hub", (0,0,2.6), 1.3, 1.9, hull, segs=16, bw=0.05)
p2.box("GATE_strut_L", (0,3.4,1.6), (1.1,5.5,0.95), mech, rot=(0,0,math.radians(-20)), bw=0.05)
p2.box("GATE_strut_R", (0,-3.4,1.6), (1.1,5.5,0.95), mech, rot=(0,0,math.radians(20)), bw=0.05)
for i,y in enumerate([-8,-4,0,4,8]):
    p2.cyl(f"GATE_nav_{i}", (2.7,y,-0.9), 0.3, 0.42, accent, segs=10)
p2.cyl("GATE_ant_L", (0,5.6,9.8), 0.1, 2.2, mech, segs=8)
p2.cyl("GATE_ant_R", (0,-5.6,9.8), 0.1, 2.2, mech, segs=8)
p2.shade_smooth()
p2.save_blend(os.path.join(ROOT,"assets/ships/parts/blender/place_gate_jump_ring_authored.blend"))
gate_lit, gate_clay = render_final("place_gate_jump_ring")
print("GATE", gate_lit)

# ===== ROCKS: surface ore + dark =====
def build_dark_rock(variant):
    p2.clear_meshes()
    basalt = p2.ensure_mat("Material_Hull", (0.12,0.11,0.10,1), metal=0.15, rough=0.9)
    iron = p2.ensure_mat("Material_Mechanical", (0.18,0.15,0.12,1), metal=0.4, rough=0.78)
    ore = p2.ensure_mat("Material_Accent", (0.78,0.55,0.16,1), metal=0.7, rough=0.32, emi=(0.55,0.38,0.08,1), emi_s=0.25, use_noise=False)
    if variant=="a":
        body=p2.sphere("ROCK_body",(0,0,0),3.3,basalt,segs=36,rings=24,scale=(1.05,0.9,1.5))
        p2.displace(body,0.55,1.3,41)
        p2.set_mat(body,basalt)
        p2.sphere("ROCK_cap",(0.3,-0.2,2.8),1.7,iron,segs=22,rings=14,scale=(1.1,0.9,0.7))
        p2.displace(bpy.data.objects["ROCK_cap"],0.35,1.8,42)
        p2.set_mat(bpy.data.objects["ROCK_cap"],iron)
        # surface shelves
        p2.box("ROCK_shelf0",(0,0,0.9),(5.0,4.0,0.45),iron,bw=0.08)
        p2.box("ROCK_shelf1",(0.2,0,-0.8),(4.4,3.5,0.4),iron,bw=0.07)
        # ore on surface - large ribbons outside
        p2.box("ROCK_ore_a",(0,2.2,0.4),(3.5,0.4,0.85),ore,rot=(0,0,math.radians(12)),bw=0.04)
        p2.box("ROCK_ore_b",(0,-2.0,-0.3),(3.0,0.35,0.7),ore,rot=(0,math.radians(8),math.radians(-15)),bw=0.04)
        p2.box("ROCK_ore_c",(2.0,0.3,1.5),(0.45,2.2,0.7),ore,rot=(math.radians(10),0,0),bw=0.04)
        p2.box("ROCK_ore_d",(-1.8,0.5,0.2),(0.9,1.2,1.0),ore,bw=0.05)
        pid="place_asteroid_rock_a"
    elif variant=="b":
        body=p2.sphere("ROCK_body",(0,0,0),3.5,basalt,segs=36,rings=20,scale=(1.5,1.3,0.5))
        p2.displace(body,0.45,1.5,51)
        p2.set_mat(body,basalt)
        p2.box("ROCK_stratum0",(0,0,0.3),(6.2,5.2,0.4),iron,bw=0.06)
        p2.box("ROCK_stratum1",(0,0,-0.35),(5.5,4.6,0.35),iron,bw=0.05)
        p2.box("ROCK_ore_a",(0,0.4,0.55),(5.0,0.4,0.5),ore,rot=(0,0,math.radians(8)),bw=0.03)
        p2.box("ROCK_ore_b",(0.5,-1.8,0.1),(3.5,0.35,0.4),ore,rot=(0,0,math.radians(-12)),bw=0.03)
        p2.box("ROCK_ore_c",(-2.0,1.2,0.35),(1.5,1.2,0.45),ore,bw=0.04)
        pid="place_asteroid_rock_b"
    else:
        body=p2.sphere("ROCK_body",(0,0,0),3.0,basalt,segs=32,rings=20,scale=(1.2,0.8,1.1))
        p2.displace(body,0.5,1.8,61)
        p2.set_mat(body,basalt)
        p2.box("ROCK_wedge",(1.6,0,0.2),(2.8,2.3,2.9),iron,rot=(0,0,math.radians(25)),bw=0.1)
        p2.box("ROCK_cleave",(0.1,0,0),(0.35,3.6,3.3),iron,rot=(0,math.radians(12),0),bw=0.05)
        p2.box("ROCK_ore_a",(-0.2,0.8,0.5),(0.4,3.0,1.0),ore,rot=(math.radians(10),0,math.radians(30)),bw=0.03)
        p2.box("ROCK_ore_b",(2.0,-0.4,0.9),(1.0,0.8,0.8),ore,bw=0.04)
        p2.box("ROCK_ore_c",(0.2,-1.2,-0.3),(2.4,0.35,0.6),ore,rot=(0,math.radians(-6),math.radians(15)),bw=0.03)
        pid="place_asteroid_rock_c"
    p2.shade_smooth()
    p2.save_blend(os.path.join(ROOT,f"assets/ships/parts/blender/{pid}_authored.blend"))
    return pid

results={}
for v in "abc":
    pid=build_dark_rock(v)
    lit,clay=render_final(pid)
    results[pid]=lit
    print("ROCK", pid, lit)

# re-export all five including hub (keep polish2 hub) + fixed gate/rocks
sys.path.insert(0, os.path.join(ROOT,"tools","blender"))
from spaceface_export import export_gltf

def do_export(part_id):
    blend=os.path.join(ROOT,f"assets/ships/parts/blender/{part_id}_authored.blend")
    bpy.ops.wm.open_mainfile(filepath=blend)
    meshes=[o for o in bpy.data.objects if o.type=="MESH"]
    if meshes:
        bpy.context.view_layer.objects.active=meshes[0]
        for o in meshes: o.select_set(True)
    out=os.path.join(ROOT,f"assets/ships/parts/revamp-evidence/{part_id}/_export_tmp.glb")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        export_gltf(out, {"kind":"place","id":part_id,"assetId":part_id,"slot":"place","tri_budget":100000,"min_hull_tris":0,"required_maps":["ao","roughness"]})
        print("EXPORT_OK", part_id, os.path.getsize(out))
        return True
    except Exception as e:
        print("EXPORT_FAIL", part_id, e)
        return False

# also re-render hub with darker studio for final
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,"assets/ships/parts/blender/place_station_trade_hub_authored.blend"))
hub_lit, hub_clay = render_final("place_station_trade_hub")
print("HUB", hub_lit)
do_export("place_station_trade_hub")
do_export("place_gate_jump_ring")
for v in "abc":
    do_export(f"place_asteroid_rock_{v}")

print(json.dumps({"ok":True,"results":results,"hub":hub_lit,"gate":gate_lit}))
