"""RU-7 / RUCKUS: original Forge-built, articulated demolition retriever.
Run: blender -b --python tools/blender/characters/ruckus.py -- --render
No downloads, fonts, add-ons, noise textures or hand-edited generated meshes are required.
The same GLBs inspected here are loaded by src/render/characters/ruckusModel.js.
"""
from pathlib import Path
import sys, math, json, argparse
import bpy, bmesh
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/blender/forge'))
import forge as F
from forge_export import MATERIAL_NAMES
P = argparse.ArgumentParser()
P.add_argument('--out', default=str(ROOT / 'assets/characters/ruckus'))
P.add_argument('--render', action='store_true')
P.add_argument('--render-dir', default=str(ROOT / 'artifacts/ruckus'))
args = P.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT = Path(args.out); OUT.mkdir(parents=True, exist_ok=True)
R = Path(args.render_dir); R.mkdir(parents=True, exist_ok=True)
F.reset_scene()
# Forge's calibrated finishes, without repeated tiled images: small industrial character,
# panel seams and service markings are actual geometry. No per-character texture payload.
def material(name, finish, color, ship_id=None):
    spec = F.FINISHES[finish]
    role, rough, metal, emission = spec['role'], spec['rough'], spec['metal'], spec.get('emit', 0)
    m = bpy.data.materials.new('RU7_' + finish); m.use_nodes = True
    n = m.node_tree.nodes.get('Principled BSDF')
    rgb = F.hex_rgb(color)
    n.inputs['Base Color'].default_value = (*rgb, 1)
    n.inputs['Metallic'].default_value = metal
    n.inputs['Roughness'].default_value = rough
    if finish in ('paint', 'paint2', 'stripe', 'hazard'):
        n.inputs['Coat Weight'].default_value = .45
        n.inputs['Coat Roughness'].default_value = .22
    if emission:
        n.inputs['Emission Color'].default_value = (*rgb, 1)
        n.inputs['Emission Strength'].default_value = min(emission, 2.8)
    m.diffuse_color = (*rgb, 1)
    m['spacefaceFinish'] = 'forge-v1'; m['spacefaceRole'] = role
    return m
F.make_material = material
# Texture-free rigid batches discard split-loop normals/UVs later, so apply the kit's geometric
# bevel here without version-specific shade operators. Geometry is identical on Blender 4/5.
def finish_compatible(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-5)
    bm.to_mesh(obj.data);bm.free()
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    width=float(obj.get('forge_bevel',.03))
    if width>0:
        mod=obj.modifiers.new('ForgeBevel','BEVEL');mod.width=width;mod.segments=3
        mod.limit_method='ANGLE';mod.angle_limit=math.radians(32);mod.harden_normals=True
        mod.miter_outer='MITER_ARC';mod.use_clamp_overlap=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data)
    faces=[f for f in bm.faces if len(f.verts)>4]
    if faces:bmesh.ops.triangulate(bm,faces=faces,quad_method='BEAUTY',ngon_method='BEAUTY')
    bm.to_mesh(obj.data);bm.free();obj.select_set(False)
F.finish_object = finish_compatible

S = F.Ship('ruckus', {'paint':'#a05a27','paint2':'#a89e80','stripe':'#bf912d',
    'gunmetal':'#27323a','dark':'#10181d','bare':'#7f929b',
    'glow_cyan':'#62e6d6','glow_amber':'#ffa139','glow_red':'#e15c40'})
rigs = {}; current = 'Body'
def group(name, pivot=(0,0,0)):
    global current
    current = name; rigs[name] = tuple(pivot)
def tag(o): o['ru7_rig'] = current; return o
# Wrap the kit's collector once, so every real Forge primitive carries a rigid group.
old_add = S.add
S.add = lambda obj: tag(old_add(obj))
def box(name,c,size,mat='gunmetal',**kw): return F.box(S,name,c,size,mat,bevel=.08,**kw)
def rod(name,a,b,r,mat='bare',**kw): return F.cylinder(S,name,a,b,r,material=mat,segments=16,bevel=.045,**kw)
def ring(name,c,r,t,mat='bare',axis=(0,0,1)):
    return F.ring(S,name,c,r,t,axis=axis,material=mat,segments=32,sides=8)
def plate(name,pts,z,h,mat='paint',ch=.3):
    return F.plate(S,name,pts,z,h,mat,chamfer=ch,bevel=.075)

group('Body')
# Hunched, broad chest and narrow haunches. The empty jaw space is the primary silhouette.
F.loft(S,'pressure_chassis',[
    dict(x=-15,w=3.3,ht=2.0,hb=2.0,zc=1),dict(x=-11,w=6.2,ht=4,hb=3.2,zc=1),
    dict(x=-2,w=8.5,ht=5.4,hb=3.3,zc=1),dict(x=7,w=8.1,ht=4.4,hb=3,zc=1),
    dict(x=12,w=5.3,ht=2.8,hb=2.2,zc=1)], 'gunmetal',count=24,bevel=.15)
plate('shoulder_saddle',[(-5,-8.2),(5,-10.3),(12,-6.4),(12,6.4),(5,10.3),(-5,8.2)],3.4,2.4,'paint',.8)
# Exposed black V between the two raised yellow shoulder plates.
for s in (-1,1):
    pts=[(-5,s*3.0),(-2,s*8.1),(5,s*9.2),(9,s*6.0),(6,s*2.6)]
    if s<0: pts.reverse()
    plate('scapula',pts,5.8,1.0,'paint',.45)
    pts=[(-1,s*5.7),(1,s*8.3),(4,s*8.5),(3,s*5.3)]
    if s<0: pts.reverse()
    plate('safety_band',pts,6.88,.1,'stripe',.06)
    rod('spine_pressure_line',(-11,s*4,4),(-2,s*4.8,5.2),.38,'bare')
    for i in range(5): box('haunch_vent',(-10+i*1.2,s*4.7,5.05),(.52,1.25,.22),'dark')
    rod('head_link',(5,s*4.8,2),(13,s*5.3,3),.8,'bare')
    # Thruster paws are bolted to real outriggers, not disconnected engines.
    for x in (-10,4):
        rod('paw_upper',(x,s*5,0),(x-1,s*10,-.7),1.2,'gunmetal')
        rod('paw_piston',(x,s*5.5,1),(x+1,s*11,-1),.45,'bare')
    ring('jaw_hinge',(10,s*6.3,2.5),1.8,.42,'bare')
# Asymmetrical replacement service panel, mechanically fastened.
plate('old_crew_patch',[(-13,-3),(-7,-4.5),(-4,-3.8),(-4,1),(-12,2)],5.2,.55,'paint2',.2)
for x,y in [(-11,-2),(-6,-3),(-5,0),(-11,1)]: rod('patch_bolt',(x,y,5.8),(x,y,6.02),.21,'bare')
# RU-7 stencilling: built-in Blender font converted to geometry, never a shipped font file.
bpy.ops.object.text_add(location=(-9,-.3,5.81))
o=bpy.context.object; o.name='RU7_service_mark'; o.data.body='RU-7';o.data.size=1.5;o.data.extrude=.006;o.data.align_x='CENTER';o.rotation_euler.z=-math.pi/2
bpy.ops.object.convert(target='MESH');o.data.materials.append(S.mat('dark'));S.add(o)
# Neck and face have a lifted brow and a deliberately lopsided sensor ear.
box('neck', (11,0,2),(4,7,3),'gunmetal')
plate('brow',[ (10,-5.1),(14,-5.6),(17,-3.4),(17,3.4),(14,5.6),(10,5.1)],3.7,1.3,'paint2',.55)
box('face_dark_recess',(14,0,5.15),(3.3,7.2,.36),'dark')
box('cyclops_eye',(14,0,5.4),(1.45,5.4,.22),'glow_cyan')
rod('ear_mount',(8,6.4,5.2),(8.3,7.4,8.3),.38,'bare')
plate('listening_ear',[(6.6,6.7),(9.3,6.7),(10.0,8.2),(7.2,9.2)],7.8,.9,'paint',.2)
rod('broken_ear',(8,-6.4,5.2),(8,-6.8,6.5),.48,'bare')
# Twin front jaws curl toward each other but never close the negative space.
for s,label in [(-1,'JawL'),(1,'JawR')]:
    group(label,(10,s*6.3,2.5))
    pts=[(10,s*5.5),(12,s*8.5),(20,s*9.8),(26,s*7.3),(26,s*3.0),(23,s*2.4),(21,s*5.5),(16,s*6.0)]
    if s<0:pts.reverse()
    plate('cast_jaw',pts,.3,3.5,'paint',.45)
    pts=[(13,s*7),(19,s*8.3),(23.4,s*6.6),(23.4,s*4.6),(21.5,s*5),(19.4,s*6.6)]
    if s<0:pts.reverse()
    plate('jaw_wear_face',pts,3.9,.55,'paint2',.12)
    rod('jaw_hydraulic',(10,s*6.3,3.8),(18,s*7.8,3.8),.45,'bare')
    for x in (17,20,23):
        box('jaw_tooth',(x,s*(5.65 if x<22 else 3.6),1.4),(1.5,2.6,2.0),'bare',rot_z=s*.2)
    box('jaw_contact_lamp',(24,s*4.4,4.5),(.8,1.3,.18),'glow_amber')
# Four independent exhaust-foot gimbals, flared nozzles facing aft.
for s in (-1,1):
    for x in (-10,4):
        group(f'Paw_{x}_{s}',(x,s*11,-1.4))
        F.loft(S,'paw_pod',[dict(x=x-4,w=2.2,ht=2,hb=1.4,zc=-1.3,y=s*11),
            dict(x=x,w=2.8,ht=2.9,hb=1.8,zc=-1.3,y=s*11),
            dict(x=x+4,w=1.4,ht=1.6,hb=1.2,zc=-1.3,y=s*11)],'paint',count=16,bevel=.12)
        ring('foot_exhaust',(x-4,s*11,-1.3),1.55,.4,'bare',axis=(1,0,0))
        rod('black_throat',(x-4.2,s*11,-1.3),(x-4.4,s*11,-1.3),1.1,'dark')
        rod('exhaust_lens',(x-4.5,s*11,-1.3),(x-4.65,s*11,-1.3),.76,'glow_cyan')
        box('paw_band',(x,s*11,1.55),(1.0,3.6,.12),'stripe')
# High dorsal pressure flywheel: animated slow breathing, not a giant generic shield sphere.
group('Drum',(-.5,0,6.8))
rod('drum_core',(-.5,0,6),(-.5,0,7.6),2.25,'gunmetal')
ring('pressure_flywheel',(-.5,0,7),3.0,.7,'gunmetal')
ring('pressure_lumen',(-.5,0,7.6),2.7,.12,'glow_cyan')
for i in range(8):
    a=i*math.tau/8; c=(-.5+2.8*math.cos(a),2.8*math.sin(a),7.9)
    box('drum_castellation',c,(1,.65,.7),'bare',rot_z=a)
rod('drum_axle',(-.5,0,5.3),(-.5,0,7.3),.65,'bare')
# Rear aerial folds like a tail; all segments form one coherent attached silhouette.
group('Tail',(-14,0,2))
rod('tail_root',(-14,0,2),(-19,0,5),.5,'bare')
rod('tail_bend',(-19,0,5),(-23,1,7),.35,'bare')
plate('tail_flag',[(-25,-.3),(-20,-.3),(-20,2),(-24.3,2.4)],6.6,.4,'paint2',.1)
box('tail_lamp',(-24.2,1,7.15),(.5,1.8,.15),'glow_amber')
S.finish()
# Weld static detail by rigid group AND finish. This limits GPU calls while preserving every pivot.
roots=[]; all_stats={}
def weld(groups, root_name, lod):
    root=bpy.data.objects.new(root_name,None);bpy.context.collection.objects.link(root)
    for name,pivot in rigs.items():
        selected=[o for o in groups if o.get('ru7_rig')==name]
        if not selected:continue
        joint=bpy.data.objects.new('RU7_'+name,None);bpy.context.collection.objects.link(joint)
        joint.location=pivot;joint.parent=root;joint['ru7Joint']=name
        mats={m for o in selected for m in o.data.materials if m}
        for mat in sorted(mats,key=lambda m:m.name):
            # All Forge parts below use one material per mesh; the kit's loft may use multiple.
            verts=[]; faces=[]
            for o in selected:
                if mat not in o.data.materials[:]:continue
                for face in o.data.polygons:
                    if o.data.materials[face.material_index]!=mat:continue
                    start=len(verts)
                    for vi in face.vertices:
                        co=o.matrix_world@o.data.vertices[vi].co-Vector(pivot);verts.append(tuple(co))
                    faces.append(tuple(range(start,len(verts))))
            me=bpy.data.meshes.new(f'{root_name}_{name}_{mat.name}');me.from_pydata(verts,[],faces);me.update()
            obj=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(obj);obj.parent=joint;me.materials.append(mat)
            bpy.context.view_layer.objects.active=obj;obj.select_set(True)
            if lod:
                mod=obj.modifiers.new('Authored_LOD','DECIMATE');mod.ratio=(.40 if lod==1 else .18)
                bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.select_set(False)
            for p in me.polygons:p.use_smooth=False
    return root
for o in list(bpy.context.selected_objects):o.select_set(False)
for lod in range(3):roots.append(weld(S.objects,f'RUCKUS_LOD{lod}',lod))
for o in S.objects:bpy.data.objects.remove(o,do_unlink=True)
# Toy uses the same industrial finishes and a real cage, with visible daylight through its handles.
rigs.clear(); S.objects=[];group('Core')
rod('core_barrel',(-3.8,0,0),(3.8,0,0),3.1,'gunmetal')
rod('core_charge',(-2.3,0,0),(2.3,0,0),3.25,'glow_cyan')
for x in (-3.5,3.5):
    ring('core_safety_collar',(x,0,0),3.4,.5,'stripe',axis=(1,0,0))
    rod('core_cap',(x,0,0),(x+.16,0,0),2.9,'paint2')
for i in range(6):
    a=i*math.tau/6;y,z=4.1*math.cos(a),4.1*math.sin(a)
    rod('core_cage',(-4,y,z),(4,y,z),.37,'bare')
    rod('core_cage_foot',(-4,y,z),(-3,2.8*math.cos(a),2.8*math.sin(a)),.37,'bare')
    rod('core_cage_foot',(4,y,z),(3,2.8*math.cos(a),2.8*math.sin(a)),.37,'bare')
S.finish();toy=weld(S.objects,'RUCKUS_CORE',0)
for o in S.objects:bpy.data.objects.remove(o,do_unlink=True)

def descendants(root):return [root]+list(root.children_recursive)
def export(root,path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in descendants(root):o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_yup=True,export_extras=True,export_animations=False,export_texcoords=False,export_normals=True,
        export_materials='EXPORT',export_cameras=False,export_lights=False)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in descendants(root) if o.type=='MESH')
    calls=sum(len(o.data.materials) for o in descendants(root) if o.type=='MESH')
    all_stats[path.name]={'bytes':path.stat().st_size,'triangles':triangles,'drawCalls':calls}
for i,root in enumerate(roots):export(root,OUT/f'ruckus-lod{i}.glb')
export(toy,OUT/'pressure-core.glb')
(OUT/'manifest.json').write_text(json.dumps({'schema':'spaceface.character.ruckus.v1','units':'world units',
    'authoringAxes':'+X nose, +Y port, +Z up','runtimeAxes':'+X nose, +Y up, -Z port',
    'rigs':['RU7_Body','RU7_JawL','RU7_JawR','RU7_Drum','RU7_Tail'],
    'collision':{'body':{'shape':'ball','radius':17,'mass':160},'core':{'shape':'ball','radius':5.5,'mass':18}},
    'textureImages':0,'lodDistances':[0,240,650],'files':all_stats},indent=2)+'\n')
for root in roots[1:]:
    for o in descendants(root):o.hide_render=True;o.hide_viewport=True
# Toy is shown in the opening jaws in the source scene, not included with the body export.
toy.location=(28,0,1.8)
world=bpy.data.worlds.new('RUCKUS studio') if not bpy.data.worlds else bpy.data.worlds[0]
bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.055,.085,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.cycles.use_denoising=getattr(bpy.app.build_options,'openimagedenoise',False);scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.render.film_transparent=False
for name,pos,power,size,color in [('key',(15,-30,60),44000,35,(1,.83,.65)),('rim',(-22,30,35),65000,30,(.38,.69,1)),('fill',(45,30,12),22000,20,(.6,1,.91))]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
c=bpy.data.cameras.new('Character Camera');camera=bpy.data.objects.new('Character Camera',c);bpy.context.collection.objects.link(camera)
scene.camera=camera;c.type='ORTHO';c.ortho_scale=78
camera.location=(66,-85,88);camera.rotation_euler=(Vector((2,0,1))-camera.location).to_track_quat('-Z','Y').to_euler()
# Source contains an actual rigid-joint action: useful in Blender; production animation remains sim-timed.
for n,axis,angle in [('RU7_JawL',2,-.2),('RU7_JawR',2,.2),('RU7_Tail',2,.3)]:
    joint=next((o for o in roots[0].children if o.name == n), None)
    if joint:
        for frame,m in [(1,0),(12,1),(24,-1),(36,0)]:
            joint.rotation_euler[axis]=angle*m;joint.keyframe_insert('rotation_euler',frame=frame)
scene.frame_set(1);scene.frame_end=36
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ruckus.blend'))
if args.render:
    scene.render.filepath=str(R/'ruckus-hero.png');bpy.ops.render.render(write_still=True)
    camera.location=(0,-.01,105);camera.rotation_euler=(0,0,0);camera.rotation_euler=(Vector((2,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
    c.ortho_scale=75;scene.render.resolution_x=1200;scene.render.resolution_y=1000
    scene.render.filepath=str(R/'ruckus-top.png');bpy.ops.render.render(write_still=True)
print('RUCKUS_ASSET_REPORT',json.dumps(all_stats))
