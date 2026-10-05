"""SF20-19 Pip & Spanner: preview-only Forge crew, metres, +X nose/+Y port/+Z up.

Build: blender -b --python pip_spanner.py -- --out <packet-directory>
The narrow forge/ directory is an unmodified snapshot of the existing game's kit.
No fleet/manifest/global-material mutation and no world collision or entity.
"""
import os, sys, json, math, struct, hashlib, argparse
from pathlib import Path
import bpy, bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
FORGE = HERE / 'forge' if (HERE / 'forge' / 'forge.py').exists() else HERE.parent
sys.path.insert(0, str(FORGE))
import forge as F
import forge_export as E

COLORS = {'paint':'#b2ab97', 'paint2':'#536065', 'stripe':'#1b837f',
          'dark':'#202830', 'gunmetal':'#606e73', 'glow_cyan':'#50c7bc',
          'glow_warm':'#edc38c'}
GROUPS = {}
PIVOTS = {}
ROOT = None

def group(s, name, start, at=(0,0,0), parent=None):
    global ROOT
    parts = s.objects[start:]
    pivot = s.motion_group(name.lower(), at, parts, parent=parent.lower() if parent else None)
    pivot.name = name
    pivot['previewSemantic'] = name
    pivot['previewOnly'] = True
    # Current lease records explicit socket empties; spaceface.motionGroup alone is not read.
    pivot['spacefaceSocket'] = True
    pivot['spacefaceInstance'] = False
    GROUPS[name] = parts
    PIVOTS[name] = pivot
    return pivot

def shifted(objects, offset):
    for ob in objects:
        for vertex in ob.data.vertices:
            vertex.co += Vector(offset)

def build():
    global ROOT
    F.reset_scene()
    s = F.Ship('sf20_19_pip_spanner', COLORS)
    # SPANNER: a low horseshoe service sled, open through its central operating bay.
    n = len(s.objects)
    F.plate(s,'RearBridge',[(-5.6,-3.1),(-5.3,-4.1),(-3.2,-4.1),(-2.93,-3.55),
                           (-2.93,3.55),(-3.2,4.1),(-5.3,4.1),(-5.6,3.1)],
            z0=-.46,thickness=1.27,material='paint',chamfer=.22,chamfer_bottom=.08,
            side_material='paint2',bevel=.042,uv_scale=.43)
    F.band(s,'RearBridge',(-4.55,0,0),(1,0,0),.52,'stripe',inset=.025,depth=-.015)
    F.panel(s,'RearBridge',(-3.55,0),(1.0,3.7),'paint2',inset=.08,depth=-.045)
    for side in (-1,1):
        label = 'Port' if side>0 else 'Starboard'
        rail_outline=[(-2.84,2.77),(-2.84,4.51),(.20,4.51),(1.38,4.18),(1.38,3.02),(.15,2.77)]
        rail_outline=[(x,side*y) for x,y in rail_outline]
        if side<0:rail_outline.reverse()
        F.plate(s,label+'SledRail',rail_outline,z0=-.43,thickness=1.15,
                material='paint',chamfer=.18,chamfer_bottom=.07,side_material='paint2',bevel=.040,uv_scale=.43)
        F.box(s,label+'AssemblyGasket',(-2.895,side*3.64,.07),(.12,1.73,.98),'dark',bevel=.012,uv_scale=.43)
        F.band(s,label+'SledRail',(-1.25,0,0),(1,0,0),.58,'stripe',inset=.024,depth=-.012)
        F.panel(s,label+'SledRail',(-2.35,side*3.65),(1.0,.85),'paint2',inset=.05,depth=-.05)
        # Strong underlying skid, recessed bay wall, and an actual fork bearing yoke.
        F.plate(s,label+'Skid',[(-4.7,side*3.2),(-4.7,side*4.2),(.85,side*4.2),(1.35,side*3.7),(.8,side*3.2)],
                z0=-.70,thickness=.32,material='dark',chamfer=.10,bevel=.045)
        F.beams(s,label+'BayRail',[((-3.3,side*2.85,.20),(1.8,side*2.85,.20))],.23,'gunmetal',h=.34,bevel=.035)
        F.plate(s,label+'HingeLower',[(-.05,side*3.05),(.0,side*4.25),(2.1,side*4.25),(2.45,side*3.7),(2.0,side*3.05)],
                z0=-.40,thickness=.40,material='paint2',chamfer=.10,bevel=.045)
        F.cylinder(s,label+'HingeAxle',(1.62,side*3.60,-.30),(1.62,side*3.60,1.00),.45,
                   material='gunmetal',segments=20,bevel=.035)
        F.cylinder(s,label+'HingeUpperCap',(1.62,side*3.60,.78),(1.62,side*3.60,1.01),.66,
                   material='paint2',segments=20,bevel=.04)
        F.cylinder(s,label+'HingeHub',(1.62,side*3.60,1.0),(1.62,side*3.60,1.06),.26,
                   material='stripe',segments=16,bevel=.014)
        F.vent(s,label+'ServiceVent',(-3.85,side*2.8,.77),(.70,.68,.08),slats=3)
    # Central rectangular worklight seated in the rear bridge, never a cartoon face.
    F.plate(s,'WorklightPlinth',[(-3.85,-1.45),(-3.0,-1.45),(-2.72,-1.16),(-2.72,1.16),(-3.0,1.45),(-3.85,1.45)],
            z0=.70,thickness=.25,material='dark',chamfer=.10,bevel=.04)
    F.box(s,'WorklightBezel',(-3.2,0,.99),(.60,2.28,.22),'gunmetal',bevel=.075)
    F.box(s,'WorklightLens',(-3.18,0,1.105),(.40,1.96,.055),'glow_warm',bevel=.045)
    F.box(s,'WorklightDivider',(-3.18,0,1.14),(.44,.065,.065),'dark',bevel=.008)
    group(s,'SPANNER_ROOT',n)
    # The two sweeping jaws leave daylight through the bay and meet only in a receipt pose.
    for side,name in ((1,'CLAW_L'),(-1,'CLAW_R')):
        n=len(s.objects)
        outline=[(1.18,3.05),(1.4,4.23),(3.2,4.33),(6.5,3.55),(7.1,2.83),(6.9,1.68),(6.15,1.72),(5.95,2.42),(3.0,3.03)]
        outline=[(x,side*y) for x,y in outline]
        if side<0: outline.reverse()
        F.plate(s,name+'ForgedJaw',outline,z0=-.06,thickness=.77,material='paint',
                chamfer=.20,chamfer_bottom=.08,side_material='dark',bevel=.052,uv_scale=.55)
        F.band(s,name+'ForgedJaw',(4.9,0,0),(1,0,0),.54,'stripe',inset=.035,depth=-.025)
        # A recessed structural channel makes the arm a cast tool, not a pasted block.
        F.beams(s,name+'Channel',[((2.1,side*3.62,.69),(5.98,side*2.90,.69))],.31,'dark',h=.11,bevel=.027)
        F.beams(s,name+'ChannelSpine',[((2.3,side*3.64,.73),(5.7,side*3.00,.73))],.065,'gunmetal',h=.08,bevel=.013)
        F.plate(s,name+'GripPad',[(6.05,side*1.48),(6.05,side*2.46),(6.92,side*2.58),(7.03,side*1.48)],
                z0=.04,thickness=.55,material='dark',chamfer=.05,bevel=.04)
        F.boxes(s,name+'GripTeeth',[((6.49,side*y,.625),(.73,.07,.065)) for y in (1.68,1.92,2.16)],'gunmetal',bevel=.012)
        group(s,name,n,at=(1.62,side*3.60,.30),parent='SPANNER_ROOT')
    # Two small padded brackets support the selected item without supplying a fake module.
    n=len(s.objects)
    for side in (-1,1):
        F.sweep(s,'CradleBracket'+str(side),[(.25,side*2.82,.20),(.55,side*1.35,.30),(1.3,side*.90,.52)],
                width=.20,height=.24,material='gunmetal',bevel=.025)
        F.plate(s,'CradleSaddle'+str(side),[(.88,side*.67),(1.70,side*.67),(1.84,side*1.16),(.75,side*1.16)],
                z0=.39,thickness=.30,material='paint2',chamfer=.065,bevel=.023)
        F.box(s,'CradlePad'+str(side),(1.27,side*.90,.74),(.64,.32,.14),'dark',bevel=.05)
    group(s,'ITEM_CRADLE',n,at=(1.25,0,.8),parent='SPANNER_ROOT')
    # PIP: true four-face tetrahedron, not a miniature humanoid or a flat icon.
    n=len(s.objects)
    bm=bmesh.new()
    vertices=[bm.verts.new(p) for p in ((1.48,0,-.58),(-1.18,-1.30,-.58),(-1.18,1.30,-.58),(-.72,0,1.40))]
    for face in ((0,2,1),(0,1,3),(0,3,2),(1,2,3)):
        bm.faces.new([vertices[i] for i in face])
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    s.add(F._new_object('PipTetraShell',bm,s.slots(['paint']),bevel=.07,uv_scale=.52,smooth_angle=22))
    F.band(s,'PipTetraShell',(-.56,0,0),(1,0,0),.31,'stripe',inset=.018,depth=-.009)
    F.band(s,'PipTetraShell',(0,0,-.43),(0,0,1),.24,'dark',inset=.016,depth=-.016)
    # A bracketed square optic normal is 45 degrees up/forward for the 60-degree camera.
    F.box(s,'PipOpticSeat',(.22,0,.59),(.32,1.06,1.06),'dark',bevel=.06,rot=(0,-math.pi/4,0))
    F.box(s,'PipOpticBezel',(.39,0,.74),(.14,.91,.91),'gunmetal',bevel=.045,rot=(0,-math.pi/4,0))
    F.box(s,'PipSquareOptic',(.446,0,.804),(.07,.67,.67),'glow_cyan',bevel=.028,rot=(0,-math.pi/4,0))
    # One short supported ducted stabilizer fan behind the tetrahedron.
    F.beams(s,'PipFanNeck',[((-1.00,0,.10),(-1.94,0,.10))],.28,'gunmetal',h=.31,bevel=.035)
    F.ring(s,'PipFanShroud',(-1.89,0,.14),.48,.115,axis=(0,0,1),material='paint2',segments=20,sides=6)
    F.cylinder(s,'PipFanHub',(-1.89,0,.02),(-1.89,0,.24),.13,material='gunmetal',segments=12)
    F.beams(s,'PipFanBlades',[((-2.30,0,.11),(-1.49,0,.11)),((-1.89,-.41,.11),(-1.89,.41,.11))],.12,'dark',h=.055,bevel=.014)
    F.cylinder(s,'PipPointerBearing',(.50,-.79,-.30),(.50,-.79,.15),.22,material='gunmetal',segments=16)
    pip_at=(-8.4,4.4,1.9)
    shifted(s.objects[n:],pip_at)
    group(s,'PIP_ROOT',n,at=pip_at)
    n=len(s.objects)
    F.sweep(s,'PipSolidPointer',[(.50,-.79,-.12),(1.18,-1.14,-.18),(2.35,-1.56,-.18)],
            width=.15,height=.16,material='gunmetal',bevel=.022)
    F.box(s,'PipPointerTip',(2.35,-1.56,-.18),(.36,.24,.21),'stripe',bevel=.046,rot_z=-.34)
    shifted(s.objects[n:],pip_at)
    group(s,'PIP_POINTER',n,at=tuple(Vector(pip_at)+Vector((.50,-.79,-.12))),parent='PIP_ROOT')
    s.finish()
    ROOT=E._root_empty('SF20_19_PREVIEW_ROOT', {'previewOnly':True,'semanticRadius':0,'worldEntity':False})
    for name in ('SPANNER_ROOT','PIP_ROOT'):
        world=PIVOTS[name].matrix_world.copy(); PIVOTS[name].parent=ROOT; PIVOTS[name].matrix_world=world
    return s

def save_exports(s,out):
    E._rename_materials(s)
    stats={}
    for level in (0,1,2):
        meshes=[]
        for name,parts in GROUPS.items():
            # Local joining is exactly the shipping Forge exporter operation, per rigid group.
            joined=E._join_named(parts,level,f'LOD0_{name}_',True)
            for ob in joined:
                world=ob.matrix_world.copy(); ob.parent=PIVOTS[name]; ob.matrix_world=world
            meshes+=joined
        path=out / ('pip_spanner.glb' if level==0 else f'pip_spanner_lod{level}.glb')
        E._export([ROOT]+list(PIVOTS.values())+meshes,str(path))
        def stamp(doc):
            meta={'contractVersion':2,'normalConvention':'OpenGL',
                  'ormChannels':'R=AO,G=Roughness,B=Metallic','textureCompression':'PNG-source',
                  'factorOnlyMaterials':['Material_Emissive_Cyan','Material_Emissive_Warm'],
                  'assetId':'sf20_19_pip_spanner','category':'places','slot':'place',
                  'previewOnly':True,'worldEntity':False,'collision':False,'semanticRadius':0,
                  'forward':'+X','up':'+Y','starboard':'+Z','unit':'metre','lod':level,
                  'surfaceGeometryRemaster':'forge-v1','forge':{'version':1,'ship':s.id},
                  'motion':'pip_spanner.motion.json','independentRoots':['SPANNER_ROOT','PIP_ROOT']}
            doc['asset'].setdefault('extras',{})['spacefaceAsset']=meta
            doc['scenes'][doc.get('scene',0)].setdefault('extras',{})['spacefaceAsset']=meta
            for material in doc.get('materials',[]): material.pop('doubleSided',None)
        doc=E.patch_glb_json(str(path),stamp)
        tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
        stats[str(level)]={'file':path.name,'triangles':tris,'drawPrimitives':sum(len(m['primitives']) for m in doc['meshes']),
                           'meshes':len(doc['meshes']),'materials':len(doc['materials']),'images':len(doc.get('images',[])),
                           'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        E._clear_export_objects(meshes)
    # Editable source keeps each cast part and source name, not only the render welds.
    for name,parts in GROUPS.items():
        for ob in parts:
            world=ob.matrix_world.copy(); ob.parent=PIVOTS[name]; ob.matrix_world=world
    return stats

def motion(out):
    clips={
        'focus':{'duration':.22,'receiptRequired':False,'tracks':[
            {'node':'PIP_ROOT','path':'translationDelta','from':[0,0,0],'to':[.38,.12,.2]},
            {'node':'PIP_POINTER','path':'rotationY','from':0,'to':-.14}]},
        'compare':{'duration':.30,'receiptRequired':False,'tracks':[
            {'node':'CLAW_L','path':'rotationY','from':0,'to':-.055},
            {'node':'PIP_POINTER','path':'rotationY','from':0,'to':.18}]},
        'confirm':{'duration':.65,'receiptRequired':True,'tracks':[
            {'node':'CLAW_L','path':'rotationY','keys':[[0,0],[.40,-.17],[.65,0]]},
            {'node':'CLAW_R','path':'rotationY','keys':[[0,0],[.40,.17],[.65,0]]},
            {'node':'ITEM_CRADLE','path':'translationDelta','keys':[[0,[0,0,0]],[.4,[0,-.18,0]],[.65,[0,0,0]]]}]},
        'denied':{'duration':.15,'receiptRequired':True,'tracks':[
            {'node':'PIP_POINTER','path':'rotationY','keys':[[0,0],[.075,.13],[.15,0]]}]},
        'repair':{'duration':.60,'receiptRequired':True,'tracks':[
            {'node':'PIP_POINTER','path':'rotationY','keys':[[0,0],[.3,-.16],[.6,0]]}]}}
    data={'version':1,'asset':'sf20_19_pip_spanner','coordinateSystem':'glTF Y-up, metres',
          'application':'relative to captured rest transforms; reset on cancel/close/reopen',
          'easing':'smoothstep','reducedMotion':'resolve instantly to truthful final state; no mandatory wait',
          'focusScreenTravelCapPx':30,'worldEntity':False,'simulationOwner':None,'clips':clips}
    (out/'pip_spanner.motion.json').write_text(json.dumps(data,indent=2)+'\n')
    # Inspectable Blender action on the rigid jaw pivots: receipt-only demonstration, not glTF animation.
    scene=bpy.context.scene;scene.render.fps=60;scene.frame_start=0;scene.frame_end=39
    for name,sign in (('CLAW_L',-1),('CLAW_R',1)):
        ob=PIVOTS[name]
        for frame,angle in ((0,0),(24,sign*.17),(39,0)):
            ob.rotation_euler.z=angle;ob.keyframe_insert(data_path='rotation_euler',frame=frame)
        ob.animation_data.action.name='ReceiptConfirmed__'+name
    scene.frame_set(0)
    return data

def author_camera(out):
    scene=bpy.context.scene
    world=bpy.data.worlds.new('NeutralReviewWorld');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.05,.065,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.7
    for name,at,power,size,color in [('Key',(2,-5,14),1900,10,(1,.90,.78)),('Fill',(-8,7,10),1500,9,(.62,.81,1)),('Rim',(8,6,8),1300,7,(.72,1,.93))]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
        ob=bpy.data.objects.new(name,d);scene.collection.objects.link(ob);ob.location=at
        ob.rotation_euler=(Vector((0,1,0))-ob.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('AuthorReviewCamera');camera=bpy.data.objects.new('AuthorReviewCamera',d);scene.collection.objects.link(camera)
    camera.location=(10,-20,31);camera.rotation_euler=(Vector((-2,1,.7))-camera.location).to_track_quat('-Z','Y').to_euler()
    d.type='ORTHO';d.ortho_scale=23;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
    scene.render.resolution_x=1080;scene.render.resolution_y=720;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'evidence'/'author-inspect.png')
    scene.view_settings.view_transform='AgX'

def main():
    args=argparse.ArgumentParser();args.add_argument('--out',default=str(HERE));args.add_argument('--render',action='store_true')
    a=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True);(out/'evidence').mkdir(exist_ok=True)
    s=build();stats=save_exports(s,out);motion(out);author_camera(out)
    coords={name:{'blenderWorldPivot':list(ob.matrix_world.translation),'gltfWorldPivot':[ob.matrix_world.translation.x,ob.matrix_world.translation.z,-ob.matrix_world.translation.y],
                 'parent':ob.parent.name if ob.parent else None} for name,ob in PIVOTS.items()}
    points=[ob.matrix_world@v.co for ob in s.objects for v in ob.data.vertices]
    bounds={axis:[min(p[i] for p in points),max(p[i] for p in points)] for i,axis in enumerate('xyz')}
    (out/'measured-contract.json').write_text(json.dumps({'assetId':s.id,'lods':stats,'pivots':coords,'sourceBoundsMetres':bounds,
        'sourcePartCount':len(s.objects),'forgeSharedTextureFiles':6,'uniqueTextureFiles':0,
        'cameraPreviewOnly':True,'gameMeasurements':'PENDING actual armory consumer; primitive counts above are exported cost, not observed frame cost'},indent=2)+'\n')
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/'pip_spanner.blend'))
    if a.render:bpy.ops.render.render(write_still=True)
    print('SF20-19_BUILD',json.dumps(stats))

if __name__=='__main__':main()
