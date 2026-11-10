"""Sable Venn's Patchwork: three hulls, two bridges, one human workshop.

Original Forge assemblies from SF20-02. Manufacturing details are ART EXTRAPOLATION.
Build: blender -b --python tools/blender/forge/ships/sable_patchwork.py -- --live
Five measured fixed convex assemblies; four nested render-only service pivots.
Author metres +X nose/+Y port/+Z up; glTF +X nose/+Y up/+Z starboard.
"""
import argparse, hashlib, json, math, shutil, sys
from pathlib import Path
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(HERE.parent))
import forge as F
import forge_export as E

SHIP_ID='sable_patchwork'
ASSET_ID='SF_SHIP_SABLE_PATCHWORK'
SOURCE_DIR=ROOT/'assets/ships/parts/wholeships'
PROVENANCE_DIR=ROOT/'assets/ships/forge/sources/sable_patchwork'
COLORS={'paint':'#908a7a','paint2':'#45515a','dark':'#222a32','stripe':'#2751a4',
        'hazard':'#b5722a','glow_drive':'#6ea6bd','glow_warm':'#bc904f'}
PREFLIGHT={
    'idea':'Human workshop bridges three hulls','tier':'B','componentReferenceDecision':'not_needed',
    'authority':['design/program/world-depth-2026-10-02/TWENTY_CONCEPT_AMENDMENT.md#sf20-02',
                 'design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/02_sable_venn.md'],
    'supportedViews':['chase-144','close-58','top-inspection'],'allSupportedViewZonesClassified':False,
    'zones':[
        {'id':'central-pressure-office','dominates':True,'assembly':'Long faceted pressure hull, low office cabin with sealed warm windows, proud access roof and connected sensor mast.',
         'bill':'Welded alloy pressure hull in warm ivory lacquer, graphite replaceable roof courses, cobalt livery band. Window apertures have dark coamings and narrow warm glass; no office box floating on a tube.'},
        {'id':'port-store-pontoon','dominates':True,'assembly':'Shorter wide pressure pontoon with recessed work deck, enclosed hatch rims and six large captive tool assemblies.',
         'bill':'Ivory alloy case, dark well floor, gray tools and cobalt stripe. Each tool sits in a cradle or mount; no pile of unrelated primitives or micro-greeble carpet.'},
        {'id':'starboard-service-pontoon','dominates':True,'assembly':'Unequal short pressure pontoon, arm foundation, ribbed power/service covers and supported aft bell.',
         'bill':'Warm ivory shell with dark service bays and cobalt identity course. Raised covers imply removable hardware; orange belongs only to the service arm/hazard points.'},
        {'id':'bridges-and-ducts','dominates':True,'assembly':'Exactly two narrow load-bearing crossbeams span the three hulls; folded outer caps, dark underside and continuous service ducts.',
         'bill':'Gray welded box-section bridges with bevelled plate edges and seated cobalt upper cap. Long gaps remain empty between crossbeams. No invisible full-width slab.'},
        {'id':'service-arm-and-jaws','dominates':False,'assembly':'Seated base bearing, twin upper clevis rails, raised elbow pin, folded forearm and two independently supported grip jaws.',
         'bill':'Orange standardized hazard coating on load links, gray bearings/jaws and dark clearances. All links remain connected through nested pivots. No floating robot arm, field custody or invented demonstration forces.'},
        {'id':'drives-and-position-lamps','dominates':False,'assembly':'Three seated recessed bell throats, small port/starboard lamps and a mast beacon above the real office.',
         'bill':'Dark heat shields and small recessed emissive cores; tiny cased navigation/window lamps show human occupation. No neon perimeter, broad luminous disks or bloom wash.'},
    ],
    'scene':'assets/ships/forge/sources/sable_patchwork/sable_patchwork.blend',
    'review':'Lead judges exact source Look pictures then serially publishes; cosmetic arm only follows native trial/purchase facts.',
}
for zone in PREFLIGHT['zones']:
    zone['disposition']='billed';zone['supportedViews']=PREFLIGHT['supportedViews'][:]
COMPONENTS={};GROUPS={};PIVOTS={};PARENTS={}

def coords(point):return [round(float(point[0]),6),round(float(point[2]),6),round(float(-point[1]),6)]
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def component(name,*parts):COMPONENTS[name]=list(parts)
def group(ship,name,pivot,start,parent=None):
    parts=ship.objects[start:];node=ship.motion_group(name,pivot,parts,parent=parent)
    node['spacefaceSocket']=True;node['spacefaceInstance']=False
    GROUPS[name]=parts;PIVOTS[name]=node;PARENTS[name]=parent
    return node

def build():
    F.reset_scene();ship=F.Ship(SHIP_ID,COLORS);ship.refresh_lod_normals=True;ship.collision_scale=1
    center=F.loft(ship,'CentralOfficePressureHull',[
        dict(x=-16.8,w=1.75,ht=1.6,hb=1.35,zc=.0,n=2.7),
        dict(x=-14.3,w=2.75,ht=2.15,hb=1.65,zc=.0,n=3.0),
        dict(x=-7.0,w=3.0,ht=2.5,hb=1.8,zc=.1,n=3.1),
        dict(x=3.5,w=2.95,ht=2.5,hb=1.75,zc=.15,n=3.0),
        dict(x=10.8,w=2.55,ht=2.0,hb=1.4,zc=.1,n=2.8),
        dict(x=15.4,w=1.4,ht=1.2,hb=.9,zc=.05,n=2.6),
        dict(x=16.7,w=.45,ht=.6,hb=.45,zc=.0,n=2.4),
    ],material='paint',belly='dark',back_material='dark',count=44,bevel=.055)
    center_bell=F.nozzle(ship,'OfficeAftDrive',(-17.05,0,-.05),1.0,1.0,material='dark',segments=32)
    # A low faceted, pressurized office is seated along the hull's load line.
    office=F.loft(ship,'HumanOfficeCabin',[
        dict(x=-5.3,w=1.9,ht=.35,hb=.18,zc=2.45,n=3.1),
        dict(x=-3.8,w=2.25,ht=1.35,hb=.3,zc=2.5,n=3.4),
        dict(x=2.0,w=2.2,ht=1.35,hb=.3,zc=2.5,n=3.4),
        dict(x=4.4,w=1.5,ht=.45,hb=.15,zc=2.45,n=3.0),
    ],material='paint',belly='dark',count=28,bevel=.045)
    component('central_office',center,office,center_bell)
    F.plate(ship,'OfficeAccessRoof',[(-3.8,-1.7),(1.9,-1.65),(2.5,0),(1.9,1.65),(-3.8,1.7)],
            z0=3.81,thickness=.14,material='paint2',chamfer=.12,bevel=.025)
    F.band(ship,'CentralOfficePressureHull',(6.2,0,0),(1,0,0),.65,'stripe')
    # Narrow housed windows sit on the cabin's actual side. Batched shared material.
    frames=[];windows=[]
    for side in (-1,1):
        for i,x in enumerate((-3.25,-1.85,-.45,.95)):
            frames.append(((x,side*2.19,3.17),(.86,.13,.53)))
            windows.append(((x,side*2.266,3.17),(.67,.035,.31)))
    F.boxes(ship,'OfficeWindowCoamings',frames,material='dark',bevel=.03)
    F.boxes(ship,'OfficeWarmWindows',windows,material='glow_warm',bevel=.005)
    F.plate(ship,'OfficeProwGlazingSill',[(4.3,-1.25),(7.3,-.88),(7.3,.88),(4.3,1.25)],
            z0=2.04,thickness=.15,material='dark',chamfer=.09,bevel=.02)
    F.canopy(ship,'OfficeProwGlazing',x0=4.45,x1=7.1,w=.88,h=.20,z=2.16,frame=False)
    for x in (-12.4,-8.5,10.9):
        F.panel(ship,'CentralOfficePressureHull',(x,0),(1.7,2.9),'paint2',inset=.045,depth=.04)
    # Pontoons deliberately have unequal noses and departments, with open inter-hull gaps.
    for side,label in ((1,'port_store'),(-1,'starboard_service')):
        y=side*9.5;fore=12.8 if side==1 else 10.8
        pontoon=F.loft(ship,'Pontoon_'+label,[
            dict(x=-12.3,y=y,w=1.8,ht=1.45,hb=1.3,zc=.05,n=3.0),
            dict(x=-10.7,y=y,w=2.55,ht=1.95,hb=1.6,zc=.1,n=3.1),
            dict(x=5.4,y=y,w=2.5,ht=1.95,hb=1.55,zc=.1,n=3.1),
            dict(x=fore-1.4,y=y,w=1.9,ht=1.5,hb=1.2,zc=.05,n=2.9),
            dict(x=fore,y=y,w=.85,ht=.75,hb=.65,zc=.0,n=2.6),
        ],material='paint',belly='dark',back_material='dark',count=36,bevel=.045)
        bell=F.nozzle(ship,'PontoonDrive_'+label,(-12.7,y,-.05),.74,.85,material='dark',segments=28)
        component(label,pontoon,bell)
        F.band(ship,'Pontoon_'+label,(6.2,y,0),(1,0,0),.65,'stripe')
        F.plate(ship,'AftServiceDeck_'+label,[(-10.6,y-1.65),(-6.1,y-1.6),(-6.1,y+1.6),(-10.6,y+1.65)],
                z0=2.035,thickness=.13,material='paint2',chamfer=.10,bevel=.025)
        F.boxes(ship,'AftServiceVents_'+label,[((-9.75+i*.52,y,2.20),(.22,2.4,.07)) for i in range(6)],material='dark',bevel=.01)
    # Exactly two convex bridge plates. There is no collision or geometry between them.
    for x,label in ((-7.0,'aft_bridge'),(6.0,'forward_bridge')):
        bridge=F.plate(ship,'Bridge_'+label,[(x-1.1,-10.8),(x+1.1,-10.8),(x+1.1,10.8),(x-1.1,10.8)],
                       z0=-.45,thickness=.9,material='paint2',side_material='dark',chamfer=.16,bevel=.04)
        component(label,bridge)
        F.plate(ship,'BridgeCap_'+label,[(x-.58,-7.0),(x+.58,-7.0),(x+.58,7.0),(x-.58,7.0)],
                z0=.46,thickness=.12,material='stripe',chamfer=.06,bevel=.02)
        F.beams(ship,'BridgeServiceDuct_'+label,[((x-.82,-9,.58),(x-.82,9,.58))],.15,h=.18,material='dark',bevel=.018)
    # Port dark work well: raised rim seats six different large service tools.
    F.plate(ship,'ToolWellFloor',[(-4.75,7.85),(3.55,7.85),(3.55,11.15),(-4.75,11.15)],
            z0=2.02,thickness=.07,material='dark',chamfer=.035,bevel=.015)
    F.beams(ship,'ToolWellRim',[
        ((-4.75,7.8,2.2),(3.55,7.8,2.2)),((3.55,7.8,2.2),(3.55,11.2,2.2)),
        ((3.55,11.2,2.2),(-4.75,11.2,2.2)),((-4.75,11.2,2.2),(-4.75,7.8,2.2)),
    ],.18,h=.30,material='paint2',bevel=.025)
    # Cutter cup, clamp clevis, two-ended driver, sealed kit, calibration vane, cable reel.
    F.nozzle(ship,'StoredCutterCup',(-3.9,8.65,2.48),.43,.7,material='paint2',glow='dark',segments=20)
    F.beams(ship,'StoredClampClevis', [((-1.9,8.35,2.17),(-1.9,9.05,2.7)),
                                     ((-1.9,9.05,2.7),(-.8,9.05,2.7)),
                                     ((-.8,9.05,2.7),(-.8,8.35,2.17))],.28,h=.24,material='paint2',bevel=.03)
    F.cylinder(ship,'StoredDriver',(.15,8.65,2.4),(2.7,8.65,2.4),.24,material='paint2',segments=18)
    for x in (.15,2.7):F.box(ship,'DriverCollar'+str(x),(x,8.65,2.4),(.27,.66,.48),material='dark',bevel=.025)
    F.box(ship,'SealedServiceKit',(-3.35,10.2,2.45),(1.7,1.0,.65),material='paint2',bevel=.09,taper=.9)
    F.plate(ship,'CalibrationVane',[(-1.9,9.7),(.15,9.7),(.15,10.7),(-1.2,10.7)],
            z0=2.18,thickness=.22,material='paint',chamfer=.06,bevel=.02)
    F.cylinder(ship,'StoredCableReel',(1.45,10.2,2.18),(1.45,10.2,2.75),.50,material='dark',segments=20)
    F.cylinder(ship,'ReelFlange',(1.45,10.2,2.72),(1.45,10.2,2.80),.63,material='paint2',segments=20,bevel=.015)
    # Field arm is render-only, anchored on the starboard deck. Folded forearm sits
    # above the twin upper rails; nested rigid pivots preserve all clevis load paths.
    F.box(ship,'ArmFoundation',(-2,-11,2.22),(1.85,1.45,.44),material='paint2',bevel=.09)
    F.cylinder(ship,'ArmBaseBearing',(-2,-11,2.16),(-2,-11,2.79),.58,material='dark',segments=28,bevel=.025)
    start=len(ship.objects)
    F.beams(ship,'UpperClevisRails', [((-2,-11.42,2.60),(3,-11.42,3.45)),
                                     ((-2,-10.58,2.60),(3,-10.58,3.45))],.30,h=.46,material='hazard',bevel=.035)
    F.beams(ship,'UpperRailWebs', [((-1.7,-11.42,2.66),(-1.7,-10.58,2.66)),
                                  ((.3,-11.42,3.0),(.3,-10.58,3.0)),((2.7,-11.42,3.40),(2.7,-10.58,3.40))],.22,material='paint2',bevel=.025)
    F.cylinder(ship,'ElbowPin',(3,-11.58,3.45),(3,-10.42,3.45),.28,material='dark',segments=24,bevel=.02)
    group(ship,'sable_arm_base',(-2,-11,2.60),start)
    start=len(ship.objects)
    F.plate(ship,'FoldedForearm',[(-1,-11.35),(3,-11.35),(3,-10.65),(-1,-10.65)],
            z0=3.68,thickness=.30,material='hazard',chamfer=.08,bevel=.025)
    F.box(ship,'ElbowMount',(3,-11,3.6),(.76,.75,.43),material='paint2',bevel=.055)
    F.box(ship,'ClampCrosshead',(-1,-11,3.6),(.75,1.65,.42),material='paint2',bevel=.055)
    for side in (-1,1):
        F.cylinder(ship,'JawHingePin'+str(side),(-1.55,-11+side*.68,3.62),(-.85,-11+side*.68,3.62),
                   .13,material='paint2',segments=18,bevel=.015)
    group(ship,'sable_arm_elbow',(3,-11,3.45),start,parent='sable_arm_base')
    for side,label in ((1,'port'),(-1,'starboard')):
        y=-11+side*.68;start=len(ship.objects)
        F.beams(ship,'GripJaw_'+label,[((-1.2,y,3.62),(-1.2,y,2.55)),
                                     ((-1.2,y,2.55),(-1.2,y-side*.34,2.55))],.25,h=.27,material='paint2',bevel=.035)
        group(ship,'sable_clamp_'+label,(-1.2,y,3.62),start,parent='sable_arm_elbow')
    # A small office sensor has a structural mast; no ornamental antenna forest.
    F.cylinder(ship,'OfficeMast',(-3.5,0,3.95),(-3.5,0,5.6),.095,material='dark',segments=16)
    F.box(ship,'OfficeSensor',(-3.5,0,5.52),(.73,.31,.23),material='paint2',bevel=.045)
    F.light(ship,'OfficeBeacon',(-3.5,0,5.73),'glow_warm',.09)
    F.light(ship,'PortPosition',(10.8,11.08,1.65),'glow_red',.105)
    F.light(ship,'StarboardPosition',(8.4,-11.08,1.65),'glow_green',.105)
    ship.socket('SOCKET_Engine_Main',(-17.08,0,-.05),(-1,0,0))
    ship.socket('SOCKET_Trail_Main',(-17.15,0,-.05),(-1,0,0))
    ship.socket('SOCKET_Engine_Port',(-12.74,9.5,-.05),(-1,0,0))
    ship.socket('SOCKET_Engine_Starboard',(-12.74,-9.5,-.05),(-1,0,0))
    ship.socket('SOCKET_Service_Item',(-1,-11,2.6))
    ship.socket('SOCKET_Camera_Focus',(0,0,1.4))
    ship.socket_names=list(ship.sockets);ship.finish();return ship

def bounds(points):
    points=[Vector(point) for point in points]
    minimum=[min(coords(p)[i] for p in points) for i in range(3)]
    maximum=[max(coords(p)[i] for p in points) for i in range(3)]
    return {'minGltf':minimum,'maxGltf':maximum,'sizeMetres':[round(maximum[i]-minimum[i],6) for i in range(3)],
            'maxRootDistanceMetres':round(max(p.length for p in points),6)}

def export(ship,out):
    E._rename_materials(ship)
    root=E._root_empty('SF_SHIP_SABLE_PATCHWORK_ROOT',{})
    E._mount_motion_pivots(ship,root)
    colliders=[]
    collision_contract=[]
    for name,parts in COMPONENTS.items():
        collider=E._collision_hull(ship,root,parts)
        collider.name='COLLISION_SABLE_PATCHWORK_'+name.upper()
        collider.data.name=collider.name
        collider['sourceAssembly']=name
        colliders.append(collider)
        collision_contract.append({'id':name,'node':collider.name,'kind':'convex',
            'sourceObjects':[ob.name for ob in parts],
            'verticesGltf':[coords(v.co) for v in collider.data.vertices],
            'triangles':[list(face.vertices) for face in collider.data.polygons],
            'bounds':bounds([v.co for v in collider.data.vertices])})
    E._add_sockets(ship,root)
    tiers={}
    near_doc=None
    paths=[]
    for lod in (0,1,2):
        tier=E._lod_meshes(ship,lod,'LOD'+str(lod))
        for ob in tier:
            if ob.parent is None:ob.parent=root
        name='sable_patchwork'+('' if lod==0 else '_lod'+str(lod))+'.glb'
        path=out/name
        E._export([root]+list(root.children_recursive),str(path))
        E._stamp(str(path),{'assetId':ASSET_ID,'partId':'sable-patchwork','liveId':'sable_patchwork','slot':'hull',
            'category':'wholeships','forge':{'version':1,'ship':SHIP_ID}},'lod'+str(lod))
        def annotate(doc):
            meta=doc['asset']['extras']['spacefaceAsset']
            meta['integratedHardpoints']=False
            meta['npcOnly']=True
            for node in doc['nodes']:
                if node.get('extras',{}).get('spacefaceAsset'):
                    node['extras']['spacefaceAsset']['integratedHardpoints']=False
                    node['extras']['spacefaceAsset']['npcOnly']=True
                if node.get('name','').startswith('MOTION_'):
                    extras=node.setdefault('extras',{})
                    extras['spacefaceSocket']=True
                    extras.setdefault('spaceface',{})['instance']=False
            scene=doc['scenes'][doc.get('scene',0)]
            scene['extras']['spacefaceAsset']['integratedHardpoints']=False
            scene['extras']['spacefaceAsset']['npcOnly']=True
            doc['asset']['extras']['sablePatchworkGeometry']={'schema':'spaceface.sablePatchworkGeometry.v1',
                'collision':'source-aligned-convex-assemblies','collisionScale':1,
                'renderOnlyGroups':['service_arm_base','service_arm_elbow','clamp_port','clamp_starboard'],
                'negativeSpace':['port-longitudinal-gap','starboard-longitudinal-gap'],'recipeSha256':digest(__file__)}
        doc=E.patch_glb_json(str(path),annotate)
        if lod==0:near_doc=doc
        primitives=[p for node in doc['nodes'] if node.get('name','').startswith('LOD'+str(lod)+'_') and 'mesh' in node
                    for p in doc['meshes'][node['mesh']]['primitives']]
        tiers[str(lod)]={'file':name,'sha256':digest(path),'bytes':path.stat().st_size,
                        'triangles':sum(doc['accessors'][p['indices']]['count']//3 for p in primitives),
                        'drawPrimitives':len(primitives),'materials':len(doc.get('materials',[])),
                        'sharedImages':len(doc.get('images',[]))}
        paths.append(path)
        E._clear_export_objects(tier)
    bank={'schema':'spaceface.rigidMotionBank.v1','rigId':'sable_patchwork_service_arm',
          'sourceAssetId':ASSET_ID,'sourceGlbSha256':digest(paths[0]),'fps':60,'bindings':[],
          'clips':[{'name':'source_rest_pose','durationS':1/60,'loop':False,'endMode':'hold','channels':[]}]}
    for name,pivot in PIVOTS.items():
        node=next(node for node in near_doc['nodes'] if node.get('name')==pivot.name)
        bank['bindings'].append({'id':name,'node':pivot.name,'parent':PARENTS[name],'requiredAtLod':[0,1,2],
            'restPose':{'translation':node.get('translation',[0,0,0]),'rotation':node.get('rotation',[0,0,0,1]),
                        'scale':node.get('scale',[1,1,1])}})
        bank['clips'][0]['channels'].append({'group':name,'path':'translation','times':[0,1/60],
                                            'values':[0,0,0,0,0,0],'interpolation':'linear'})
    (out/'sable-patchwork.motion.json').write_text(json.dumps(bank,indent=2)+'\n',encoding='utf-8')
    # The packed authoring scene retains editable finished parts and the real pivot hierarchy.
    for name,parts in GROUPS.items():
        for ob in parts:
            world=ob.matrix_world.copy();ob.parent=PIVOTS[name];ob.matrix_world=world
    for ob in ship.objects:
        if ob.parent is None:ob.parent=root
    bpy.context.view_layer.update()
    physical=bounds([ob.matrix_world@v.co for parts in COMPONENTS.values() for ob in parts for v in ob.data.vertices])
    visual=bounds([ob.matrix_world@v.co for ob in ship.objects for v in ob.data.vertices])
    PIVOTS['sable_arm_base'].rotation_euler.z=math.radians(-60)
    PIVOTS['sable_arm_elbow'].rotation_euler.z=math.radians(85)
    bpy.context.view_layer.update()
    deployed=bounds([ob.matrix_world@v.co for ob in ship.objects for v in ob.data.vertices])
    for pivot in PIVOTS.values():pivot.rotation_euler=(0,0,0)
    bpy.context.view_layer.update()
    contract={'schema':'spaceface.sablePatchworkSourceGeometry.v1','assetId':ASSET_ID,'renderScale':1,'recipeSha256':digest(__file__),
              'lods':tiers,'bounds':visual,'deployedBounds':deployed,'physicalBounds':physical,'collision':{'kind':'compound',
              'components':collision_contract,'negativeSpace':['port-longitudinal-gap','starboard-longitudinal-gap']},
              'groups':{name:{'node':pivot.name,'pivotGltf':coords(pivot.matrix_world.translation),
                              'axisGltf':[1,0,0] if name.startswith('sable_clamp_') else [0,1,0],'parent':PARENTS[name]}
                        for name,pivot in PIVOTS.items()},
              'sockets':{name:{'positionGltf':coords(pos),'forwardGltf':coords(forward)} for name,(pos,forward) in ship.sockets.items()},
              'preflight':PREFLIGHT,'provenance':'Original SpaceFace procedural Forge source; no external geometry/media',
              'acceptance':'Source candidate; lead owns publication and exact live Look/runtime review'}
    (out/'measured-contract.json').write_text(json.dumps(contract,indent=2)+'\n',encoding='utf-8')
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'sable_patchwork.blend'))
    return paths,contract

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default=str(ROOT/'.devshots/sable-patchwork-build'))
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    ship=build();paths,contract=export(ship,out)
    if args.live:
        SOURCE_DIR.mkdir(parents=True,exist_ok=True)
        for path in paths:shutil.copyfile(path,SOURCE_DIR/path.name)
        PROVENANCE_DIR.mkdir(parents=True,exist_ok=True)
        for name in ('sable_patchwork.blend','measured-contract.json'):shutil.copyfile(out/name,PROVENANCE_DIR/name)
        motion_path=ROOT/'assets/ships/motions/sable-patchwork.motion.json'
        motion_path.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(out/'sable-patchwork.motion.json',motion_path)
    print('SABLE_PATCHWORK_BUILD',json.dumps({key:contract[key] for key in ('assetId','lods','bounds','physicalBounds')}))

if __name__=='__main__':main()
