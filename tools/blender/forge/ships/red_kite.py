"""SF20-05 Red Kite: crimson courier dart, single sail, offset drive, forked stern.

Original SpaceFace Forge geometry. The concept/amendment owns the asymmetric courier
and ordinary physical race; manufactured assemblies below are ART EXTRAPOLATION.
Build: blender -b --python tools/blender/forge/ships/red_kite.py -- --live
Three source tiers plus packed editable scene and measured native convex components.
Metres: author +X nose/+Y port/+Z up; glTF +X nose/+Y up/+Z starboard.
"""
import argparse, hashlib, json, math, shutil, sys
from pathlib import Path
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parent))
import forge as F
import forge_export as E

SHIP_ID = 'red_kite'
ASSET_ID = 'SF_SHIP_RED_KITE'
SOURCE_DIR = ROOT / 'assets/ships/parts/wholeships'
PROVENANCE_DIR = ROOT / 'assets/ships/forge/sources/red_kite'
COLORS = {'paint': '#96393e', 'paint2': '#76828a', 'dark': '#252e37',
          'glow_drive': '#73c9d2', 'glow_red': '#bd423a', 'glow_green': '#52a581'}

# Material-truth preflight, authored before the camera-visible build. Every supported
# zone is billed. Review remains with the lead's exact exported chase/close pictures.
PREFLIGHT = {
    'idea': 'Crimson courier cuts asymmetric lines', 'tier': 'B',
    'authority': ['design/program/world-depth-2026-10-02/TWENTY_CONCEPT_AMENDMENT.md#sf20-05',
                  'design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/05_red_kite.md'],
    'supportedViews': ['chase-144', 'close-58', 'top-inspection'],
    'componentReferenceDecision': 'not_needed',
    'allSupportedViewZonesClassified': False,
    'zones': [
        {'id': 'pressure-dart', 'disposition': 'billed', 'dominates': True,
         'assembly': 'Faceted pressure shell, folded dorsal cover, tapered armored prow; gray bolted service courses seat on the shell.',
         'bill': 'Welded alloy pressure vessel with crimson lacquer and gray replaceable covers. Curved planes carry coat glints; dark seams show service joints. No cylindrical toy or uniformly inflated block.'},
        {'id': 'port-sail-and-spar', 'disposition': 'billed', 'dominates': True,
         'assembly': 'Three closed triangular blade sections seated on a broad root spar; proud folded leading-edge cap and relieved trailing notch.',
         'bill': 'Thin alloy heat/control blade with crimson lacquer, dark exposed edge caps, gray reinforced root and hinge. Broad planes and a narrow bevel, never a thick slab or floating fin.'},
        {'id': 'flap', 'disposition': 'billed', 'dominates': False,
         'assembly': 'Separate tapered control plate in the real trailing notch; X-axis hinge barrel and two bearing saddles.',
         'bill': 'Gray lacquered control plate, flush hinge line, dark clearance. Finite motion follows accepted native angular acceleration. No idle flapping.'},
        {'id': 'forked-stern-and-drives', 'disposition': 'billed', 'dominates': False,
         'assembly': 'Two tapered structural prongs terminate in recessed small bell throats; the central stern remains empty.',
         'bill': 'Dark heat shield skin with seated crimson shoulder covers. Machined lips catch a narrow highlight; only the recessed drive cores emit. No glowing cylinder caps or filled visual/physics gap.'},
        {'id': 'starboard-drive-and-support', 'disposition': 'billed', 'dominates': False,
         'assembly': 'Short tapered gray drive pod carried by a broad enclosed spar; seated heat shield and recessed aft bell.',
         'bill': 'Gray serviceable alloy case, crimson livery band, dark heat shield. A continuous load path connects it to the pressure dart. No floating engine or arbitrary outriggers.'},
        {'id': 'cockpit-and-optics', 'disposition': 'billed', 'dominates': False,
         'assembly': 'Low narrow canopy seated in a raised faceted brow with dark sill; small navigation lamps at actual extremities.',
         'bill': 'Smoked laminated optical glazing in a dark sealed coaming. Glass responds to current Look; nav lamps are tiny housed emitters. No crystal dome or glow wash.'},
        {'id': 'courier-canister-and-clamps', 'disposition': 'billed', 'dominates': False,
         'assembly': 'Small keyed dorsal courier case in a seated saddle, with two separate hooked jaws, X-axis hinge pins and local clearance.',
         'bill': 'Gray lacquered alloy case and forged gray jaws with dark seat/contact pads. Accepted gate handoff causes one finite jaw gesture. No paid-looking idle or unsupported cargo.'},
    ],
    'scene': 'assets/ships/forge/sources/red_kite/red_kite.blend',
    'review': 'Lead opens exact runtime Look chase/close/top pictures, then publishes the accepted source family.',
}
for zone in PREFLIGHT['zones']:
    zone['supportedViews'] = PREFLIGHT['supportedViews'][:]

COMPONENTS = {}
GROUPS = {}
PIVOTS = {}

def coords(point):
    return [round(float(point[0]), 6), round(float(point[2]), 6), round(float(-point[1]), 6)]

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def group(ship, name, pivot, start):
    parts = ship.objects[start:]
    node = ship.motion_group(name, pivot, parts)
    node['spacefaceSocket'] = True
    node['spacefaceInstance'] = False
    GROUPS[name] = parts
    PIVOTS[name] = node

def component(name, *parts):
    COMPONENTS[name] = list(parts)

def build():
    F.reset_scene()
    ship = F.Ship(SHIP_ID, COLORS)
    ship.refresh_lod_normals = True
    ship.collision_scale = 1.0
    spine = F.loft(ship, 'PressureDart', [
        dict(x=-7.4, w=.85, ht=.70, hb=.63, zc=.0, n=2.8),
        dict(x=-5.6, w=1.38, ht=.92, hb=.75, zc=.0, n=2.9),
        dict(x=-1.8, w=1.35, ht=1.03, hb=.72, zc=.03, n=3.0),
        dict(x=3.2, w=1.10, ht=.89, hb=.58, zc=.08, n=2.8),
        dict(x=7.8, w=.68, ht=.64, hb=.44, zc=.10, n=2.6),
        dict(x=11.8, w=.12, ht=.21, hb=.18, zc=.06, n=2.4),
    ], material='paint', belly='dark', back_material='dark', count=36, bevel=.04)
    component('pressure_dart', spine)
    # A low folded brow and real service covers break the shell at useful scales.
    F.plate(ship, 'ProwBrow', [(10.6,-.20),(6.9,-.80),(3.3,-.94),(3.3,.94),(6.9,.80),(10.6,.20)],
            z0=.64, thickness=.18, material='dark', chamfer=.10, bevel=.02)
    F.canopy(ship, 'CourierCanopy', x0=3.6, x1=7.4, w=.55, h=.28, z=.87, peak=.45)
    F.plate(ship, 'DorsalPressureCover', [(-6.8,-.45),(2.65,-.37),(3.0,0),(2.65,.37),(-6.8,.45)],
            z0=.91, thickness=.17, material='paint', chamfer=.08, bevel=.025)
    for i, x in enumerate((-5.0,-1.3,2.2)):
        F.plate(ship, f'ServiceCourse_{i}', [(x-.75,-.73),(x+.65,-.65),(x+.65,.65),(x-.75,.73)],
                z0=1.05, thickness=.06, material='paint2' if i==1 else 'paint', chamfer=.08, bevel=.015)
    # Two prongs have independent convex sources: no hull spans the empty aft slot.
    for side, label in ((1,'port'),(-1,'starboard')):
        y = side*1.38
        prong = F.loft(ship, f'SternProng_{label}', [
            dict(x=-10.45,w=.43,ht=.46,hb=.46,zc=-.13,y=y,n=3.3),
            dict(x=-9.5,w=.47,ht=.51,hb=.47,zc=-.09,y=y,n=3.1),
            dict(x=-7.3,w=.46,ht=.51,hb=.43,zc=.0,y=y,n=3.0),
            dict(x=-5.95,w=.32,ht=.44,hb=.35,zc=.0,y=side*1.10,n=2.8),
        ], material='dark', count=24, bevel=.025)
        bell=F.nozzle(ship,f'ForkDrive_{label}',(-10.55,y,-.13),.29,.55,material='dark',segments=24)
        component('stern_'+label,prong,bell)
        F.plate(ship,f'ForkShoulder_{label}', [(-9.35,y-.23),(-6.15,y-.27),(-6.15,y+.27),(-9.35,y+.23)],
                z0=.39,thickness=.11,material='paint',chamfer=.05,bevel=.015)
        F.box(ship,f'ForkHeatShield_{label}',(-9.8,y,.30),(.70,.74,.08),material='dark',bevel=.025)
    # Port sail: relieved aft notch, three real thin closed blades, one seated root.
    spar=F.plate(ship,'PortRootSpar',[(-4,1.0),(-.7,1.0),(3,2.0),(-2,3.5),(-4,3.0)],
                 z0=.06,thickness=.63,material='paint2',chamfer=.12,bevel=.025)
    component('port_spar',spar)
    blade_outlines=[
        [(-7,3),(3,2),(8,3),(.6,5.8),(-4,5.8)],
        [(.8,5.8),(8,3),(0,10)],
        [(-2.2,7.15),(2,7.15),(0,10)],
    ]
    for i, outline in enumerate(blade_outlines):
        blade=F.plate(ship,f'PortSailBlade_{i}',outline,z0=.57,thickness=.32,
                      material='paint',side_material='dark',chamfer=.13,bevel=.018)
        component('port_sail_'+str(i),blade)
    # Dark folded edge cap follows the triangle rather than becoming a decorative bar.
    F.beams(ship,'SailLeadingEdge',[((8,3,.91),(0,10,.91))],.15,h=.11,material='dark',bevel=.016)
    F.beams(ship,'SailRootCourse',[((-6.4,3.25,.91),(2.7,2.3,.91))],.10,h=.07,material='paint2',bevel=.01)
    F.plate(ship,'SailTipPatch',[(-.65,8.9),(.12,8.8),(.05,9.70),(-.17,9.70)],
            z0=.895,thickness=.035,material='paint2',chamfer=.015,bevel=.006)
    F.cylinder(ship,'FlapHingeBarrel',(-3.5,5.80,.83),(.55,5.80,.83),.095,
               material='dark',segments=20,bevel=.01)
    F.boxes(ship,'FlapBearingSaddles',[( (-3.30,5.71,.82),(.24,.35,.19)),
                                      ((.30,5.71,.82),(.24,.35,.19))],material='dark',bevel=.015)
    start=len(ship.objects)
    F.plate(ship,'PortControlFlap',[(-3.5,5.85),(.5,5.85),(.5,7.05),(-2.3,7.05)],
            z0=.60,thickness=.25,material='paint2',chamfer=.10,bevel=.015)
    group(ship,'red_kite_flap',(-1.5,5.80,.83),start)
    # Offset starboard pod and its broad support are source-aligned native pieces.
    support=F.plate(ship,'StarboardDriveSpar',[(-5.9,-1.1),(-2.5,-1.1),(-2.1,-4.8),(-4.5,-5.0)],
                    z0=-.38,thickness=.61,material='dark',chamfer=.12,bevel=.02)
    component('starboard_spar',support)
    pod=F.loft(ship,'StarboardDrivePod',[
        dict(x=-6.5,y=-5,w=.64,ht=.68,hb=.61,zc=-.04,n=2.8),
        dict(x=-5.0,y=-5,w=.80,ht=.75,hb=.70,zc=.0,n=3.0),
        dict(x=-2.2,y=-5,w=.70,ht=.62,hb=.56,zc=.03,n=3.0),
        dict(x=-1.2,y=-5,w=.20,ht=.30,hb=.26,zc=.02,n=2.6),
    ],material='paint2',belly='dark',count=28,bevel=.035)
    pod_bell=F.nozzle(ship,'OffsetDriveBell',(-6.64,-5,-.04),.50,.62,material='dark',segments=28)
    component('starboard_drive',pod,pod_bell)
    F.band(ship,'StarboardDrivePod',(-3.8,-5,0),(1,0,0),.38,'paint')
    F.plate(ship,'OffsetPodServiceCover',[(-5.4,-5.40),(-2.45,-5.31),(-2.45,-4.69),(-5.4,-4.6)],
            z0=.73,thickness=.07,material='paint2',chamfer=.08,bevel=.015)
    F.boxes(ship,'PodCoolingSlots',[((-5.5+i*.29,-5,.81),(.13,.51,.035)) for i in range(5)],
            material='dark',bevel=.005)
    # A small real courier case is seated; jaws open from their own supported pivots.
    F.plate(ship,'CourierCaseSaddle',[(-4.0,-.72),(-1.25,-.62),(-1.25,.62),(-4.0,.72)],
            z0=1.06,thickness=.22,material='dark',chamfer=.09,bevel=.025)
    F.box(ship,'CourierCanister',(-2.6,0,1.57),(2.0,.98,.72),material='paint2',bevel=.11,taper=.92)
    F.box(ship,'CanisterKeyedLid',(-2.6,0,1.98),(1.79,.87,.13),material='dark',bevel=.035)
    for side,label in ((1,'port'),(-1,'starboard')):
        y=side*.77
        F.cylinder(ship,f'ClampHinge_{label}',(-3.55,y,1.25),(-1.65,y,1.25),.11,
                   material='dark',segments=20,bevel=.01)
        start=len(ship.objects)
        F.beams(ship,f'CourierJaw_{label}',[
            ((-3.2,y,1.25),(-3.2,y,1.93)),((-2.0,y,1.25),(-2.0,y,1.93)),
            ((-3.2,y,1.93),(-2.0,y,1.93)),
            ((-3.2,y,1.93),(-3.2,side*.41,2.08)),
            ((-2.0,y,1.93),(-2.0,side*.41,2.08)),
        ],.17,h=.15,material='paint2',bevel=.025)
        group(ship,'red_kite_clamp_'+label,(-2.6,y,1.25),start)
    F.light(ship,'PortNav',(0,9.72,.99),'glow_red',.085)
    F.light(ship,'StarboardNav',(-2.6,-5.7,.57),'glow_green',.085)
    ship.socket('SOCKET_Engine_Main',(-6.66,-5,-.04),(-1,0,0))
    ship.socket('SOCKET_Trail_Main',(-6.75,-5,-.04),(-1,0,0))
    ship.socket('SOCKET_Engine_Port',(-10.57,1.38,-.13),(-1,0,0))
    ship.socket('SOCKET_Engine_Starboard',(-10.57,-1.38,-.13),(-1,0,0))
    ship.socket('SOCKET_Courier_Canister',(-2.6,0,1.57))
    ship.socket('SOCKET_Camera_Focus',(0,0,.5))
    ship.socket_names=list(ship.sockets)
    ship.finish()
    return ship

def bounds(points):
    points=[Vector(point) for point in points]
    minimum=[min(coords(p)[i] for p in points) for i in range(3)]
    maximum=[max(coords(p)[i] for p in points) for i in range(3)]
    return {'minGltf':minimum,'maxGltf':maximum,'sizeMetres':[round(maximum[i]-minimum[i],6) for i in range(3)],
            'maxRootDistanceMetres':round(max(p.length for p in points),6)}

def export(ship,out):
    E._rename_materials(ship)
    root=E._root_empty('SF_SHIP_RED_KITE_ROOT',{})
    E._mount_motion_pivots(ship,root)
    colliders=[]
    collision_contract=[]
    for name,parts in COMPONENTS.items():
        collider=E._collision_hull(ship,root,parts)
        collider.name='COLLISION_RED_KITE_'+name.upper()
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
        name='red_kite'+('' if lod==0 else '_lod'+str(lod))+'.glb'
        path=out/name
        E._export([root]+list(root.children_recursive),str(path))
        E._stamp(str(path),{'assetId':ASSET_ID,'partId':'red-kite','liveId':'red_kite','slot':'hull',
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
            doc['asset']['extras']['redKiteGeometry']={'schema':'spaceface.redKiteGeometry.v1',
                'collision':'source-aligned-convex-assemblies','collisionScale':1,
                'renderOnlyGroups':['flap','courier_clamp_port','courier_clamp_starboard'],
                'negativeSpace':['stern-slot','port-flap-notch'],'recipeSha256':digest(__file__)}
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
    bank={'schema':'spaceface.rigidMotionBank.v1','rigId':'red_kite_courier_controls',
          'sourceAssetId':ASSET_ID,'sourceGlbSha256':digest(paths[0]),'fps':60,'bindings':[],
          'clips':[{'name':'source_rest_pose','durationS':1/60,'loop':False,'endMode':'hold','channels':[]}]}
    for name,pivot in PIVOTS.items():
        node=next(node for node in near_doc['nodes'] if node.get('name')==pivot.name)
        bank['bindings'].append({'id':name,'node':pivot.name,'parent':None,'requiredAtLod':[0,1,2],
            'restPose':{'translation':node.get('translation',[0,0,0]),'rotation':node.get('rotation',[0,0,0,1]),
                        'scale':node.get('scale',[1,1,1])}})
        bank['clips'][0]['channels'].append({'group':name,'path':'translation','times':[0,1/60],
                                            'values':[0,0,0,0,0,0],'interpolation':'linear'})
    (out/'red-kite.motion.json').write_text(json.dumps(bank,indent=2)+'\n',encoding='utf-8')
    # The packed authoring scene retains editable finished parts and the real pivot hierarchy.
    for name,parts in GROUPS.items():
        for ob in parts:
            world=ob.matrix_world.copy();ob.parent=PIVOTS[name];ob.matrix_world=world
    for ob in ship.objects:
        if ob.parent is None:ob.parent=root
    bpy.context.view_layer.update()
    physical=bounds([ob.matrix_world@v.co for parts in COMPONENTS.values() for ob in parts for v in ob.data.vertices])
    visual=bounds([ob.matrix_world@v.co for ob in ship.objects for v in ob.data.vertices])
    contract={'schema':'spaceface.redKiteSourceGeometry.v1','assetId':ASSET_ID,'renderScale':1,'recipeSha256':digest(__file__),
              'lods':tiers,'bounds':visual,'physicalBounds':physical,'collision':{'kind':'compound',
              'components':collision_contract,'negativeSpace':['stern-slot','port-flap-notch']},
              'groups':{name:{'node':pivot.name,'pivotGltf':coords(pivot.matrix_world.translation),'axisGltf':[1,0,0]}
                        for name,pivot in PIVOTS.items()},
              'sockets':{name:{'positionGltf':coords(pos),'forwardGltf':coords(forward)} for name,(pos,forward) in ship.sockets.items()},
              'preflight':PREFLIGHT,'provenance':'Original SpaceFace procedural Forge source; no external geometry/media',
              'acceptance':'Source candidate; lead owns publication and exact live Look/runtime review'}
    (out/'measured-contract.json').write_text(json.dumps(contract,indent=2)+'\n',encoding='utf-8')
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'red_kite.blend'))
    return paths,contract

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default=str(ROOT/'.devshots/red-kite-build'))
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    ship=build();paths,contract=export(ship,out)
    if args.live:
        SOURCE_DIR.mkdir(parents=True,exist_ok=True)
        for path in paths:shutil.copyfile(path,SOURCE_DIR/path.name)
        PROVENANCE_DIR.mkdir(parents=True,exist_ok=True)
        for name in ('red_kite.blend','measured-contract.json'):shutil.copyfile(out/name,PROVENANCE_DIR/name)
        motion_path=ROOT/'assets/ships/motions/red-kite.motion.json'
        motion_path.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(out/'red-kite.motion.json',motion_path)
    print('RED_KITE_BUILD',json.dumps({key:contract[key] for key in ('assetId','lods','bounds','physicalBounds')}))

if __name__=='__main__':main()
