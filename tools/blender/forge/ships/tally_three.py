"""Tally-3 claim assessor, authored with the current shared Forge kit.

Preserves the original Tally pressure spine, unequal lattice instruments, open forward
cradle and supported amber receipt press from tally_3.py. No external geometry.
Build: blender -b --python tally_three.py -- --out .devshots/tally-three-build
Publish compatibility: --live copies only the owned place_tally_three source GLB.
Metres: author +X nose/+Y port/+Z up, glTF +X nose/+Y up/+Z starboard.
"""
import argparse, hashlib, json, math, shutil, sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(HERE.parent))
import forge as F
import forge_export as E

COLORS={'paint':'#87949b','paint2':'#46565f','stripe':'#b78027','dark':'#19222c',
        'gunmetal':'#74828a','glow_cyan':'#4cc9d4','glow_drive':'#75cdd6'}
PIVOTS={};GROUPS={};SPINE=None
REST_ANGLE=20.0
WORK_ANGLE=75.0
ASSET_ID='SF_PLACE_TALLY_3'
SOURCE=ROOT/'assets/ships/parts/places/place_tally_three.glb'

def coords(p):return [round(p[0],6),round(p[2],6),round(-p[1],6)]
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def group(s,ident,start,pivot):
    parts=s.objects[start:]
    ob=s.motion_group(ident,pivot,parts)
    ob['spacefaceSocket']=True
    ob['spacefaceInstance']=False
    PIVOTS[ident]=ob;GROUPS[ident]=parts
    return ob

def orient_source(parts,pivot,angle):
    mat=Matrix.Translation(Vector(pivot))@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-Vector(pivot))
    for ob in parts:
        for v in ob.data.vertices:v.co=mat@v.co

def plate_side(s,name,outline,side,**kwargs):
    poly=[(x,y*side) for x,y in outline]
    if side<0:poly.reverse()
    return F.plate(s,name,poly,**kwargs)

def build():
    global SPINE
    F.reset_scene()
    s=F.Ship('tally_three',COLORS)
    s.refresh_lod_normals=True
    # One genuine convex primary pressure/drive spine. All peripheral instruments are excluded.
    SPINE=F.loft(s,'ROOT_TALLY__CollisionSpine',[
        dict(x=-10.55,w=1.38,ht=.78,hb=.83,zc=-.18,n=3.2),
        dict(x=-8.9,w=2.15,ht=1.00,hb=1.13,zc=-.18,n=3.2),
        dict(x=-5.0,w=2.3,ht=1.07,hb=1.23,zc=-.18,n=3.2),
        dict(x=2.2,w=1.91,ht=.91,hb=1.06,zc=-.18,n=3.2),
        dict(x=6.1,w=1.49,ht=.80,hb=.81,zc=-.18,n=3.2),
        dict(x=8.1,w=.75,ht=.43,hb=.51,zc=-.18,n=3.2)],
        material='dark',count=24,bevel=.085,uv_scale=.6)
    # Two slate shoulder skins leave the long, dark mechanical top channel visible.
    for side,label in ((1,'Port'),(-1,'Starboard')):
        for i,(a,b,outer,inner) in enumerate([(-9.5,-6.1,2.12,.98),(-5.92,-2.62,2.12,.84),(-2.44,.68,1.94,.72),(.86,3.68,1.71,.60)]):
            plate_side(s,label+'RaisedShoulder'+str(i),[(a,inner),(a+.28,outer-.15),(b-.28,outer),(b,outer-.3),(b,inner)],side,
                       z0=.58 if i<2 else .47,thickness=.54,material='paint',side_material='dark',chamfer=.17,bevel=.04,uv_scale=.6)
        # Fore service plates narrow with the spine, leaving an honest optical recess.
        plate_side(s,label+'ForeCheek',[(3.9,.55),(3.98,1.56),(6.44,1.32),(7.52,.78),(6.8,.47)],side,
                   z0=.27,thickness=.55,material='paint',side_material='dark',chamfer=.14,bevel=.042,uv_scale=.6)
        # Rail below the shoulder, load-aligned rather than decorative floating tubing.
        F.sweep(s,label+'LongitudinalRail',[(-9.28,side*2.02,-.02),(-4.9,side*2.31,-.02),(2.1,side*1.96,-.02),(6.2,side*1.48,-.02)],
                .17,.23,'gunmetal',bevel=.02,uv_scale=.7)
        F.box(s,label+'HingeFoundation',(-.08,side*2.08,.22),(1.6,1.08,.84),'dark',bevel=.11)
        F.cylinder(s,label+'FixedHingeAxle',(0,side*2.50,-.12),(0,side*2.50,1.04),.34,material='gunmetal',segments=20,bevel=.02)
        F.cylinder(s,label+'BearingLowerRace',(0,side*2.50,.0),(0,side*2.50,.19),.59,material='dark',segments=20,bevel=.025)
        F.cylinder(s,label+'BearingUpperRace',(0,side*2.50,.85),(0,side*2.50,1.09),.64,material='dark',segments=20,bevel=.025)
        F.cylinder(s,label+'BearingCap',(0,side*2.50,1.09),(0,side*2.50,1.14),.27,material='stripe',segments=16,bevel=.012)
    # One longitudinal ochre band carried by a recessed service cover; dark gaps remain on either side.
    F.plate(s,'DorsalLedgerCover',[(-5.35,-.46),(-5.35,.46),(3.80,.40),(4.50,.0),(3.8,-.40)],
            z0=.73,thickness=.24,material='dark',chamfer=.06,bevel=.02,uv_scale=.58)
    F.band(s,'DorsalLedgerCover',(0,0,0),(0,1,0),.23,'stripe',facing=(0,0,1),inset=.012,depth=-.006)
    F.boxes(s,'ChannelCrossRibs',[((x,0,.83),(.18,1.28,.20)) for x in (-4.9,-3.45,-1.95,-.42,1.10,2.55)],'gunmetal',bevel=.02)
    # Engraved task-independent hardware, useful at close zoom without a noise field.
    s.detail=1
    F.boxes(s,'ShoulderFasteners',[((x,side*y,z),(.105,.105,.065)) for side in (-1,1) for x,y,z in [(-8.9,1.75,1.13),(-6.5,1.78,1.13),(-5.4,1.72,1.13),(-3.0,1.72,1.13),(-1.9,1.50,1.02),(.1,1.5,1.02),(1.3,1.3,1.02),(3.2,1.28,1.02)]],'gunmetal',bevel=.01)
    for side in (-1,1):
        for x in (-8.0,-4.2,2.2):
            F.boxes(s,'SeatedCoolingLouvers'+str(side)+str(x),[((x+i*.17,side*1.32,1.13 if x<0 else 1.02),(.075,.56,.09)) for i in (-2,-1,0,1,2)],'dark',bevel=.008)
    s.detail=0
    # Rear drive nests in the structural tail. Shoulder housings and brace feet are continuous.
    F.box(s,'DriveCrosshead',(-10.03,0,-.18),(1.32,3.42,1.39),'dark',bevel=.18)
    for y in (-.90,.90):
        F.nozzle(s,'SupportedMainNozzle'+str(y),(-10.58,y,-.18),.59,.82,'gunmetal',glow='glow_drive')
    # Stamp is a vertically moving press ring in a fixed, solid U-yoke. No floating disc.
    for side in (-1,1):
        F.box(s,'StampFoot'+str(side),(-7.08,side*1.84,1.06),(1.64,.78,.45),'dark',bevel=.085)
        F.plate_v(s,'StampUpright'+str(side),[(-7.66,1.11),(-6.5,1.11),(-6.55,3.10),(-6.88,3.72),(-7.50,3.72),(-7.66,3.12)],
                  side*1.83-.19,.38,'xz','dark',chamfer=.1,bevel=.04)
        F.cylinder(s,'StampGuide'+str(side),(-7.04,side*1.84,1.3),(-7.04,side*1.84,3.70),.105,material='gunmetal',segments=12,bevel=.015)
    F.beams(s,'SolidUYokeCrossbar',[((-7.07,-1.96,3.80),(-7.07,1.96,3.80))],.38,'dark',h=.37,bevel=.05)
    F.box(s,'StampRamHousing',(-7.07,0,3.91),(1.12,.94,.62),'dark',bevel=.16)
    F.cylinder(s,'StampRamCollar',(-7.07,0,3.35),(-7.07,0,3.76),.30,material='gunmetal',segments=20,bevel=.025)
    F.annulus(s,'StampFixedGuideRim',(-7.07,0),2.58,2.70,2.52,.55,'gunmetal',segments=48,bevel=.014,uv_scale=.15)
    n=len(s.objects)
    F.annulus(s,'STAMP__OchrePressRing',(-7.07,0),1.56,2.57,2.53,.50,'stripe',segments=48,side_material='gunmetal',bevel=.052,uv_scale=.6)
    # Fixed outer guide ring is outside the translating stamp-face group.
    # Three large raised bars cross the open face, no generated lettering or tiny glyphs.
    F.boxes(s,'StampThreeRaisedBars',[((-7.07,x,2.995),(2*math.sqrt(1.58**2-x*x)+.12,.28,.19)) for x in (-.77,0,.77)],'stripe',bevel=.035)
    F.beams(s,'StampBridgeArms',[((-7.07,-1.94,3.15),(-7.07,0,3.25)),((-7.07,0,3.25),(-7.07,1.94,3.15))],.20,'gunmetal',h=.20,bevel=.025)
    F.cylinder(s,'StampMovingSpindle',(-7.07,0,2.93),(-7.07,0,3.56),.15,material='gunmetal',segments=16,bevel=.012)
    for side in (-1,1):F.box(s,'StampGuideSleeve'+str(side),(-7.04,side*1.84,2.99),(.46,.37,.57),'gunmetal',bevel=.06)
    # A single warm lacquer face translates within the fixed structural ring/yoke.
    for ob in s.objects[n:]:
        ob.data.materials.clear();ob.data.materials.append(s.mat('stripe'))
        for face in ob.data.polygons:face.material_index=0
    group(s,'tally_stamp',n,(-7.07,0,2.5))
    # Unequal, truly open cage trusses: same manufacture; one 1.5m shorter.
    for side,label,length in ((1,'left',7.0),(-1,'right',5.5)):
        n=len(s.objects);p=(0,side*2.5,.52)
        q=(length,side*2.5,.52)
        F.truss(s,'ARM_'+label.upper()+'__OpenCage',(0,side*2.5,.52),(length-.48,side*2.5,.52),.90,5 if side>0 else 4,'gunmetal',chord=.18,web=.09,uv_scale=.12)
        F.box(s,label+'ArmRootClevis',(.34,side*2.5,.51),(.72,.68,.54),'gunmetal',bevel=.045)
        F.cylinder(s,label+'MovingHub',(0,side*2.5,.26),(0,side*2.5,.79),.45,material='gunmetal',segments=20,bevel=.025)
        # Terminal head is seated into a short fork, with visible depth and two recessed scan slots.
        F.box(s,label+'HeadNeck',(length-.42,side*2.5,.50),(.80,.53,.38),'gunmetal',bevel=.04)
        F.cylinder(s,label+'ScanHead',(length,side*2.5,.30),(length,side*2.5,.78),.73,material='gunmetal',segments=24,bevel=.035)
        F.annulus(s,label+'ScanHeadOchreBezel',(length,side*2.5),.50,.74,.76,.14,'stripe',segments=24,bevel=.022)
        F.boxes(s,label+'LargeScanGrilles',[((length+x,side*2.5,.814),(.15,.80,.07)) for x in (-.25,.25)],'stripe',bevel=.018)
        # One local equipment band; lattice aperture stays open all the way through.
        F.box(s,label+'CalibrationCollar',(length*.56,side*2.5,.51),(.17,.82,.83),'stripe',bevel=.015)
        # Both unequal instruments use one common mechanical finish.
        for ob in s.objects[n:]:
            ob.data.materials.clear();ob.data.materials.append(s.mat('gunmetal'))
            for face in ob.data.polygons:face.material_index=0
        parts=s.objects[n:];orient_source(parts,p,math.radians(side*REST_ANGLE))
        group(s,'tally_arm_'+label,n,p)
    # Open V receiver: pads are separate triangular solids, not an invisible tray.
    for side,label in ((1,'Port'),(-1,'Starboard')):
        plate_side(s,label+'CradleRoot',[(4.7,1.17),(5.15,1.97),(7.45,2.61),(7.75,2.2),(6.15,1.34)],side,
                   z0=-.18,thickness=.55,material='dark',chamfer=.12,bevel=.045)
        plate_side(s,label+'GoldTriangularPad',[(6.05,1.49),(6.50,2.35),(10.5,2.9),(11.20,2.28),(9.18,1.62)],side,
                   z0=.07,thickness=.45,material='stripe',side_material='gunmetal',chamfer=.095,bevel=.045,uv_scale=.65)
        F.beams(s,label+'CradleInnerBumper',[((7.20,side*1.59,.50),(10.25,side*2.03,.50))],.14,'dark',h=.19,bevel=.025)
        F.box(s,label+'CradleMountPin',(6.52,side*1.92,.52),(.35,.65,.20),'gunmetal',bevel=.032)
    # Single scan aperture under the forward plate; the optical plate can sweep on its hinge.
    F.box(s,'SCAN_SOCKET__RecessedAperture',(7.25,0,.55),(1.25,1.15,.27),'dark',bevel=.09)
    F.box(s,'ScanProtectiveBrow',(7.00,0,.86),(.47,1.33,.20),'paint',bevel=.065)
    F.box(s,'ScanOpticCarrier',(7.72,0,.50),(.23,1.0,.33),'gunmetal',bevel=.05)
    n=len(s.objects)
    F.box(s,'ScanOpticSlit',(7.856,0,.54),(.035,.80,.085),'glow_cyan',bevel=.015)
    group(s,'tally_scan',n,(7.65,0,.51))
    # Necessary position lights, small and mounted. No all-over glowing stripe.
    F.light(s,'PortNavigation',(-.25,2.45,1.15),'glow_red',.09)
    F.light(s,'StarboardNavigation',(-.25,-2.45,1.15),'glow_green',.09)
    s.socket('HOOK_SCAN',(7.876,0,.54),(1,0,0))
    s.socket('SOCKET_CLAIM_CRADLE',(9.6,0,.31),(1,0,0))
    s.socket('SOCKET_TALLY_STAMP',(-7.07,0,2.5),(0,0,-1))
    s.socket('SOCKET_Engine_Main',(-11.15,0,-.18),(-1,0,0))
    s.socket('SOCKET_Camera_Focus',(-.3,0,.8))
    s.socket_names=list(s.sockets)
    # Calm small structural parts with a low-frequency shared manufactured finish.
    for ob in s.objects:
        if any(k in ob.name for k in ('StampFoot','StampUpright','SolidUYoke','StampRamHousing','HingeFoundation','BearingLowerRace','BearingUpperRace')):
            ob.data.materials.clear();ob.data.materials.append(s.mat('gunmetal'))
            for face in ob.data.polygons:face.material_index=0
        if any(k in ob.name for k in ('left','right','Rail','StampGuide','StampFixedGuide','Hinge','Bearing','SolidUYoke','StampRam')):ob['forge_uv_scale']=.12
    s.finish()
    # Preserve the Forge finished source surface, then reduce only redundant bevel sampling.
    # Truss topology and the spine collision source remain exact; the contract measures the result.
    for ob in s.objects:
        if ob == SPINE or '__OpenCage' in ob.name: continue
        if len(ob.data.polygons) < 90: continue
        E._select_only([ob])
        mod=ob.modifiers.new('TallyBevelDensityBudget','DECIMATE');mod.ratio=.49;mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return s

def export(s,out):
    E._rename_materials(s)
    root=E._root_empty('SF_PLACE_TALLY_3_ROOT',{})
    meshes=[]
    for lod in (0,1,2):
        tier=E._lod_meshes(s,lod,'LOD'+str(lod))
        for ob in tier:
            if ob.parent is None:ob.parent=root
        meshes+=tier
    E._mount_motion_pivots(s,root)
    collision=E._collision_hull(s,root,[SPINE])
    E._add_sockets(s,root)
    path=out/'tally_three.glb'
    E._export([root]+list(root.children_recursive),str(path))
    E._stamp(str(path),{'assetId':ASSET_ID,'partId':'tally-3','liveId':'place_tally_three',
        'slot':'place','category':'places','forge':{'version':1,'ship':'tally_three'}},'lod0')
    def annotate(doc):
        for node in doc['nodes']:
            if node.get('name')=='HOOK_SCAN':
                node['name']='SOCKET_TALLY_SCAN'
                node.setdefault('extras',{})['authorSemantic']='HOOK_SCAN'
            if node.get('name','').startswith('MOTION_'):
                extras=node.setdefault('extras',{})
                extras['spacefaceSocket']=True
                extras.setdefault('spaceface',{})['instance']=False
        doc['asset']['extras']['tally3Geometry']={
            'schema':'spaceface.tally3Geometry.v1','collision':'single-convex-spine',
            'nonColliding':['arms','stamp','cradle','scan'],'referenceState':'folded-20-degrees',
            'sourceRecipeSha256':digest(__file__)}
    doc=E.patch_glb_json(str(path),annotate)
    tiers={}
    for lod in (0,1,2):
        primitives=[primitive for node in doc['nodes'] if node.get('name','').startswith('LOD'+str(lod)+'_')
            and 'mesh' in node for primitive in doc['meshes'][node['mesh']]['primitives']]
        tiers[str(lod)]={'triangles':sum(doc['accessors'][p['indices']]['count']//3 for p in primitives),
            'drawPrimitives':len(primitives)}
    body={'kind':'convex','source':'ROOT_TALLY__CollisionSpine only','renderScale':1,
        'verticesGltf':[coords(v.co) for v in collision.data.vertices],
        'triangles':[list(face.vertices) for face in collision.data.polygons]}
    E._clear_export_objects(meshes+[collision])
    for ident,parts in GROUPS.items():
        for ob in parts:
            world=ob.matrix_world.copy();ob.parent=PIVOTS[ident];ob.matrix_world=world
    for ob in s.objects:
        if ob.parent is None:ob.parent=root
    return path,doc,tiers,body

def measured_bounds(s):
    points=[ob.matrix_world@v.co for ob in s.objects for v in ob.data.vertices]
    return {'minGltf':[min(coords(p)[i] for p in points) for i in range(3)],
        'maxGltf':[max(coords(p)[i] for p in points) for i in range(3)],
        'maxRootDistanceMetres':max(p.length for p in points)}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default=str(ROOT/'.devshots/tally-three-build'))
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    s=build();path,doc,tiers,collision=export(s,out)
    folded=measured_bounds(s)
    for group_id,angle in [('tally_arm_left',55),('tally_arm_right',-55)]:
        PIVOTS[group_id].rotation_euler.z=math.radians(angle)
    bpy.context.view_layer.update();deployed=measured_bounds(s)
    for ob in PIVOTS.values():ob.rotation_euler=(0,0,0)
    bpy.context.view_layer.update()
    contract={'assetId':ASSET_ID,'sourceFile':'assets/ships/parts/places/place_tally_three.glb',
        'recipeSha256':digest(__file__),'glbSha256':digest(path),'lods':tiers,
        'materials':len(doc.get('materials',[])),'sharedImages':len(doc.get('images',[])),
        'bytes':path.stat().st_size,'bounds':{'folded':folded,'deployed':deployed},
        'groups':{ident:{'node':ob.name,'pivotGltf':coords(ob.matrix_world.translation)} for ident,ob in PIVOTS.items()},
        'collision':collision,'receiptAuthority':'Only accepted cargo/economy settlement can stroke the stamp',
        'sourceGeometry':'Original SpaceFace tally_3.py assessor geometry, rebuilt through current Forge',
        'gameCameraAcceptance':'Root integration owns actual published Look picture'}
    (out/'measured-contract.json').write_text(json.dumps(contract,indent=2)+'\n')
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/'tally_three.blend'))
    if args.live:
        SOURCE.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,SOURCE)
    print('TALLY_THREE_BUILD',json.dumps({k:contract[k] for k in ['assetId','glbSha256','lods','materials','sharedImages','bytes']}))

if __name__=='__main__':main()
