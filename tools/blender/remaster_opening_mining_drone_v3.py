#!/usr/bin/env python3
"""Build a non-promoting, gameplay-contract-preserving mining drone candidate (v3).

Iteration 3 finishes the asset's service language after v2's construction repair:
crown plate fasteners and safety edge rails, asymmetric port/starboard service runs
with real clamps, a drum/yoke grease collar, tow bolts, and an optic hood.  It stays
inside the frozen envelope (an antenna whip was evaluated and rejected on guard math).

Only authored visual content is changed.  The root, mining socket, rotating tool hook
and emissive hook remain intact so controller integration does not touch drilling or
mining gameplay code.  Cutter meshes remain parented to HOOK_Spin after batching.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROLE_BY_MATERIAL = {
    "Material_Hull": "drone_painted_armor",
    "Material_Mechanical": "drone_structural_alloy",
    "Material_Tool": "drone_cutter_carbide",
    "Material_Accent": "drone_sensor_optic",
    "Material_Radiator": "drone_radiator",
    "Material_Cable": "drone_cable_polymer",
    "Material_Safety": "drone_safety_surface",
}
NORMAL_STRENGTH = {
    "drone_painted_armor": 0.14,
    "drone_structural_alloy": 0.12,
    "drone_cutter_carbide": 0.13,
    "drone_sensor_optic": 0.05,
    "drone_radiator": 0.11,
    "drone_cable_polymer": 0.09,
    "drone_safety_surface": 0.075,
}
SOURCE_BOUNDS = {
    "min": (-0.39999998, -1.20000005, -0.05000001),
    "max": (4.59999990, 1.20000005, 1.27750003),
    "size": (4.99999988, 2.40000010, 1.32750005),
}


def cli() -> argparse.Namespace:
    values=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    parser=argparse.ArgumentParser()
    parser.add_argument("--maps-root",type=Path,required=True)
    parser.add_argument("--output-blend",type=Path,required=True)
    parser.add_argument("--output-glb",type=Path,required=True)
    parser.add_argument("--report",type=Path,required=True)
    return parser.parse_args(values)


def sha256(path:Path) -> str:
    digest=hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda:handle.read(1024*1024),b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def load_image(path:Path,colorspace:str):
    image=bpy.data.images.load(str(path.resolve()),check_existing=True)
    image.name=path.name
    image.colorspace_settings.name=colorspace
    image.pack()
    return image


def material(name:str,role:str,maps_root:Path):
    value=bpy.data.materials.new(name)
    value.use_nodes=True
    nodes=value.node_tree.nodes
    links=value.node_tree.links
    nodes.clear()
    output=nodes.new("ShaderNodeOutputMaterial")
    output.name="SF_Surface_Output"
    principled=nodes.new("ShaderNodeBsdfPrincipled")
    principled.name="SF_Principled"

    base=nodes.new("ShaderNodeTexImage")
    base.name=f"SF_{role}_BaseColor"
    base.image=load_image(maps_root/f"{role}_basecolor.png","sRGB")
    base.interpolation="Linear"
    links.new(base.outputs["Color"],principled.inputs["Base Color"])
    orm=nodes.new("ShaderNodeTexImage")
    orm.name=f"SF_{role}_ORM"
    orm.image=load_image(maps_root/f"{role}_orm.png","Non-Color")
    orm.interpolation="Linear"
    separate=nodes.new("ShaderNodeSeparateColor")
    separate.name="SF_ORM_Channels"
    links.new(orm.outputs["Color"],separate.inputs["Color"])
    links.new(separate.outputs["Green"],principled.inputs["Roughness"])
    links.new(separate.outputs["Blue"],principled.inputs["Metallic"])
    group=bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group=bpy.data.node_groups.new("glTF Material Output","ShaderNodeTree")
        group.interface.new_socket(name="Occlusion",in_out="INPUT",socket_type="NodeSocketFloat")
    gltf_output=nodes.new("ShaderNodeGroup")
    gltf_output.name="SF_glTF_Occlusion"
    gltf_output.node_tree=group
    links.new(separate.outputs["Red"],gltf_output.inputs["Occlusion"])
    normal=nodes.new("ShaderNodeTexImage")
    normal.name=f"SF_{role}_Normal"
    normal.image=load_image(maps_root/f"{role}_normal.png","Non-Color")
    normal.interpolation="Linear"
    normal_map=nodes.new("ShaderNodeNormalMap")
    normal_map.name="SF_Tangent_Normal"
    normal_map.inputs["Strength"].default_value=NORMAL_STRENGTH[role]
    links.new(normal.outputs["Color"],normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"],principled.inputs["Normal"])
    emissive_path=maps_root/f"{role}_emissive.png"
    if emissive_path.exists():
        emissive=nodes.new("ShaderNodeTexImage")
        emissive.name=f"SF_{role}_Emissive"
        emissive.image=load_image(emissive_path,"sRGB")
        emissive.interpolation="Linear"
        links.new(emissive.outputs["Color"],principled.inputs["Emission Color"])
        principled.inputs["Emission Strength"].default_value=1.25
        principled.inputs["Coat Weight"].default_value=0.35
        principled.inputs["Coat Roughness"].default_value=0.14
    elif name=="Material_Hull":
        principled.inputs["Coat Weight"].default_value=0.09
        principled.inputs["Coat Roughness"].default_value=0.34
    links.new(principled.outputs["BSDF"],output.inputs["Surface"])
    value["spaceface.semantic"]=name
    value["spaceface.textureRole"]=role
    value["spaceface.ormChannels"]="R=AO,G=Roughness,B=Metallic"
    value["spaceface.normalConvention"]="OpenGL tangent space"
    return value


def tag(obj,lod:int,mat,role:str,root) -> None:
    obj.parent=root
    obj["spaceface.lod"]=f"lod{lod}"
    obj["spaceface.lodLevel"]=lod
    obj["spaceface.materialRole"]=mat.name
    obj["spaceface.structureRole"]=role
    obj["spaceface.functionalZone"]="propulsion/power/tool/sensor/thermal/structure"


def bevel(obj,width:float,lod:int) -> None:
    modifier=obj.modifiers.new("SF_PhysicalEdge","BEVEL")
    modifier.width=max(0.009,width*(1.0 if lod==0 else 0.68 if lod==1 else 0.44))
    modifier.segments=2 if lod==0 else 2 if lod==1 else 1
    modifier.limit_method="ANGLE"


def box(name,dimensions,location,rotation,mat,lod,role,root,edge=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1.0,location=location,rotation=rotation)
    obj=bpy.context.object
    obj.name=f"LOD{lod}_Drone_{name}"
    obj.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    obj.data.materials.append(mat)
    bevel(obj,edge,lod)
    tag(obj,lod,mat,role,root)
    return obj


def cylinder(name,radius,depth,location,rotation,mat,lod,role,root,vertices=24,edge=0.05):
    count=max(8,vertices if lod==0 else vertices//2 if lod==1 else vertices//3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=count,radius=radius,depth=depth,end_fill_type="NGON",location=location,rotation=rotation)
    obj=bpy.context.object
    obj.name=f"LOD{lod}_Drone_{name}"
    obj.data.materials.append(mat)
    bevel(obj,min(radius,depth)*edge,lod)
    tag(obj,lod,mat,role,root)
    return obj


def beam(name,start,end,width,mat,lod,role,root,edge=0.025):
    a,b=Vector(start),Vector(end)
    delta=b-a
    obj=box(name,(width,width,delta.length),(a+b)*0.5,(0,0,0),mat,lod,role,root,edge)
    obj.rotation_mode="QUATERNION"
    obj.rotation_quaternion=delta.to_track_quat("Z","Y")
    obj.rotation_mode="XYZ"
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    obj.select_set(False)
    return obj


def strip_edge(obj) -> None:
    for modifier in list(obj.modifiers):
        if modifier.type=="BEVEL": obj.modifiers.remove(modifier)


def plate_seam(name,dimensions,location,rotation,mat,lod,root):
    # Recessed construction seam: a thin dark strip sitting slightly proud of the plate
    # inner face so the eye reads the groove between two fastened plates.  Hard-edged
    # by construction: sliver bevels on flat groove strips bake degenerate UV faces.
    obj=box(name,dimensions,location,rotation,mat,lod,"plate_boundary_seam",root,0.0)
    strip_edge(obj)
    return obj


def rcs_pod(name,x,y,z,side,mat,lod,root) -> None:
    # Compact RCS block seated on a reaction rail: machined housing plus a recessed
    # dark throat whose mouth stays inside the frozen 2.4m width envelope.
    box(f"{name}_Housing",(0.38,0.32,0.26),(x,y,z),(0,0,0),mat,lod,"rcs_pod_machined_housing",root,0.04)
    throat=cylinder(f"{name}_Throat",0.105,0.14,(x,y+side*0.125,z),(math.pi/2,0,0),mat,lod,"rcs_recessed_nozzle_throat",root,12,0.03)
    strip_edge(throat)


def build_lod(lod:int,mats,root) -> None:
    # Low, continuous chassis with distinct serviceable power and avionics masses.
    box("RearBumper",(0.60,1.70,0.42),(-0.10,0,0.38),(0,0,0),mats["Material_Mechanical"],lod,"rear_impact_and_tow_structure",root,0.07)
    box("CentralSpine",(3.25,0.36,0.30),(1.60,0,0.45),(0,0,0),mats["Material_Mechanical"],lod,"continuous_tool_load_spine",root,0.055)
    box("LowerSkid",(2.15,1.35,0.28),(0.90,0,0.09),(0,0,0),mats["Material_Mechanical"],lod,"service_and_landing_skid",root,0.05)
    box("BatteryArmor",(1.40,1.72,0.74),(0.72,0,0.62),(0,0,0),mats["Material_Hull"],lod,"replaceable_battery_cassette",root,0.08)
    box("ControllerArmor",(0.86,1.78,0.62),(1.82,0,0.67),(0,0,0),mats["Material_Hull"],lod,"motor_controller_service_cover",root,0.065)
    box("TopArmor",(1.85,1.30,0.34),(1.02,0,1.105),(0,0,0),mats["Material_Hull"],lod,"armored_avionics_crown",root,0.06)

    # Construction seams: battery cassette, controller cover and avionics crown are
    # separate fastened plates, not one clay shell.  Grooves sit on the plate faces.
    plate_seam("BatterySeamTop",(0.030,1.66,0.018),(0.72,0,1.002),(0,0,0),mats["Material_Mechanical"],lod,root)
    plate_seam("ControllerSeamTop",(0.026,1.72,0.018),(1.82,0,0.9905),(0,0,0),mats["Material_Mechanical"],lod,root)
    plate_seam("CrownSeamSplit",(0.024,1.24,0.018),(1.02,0,1.112),(0,0,0),mats["Material_Mechanical"],lod,root)
    # Crown construction: safety edge rails and corner fasteners declare the avionics
    # plate as a fastened cover, never a clay roof.  Top z stays under the 1.29 shield.
    for side in (-1,1):
        box(f"CrownEdgeRail_{side}",(1.85,0.035,0.02),(1.02,side*0.6325,1.258),(0,0,0),mats["Material_Safety"],lod,"avionics_crown_edge_rail",root,0.006)
    if lod==0:
        for cx in (0.16,1.88):
            for cy in (-0.52,0.52):
                strip_edge(cylinder(f"CrownFastener_{cx}_{cy}",0.040,0.05,(cx,cy,1.2775),(0,0,0),mats["Material_Mechanical"],lod,"avionics_crown_corner_fastener",root,10,0.02))
    for side in (-1,1):
        plate_seam(f"BatterySeamSide_{side}",(0.030,0.016,0.66),(0.72,side*0.866,0.62),(0,0,0),mats["Material_Mechanical"],lod,root)
        plate_seam(f"ControllerSeamSide_{side}",(0.024,0.016,0.54),(1.82,side*0.896,0.67),(0,0,0),mats["Material_Mechanical"],lod,root)
    # Quarter-turn latch hardware on the service covers (paired with the port hatches).
    # Captive hardware is stamped metal: hard-edged, LOD0-only, one per cover edge.
    if lod==0:
        for sx in (0.30,1.14):
            for side in (-1,1):
                strip_edge(cylinder(f"BatteryLatch_{sx}_{side}",0.055,0.06,(sx,side*0.872,0.62),(math.pi/2,0,0),mats["Material_Safety"],lod,"quarter_turn_battery_latch",root,10,0.025))
        for side in (-1,1):
            strip_edge(cylinder(f"ControllerLatch_1.83_{side}",0.050,0.06,(1.83,side*0.902,0.67),(math.pi/2,0,0),mats["Material_Safety"],lod,"quarter_turn_controller_latch",root,10,0.025))

    # Side rails and paired actuators root the cutter in the chassis.
    for side in (-1,1):
        box(f"SideRail_{side}",(2.65,0.20,0.22),(1.75,side*0.99,0.45),(0,0,0),mats["Material_Mechanical"],lod,"cutter_reaction_rail",root,0.035)
        beam(f"UpperActuator_{side}",(2.05,side*0.91,0.88),(3.25,side*0.70,0.68),0.22,mats["Material_Mechanical"],lod,"cutter_yoke_actuator",root,0.025)
        beam(f"LowerActuator_{side}",(2.05,side*0.91,0.25),(3.25,side*0.70,0.48),0.20,mats["Material_Mechanical"],lod,"cutter_yoke_reaction_link",root,0.025)
        cylinder(f"ActuatorPinRear_{side}",0.11,0.28,(2.05,side*0.91,0.88),(math.pi/2,0,0),mats["Material_Safety"],lod,"serviceable_actuator_pin",root,14,0.04)
        cylinder(f"ActuatorPinFront_{side}",0.10,0.24,(3.25,side*0.70,0.68),(math.pi/2,0,0),mats["Material_Safety"],lod,"serviceable_yoke_pin",root,14,0.04)

    # RCS station-keeping: recessed-throat pods seated on the four rail ends, inside
    # the frozen 5 x 2.4 x 1.33m envelope so runtime clearance math does not change.
    for side in (-1,1):
        rcs_pod("RcsRear",0.62,side*0.98,0.64,side,mats["Material_Mechanical"],lod,root)
        rcs_pod("RcsForward",2.95,side*0.98,0.64,side,mats["Material_Mechanical"],lod,root)

    # Heat rejection is directional and tied to battery/controller volumes.
    fin_count=5 if lod==0 else 3 if lod==1 else 2
    for index in range(fin_count):
        x=0.28+index*(1.05/max(1,fin_count-1))
        box(f"RadiatorFin_{index}",(0.12,1.92,0.28),(x,0,1.01),(0,0,0),mats["Material_Radiator"],lod,"battery_heat_rejection_fin",root,0.025)
    box("RadiatorRoot",(1.30,1.98,0.14),(0.80,0,0.94),(0,0,0),mats["Material_Mechanical"],lod,"radiator_cold_plate_root",root,0.03)

    # Coolant loop: paired hardlines from the cold plate to the cutter bearings.
    for side in (-1,1):
        beam(f"CoolantLine_{side}",(1.42,side*0.94,0.92),(2.96,side*0.84,0.72),0.07,mats["Material_Cable"],lod,"cutter_bearing_coolant_hardline",root,0.012)

    # Tool yoke encloses the spin hook at x=2.8 and supports the drum at x=3.45.
    box("ToolYoke",(0.62,1.72,0.34),(2.84,0,0.62),(0,0,0),mats["Material_Mechanical"],lod,"rotary_tool_yoke",root,0.055)
    for side in (-1,1):
        box(f"ToolGuard_{side}",(1.15,0.17,0.62),(3.42,side*1.11,0.56),(0,0,0),mats["Material_Safety"],lod,"pinch_point_tool_guard",root,0.035)
    # Debris shield: spall from the drum cannot arc back into the avionics crown.
    # The crown plate clears the spinning drum (drum top z=1.17, shield bottom 1.19)
    # and stays within the 8% envelope guard: flat plate, no tilted lip past the roof.
    box("DebrisShieldTop",(1.30,2.02,0.10),(3.18,0,1.24),(0,0,0),mats["Material_Safety"],lod,"cutter_spall_deflector_crown",root,0.025)
    box("DebrisShieldRoot",(0.16,2.02,0.52),(2.48,0,0.66),(0,0,0),mats["Material_Safety"],lod,"cutter_spall_root_bulkhead",root,0.03)

    cylinder("CutterDrum",0.61,0.82,(3.52,0,0.56),(0,math.pi/2,0),mats["Material_Tool"],lod,"rotating_cutter_drum",root,28,0.045)
    # Grease collar buries the drum/yoke interface so the spindle reads as a sealed
    # bearing assembly rather than a cylinder intersecting a block.
    cylinder("DrumGreaseCollar",0.615,0.075,(3.115,0,0.56),(0,math.pi/2,0),mats["Material_Mechanical"],lod,"sealed_spindle_grease_collar",root,18,0.03)
    cylinder("CutterNose",0.31,0.92,(4.14,0,0.56),(0,math.pi/2,0),mats["Material_Tool"],lod,"indexed_cutter_hub",root,18,0.045)
    # Helical cutting path: three staggered rings of wedding-pick teeth rather than a
    # single crown plane, so the silhouette shows the working twist of a roadheader head.
    # Carbide is hard-edged by manufacture; sliver bevels bake degenerate UV faces.
    ring_plan=[(6,3.62,0.0),(6,3.74,13.0),(6,3.86,26.0)] if lod==0 else ([(4,3.64,0.0),(4,3.78,30.0)] if lod==1 else [(3,3.68,0.0),(3,3.80,45.0)])
    tooth_index=0
    for teeth,ring_x,offset_deg in ring_plan:
        for index in range(teeth):
            angle=math.tau*index/teeth+math.radians(offset_deg)
            y=math.cos(angle)*0.54
            z=0.56+math.sin(angle)*0.54
            holder=box(f"CutterTooth_{tooth_index}",(0.10,0.16,0.12),(ring_x,y,z),(0,0,0),mats["Material_Tool"],lod,"wedding_pick_carbide_holder",root,0.02)
            strip_edge(holder)
            # Conical point aimed outboard of the holder.
            bit=cylinder(f"CutterBit_{tooth_index}",0.045,0.16,(ring_x,math.cos(angle)*0.60,0.56+math.sin(angle)*0.60),(angle-math.pi/2,0,0),mats["Material_Tool"],lod,"brazed_carbide_conical_bit",root,10,0.012)
            strip_edge(bit)
            tooth_index+=1
            tooth_index+=1
    # A central pilot cutter reaches the canonical front envelope without using a smooth cone.
    cylinder("PilotCutter",0.18,0.46,(4.37,0,0.56),(0,math.pi/2,0),mats["Material_Tool"],lod,"replaceable_pilot_cutter",root,16,0.04)

    # Bounded work optics and analysis aperture; no full-body emissive wash.
    box("SensorBrow",(0.45,0.76,0.24),(3.06,0,1.04),(0,0,0),mats["Material_Mechanical"],lod,"sensor_micrometeoroid_brow",root,0.035)
    box("WorkOptic",(0.24,0.48,0.22),(3.27,0,0.95),(0,0,0),mats["Material_Accent"],lod,"bounded_work_volume_optic",root,0.028)

    if lod<2:
        cable_count=8 if lod==0 else 4
        for index in range(cable_count):
            side=-1 if index%2==0 else 1
            offset=(index//4)*0.14
            run=(index//2)%2
            beam(f"PowerHarness_{index}",(1.40+run*0.22,side*(0.80-offset),0.42+run*0.06),(2.72,side*(0.78-offset),0.58+offset+run*0.08),0.085-run*0.02,mats["Material_Cable"],lod,"motor_power_harness",root,0.014)
        box("ServiceHatch",(0.58,0.10,0.42),(0.65,-0.91,0.62),(0,0,0),mats["Material_Safety"],lod,"battery_service_release",root,0.025)
        box("ControllerHatch",(0.48,0.10,0.34),(1.83,-0.94,0.68),(0,0,0),mats["Material_Safety"],lod,"controller_service_release",root,0.025)
        # v3 asymmetric runs: port carries the data bus on clamped conduit, starboard a
        # secondary coolant loop; a real machine dresses its two sides differently.
        beam("PortDataConduit",(0.30,-0.866,0.55),(2.70,-0.826,0.62),0.060,mats["Material_Cable"],lod,"avionics_data_bus_conduit",root,0.010)
        clamp_count=3 if lod==0 else 2
        for c in range(clamp_count):
            cx=0.90+c*(1.40/max(1,clamp_count-1))
            box(f"PortConduitClamp_{c}",(0.085,0.065,0.125),(cx,-0.883,0.575),(0,0,0),mats["Material_Mechanical"],lod,"conduit_saddle_clamp",root,0.010)
        beam("StarboardCoolantLoop",(0.40,0.882,0.50),(2.90,0.842,0.66),0.050,mats["Material_Cable"],lod,"secondary_coolant_return_loop",root,0.010)
        if lod==0:
            box("StarboardRelayBox",(0.40,0.085,0.30),(1.10,0.905,0.55),(0,0,0),mats["Material_Safety"],lod,"harness_relay_junction_box",root,0.025)

    if lod==0:
        # Optic hood and tow bolts: service hardware sized for a five-metre asset.
        box("OpticHood",(0.28,0.52,0.05),(3.27,0,1.078),(0,0,0),mats["Material_Safety"],lod,"work_optic_spray_hood",root,0.012)
        for side in (-1,1):
            strip_edge(cylinder(f"TowBolt_{side}",0.052,0.055,(-0.36,side*0.28,0.30),(0,math.pi/2,0),mats["Material_Safety"],lod,"rear_bumper_tow_bolt",root,12,0.02))
        for index,x in enumerate((0.72,1.82)):
            for side in (-1,1):
                strip_edge(cylinder(f"ArmorFastener_{index}_{side}",0.045,0.10,(x,side*0.87,0.78),(math.pi/2,0,0),mats["Material_Mechanical"],lod,"captive_service_fastener",root,10,0.03))


def apply_modifiers_uv() -> list[str]:
    failures=[]
    for obj in sorted((item for item in bpy.data.objects if item.type=="MESH"),key=lambda item:item.name):
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        for modifier in list(obj.modifiers):
            try: bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception as exc: failures.append(f"{obj.name}/{modifier.name}: {exc}")
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        obj.data.validate(clean_customdata=False)
        for polygon in obj.data.polygons: polygon.use_smooth=True
        if not obj.data.uv_layers: obj.data.uv_layers.new(name="UVMap")
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(58),island_margin=0.014)
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception as exc:
            failures.append(f"{obj.name}/UV: {exc}")
            if obj.mode!="OBJECT": bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return failures


def parent_preserve_world(obj,parent) -> None:
    matrix=obj.matrix_world.copy()
    obj.parent=parent
    obj.matrix_world=matrix


def join_groups(materials,root,spin_hook,emissive_hook) -> None:
    counts=[]
    for obj in sorted((o for o in bpy.data.objects if o.type=="MESH"),key=lambda o:o.name):
        obj.data.calc_loop_triangles()
        counts.append({"name":obj.name,"tris":len(obj.data.loop_triangles)})
    counts.sort(key=lambda c:-c["tris"])
    print(f"[piece-cost] {json.dumps(counts[:24])}",flush=True)
    for lod in range(3):
        for material_name,material_value in materials.items():
            matches=[obj for obj in bpy.data.objects if obj.type=="MESH" and obj.name.startswith(f"LOD{lod}_") and obj.data.materials and obj.data.materials[0]==material_value]
            if not matches: continue
            bpy.ops.object.select_all(action="DESELECT")
            for obj in matches: obj.select_set(True)
            bpy.context.view_layer.objects.active=matches[0]
            if len(matches)>1: bpy.ops.object.join()
            joined=bpy.context.object
            joined.name=f"LOD{lod}_Drone_{material_name}"
            owner=spin_hook if material_name=="Material_Tool" else emissive_hook if material_name=="Material_Accent" else root
            parent_preserve_world(joined,owner)
            joined["spaceface.lod"]=f"lod{lod}"
            joined["spaceface.lodLevel"]=lod
            joined["spaceface.materialRole"]=material_name
            joined["spaceface.structureRole"]="merged_functional_draw_group"
            modifier=joined.modifiers.new("SF_ExportTriangulate","TRIANGULATE")
            modifier.keep_custom_normals=True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            joined.select_set(False)


def tangent_results() -> list[dict]:
    results=[]
    for obj in sorted((item for item in bpy.data.objects if item.type=="MESH"),key=lambda item:item.name):
        mesh=obj.data
        mesh.calc_loop_triangles()
        valid=False; error=None
        try:
            mesh.calc_tangents(uvmap=mesh.uv_layers[0].name)
            lengths=[loop.tangent.length for loop in mesh.loops]
            valid=bool(lengths) and min(lengths)>0.985 and max(lengths)<1.015
            if not valid and lengths:
                bad=sum(1 for v in lengths if v<=0.985 or v>=1.015)
                print(f"[tangent-detail] {obj.name}: min={min(lengths):.4f} max={max(lengths):.4f} bad={bad}/{len(lengths)}",flush=True)
        except Exception as exc: error=str(exc)
        finally:
            try: mesh.free_tangents()
            except Exception: pass
        results.append({"object":obj.name,"valid":valid,"error":error,"loops":len(mesh.loops)})
    return results


def triangles(obj)->int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(objects):
    points=[obj.matrix_world@Vector(corner) for obj in objects for corner in obj.bound_box]
    low=[min(point[axis] for point in points) for axis in range(3)]
    high=[max(point[axis] for point in points) for axis in range(3)]
    return {"min":low,"max":high,"size":[high[i]-low[i] for i in range(3)]}


def export_glb(target:Path,root) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type not in {"LIGHT","CAMERA"}: obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    target.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target),export_format="GLB",use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials="EXPORT")
    bpy.ops.object.select_all(action="DESELECT")


def family_update(report_path:Path,maps_manifest:Path)->Path:
    target=report_path.with_name("opening-route-industrial-prop-family-update.json")
    value={
        "schema":"spaceface.openingRouteIndustrialPropFamily.v1","status":"candidate-not-promoted","surfaceManifest":str(maps_manifest.resolve()),
        "place_mining_drone":{"candidateState":"implemented-not-promoted","identity":"compact autonomous rotary cutter drone","functionalZones":["battery cassette","motor controller","reaction frame","paired actuators","rotary carbide cutter","ranging optic","radiator","service harnesses"]},
        "sharedRules":{"paint":"industrial coated service covers, never whole-object metal","structure":"dark alloy load paths remain visible","tools":"separate material and animation hierarchy","signals":"finite optics only","safety":"pinch points and service releases only","scale":"fastener and cable sizes remain plausible at five-metre asset scale"},
        "nonGoals":["mining gameplay changes","generic glowing box","single-material plastic","decorative random greeble","tool identity by color alone"],
    }
    target.write_text(json.dumps(value,indent=2),encoding="utf-8")
    return target


def main() -> None:
    args=cli()
    args.maps_root=args.maps_root.resolve();args.output_blend=args.output_blend.resolve();args.output_glb=args.output_glb.resolve();args.report=args.report.resolve()
    source_path=Path(bpy.data.filepath).resolve();maps_manifest=args.maps_root/"surface-map-build.json"
    root=bpy.data.objects.get("place_mining_drone")
    socket=bpy.data.objects.get("SOCKET_Mining_Front")
    spin=bpy.data.objects.get("HOOK_Spin")
    emissive=bpy.data.objects.get("HOOK_Emissive")
    if any(item is None for item in (root,socket,spin,emissive)): raise RuntimeError("Expected mining drone root, socket and animation hooks")
    marker_names=[obj.name for obj in bpy.data.objects if obj.type=="EMPTY"]
    preserved={name:{"location":list(bpy.data.objects[name].location),"rotation":list(bpy.data.objects[name].rotation_euler),"scale":list(bpy.data.objects[name].scale),"parent":bpy.data.objects[name].parent.name if bpy.data.objects[name].parent else None} for name in marker_names}
    for obj in list(bpy.data.objects):
        if obj.type=="MESH": bpy.data.objects.remove(obj,do_unlink=True)
    for item in list(bpy.data.materials): bpy.data.materials.remove(item,do_unlink=True)
    for item in list(bpy.data.images): bpy.data.images.remove(item,do_unlink=True)
    materials={name:material(name,role,args.maps_root) for name,role in ROLE_BY_MATERIAL.items()}
    for lod in range(3): build_lod(lod,materials,root)
    failures=apply_modifiers_uv()
    join_groups(materials,root,spin,emissive)
    tangents=tangent_results();invalid=[entry for entry in tangents if not entry["valid"]]
    if invalid: raise RuntimeError(f"Tangent validation failed: {invalid[:5]}")
    scale_failures=[obj.name for obj in bpy.data.objects if obj.type=="MESH" and any(abs(float(v)-1)>1e-5 for v in obj.scale)]
    if scale_failures: raise RuntimeError(f"Unapplied scale: {scale_failures[:8]}")
    lod_meshes={lod:sorted([obj for obj in bpy.data.objects if obj.type=="MESH" and obj.name.startswith(f"LOD{lod}_Drone_")],key=lambda item:item.name) for lod in range(3)}
    lod_stats={f"lod{lod}":{"triangles":sum(triangles(obj) for obj in meshes),"drawGroups":len(meshes),"objects":[obj.name for obj in meshes]} for lod,meshes in lod_meshes.items()}
    candidate_bounds=bounds(lod_meshes[0])
    size_drift=[abs(candidate_bounds["size"][axis]-SOURCE_BOUNDS["size"][axis])/SOURCE_BOUNDS["size"][axis] for axis in range(3)]
    corner_drift=[abs(candidate_bounds["min"][axis]-SOURCE_BOUNDS["min"][axis]) for axis in range(3)]
    if any(value>0.08 for value in size_drift) or any(value>0.16 for value in corner_drift): raise RuntimeError(f"Source scale/pivot drift outside guard: size={size_drift}, min={corner_drift}, bounds={candidate_bounds}")
    # Animation hierarchy is a hard visual/runtime contract.
    hierarchy={obj.name:obj.parent.name if obj.parent else None for obj in bpy.data.objects if obj.type=="MESH"}
    if not all(hierarchy.get(f"LOD{lod}_Drone_Material_Tool")==spin.name for lod in range(3)): raise RuntimeError(f"Cutter hierarchy lost: {hierarchy}")
    if not all(hierarchy.get(f"LOD{lod}_Drone_Material_Accent")==emissive.name for lod in range(3)): raise RuntimeError(f"Optic hierarchy lost: {hierarchy}")
    root["spaceface.family"]="opening_route_industrial_props_v1";root["spaceface.surfaceRevision"]="opening_mining_drone_v3"
    root["spacefaceAssetJson"]=json.dumps({"contractVersion":1,"assetId":"place_mining_drone","partId":"place_mining_drone","liveId":"place_mining_drone","slot":"place","forward":"+X","up":"+Y","starboard":"+Z","unit":"metre","normalConvention":"OpenGL","ormChannels":"R=AO,G=Roughness,B=Metallic","textureCompression":"PNG-source/KTX2-release-candidate","textureSize":512,"family":"opening_route_industrial_props_v1","role":"autonomous_rotary_mining_drone","deliverableRole":"production_multi_lod_candidate","lods":["lod0","lod1","lod2"],"lodTriangles":{key:value["triangles"] for key,value in lod_stats.items()},"drawGroupsPerLod":{key:value["drawGroups"] for key,value in lod_stats.items()},"wiringStatus":"candidate_not_promoted"},separators=(",",":"))
    bpy.context.scene["spacefaceAssetJson"]=root["spacefaceAssetJson"]
    args.output_blend.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend),check_existing=False)
    export_glb(args.output_glb,root)
    family_path=family_update(args.report,maps_manifest)
    report={"schema":"spaceface.openingMiningDroneRemaster.v3","status":"candidate-not-promoted","source":{"path":str(source_path),"sha256":sha256(source_path)},"surfaceManifest":{"path":str(maps_manifest),"sha256":sha256(maps_manifest)},"outputs":{"blend":{"path":str(args.output_blend),"sha256":sha256(args.output_blend)},"glb":{"path":str(args.output_glb),"sha256":sha256(args.output_glb)},"familyUpdate":{"path":str(family_path),"sha256":sha256(family_path)}},"preservedContract":{"sourceBounds":SOURCE_BOUNDS,"candidateBounds":candidate_bounds,"relativeSizeDrift":size_drift,"minimumCornerDriftM":corner_drift,"markers":preserved,"meshHierarchy":hierarchy},"materials":[{"name":name,"textureRole":role} for name,role in ROLE_BY_MATERIAL.items()],"lod":lod_stats,"modifierOrUvFailures":failures,"tangents":tangents,"knownDefects":["Candidate has not been promoted or inspected on the live player route.","Mining/drilling behavior was intentionally not changed and must be validated by the owning gameplay lane after visual promotion.","Runtime spin, optic intensity, tool alignment and mining-laser origin require live checks against the preserved hooks/socket.","KTX2 binding, release optimization, collision and LOD thresholds remain controller-owned integration work."]}
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps({"ok":True,"blend":str(args.output_blend),"glb":str(args.output_glb),"report":str(args.report),"lod":lod_stats,"bounds":candidate_bounds,"hierarchy":hierarchy}))


if __name__=="__main__": main()
