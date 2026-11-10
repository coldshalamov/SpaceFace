"""Stormshift cooling rack: folded shield, exposed spine.

Candidate only; does not register physics or cooling powers. +X nose, +Y port,
+Z up. Three physical presentations share load/berth sockets. Run with --render
for CPU geometry proofs; actual runtime Look/GPU acceptance is separate.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent))
import forge as F
import forge_export as E

COLORS={'paint':'#668480','paint2':'#353f47','stripe':'#b65e2f',
        'ceramic':'#252b30','hazard':'#b88738'}
STATES=('intact','damaged','repaired')
LOADS=[(-3.6,-1.45,1.05),(-1.2,-1.45,1.05),(1.2,-1.45,1.05),(3.6,-1.45,1.05)]

def build(state='intact'):
    assert state in STATES
    F.reset_scene()
    s=F.Ship('stormshift_cooling_rack_'+state,COLORS)
    s.socket_names=['SOCKET_Tow','SOCKET_Berth_A','SOCKET_Berth_B','SOCKET_Transfer']+[f'SOCKET_Load_{i}' for i in range(4)]
    s.contract={'version':1,'state':state,'axesBlender':'+X nose,+Y port,+Z up',
        'axesGltf':'+X nose,+Y up,+Z starboard','loadPositions':[],
        'collision':{'status':'proposed compound; runtime authority must adopt and verify',
            'units':'metres in Blender author coordinates; planar X,Y maps to game X,-Z',
            'boxes':[],'holes':[{'name':'handling-yoke','x':[5.25,6.65],'y':[-2.1,-.9]}]},
        'behavior':'one heavy body; panels are fixed presentation; no temperature/cooling mechanic',
        'compatibleCanister':{'length':1.68,'radius':.43,'valveExtension':.18},
        'repairedMeans':'replacement outer leaf, structural splice and seated berth latches; installation remains simulation-owned'}
    def proxy(name,center,size):
        s.contract['collision']['boxes'].append({'name':name,'centerBlender':center,'sizeBlender':size})
    # Double flange spine with a deep recessed mechanical channel.
    F.box(s,'SpineCore',(0,0,0),(10.4,1.05,.8),'paint2',bevel=.15)
    for y in (-.5,.5):
        F.box(s,'SpineFlange'+str(y),(0,y,.37),(10.5,.19,.26),'paint',bevel=.045)
    F.box(s,'SpineInlay',(0,0,.43),(8.8,.54,.14),'gunmetal',bevel=.04)
    F.beams(s,'SpineCrossWebs',[((x,-.44,.51),(x,.44,.51)) for x in (-4,-2,0,2,4)],.1,'paint2')
    for x in (-4.75,4.75):
        F.box(s,'EndCap'+str(x),(x,0,.1),(.56,1.22,1.0),'paint',bevel=.12)
        F.band(s,'EndCap'+str(x),(x,0,0),(1,0,0),.2,'stripe')
    proxy('spine',(0,0,0),(10.5,1.2,1.0))
    # Three accordion bays. Each broad leaf is a real tilted panel with a hinge,
    # perimeter rail, and shallow ribbed radiator surface; the folds are physical.
    for bay,x in enumerate((-3.35,0,3.35)):
        for leaf,(y0,y1,z0,z1) in enumerate(((.62,3.0,.25,1.28),(3.0,5.3,1.28,.38))):
            if state=='damaged' and bay==0 and leaf==1:continue
            start=len(s.objects)
            width=3.05
            if state=='damaged' and bay==0:z1=.68
            dy=y1-y0;dz=z1-z0;length=math.hypot(dy,dz);angle=math.atan2(dz,dy)
            center=(x,(y0+y1)/2,(z0+z1)/2)
            F.box(s,f'Radiator_{bay}_{leaf}',center,(width,length,.17),'ceramic',bevel=.05,rot=(angle,0,0))
            rails=[]
            for xx in (x-width/2,x+width/2):rails.append(((xx,y0,z0+.11),(xx,y1,z1+.11)))
            for yy,zz in ((y0,z0),(y1,z1)):rails.append(((x-width/2,yy,zz+.11),(x+width/2,yy,zz+.11)))
            F.beams(s,f'RadiatorFrame_{bay}_{leaf}',rails,.14,'paint2',h=.15,bevel=.025)
            ribs=[]
            for j in range(1,10):
                t=j/10;yy=y0+dy*t;zz=z0+dz*t+.105
                ribs.append(((x-width/2+.14,yy,zz),(x+width/2-.14,yy,zz)))
            F.beams(s,f'RadiatorFins_{bay}_{leaf}',ribs,.042,'gunmetal',h=.055)
            F.beams(s,f'LeafCenterRail_{bay}_{leaf}',[((x,y0,z0+.15),(x,y1,z1+.15))],.1,'paint')
            # Fixed leaves merge by finish; separate variants carry damage.
            proxy(f'panel-{bay}-{leaf}',center,(width+.14,dy+.14,abs(dz)+.32))
        # Buttressed root connects every panel to the spine.
        F.box(s,f'RootButtress_{bay}',(x,.7,.06),(1.1,.7,.5),'paint',bevel=.09)
        hinge_z=.69 if state=='damaged' and bay==0 else 1.29
        F.cylinder(s,f'FoldHinge_{bay}',(x-1.58,3,hinge_z),(x+1.58,3,hinge_z),.14,material='gunmetal',segments=16)
        if state=='damaged' and bay==0:
            F.beams(s,'BrokenHingeStubs',[((x-1.4,3,.7),(x-1.4,3.5,.48)),((x+1.4,3,.7),(x+1.4,3.3,.54))],.14,'bare')
        else:
            F.box(s,f'PanelTip_{bay}',(x,5.28,.46),(3.23,.22,.26),'paint',bevel=.07)
            F.band(s,f'PanelTip_{bay}',(x,0,0),(1,0,0),.6,'stripe')
    # Offset open U-shaped towing fork. Empty middle is not an opaque plate.
    yoke=[((4.85,-.75,.12),(6.85,-.75,.12)),((4.85,-2.25,.12),(6.85,-2.25,.12)),((6.85,-2.25,.12),(6.85,-.75,.12))]
    F.beams(s,'HandlingYoke',yoke,.3,'hazard',h=.42,bevel=.065)
    F.beams(s,'YokeRoot',[((4.9,-.4,0),(4.9,-2.3,0))],.42,'paint2',h=.55,bevel=.06)
    for cy in (-.75,-2.25):proxy('yoke-rail'+str(cy),(5.85,cy,.12),(2.3,.3,.42))
    proxy('yoke-end',(6.85,-1.5,.12),(.3,1.8,.42))
    proxy('yoke-root',(4.9,-1.35,0),(.42,2.1,.55))
    F.cylinder(s,'TowPin',(6.85,-1.5,-.3),(6.85,-1.5,.55),.21,material='bare',segments=20)
    s.socket('SOCKET_Tow',(7.02,-1.5,.12),(1,0,0))
    # Finite exposed saddles. Identical pressure vessel dimensions to collector.
    for i,(x,y,z) in enumerate(LOADS):
        F.box(s,f'SaddleBridge_{i}',(x,-.97,-.12),(2.12,1.65,.28),'paint2',bevel=.06)
        for dx in (-.65,.65):
            F.box(s,f'SaddlePad_{i}_{dx}',(x+dx,y,.25),(.18,1.12,.58),'gunmetal',bevel=.04)
            for yy in (y-.56,y+.56):
                F.box(s,f'SaddleLatch_{i}_{dx}_{yy}',(x+dx,yy,.62),(.22,.16,.52),'hazard',bevel=.035)
        proxy(f'saddle-{i}',(x,-1.15,.18),(2.12,1.95,.65))
        start=len(s.objects)
        F.cylinder(s,f'Canister_{i}',(x-.84,y,z),(x+.84,y,z),.43,material='paint',segments=20)
        for dx in (-.68,.68):F.ring(s,f'CanisterCollar_{i}_{dx}',(x+dx,y,z),.44,.065,material='gunmetal',segments=20,sides=6)
        F.cylinder(s,f'CanisterValve_{i}',(x+.83,y,z),(x+1.02,y,z),.17,material='gunmetal',segments=12)
        hook=f'HOOK_SECONDARY_CANISTER_{i}'
        s.hook_part(hook,*s.objects[start:])
        socket=f'SOCKET_Load_{i}';s.socket(socket,(x,y,z),(0,0,1))
        s.contract['loadPositions'].append({'index':i,'socket':socket,'hook':hook,'positionBlender':[x,y,z]})
    # Visible docking shoes remain fixed between variants; no disappearing rack.
    for i,x in enumerate((-4.4,4.4)):
        F.box(s,f'BerthShoe_{i}',(x,.05,-.67),(.75,1.6,.42),'gunmetal',bevel=.075)
        F.box(s,f'BerthLatch_{i}',(x,.78,-.45),(.48,.34,.35),'stripe',bevel=.045)
        s.socket('SOCKET_Berth_'+('A' if i==0 else 'B'),(x,0,-.88),(0,0,-1))
    F.box(s,'ServiceCoupling',(-5.25,0,.1),(.28,.68,.62),'gunmetal',bevel=.06)
    s.socket('SOCKET_Transfer',(-5.42,0,.1),(-1,0,0))
    if state=='repaired':
        F.box(s,'RepairSplice',(-3.35,3,1.52),(1.3,.58,.14),'stripe',bevel=.05)
        F.beams(s,'RepairBrace',[((-4.8,3.1,1.48),(-1.9,5.1,.62))],.16,'bare',h=.12)
    s.detail=1
    for x in (-4.75,4.75):F.light(s,'LatchIndicator'+str(x),(x,.24,.65),finish='glow_amber',size=.07)
    s.detail=0
    return s


def source_scene(s,out,state,render):
    keep=set(s.objects)
    for o in list(bpy.context.scene.objects):
        if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU'
    scene.cycles.samples=20;scene.cycles.use_denoising=False
    scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('RackProofWorld');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.12,.17,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    for name,pos,energy,size,color in [('Key',(4,-7,18),2400,10,(1,.87,.73)),('Fill',(-7,8,12),1900,9,(.58,.77,1)),('Rim',(-12,-5,7),1600,7,(1,.55,.25))]:
        d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.size=size;d.color=color
        o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,1,0))-o.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.objects.new('ProofCamera',bpy.data.cameras.new('ProofCamera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO'
    for material in s._mats.values():
        # Solid viewport uses the actual Forge material base colour.
        bsdf=material.node_tree.nodes.get('Principled BSDF')
        if bsdf:material.diffuse_color=bsdf.inputs['Base Color'].default_value
    for view,pos,scale in [('chase',(13,-18,27),17),('top',(.6,1.1,35),17),('close',(11,-12,16),15)]:
        camera.location=pos;camera.rotation_euler=(Vector((.6,1.1,.2))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
        if view=='chase':
            for screen in bpy.data.screens:
                for area in screen.areas:
                    if area.type=='VIEW_3D':
                        area.spaces.active.shading.type='SOLID';area.spaces.active.shading.color_type='MATERIAL'
                        area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
                        area.spaces.active.region_3d.view_distance=19;area.spaces.active.region_3d.view_location=(.6,1.1,.2)
            bpy.ops.object.select_all(action='DESELECT')
            bpy.context.view_layer.objects.active=s.objects[0]
            bpy.ops.wm.save_as_mainfile(filepath=str(out/f'{state}.blend'))
        if render:
            scene.render.filepath=str(out/f'{state}-{view}.png');bpy.ops.render.render(write_still=True)


def main():
    p=argparse.ArgumentParser();p.add_argument('--render',action='store_true');p.add_argument('--state',choices=STATES)
    p.add_argument('--out',type=Path,default=HERE.parents[3]/'.devshots/stormshift-cooling-rack')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);args.out.mkdir(parents=True,exist_ok=True)
    reports=[]
    for state in ([args.state] if args.state else STATES):
        s=build(state).finish();lo,hi=E.ship_bounds(s)
        s.contract['sourceSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        spec={'layout':'place','file':f'place_stormshift_cooling_rack_{state}_v01','asset_id':f'SF_STORMSHIFT_COOLING_RACK_{state.upper()}_V01','part_id':f'place_stormshift_cooling_rack_{state}', 'new_place':True,'no_collision':True}
        # Suppress Forge's generic convex hull: it would close the yoke and damage
        # opening. The explicit proposed compounds above require runtime adoption.
        previous=E.PREVIEW_DIR
        try:E.PREVIEW_DIR=str(args.out);written=E.export_ship(s,spec,preview=True)
        finally:E.PREVIEW_DIR=previous
        def stamp(doc):
            doc['asset'].setdefault('extras',{})['stormshiftRack']=s.contract
            for node in doc['nodes']:
                if node.get('name') in s.sockets:
                    node['extras']['spaceface']['forward']=E._gltf_dir(s.sockets[node['name']][1])
                    if node['name'].startswith('SOCKET_Load_'):node['extras']['spaceface']['role']='cargo'
        for path,tris in written:E.patch_glb_json(path,stamp)
        reports.append({'state':state,'boundsBlender':[list(lo),list(hi)],'dimensionsBlender':list(hi-lo),'lod0Triangles':written[0][1],'contract':s.contract})
        (args.out/f'{state}-source-report.json').write_text(json.dumps(reports[-1],indent=2)+'\n')
        source_scene(s,args.out,state,args.render)
    (args.out/'source-report.json').write_text(json.dumps(reports,indent=2)+'\n')
if __name__=='__main__':main()
