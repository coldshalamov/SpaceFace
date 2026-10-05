"""SF20-03 Tally-3: original Forge claim-assessor production candidate.

Canonical: blender -b --python tools/blender/forge/ships/tally_3.py -- --render
Isolated packet: add --forge-root /read-only/repo/tools/blender/forge.
Uses existing Forge finishes/export operations, never writes Forge shared files.
Authored metres: +X nose, +Y port, +Z up. No glTF animations. Rigid motion bank.
"""
import argparse, hashlib, json, math, os, sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix, Quaternion

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
args = argparse.ArgumentParser()
args.add_argument('--forge-root',default=str(HERE.parent))
args.add_argument('--render',action='store_true')
args.add_argument('--render-version',default='v1')
A = args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
sys.path.insert(0,A.forge_root)
import forge as F
import forge_export as E

SOURCE=ROOT/'tools/blender/forge/source_assets/tally_3'
DESIGN=ROOT/'design/visual-assets/tally-3'
GLB=ROOT/'assets/ships/parts/places/place_tally_3.glb'
BANK=ROOT/'assets/ships/motions/tally-3.motion.json'
RENDERS=ROOT.parent/'source-renders'/('tally-3-'+A.render_version)
for p in (SOURCE,DESIGN,GLB.parent,BANK.parent,RENDERS):p.mkdir(parents=True,exist_ok=True)
COLORS={'paint':'#87949b','paint2':'#46565f','stripe':'#b78027','dark':'#19222c',
        'gunmetal':'#55636c','glow_cyan':'#4cc9d4','glow_drive':'#75cdd6'}
PIVOTS={}; GROUPS={}; SPINE=None; ROOT_OBJ=None
REST_ANGLE=20.0
WORK_ANGLE=75.0

def coords(p):return [round(p[0],6),round(p[2],6),round(-p[1],6)]
def h(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def group(s,ident,start,pivot):
    parts=s.objects[start:]
    ob=s.motion_group(ident,pivot,parts)
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
    s=F.Ship('tally_3',COLORS)
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
                       z0=.58 if i<2 else .47,thickness=.54,material='paint',side_material='paint2',chamfer=.17,bevel=.04,uv_scale=.6)
        # Fore service plates narrow with the spine, leaving an honest optical recess.
        plate_side(s,label+'ForeCheek',[(3.9,.55),(3.98,1.56),(6.44,1.32),(7.52,.78),(6.8,.47)],side,
                   z0=.27,thickness=.55,material='paint',side_material='paint2',chamfer=.14,bevel=.042,uv_scale=.6)
        # Rail below the shoulder, load-aligned rather than decorative floating tubing.
        F.sweep(s,label+'LongitudinalRail',[(-9.28,side*2.02,-.02),(-4.9,side*2.31,-.02),(2.1,side*1.96,-.02),(6.2,side*1.48,-.02)],
                .17,.23,'gunmetal',bevel=.02,uv_scale=.7)
        F.box(s,label+'HingeFoundation',(-.08,side*2.08,.22),(1.6,1.08,.84),'paint2',bevel=.11)
        F.cylinder(s,label+'FixedHingeAxle',(0,side*2.50,-.12),(0,side*2.50,1.04),.34,material='gunmetal',segments=20,bevel=.02)
        F.cylinder(s,label+'BearingLowerRace',(0,side*2.50,.0),(0,side*2.50,.19),.59,material='paint2',segments=20,bevel=.025)
        F.cylinder(s,label+'BearingUpperRace',(0,side*2.50,.85),(0,side*2.50,1.09),.64,material='paint2',segments=20,bevel=.025)
        F.cylinder(s,label+'BearingCap',(0,side*2.50,1.09),(0,side*2.50,1.14),.27,material='stripe',segments=16,bevel=.012)
    # One longitudinal ochre band carried by a recessed service cover; dark gaps remain on either side.
    F.plate(s,'DorsalLedgerCover',[(-5.35,-.46),(-5.35,.46),(3.80,.40),(4.50,.0),(3.8,-.40)],
            z0=.73,thickness=.24,material='paint2',chamfer=.06,bevel=.02,uv_scale=.58)
    F.band(s,'DorsalLedgerCover',(0,0,0),(0,1,0),.23,'stripe',facing=(0,0,1),inset=.012,depth=-.006)
    F.boxes(s,'ChannelCrossRibs',[((x,0,.83),(.18,1.28,.20)) for x in (-4.9,-3.45,-1.95,-.42,1.10,2.55)],'gunmetal',bevel=.02)
    # Engraved task-independent hardware, useful at close zoom without a noise field.
    s.detail=1
    F.boxes(s,'ShoulderFasteners',[((x,side*y,z),(.105,.105,.065)) for side in (-1,1) for x,y,z in [(-8.9,1.75,1.13),(-6.5,1.78,1.13),(-5.4,1.72,1.13),(-3.0,1.72,1.13),(-1.9,1.50,1.02),(.1,1.5,1.02),(1.3,1.3,1.02),(3.2,1.28,1.02)]],'gunmetal',bevel=.01)
    for side in (-1,1):
        for x in (-8.0,-4.2,2.2):
            F.boxes(s,'SeatedCoolingLouvers'+str(side)+str(x),[((x+i*.17,side*1.32,1.13 if x<0 else 1.02),(.075,.56,.09)) for i in (-2,-1,0,1,2)],'paint2',bevel=.008)
    s.detail=0
    # Rear drive nests in the structural tail. Shoulder housings and brace feet are continuous.
    F.box(s,'DriveCrosshead',(-10.03,0,-.18),(1.32,3.42,1.39),'paint2',bevel=.18)
    for y in (-.90,.90):
        F.nozzle(s,'SupportedMainNozzle'+str(y),(-10.58,y,-.18),.59,.82,'gunmetal',glow='glow_drive')
    # Stamp is a vertically moving press ring in a fixed, solid U-yoke. No floating disc.
    for side in (-1,1):
        F.box(s,'StampFoot'+str(side),(-7.08,side*1.84,1.06),(1.64,.78,.45),'paint2',bevel=.085)
        F.plate_v(s,'StampUpright'+str(side),[(-7.66,1.11),(-6.5,1.11),(-6.55,3.10),(-6.88,3.72),(-7.50,3.72),(-7.66,3.12)],
                  side*1.83-.19,.38,'xz','paint2',chamfer=.1,bevel=.04)
        F.cylinder(s,'StampGuide'+str(side),(-7.04,side*1.84,1.3),(-7.04,side*1.84,3.70),.105,material='gunmetal',segments=12,bevel=.015)
    F.beams(s,'SolidUYokeCrossbar',[((-7.07,-1.96,3.80),(-7.07,1.96,3.80))],.38,'paint2',h=.37,bevel=.05)
    F.box(s,'StampRamHousing',(-7.07,0,3.91),(1.12,.94,.62),'paint2',bevel=.16)
    F.cylinder(s,'StampRamCollar',(-7.07,0,3.35),(-7.07,0,3.76),.30,material='gunmetal',segments=20,bevel=.025)
    n=len(s.objects)
    F.annulus(s,'STAMP__OchrePressRing',(-7.07,0),1.56,2.57,2.53,.50,'stripe',segments=48,side_material='gunmetal',bevel=.052,uv_scale=.6)
    F.annulus(s,'StampRecessedRim',(-7.07,0),2.12,2.36,3.025,.025,'gunmetal',segments=48,bevel=.007)
    # Three large raised bars cross the open face, no generated lettering or tiny glyphs.
    F.boxes(s,'StampThreeRaisedBars',[((-7.07+x,0,2.995),(.28,2*math.sqrt(1.58**2-x*x)+.12,.19)) for x in (-.77,0,.77)],'stripe',bevel=.035)
    F.beams(s,'StampBridgeArms',[((-7.07,-1.94,3.15),(-7.07,0,3.25)),((-7.07,0,3.25),(-7.07,1.94,3.15))],.20,'gunmetal',h=.20,bevel=.025)
    F.cylinder(s,'StampMovingSpindle',(-7.07,0,2.93),(-7.07,0,3.56),.15,material='gunmetal',segments=16,bevel=.012)
    for side in (-1,1):F.box(s,'StampGuideSleeve'+str(side),(-7.04,side*1.84,2.99),(.46,.37,.57),'gunmetal',bevel=.06)
    group(s,'tally_stamp',n,(-7.07,0,2.5))
    # Unequal, truly open cage trusses: same manufacture; one 1.5m shorter.
    for side,label,length in ((1,'left',7.0),(-1,'right',5.5)):
        n=len(s.objects);p=(0,side*2.5,.52)
        q=(length,side*2.5,.52)
        F.truss(s,'ARM_'+label.upper()+'__OpenCage',(0,side*2.5,.52),(length-.48,side*2.5,.52),.71,5 if side>0 else 4,'gunmetal',chord=.115,web=.076,uv_scale=.6)
        F.box(s,label+'ArmRootClevis',(.34,side*2.5,.51),(.72,.68,.54),'gunmetal',bevel=.045)
        F.cylinder(s,label+'MovingHub',(0,side*2.5,.26),(0,side*2.5,.79),.45,material='gunmetal',segments=20,bevel=.025)
        # Terminal head is seated into a short fork, with visible depth and two recessed scan slots.
        F.box(s,label+'HeadNeck',(length-.42,side*2.5,.50),(.80,.53,.38),'gunmetal',bevel=.04)
        F.cylinder(s,label+'ScanHead',(length,side*2.5,.30),(length,side*2.5,.78),.73,material='gunmetal',segments=24,bevel=.035)
        F.annulus(s,label+'ScanHeadOchreBezel',(length,side*2.5),.50,.74,.76,.14,'stripe',segments=24,bevel=.022)
        F.boxes(s,label+'LargeScanGrilles',[((length+x,side*2.5,.814),(.15,.80,.07)) for x in (-.25,.25)],'stripe',bevel=.018)
        # One local equipment band; lattice aperture stays open all the way through.
        F.box(s,label+'CalibrationCollar',(length*.56,side*2.5,.51),(.17,.82,.83),'stripe',bevel=.015)
        parts=s.objects[n:];orient_source(parts,p,math.radians(side*REST_ANGLE))
        group(s,'tally_arm_'+label,n,p)
    # Open V receiver: pads are separate triangular solids, not an invisible tray.
    for side,label in ((1,'Port'),(-1,'Starboard')):
        plate_side(s,label+'CradleRoot',[(4.7,1.17),(5.15,1.97),(7.45,2.61),(7.75,2.2),(6.15,1.34)],side,
                   z0=-.18,thickness=.55,material='paint2',chamfer=.12,bevel=.045)
        plate_side(s,label+'GoldTriangularPad',[(6.05,1.49),(6.50,2.35),(10.5,2.9),(11.20,2.28),(9.18,1.62)],side,
                   z0=.07,thickness=.45,material='stripe',side_material='gunmetal',chamfer=.095,bevel=.045,uv_scale=.65)
        F.beams(s,label+'CradleInnerBumper',[((7.20,side*1.59,.50),(10.25,side*2.03,.50))],.14,'dark',h=.19,bevel=.025)
        F.box(s,label+'CradleMountPin',(6.52,side*1.92,.52),(.35,.65,.20),'gunmetal',bevel=.032)
    # Single scan aperture under the forward plate; the optical plate can sweep on its hinge.
    F.box(s,'SCAN_SOCKET__RecessedAperture',(7.25,0,.55),(1.25,1.15,.27),'dark',bevel=.09)
    F.box(s,'ScanProtectiveBrow',(7.00,0,.86),(.47,1.33,.20),'paint',bevel=.065)
    n=len(s.objects)
    F.box(s,'ScanOpticCarrier',(7.72,0,.50),(.23,1.0,.33),'gunmetal',bevel=.05)
    F.box(s,'ScanOpticSlit',(7.856,0,.54),(.035,.80,.085),'glow_cyan',bevel=.015)
    group(s,'tally_scan',n,(7.65,0,.51))
    # Necessary position lights, small and mounted. No all-over glowing stripe.
    F.light(s,'PortNavigation',(-.25,2.45,1.15),'glow_red',.09)
    F.light(s,'StarboardNavigation',(-.25,-2.45,1.15),'glow_green',.09)
    s.socket('HOOK_SCAN',(8,0,1.5),(1,0,0))
    s.socket('SOCKET_CLAIM_CRADLE',(9.4,0,.31),(1,0,0))
    s.socket('SOCKET_TALLY_STAMP',(-7.07,0,2.5),(0,0,-1))
    s.socket('SOCKET_Engine_Main',(-11.15,0,-.18),(-1,0,0))
    s.socket('SOCKET_Camera_Focus',(-.3,0,.8))
    s.socket_names=list(s.sockets)
    s.finish();return s

def export(s):
    global ROOT_OBJ
    E._rename_materials(s)
    ROOT_OBJ=E._root_empty('SF_PLACE_TALLY_3_ROOT',{})
    meshes=[];stats={}
    for lod in (0,1,2):
        ms=E._lod_meshes(s,lod,'LOD'+str(lod))
        for ob in ms:
            if ob.parent is None:ob.parent=ROOT_OBJ
        stats[str(lod)]={'triangles':sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in ms),'drawPrimitives':len(ms)}
        meshes+=ms
    E._mount_motion_pivots(s,ROOT_OBJ)
    # Exact Forge convex builder, deliberately fed the structural spine only.
    coll=E._collision_hull(s,ROOT_OBJ,[SPINE])
    E._add_sockets(s,ROOT_OBJ)
    E._export([ROOT_OBJ]+list(ROOT_OBJ.children_recursive),str(GLB))
    E._stamp(str(GLB),{'assetId':'SF_PLACE_TALLY_3','partId':'tally-3','liveId':'place_tally_3','slot':'place','category':'places','forge':{'version':1,'ship':'tally_3'}},'lod0')
    def patch(doc):
        for node in doc['nodes']:
            if node.get('name')=='HOOK_SCAN':
                # A simulation socket is an explicit empty, not a renderable damage hook.
                node['name']='SOCKET_TALLY_SCAN';node.setdefault('extras',{})['authorSemantic']='HOOK_SCAN'
            if node.get('name','').startswith('MOTION_'):
                node.setdefault('extras',{}).setdefault('spaceface',{})['instance']=False
        doc['asset']['extras']['tally3Geometry']={'schema':'spaceface.tally3Geometry.v1','collision':'single-convex-spine','nonColliding':['arms','stamp','cradle','scan'],'referenceState':'folded-20-degrees','sourceRecipeSha256':h(__file__)}
    doc=E.patch_glb_json(str(GLB),patch)
    collision={'verticesGltf':[[round(v.co.x,6),round(v.co.z,6),round(-v.co.y,6)] for v in coll.data.vertices],
               'triangles':[list(p.vertices) for p in coll.data.polygons],
               'source':'ROOT_TALLY__CollisionSpine only','node':'COLLISION_HULL','kind':'convex','renderScale':1}
    # Remove exported welds before source saving, preserving original individually-editable parts.
    E._clear_export_objects(meshes+[coll])
    for ident,parts in GROUPS.items():
        for ob in parts:
            w=ob.matrix_world.copy();ob.parent=PIVOTS[ident];ob.matrix_world=w
    for ob in s.objects:
        if ob.parent is None:ob.parent=ROOT_OBJ
    return stats,collision,doc


def sample_clip(name,duration,channel_specs,end='hold',settlement=False):
    steps=round(duration*60);times=[i/60 for i in range(steps+1)]
    channels=[]
    for group,path,fn in channel_specs:
        values=[]
        for t in times:values.extend(fn(t/duration))
        channels.append({'group':group,'path':path,'times':times,'values':values,'interpolation':'slerp' if path=='rotation' else 'linear'})
    return {'name':name,'durationS':duration,'loop':False,'endMode':end,'channels':channels,
            **({'settlementRequired':True,'trigger':'accepted cargo/economy settlement receipt only; never contact, offer, or animation completion'} if settlement else {})}

def smooth(u):return u*u*(3-2*u)
def qz(degrees):
    a=math.radians(degrees)/2
    return [0,math.sin(a),0,math.cos(a)] # Blender +Z -> glTF +Y

def motions(doc):
    bindings=[{'id':n['name'][7:].lower(),'node':n['name'],'parent':None,
               'restPose':{'translation':n.get('translation',[0,0,0]),'rotation':n.get('rotation',[0,0,0,1]),'scale':n.get('scale',[1,1,1])},'requiredAtLod':[0,1,2]} for n in doc['nodes'] if n.get('name','').startswith('MOTION_')]
    arm=lambda ident,sgn,fn:(ident,'rotation',lambda u:qz(sgn*fn(u)))
    zero=lambda u:[0,0,0]
    clips=[
      sample_clip('assess',1.4,[arm('tally_arm_left',1,lambda u:55*smooth(u)),arm('tally_arm_right',-1,lambda u:55*smooth(u)),arm('tally_scan',1,lambda u:8*math.sin(math.pi*u))]),
      sample_clip('disputed',2.0,[arm('tally_arm_left',1,lambda u:55+7*smooth(min(1,u*3))),arm('tally_arm_right',-1,lambda u:55-16*smooth(min(1,u*3))),('tally_stamp','translation',zero)]),
      sample_clip('receipt',.45,[('tally_stamp','translation',lambda u:[0,-.35*(smooth(u/.42) if u<.42 else 1-smooth((u-.42)/.58)),0])],end='rest',settlement=True),
      sample_clip('withdraw',1.1,[arm('tally_arm_left',1,lambda u:55*(1-smooth(u))),arm('tally_arm_right',-1,lambda u:55*(1-smooth(u))),arm('tally_scan',1,lambda u:0)],end='rest')]
    bank={'schema':'spaceface.rigidMotionBank.v1','rigId':'tally_3_claim_assessor','sourceAssetId':'SF_PLACE_TALLY_3','sourceGlbSha256':h(GLB),'fps':60,'bindings':bindings,'clips':clips,
          'simulationAuthority':'Cosmetic instrument transforms only. Accepted settlement receipt is the sole authority for stamp stroke. Receiver and collision never read these transforms.',
          'restState':'folded-20-degrees','interruptions':'Runtime live-to-key bridge; do not reset source transforms on a phase transition.','reducedMotion':'Use shared bank reduction; receipt truth and textual claim state remain independent.'}
    BANK.write_text(json.dumps(bank,indent=2)+'\n')
    # Real editable 60fps actions for every rigid group/clip, not a rendered-motion substitute.
    for clip in clips:
        for ch in clip['channels']:
            ob=PIVOTS[ch['group']];ob.animation_data_create()
            action=bpy.data.actions.new(clip['name']+'__'+ch['group']);action.use_fake_user=True
            ob.animation_data.action=action
            rest=ob.matrix_basis.copy();stride=4 if ch['path']=='rotation' else 3
            for i,t in enumerate(ch['times']):
                val=ch['values'][i*stride:(i+1)*stride]
                if stride==4:
                    ob.rotation_mode='QUATERNION';ob.rotation_quaternion=Quaternion((val[3],val[0],-val[2],val[1]))
                    ob.keyframe_insert(data_path='rotation_quaternion',frame=round(t*60))
                else:
                    ob.location=rest.translation+Vector((val[0],-val[2],val[1]));ob.keyframe_insert(data_path='location',frame=round(t*60))
            ob.animation_data.action=None;ob.matrix_basis=rest
    return bank


def pose(name):
    for ob in PIVOTS.values():
        ob.rotation_mode='XYZ';ob.rotation_euler=(0,0,0)
    PIVOTS['tally_stamp'].location=(-7.07,0,2.5)
    if name in ('deployed','working','receipt'):
        PIVOTS['tally_arm_left'].rotation_euler.z=math.radians(55 if name!='working' else 62)
        PIVOTS['tally_arm_right'].rotation_euler.z=math.radians(-55 if name!='working' else -39)
    if name=='receipt':PIVOTS['tally_stamp'].location.z-=.35
    bpy.context.view_layer.update()

def bounds(s):
    pts=[ob.matrix_world@v.co for ob in s.objects for v in ob.data.vertices]
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
    return {'min':lo,'max':hi,'size':[hi[i]-lo[i] for i in range(3)]}

def lighting():
    sc=bpy.context.scene;sc.world=bpy.data.worlds.new('TallyNeutralAuthoringWorld');sc.world.use_nodes=True
    bg=sc.world.node_tree.nodes['Background'];bg.inputs[0].default_value=(.033,.050,.072,1);bg.inputs[1].default_value=.55
    for name,at,energy,size,col in [('Key',(-2,-8,18),3500,12,(1,.82,.58)),('Fill',(6,11,12),2700,10,(.47,.78,1)),('Rim',(-14,5,8),2400,8,(.75,.9,1))]:
        d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=col
        o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=at;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('AuthorReviewCamera');o=bpy.data.objects.new('AuthorReviewCamera',d);sc.collection.objects.link(o);d.type='ORTHO';sc.camera=o
    sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=True
    sc.render.resolution_x=1440;sc.render.resolution_y=1080;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
    sc.view_settings.view_transform='AgX';sc.render.fps=60
    return o

def render(camera,name,at,target,scale,mode='deployed'):
    pose(mode);camera.location=at;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
    bpy.context.scene.render.filepath=str(RENDERS/(name+'.png'));bpy.ops.render.render(write_still=True)

def main():
    s=build();stats,collision,doc=export(s);bank=motions(doc)
    pose('folded');rest=bounds(s);pose('deployed');deployed=bounds(s);pose('working');disputed=bounds(s);pose('folded')
    camera=lighting()
    camera.location=(16,-26,38);camera.rotation_euler=(Vector((0,.6,.6))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=29
    # The editable file saves the render-independent folded reference pose and individually named solids.
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'tally_3.blend'))
    contract={'schemaVersion':1,'status':'source-art-candidate-awaiting-game-camera-review','assetId':'SF_PLACE_TALLY_3','partId':'tally-3','sourceFile':str(GLB.relative_to(ROOT)),
        'recipe':str(Path(__file__).relative_to(ROOT)),'recipeSha256':h(__file__),'glbSha256':h(GLB),'motionBank':str(BANK.relative_to(ROOT)),'motionSha256':h(BANK),
        'authoredCoordinates':'+X nose,+Y port,+Z up; metres','gltfCoordinates':'+X nose,+Y up,+Z starboard; metres','runtimeScaleProposal':1,
        'semanticRadiusProposalWU':20,'massProposalInternalUnits':180,'bodyOwnership':'single dynamic body; no split bodies','root':'SF_PLACE_TALLY_3_ROOT',
        'boundsSourceMetres':{'folded':rest,'deployed':deployed,'disputed':disputed},'lods':stats,'materialCount':len(doc['materials']),'sharedTextures':len(doc.get('images',[])),
        'drawBudgetNote':'Measured articulated export primitives, not observed game draw calls. Target 10 may be exceeded by moving groups; no simulated performance claim.',
        'collision':collision,'nonCollidingPeripheralGeometry':['arms','stamp','cradle','scan'],
        'receiverSensorProposal':{'socket':'SOCKET_CLAIM_CRADLE','positionGltf':coords((9.4,0,.31)),'shape':'box-sensor','halfExtentsWU':[1.4,.75,1.45],'relativeSpeedLimitWU':8,'explicitDeliveryIntentRequired':True,'ownershipTransferOwner':'existing cargo/economy settlement only'},
        'pivots':{ident:{'node':ob.name,'blenderPivot':list(ob.matrix_world.translation),'gltfPivot':coords(ob.matrix_world.translation)} for ident,ob in PIVOTS.items()},
        'socketNames':['SOCKET_TALLY_SCAN','SOCKET_CLAIM_CRADLE','SOCKET_TALLY_STAMP','SOCKET_Engine_Main','SOCKET_Camera_Focus'],
        'gameCameraAcceptance':'NOT CLAIMED; these are source Blender review renders only','normalRouteAcceptance':'NOT CLAIMED'}
    (DESIGN/'asset-contract.json').write_text(json.dumps(contract,indent=2)+'\n')
    manifest={'schema':'spaceface.forgeSource.v1','recipe':str(Path(__file__).relative_to(ROOT)),'recipeSha256':h(__file__),'blend':'tally_3.blend','blendSha256':h(SOURCE/'tally_3.blend'),
              'sharedForge':{name:h(Path(A.forge_root)/name) for name in ('forge.py','forge_export.py','motion.py')},'reference':'original SF20-03 concept and blueprint inspected; production geometry rebuilt, not copied blockout',
              'noExternalArt':True,'alternatives':'Versioned source renders and script/blend archives in source-renders; no rejected attempt overwritten'}
    (SOURCE/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('TALLY_EXPORT_STATS',json.dumps(stats));print('TALLY_BOUNDS',json.dumps(contract['boundsSourceMetres']))
    if A.render:
        render(camera,'top',(0,0,42),(0,.6,0),28)
        render(camera,'chase',(14,-24,43),(0,.6,.6),28)
        render(camera,'close',(-18,-20,17),(-5.4,0,1.2),17)
        render(camera,'working',(15,-25,38),(0,.6,.5),28,'working')
        render(camera,'folded',(14,-24,43),(0,.6,.6),28,'folded')
    print('TALLY_3_COMPLETE',GLB)
if __name__=='__main__':main()
