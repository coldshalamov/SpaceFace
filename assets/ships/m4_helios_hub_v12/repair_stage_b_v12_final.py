"""The single final visual repair for Helios V12.

Run after build_helios_v12_stage_b.py. It edits the saved isolated candidate,
re-renders evidence, re-exports all five GLBs, and re-runs structural reporting.
No live release path is touched.
"""
from pathlib import Path
import math

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
BLEND = HERE / "helios_hub_v12_candidate.blend"
STAGE = HERE / "build_helios_v12_stage_b.py"

bpy.ops.wm.open_mainfile(filepath=str(BLEND))

# Load the Stage-B export/evidence helpers without rebuilding its scene.
stage_source = STAGE.read_text(encoding="utf-8")
stage_source = stage_source.replace('"BLENDER_EEVEE_NEXT"', '"BLENDER_EEVEE"')
stage_source = stage_source.replace(
    '("v12_gate_close_final.png", (61,-78,12), (61,-24,4), 68, None, (1200,1200), (0,1,0))',
    '("v12_gate_close_final.png", (91,-69,34), (61,-24,4), 66, None, (1200,1200), (0,1,0))',
)
stage_source = stage_source.split('# Preserve references before replacing', 1)[0]
stage_ns = {"__file__": str(STAGE), "__name__": "helios_v12_final_repair_helpers"}
exec(compile(stage_source, str(STAGE), "exec"), stage_ns)
base = stage_ns["ns"]


def material(name):
    return bpy.data.materials[name]


def relink_and_parent(obj, coll, root):
    base["relink"](obj, coll)
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world
    return obj


def cylinder(name, loc, radius, depth, mat, coll, root, vertices=20, bevel=0.15):
    obj = base["cylinder"](name, loc, radius, depth, mat, coll, vertices, bevel=bevel)
    return relink_and_parent(obj, coll, root)


def beam(name, a, b, width, depth, mat, coll, root, bevel=0.1):
    obj = base["beam_between"](name, a, b, width, depth, mat, coll, bevel)
    return relink_and_parent(obj, coll, root)


# Reduce cyan dominance but keep the navigational role clear at game distance.
for name, strength in (("MAT_HeliosNavigation", 0.92), ("MAT_GateField", 1.35)):
    mat = material(name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Emission Strength"].default_value = strength
    if name == "MAT_HeliosNavigation":
        bsdf.inputs["Base Color"].default_value = (0.015,0.24,0.32,1)
        bsdf.inputs["Emission Color"].default_value = (0.01,0.48,0.64,1)


# Replace the final black needle/rotor artifact with a compact ring sensor.
hub_coll = bpy.data.collections["V12_HeliosHub"]
hub_root = bpy.data.objects["V12_HeliosHub_Root"]
for name in ("HUB_SensorMast", "HUB_SensorVane_0", "HUB_SensorVane_1", "HUB_SensorVane_2"):
    obj = bpy.data.objects.get(name)
    if obj:
        bpy.data.objects.remove(obj, do_unlink=True)
cylinder("HUB_SensorPedestal", (-3,-22,23.4), 1.45, 4.5,
         material("MAT_ForgeArmor"), hub_coll, hub_root, 16, 0.18)
cylinder("HUB_SensorDrum", (-3,-22,25.8), 2.6, 0.85,
         material("MAT_HabitatCeramic"), hub_coll, hub_root, 20, 0.15)
bpy.ops.mesh.primitive_torus_add(major_radius=3.25, minor_radius=0.34,
                                major_segments=32, minor_segments=8,
                                location=(-3,-22,26.5))
ring = bpy.context.object
ring.name = "HUB_SensorCrownRing"
ring.data.materials.append(material("MAT_HeliosNavigation"))
relink_and_parent(ring, hub_coll, hub_root)
cylinder("HUB_SensorLens", (-3,-22,26.7), 0.9, 0.45,
         material("MAT_HeliosNavigation"), hub_coll, hub_root, 16, 0.1)
for obj in bpy.data.objects:
    if obj.name.startswith("HUB_DockRail_"):
        obj.scale.x *= 0.62


# Deepen the gate into a double truss and replace the single vertical field line
# with restrained horizontal transit bands.
gate_coll = bpy.data.collections["V12_SplitHexGate"]
gate_root = bpy.data.objects["V12_SplitHexGate_Root"]
for obj in list(bpy.data.objects):
    if obj.name == "GATE_Field" or obj.name.startswith("GATE_FieldBand_"):
        bpy.data.objects.remove(obj, do_unlink=True)
for name in ("GATE_ServiceSpine_-1", "GATE_ServiceSpine_1"):
    obj = bpy.data.objects.get(name)
    if obj and obj.type == "MESH":
        obj.data.materials.clear()
        obj.data.materials.append(material("MAT_ForgeArmor"))
ox,oy,oz = 61,-24,4
pts=[(-12,0),(-6,10.4),(6,10.4),(12,0),(6,-10.4),(-6,-10.4)]
segs=[(0,1),(1,2),(5,0),(2,3),(3,4),(4,5)]
for plane,yoff in enumerate((-1.65,1.65)):
    for idx,(a,b) in enumerate(segs):
        pa,pb=pts[a],pts[b]
        beam(f"GATE_DepthTruss_{plane}_{idx}", (ox+pa[0],oy+yoff,oz+pa[1]),
             (ox+pb[0],oy+yoff,oz+pb[1]), 0.72,0.82,
             material("MAT_HabitatCeramic" if plane else "MAT_HeliosHull"),
             gate_coll,gate_root,0.12)
        beam(f"GATE_TrussTie_{plane}_{idx}", (ox+pa[0],oy-1.65,oz+pa[1]),
             (ox+pa[0],oy+1.65,oz+pa[1]), 0.42,0.48,
             material("MAT_ForgeArmor"),gate_coll,gate_root,0.08)
for idx,(zoff,half_width) in enumerate(((-5.2,4.3),(0,7.2),(5.2,4.3))):
    beam(f"GATE_FieldBand_Final_{idx}", (ox-half_width,oy+0.42,oz+zoff),
         (ox+half_width,oy+0.42,oz+zoff), 0.24,0.20,
         material("MAT_GateField"),gate_coll,gate_root,0.04)


# Convert six scattered protrusions into two visibly rooted three-crystal clusters.
cluster_dirs = [
    (0.30,-0.78,0.56),(0.40,-0.70,0.59),(0.18,-0.82,0.54),
    (-0.58,0.08,0.72),(-0.48,0.18,0.76),(-0.66,0.02,0.66),
]
rock_specs = {
    "ROCK_HeliosFerrite": ((8.5,6.2,5.6),11),
    "ROCK_IceFracture": ((6.5,8.8,6.0),23),
    "ROCK_CobaltCrown": ((5.5,5.8,9.2),37),
}
for rock_name,(scale,seed) in rock_specs.items():
    rock=bpy.data.objects[rock_name]
    for idx,direction in enumerate(cluster_dirs):
        crystal=bpy.data.objects.get(f"{rock_name}_Crystal_{idx:02d}")
        if not crystal:
            continue
        n=Vector(direction).normalized()
        base_point=rock.location+Vector((n.x*scale[0],n.y*scale[1],n.z*scale[2]))*(0.78+0.025*(idx%3))
        length=2.2+0.7*((idx+seed)%3)
        crystal.matrix_world.translation=base_point+n*(length*0.15)
        crystal.rotation_euler=n.to_track_quat("Z","Y").to_euler()

bpy.context.scene.view_settings.exposure = 0.86
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
stage_ns["render_evidence_stage_b"]()
report = stage_ns["validate_and_export"]()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print("V12_FINAL_REPAIR_OK", BLEND)
print("V12_FINAL_EXPORTS", len(report["exports"]))
print("V12_FINAL_ROCKS_WATERTIGHT", report["rocks"]["allWatertight"])
