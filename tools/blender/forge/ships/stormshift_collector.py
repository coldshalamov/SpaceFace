"""Stormshift collector: low storm jaws, folding fans.

New anatomy; shared Forge finishes/textures only. +X nose, +Y port, +Z up.
Candidate-only: no fleet lookup, live export or manifest mutation. Run:
  blender -b -t 2 --python tools/blender/forge/ships/stormshift_collector.py -- --render
The GLB is authored in working rest pose. stormshiftRig extras describe rigid stowed
poses for later motion-bank integration; they do NOT imply an installed runtime action.
CPU renders prove geometry only, not the game Look or target-GPU acceptance.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import forge as F
import forge_export as E

SHIP_ID = 'stormshift_collector'
SPEC = {'layout': 'npc', 'file': 'ship_stormshift_collector_v01',
        'asset_id': 'SF_STORMSHIFT_COLLECTOR_V01',
        'part_id': 'wholeship_stormshift_collector',
        'npc_root': 'STORMSHIFT_COLLECTOR_ROOT'}
COLORS = {'paint': '#668480', 'paint2': '#353f47', 'stripe': '#b65e2f',
          'ceramic': '#252b30', 'hazard': '#b88738'}
# Four finite positions, individually hideable, no unbounded decorative cargo yard.
LOAD_POSITIONS = [(-2.4, 2.6, 1.0), (0.1, 2.6, 1.0),
                  (-2.4, -2.6, 1.0), (0.1, -2.6, 1.0)]


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.rig_contract = {'version': 1, 'restState': 'harvest',
                      'blenderAxes': '+X nose,+Y port,+Z up',
                      'gltfAxes': '+X nose,+Y up,+Z starboard',
                      'groups': [], 'loadPositions': [],
                      'states': ['harvest', 'transit'],
                      'pendingStates': ['transfer behavior', 'disabled behavior'],
                      'collision': 'Forge convex envelope; mouth/fan gaps require compound runtime collider review',
                      'integration': 'candidate; no runtime motion bank registered'}
    F.loft(s, 'ProtectedDriveBody', [
        dict(x=-5.7,w=2.5,ht=.65,hb=.65,n=3.4),
        dict(x=-4.4,w=3.8,ht=.85,hb=.8,n=3.4),
        dict(x=-.6,w=3.9,ht=.7,hb=.7,n=3.5),
        dict(x=2.1,w=2.9,ht=.45,hb=.5,n=3.2),
        dict(x=3.0,w=2.1,ht=.25,hb=.3,n=3.0)], belly='ceramic', count=32)
    F.loft(s, 'CompressedCabin', [dict(x=-2.2,w=1.25,ht=.25,hb=.1,zc=.8,n=3),
        dict(x=-1.3,w=1.5,ht=.95,hb=.2,zc=.8,n=3),
        dict(x=.8,w=1.45,ht=.75,hb=.2,zc=.8,n=3),
        dict(x=1.7,w=.9,ht=.3,hb=.1,zc=.8,n=3)], material='paint2',count=24)
    F.canopy(s, 'PilotVisor', .1, 1.65, .95, .27, 1.39)
    F.band(s, 'ProtectedDriveBody', (-3.8,0,0),(1,0,0),.65,'stripe')
    F.box(s,'CabinRoof',( -1.0,0,1.77),(1.55,1.6,.15),'paint',bevel=.08)
    F.beacon(s,'Beacon',(-1.1,0,1.9),size=.16)
    # Twin engines live between ceramic shoulders, protected from the working lip.
    for side,sign in [('port',1),('starboard',-1)]:
        y=sign*1.65
        F.loft(s, 'DriveShroud_'+side,[dict(x=-6.5,w=.91,ht=.82,hb=.7,y=y,n=3),
            dict(x=-4.5,w=1.0,ht=.8,hb=.7,y=y,n=3)],material='paint2',count=24)
        F.nozzle(s,'Drive_'+side,(-6.62,y,0),.63,1.1,segments=24)
        s.socket('SOCKET_Nozzle_'+side.title(),(-6.65,y,0),(-1,0,0))
        s.socket('SOCKET_Trail_'+side.title(),(-6.75,y,0),(-1,0,0))
        F.vent(s,'DriveCooling_'+side,(-4.8,y,.85),(1.45,1.15,.12),slats=5)
        # Cheeks attach to a visible hinge at their broad root. The space between
        # the lips is genuinely empty, not a black painted plate.
        pivot=(1.2,sign*3.4,0)
        F.cylinder(s,'CheekMount_'+side,(1.2,sign*3.4,-.75),(1.2,sign*3.4,.8),.53,
                   material='gunmetal',segments=20)
        F.cylinder(s,'IntakeRootDuct_'+side,(.4,sign*2.45,-.05),(1.2,sign*3.4,-.05),.48,
                   material='gunmetal',segments=20)
        F.box(s,'HingeRootBridge_'+side,(1.0,sign*2.85,.61),(.95,1.6,.3),'paint2',bevel=.08)
        start=len(s.objects)
        outline=[(.7,2.9),(2.4,2.5),(7.7,3.8),(8.9,4.7),(8.6,6.1),(6.3,6.7),(2.0,5.5),(.6,4.2)]
        outline=[(x,sign*y) for x,y in outline]
        if sign<0: outline.reverse()
        F.plate(s,'IntakeCheek_'+side,outline,-.5,.65,'paint2',chamfer=.13,side_material='ceramic')
        # A low dark trough sits between the inner heat lip and a thick outer
        # cheek shoulder. It is open upward/inward, not a painted black grille.
        shoulder=[(.7,4.0),(1.4,3.65),(6.9,4.86),(8.52,5.48),(8.6,6.1),
                  (6.3,6.7),(2.0,5.5),(.6,4.2)]
        shoulder=[(x,sign*y) for x,y in shoulder]
        if sign<0:shoulder.reverse()
        F.plate(s,'CollectorShoulder_'+side,shoulder,.14,.56,'paint',chamfer=.14,side_material='paint2')
        F.band(s,'CollectorShoulder_'+side,(6.7,0,0),(1,0,0),.65,'stripe')
        throat=[(1.65,2.93),(7.54,4.14),(8.4,4.8),(8.24,5.28),(6.8,4.58),(1.5,3.43)]
        throat=[(x,sign*y) for x,y in throat]
        if sign<0:throat.reverse()
        F.plate(s,'RecessedIntakeThroat_'+side,throat,.155,.025,'dark')
        ribs=[]
        for k in range(7):
            x=2.3+k*.74;y=3.0+(x-2.0)*.22
            ribs.append(((x,sign*(y+.06),.25),(x-.22,sign*(y+.62),.48)))
        F.beams(s,'IntakeFlowVanes_'+side,ribs,.085,'gunmetal',h=.11)

        # Scorch protection is coherent modelled ceramic along the hot inner edge.
        hot=[(2.0,2.58),(7.7,3.84),(8.65,4.62),(8.38,4.97),(7.45,4.28),(1.95,3.0)]
        hot=[(x,sign*y) for x,y in hot]
        if sign<0: hot.reverse()
        F.plate(s,'HeatLip_'+side,hot,.15,.43,'ceramic',chamfer=.03)
        F.sweep(s,'HotWorkingEdge_'+side,[(2.2,sign*2.73,.59),(7.5,sign*3.99,.59),
                 (8.42,sign*4.7,.59)],.055,.045,'glow_amber')
        F.box(s,'LipBumper_'+side,(8.67,sign*5.3,.12),(.35,1.1,.75),'gunmetal',bevel=.1)
        F.light(s,'Navigation_'+side,(8.5,sign*5.8,.65),
                finish='glow_red' if sign>0 else 'glow_green',size=.11)
        rig='stormshift_cheek_'+side
        s.motion_group(rig,pivot,s.objects[start:])
        s.rig_contract['groups'].append({'id':rig,'pivotBlender':pivot,
            'stowedRotationZ':math.radians(-sign*18),'role':'collector'})
        # Three separate rigid radiator blades fan from one mechanically attached hub.
        hub=(-3.9,sign*3.55,.15)
        F.cylinder(s,'FanHub_'+side,(hub[0],hub[1],-.25),(hub[0],hub[1],1.32),.6,
                   material='gunmetal',segments=20)
        for leaf,deg in enumerate((18,43,68)):
            start=len(s.objects)
            a=math.pi-sign*math.radians(deg)
            z=.3+leaf*.38
            def point(u,v):
                return (hub[0]+u*math.cos(a)-v*math.sin(a),hub[1]+u*math.sin(a)+v*math.cos(a))
            blade=[point(.25,-.37),point(4.9,-.68),point(5.45,-.38),point(5.45,.38),point(4.9,.68),point(.25,.37)]
            F.plate(s,f'FanBlade_{side}_{leaf}',blade,z,.14,'ceramic',chamfer=.035)
            inset=[point(.8,-.26),point(4.95,-.43),point(5.1,.0),point(4.95,.43),point(.8,.26)]
            F.plate(s,f'FanCore_{side}_{leaf}',inset,z+.15,.035,'ceramic')
            ribs=[]
            for k in range(9):
                u=1.0+k*.43
                p,q=point(u,-.36),point(u,.36)
                ribs.append(((p[0],p[1],z+.22),(q[0],q[1],z+.22)))
            F.beams(s,f'FanFins_{side}_{leaf}',ribs,.045,'gunmetal',h=.055)
            p,q=point(.4,0),point(5.28,0)
            F.beams(s,f'FanSpine_{side}_{leaf}',[((p[0],p[1],z+.24),(q[0],q[1],z+.24))],.085,'gunmetal')
            rig=f'stormshift_fan_{side}_{leaf}'
            s.motion_group(rig,(hub[0],hub[1],z),s.objects[start:])
            s.rig_contract['groups'].append({'id':rig,'pivotBlender':(hub[0],hub[1],z),
                'stowedRotationZ':math.radians(sign*(deg-8)), 'role':'radiator'})
    # Exposed cargo saddles remain on the hull when an individual canister leaves.
    for i,(x,y,z) in enumerate(LOAD_POSITIONS):
        F.box(s,f'LoadWell_{i}',(x,y,.75),(2.1,1.3,.15),'dark',bevel=.05)
        for dx in (-.65,.65):
            F.box(s,f'Saddle_{i}_{dx}',(x+dx,y,.95),(.16,1.1,.45),'gunmetal',bevel=.05)
        start=len(s.objects)
        F.cylinder(s,f'Canister_{i}',(x-.84,y,1.27),(x+.84,y,1.27),.43,
                   material='paint',segments=20)
        for dx in (-.68,.68):
            F.ring(s,f'CanisterCollar_{i}_{dx}',(x+dx,y,1.27),.44,.065,material='gunmetal',segments=20,sides=6)
        F.cylinder(s,f'CanisterValve_{i}',(x+.83,y,1.27),(x+1.02,y,1.27),.17,
                   material='gunmetal',segments=12)
        s.hook_part(f'HOOK_SECONDARY_CANISTER_{i}',*s.objects[start:])
        socket=f'SOCKET_Load_{i}'
        s.socket(socket,(x,y,1.27),(0,0,1))
        s.rig_contract['loadPositions'].append({'index':i,'socket':socket,
            'hook':f'HOOK_SECONDARY_CANISTER_{i}','positionBlender':[x,y,1.27]})
    F.box(s,'TransferCoupler',( -3.5,0,.87),(.55,.9,.25),'gunmetal',bevel=.08)
    s.socket('SOCKET_Transfer',(-3.5,0,1.03),(0,0,1))
    s.socket('SOCKET_Collector',(5.8,0,0),(1,0,0))
    s.socket('SOCKET_Engine_Main',(-6.65,0,0),(-1,0,0))
    s.socket('SOCKET_Trail_Main',(-6.75,0,0),(-1,0,0))
    s.hook('HOOK_DRIVE_CORE',(-6.4,0,0))
    return s


def preview_source(s,out,render=False):
    # Retain actual Forge materials and UVs; no style substitutions.
    keep=set(s.objects)|set(s.motion_pivots.values())
    for o in list(bpy.context.scene.objects):
        if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
    for pivot in s.motion_pivots.values():pivot.parent=None
    for group in s.motion_groups:
        pivot=s.motion_pivots[group['id']]
        for o in group['objects']:
            world=o.matrix_world.copy();o.parent=pivot;o.matrix_world=world
    for material in s._mats.values():
        key=material.get('forgeKey','paint')
        color=s.colors.get(key,s.colors.get(key.split('.')[0],'#668480'))
        material.diffuse_color=(*F.hex_rgb(color),1)
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.device='CPU'
    scene.cycles.samples=24
    scene.cycles.use_denoising=False
    scene.render.resolution_x=1000
    scene.render.resolution_y=850
    scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('StormshiftProofWorld')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.12,.17,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    for name,pos,energy,size,color in [('Key',(4,-7,18),2400,10,(1,.87,.73)),
        ('Fill',(-7,8,12),1900,9,(.58,.77,1)),('Rim',(-12,-5,7),1600,7,(1,.55,.25))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=pos
        obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
    cam=bpy.data.objects.new('ProofCamera',bpy.data.cameras.new('ProofCamera'))
    scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO'
    scene.frame_start=1;scene.frame_end=60
    scene.timeline_markers.new('HARVEST / OPEN',frame=1)
    scene.timeline_markers.new('TRANSIT / STOWED',frame=60)
    for frame in (1,60):
        for g in s.rig_contract['groups']:
            pivot=s.motion_pivots[g['id']]
            pivot.rotation_euler.z=g['stowedRotationZ'] if frame==60 else 0
            pivot.keyframe_insert(data_path='rotation_euler',frame=frame)
    for state,frame in [('harvest',1),('transit',60)]:
        scene.frame_set(frame)
        cam.location=(-16,-20,34)
        cam.rotation_euler=(Vector((-.4,0,.2))-cam.location).to_track_quat('-Z','Y').to_euler()
        cam.data.ortho_scale=26
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type=='VIEW_3D':
                    area.spaces.active.shading.type='SOLID'
                    area.spaces.active.shading.color_type='MATERIAL'
                    area.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
                    area.spaces.active.region_3d.view_distance=29
                    area.spaces.active.region_3d.view_location=(0,0,0)
        bpy.ops.object.select_all(action='DESELECT')
        for o in s.objects:o.select_set(True)
        bpy.context.view_layer.objects.active=s.objects[0]
        bpy.ops.wm.save_as_mainfile(filepath=str(out/f'{state}.blend'))
        if not render:continue
        for view,pos,scale in [('top',(0,0,35),26),('chase',(-16,-20,34),26),('close',(14,-18,22),23)]:
            if state=='transit' and view=='close':continue
            cam.location=pos;cam.rotation_euler=(Vector((-.4,0,.2))-cam.location).to_track_quat('-Z','Y').to_euler()
            cam.data.ortho_scale=scale
            scene.render.filepath=str(out/f'{state}-{view}.png')
            bpy.ops.render.render(write_still=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--render',action='store_true')
    p.add_argument('--out',type=Path,default=HERE.parents[3]/'.devshots/stormshift-collector')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    args.out.mkdir(parents=True,exist_ok=True)
    ship=build().finish()
    ship.rig_contract['sourceSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    lo,hi=E.ship_bounds(ship)
    assert (hi.z-lo.z)<3.5 and (hi.y-lo.y)>16, 'Collector must stay broad and low'
    written=E.export_ship(ship,SPEC,out_dir=str(args.out),preview=True)
    # Preserve custom socket direction: current shared exporter uses defaults for unknown names.
    def stamp(doc):
        doc['asset'].setdefault('extras',{})['stormshiftRig']=ship.rig_contract
        for n in doc['nodes']:
            if n.get('name') in ship.sockets:
                n['extras']['spaceface']['forward']=E._gltf_dir(ship.sockets[n['name']][1])
                if n['name'].startswith('SOCKET_Nozzle_'):n['extras']['spaceface']['role']='vfx'
                if n['name'].startswith('SOCKET_Load_'):n['extras']['spaceface']['role']='cargo'
    for path,tris in written:E.patch_glb_json(path,stamp)
    report={'asset':SPEC,'blenderBounds':[list(lo),list(hi)],'dimensionsBlender':list(hi-lo),
            'lod0Triangles':written[0][1],'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'rig':ship.rig_contract,'evidence':'CPU source proof only; runtime integration/visual/GPU acceptance pending'}
    (args.out/'source-report.json').write_text(json.dumps(report,indent=2)+'\n')
    preview_source(ship,args.out,render=args.render)
