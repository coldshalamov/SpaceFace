"""Cold-import neutral review of the exact exported prototype GLB.
No images from image generation are used in these renders.
"""
import bpy,sys,math,json,hashlib
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUTPUT_ROOT=Path(sys.argv[sys.argv.index('--output-root')+1]).resolve() if '--output-root' in sys.argv else ROOT
OUT=OUTPUT_ROOT/'review';OUT.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'prototype/mite-lamellar-r1.glb'
if '--source' in sys.argv:SRC=Path(sys.argv[sys.argv.index('--source')+1]).resolve()
lod=int(sys.argv[sys.argv.index('--lod')+1]) if '--lod' in sys.argv else 0
tag=SRC.stem+'-lod'+str(lod)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC))
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH']
for ob in meshes:ob.hide_render=not ob.name.startswith('LOD'+str(lod)+'_')
meshes=[o for o in meshes if not o.hide_render]
original={o.name:[m for m in o.data.materials] for o in meshes}
original_indices={o.name:[p.material_index for p in o.data.polygons] for o in meshes}
target=Vector((.35,0,.55));extent=13.6
for name,loc,power,size in [('key',(3,-7,13),1900,8),('fill',(-7,4,8),1100,10),('edge',(6,8,7),1000,7)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('Neutral studio, no game Look');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.16,.16,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True;scene.view_settings.view_transform='AgX'
camdata=bpy.data.cameras.new('Neutral review');cam=bpy.data.objects.new('Neutral review',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO'
clay=bpy.data.materials.new('Neutral Clay');clay.use_nodes=True;p=clay.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.32,.32,.32,1);p.inputs['Roughness'].default_value=.65
views=[('tiny60',(0,-1.5,2.598076)),('underside',(.7,-2,-2.5)),('reference',(.75,-3,2.50)),('rootmatch',(1,-3,1.5)),('top',(0,0,3)),('chase60',(0,-1.5,2.598076)),('threequarter',(1.8,-2.2,2.6)),('jawroot',(3,-2,1.4)),('side',(.1,-3,.25))]
if '--views' in sys.argv:views=[v for v in views if v[0] in sys.argv[sys.argv.index('--views')+1].split(',')]
modes=['material','clay']
if '--modes' in sys.argv:modes=sys.argv[sys.argv.index('--modes')+1].split(',')
files=[]
for mode in modes:
    for ob in meshes:
        ob.data.materials.clear()
        for mat in ([clay] if mode=='clay' else original[ob.name]):ob.data.materials.append(mat)
        for p,idx in zip(ob.data.polygons,original_indices[ob.name]):p.material_index=0 if mode=='clay' else idx
    for view,vec in views:
        aim=Vector((1.75,-1.60,.1)) if view in ('jawroot','rootmatch') else target
        camdata.ortho_scale=5.9 if view in ('jawroot','rootmatch') else (15.8 if view in ('threequarter','reference') else extent)
        
        if view=='tiny60':
            scale=json.loads((ROOT/'contracts/n4-dense-envelope.json').read_text())['sourceScaleToDense'];camdata.type='PERSP';camdata.sensor_fit='VERTICAL';camdata.lens=50;camdata.sensor_height=100*math.tan(math.radians(25));aim=Vector((0,0,0));distance=144/scale
        else:distance=30
        cam.location=aim+Vector(vec).normalized()*distance;cam.rotation_euler=(aim-cam.location).to_track_quat('-Z','Y').to_euler()
        path=OUT/f'{tag}-{mode}-{view}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);files.append(path.name)
        if view=='tiny60':
            from bpy_extras.object_utils import world_to_camera_view
            coords=[world_to_camera_view(scene,cam,ob.matrix_world@v.co) for ob in meshes for v in ob.data.vertices];xs=[c.x*1600 for c in coords];ys=[(1-c.y)*1000 for c in coords]
            (OUT/'tiny-projection.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'isolatedAsset':True,'actualPopulation':False,'actualGameLook':False,'uniformScale':scale,'equivalentCameraDistanceWU':144,'verticalFovDegrees':50,'viewport':[1600,1000],'pixelBounds':[min(xs),min(ys),max(xs),max(ys)],'projectedWidthPx':max(xs)-min(xs),'projectedHeightPx':max(ys)-min(ys),'lod':lod},indent=2))
(OUT/f'{tag}-render-receipt.json').write_text(json.dumps({'source':str(SRC),'sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'renderer':'Blender Cycles 4.3 CPU','scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'actualGameLook':False,'input':'Cold import of exact exported GLB','clayIsActualGeometry':True,'colorGrade':'AgX','renders':files,'camera':'orthographic comparison, chase is 60 degrees; not actual perspective game camera','orthographicWidth':extent},indent=2))
