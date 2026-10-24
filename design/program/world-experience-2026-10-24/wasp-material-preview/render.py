import os,sys,json,base64,subprocess,struct,hashlib,io
from pathlib import Path
sys.dont_write_bytecode=True
R=Path(os.environ.get('SF_WASP_OUTPUT', '.')).resolve()
REPO=Path(os.environ.get('SF_REPO', '.')).resolve()
RENDER_SCRIPT=Path(__file__).read_text()
if '--blender-stage' in sys.argv:
 import bpy
 from mathutils import Vector
 from io_scene_gltf2.io.imp.gltf2_io_gltf import glTFImporter
 from io_scene_gltf2.io.com.gltf2_io import gltf_from_dict
 from io_scene_gltf2.blender.imp.blender_gltf import BlenderGlTF
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 cfg={'import_user_extensions':[],'import_pack_images':True,'merge_vertices':False,'import_shading':'NORMALS','bone_heuristic':'BLENDER','disable_bone_shape':True,'bone_shape_scale_factor':1,'guess_original_bind_pose':False,'import_webp_texture':False,'export_import_convert_lighting_mode':'SPEC'}
 imp=glTFImporter('memory.glb',cfg);data,imp.glb_buffer=imp.load_glb(memoryview(sys.stdin.buffer.read()));imp.data=gltf_from_dict(data);imp.checks();BlenderGlTF.create(imp)
 visible=[]
 for ob in bpy.data.objects:
  if ob.type=='MESH':
   ob.hide_render=not ob.name.startswith('LOD0_')
   if not ob.hide_render:visible.append(ob)
 assert len(visible)==22,len(visible)
 for im in bpy.data.images:
  if im.name.startswith('forge_'):assert im.size[0] in [512,1024],(im.name,list(im.size))
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4
 scene.render.resolution_x=1100;scene.render.resolution_y=700;scene.render.resolution_percentage=100
 scene.render.film_transparent=False;scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=85
 scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
 world=bpy.data.worlds.new('Neutral studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.18,.18,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
 def aim(ob,p):ob.rotation_euler=(Vector(p)-ob.location).to_track_quat('-Z','Y').to_euler()
 for name,pos,power,size in [('Key',(-5,-12,22),3000,18),('Fill',(10,12,15),2000,14)]:
  l=bpy.data.lights.new(name,'AREA');l.energy=power;l.shape='DISK';l.size=size;o=bpy.data.objects.new(name,l);scene.collection.objects.link(o);o.location=pos;aim(o,(0,0,0))
 c=bpy.data.cameras.new('Studio camera');o=bpy.data.objects.new('Studio camera',c);scene.collection.objects.link(o);o.location=(-12,-22,34);aim(o,(0,0,.4));c.type='ORTHO';c.ortho_scale=37;scene.camera=o
 evidence={'blender':bpy.app.version_string,'engine':'Cycles CPU','samples':32,'denoise':False,'visibleMeshes':len(visible),'triangles':sum(len(ob.data.polygons) for ob in visible),'images':[{'name':im.name,'size':list(im.size),'colorSpace':im.colorspace_settings.name} for im in bpy.data.images if im.name.startswith('forge_')],'camera':{'position':list(o.location),'target':[0,0,.4],'orthoScale':37},'lighting':'neutral world plus two area lights; no game lighting','ao':'Authored AO retained in importer settings socket but NOT applied to shading; no base-color multiplication'}
 bpy.ops.render.render()
 fd=os.memfd_create('studio-jpeg');bpy.data.images['Render Result'].save_render('/proc/self/fd/'+str(fd),scene=scene);os.lseek(fd,0,0);out=os.read(fd,2*1024*1024);os.close(fd);assert out[:2]==b'\xff\xd8'
 print('RESULT_JSON:'+json.dumps({'jpeg':base64.b64encode(out).decode(),'evidence':evidence}),flush=True)
else:
 from PIL import Image,ImageDraw,ImageFont
 def sha(x):return hashlib.sha256(x).hexdigest()
 blob='6d9912a982090e1911f3932eef7b8cd9d8aae880'
 raw=subprocess.check_output(['git','-C',str(REPO),'cat-file','blob',blob],env=dict(os.environ,GIT_NO_LAZY_FETCH='1',GIT_OPTIONAL_LOCKS='0'));assert len(raw)==798728 and sha(raw)=='58aa882b40036e3af8ec56f190180443a4a6e937e13c38f2cc2e7adf7dc896c3'
 js=r'''const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.env.SF_REPO;const req=require('node:module').createRequire(root+'/package.json');const {NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions'),{MeshoptDecoder}=req('meshoptimizer');const p=root+'/node_modules/three/examples/jsm/libs/basis/';const factory=vm.runInThisContext(fs.readFileSync(p+'basis_transcoder.js','utf8')+';BASIS;');(async()=>{await MeshoptDecoder.ready;const B=await factory({wasmBinary:fs.readFileSync(p+'basis_transcoder.wasm')});B.initializeBasis();const b=fs.readFileSync(0),jl=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+jl)),bin=20+jl+8,images=[];for(const im of g.images){const bv=g.bufferViews[im.bufferView],k=new B.KTX2File(new Uint8Array(b.subarray(bin+(bv.byteOffset||0),bin+(bv.byteOffset||0)+bv.byteLength)));if(!k.isValid()||!k.startTranscoding())throw Error('invalid KTX2');const dst=new Uint8Array(k.getImageTranscodedSizeInBytes(0,0,0,13));if(!k.transcodeImage(dst,0,0,0,13,0,-1,-1))throw Error('decode failed');images.push({name:im.name,width:k.getWidth(),height:k.getHeight(),ktxBytes:bv.byteLength,rgba:Buffer.from(dst).toString('base64')});k.close();k.delete();}const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});const doc=await io.readBinary(new Uint8Array(b));for(const e of doc.getRoot().listExtensionsUsed())if(e.extensionName==='EXT_meshopt_compression')e.dispose();const out=await io.writeBinary(doc);console.log(JSON.stringify({glb:Buffer.from(out).toString('base64'),images}));})().catch(e=>{console.error(e);process.exit(1)});'''
 dec=json.loads(subprocess.check_output(['node','-e',js],input=raw,env=dict(os.environ,SF_REPO=str(REPO))));b=base64.b64decode(dec['glb']);jl=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jl]);binary=bytearray(b[20+jl+8:]);evidence=[]
 # Match by name, because NodeIO may reorder embedded images.
 image_by_name={a['name']:a for a in dec['images']}
 for im in g['images']:
  a=image_by_name[im['name']];rgba=base64.b64decode(a['rgba']);png=io.BytesIO();Image.frombytes('RGBA',(a['width'],a['height']),rgba).save(png,format='PNG');pb=png.getvalue()
  while len(binary)%4:binary.append(0)
  idx=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(pb)});binary.extend(pb);im['bufferView']=idx;im['mimeType']='image/png';evidence.append({k:v for k,v in a.items() if k!='rgba'}|{'rgbaSha256':sha(rgba),'pngBytes':len(pb)})
 for t in g['textures']:
  ext=t.get('extensions',{}).pop('KHR_texture_basisu',None)
  if ext:t['source']=ext['source']
  if not t.get('extensions'):t.pop('extensions',None)
 for key in ['extensionsUsed','extensionsRequired']:
  if key in g:g[key]=[x for x in g[key] if x!='KHR_texture_basisu']
 g['buffers'][0]['byteLength']=len(binary)
 while len(binary)%4:binary.append(0)
 j=json.dumps(g,separators=(',',':')).encode()
 while len(j)%4:j+=b' '
 glb=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary
 print('RAM_IMPORT_BYTES',len(glb),'MAPS',json.dumps(evidence),flush=True)
 env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1');p=subprocess.run(['blender','--background','--factory-startup','--disable-autoexec','--python-exit-code','7','--python-expr',RENDER_SCRIPT,'--','--blender-stage'],input=glb,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env)
 output=p.stdout.decode(errors='replace');marks=[l[12:] for l in output.splitlines() if l.startswith('RESULT_JSON:')]
 if p.returncode or not marks:print(output[-14000:]);raise SystemExit('Blender failed '+str(p.returncode))
 result=json.loads(marks[-1]);photo=Image.open(io.BytesIO(base64.b64decode(result['jpeg']))).convert('RGB');im=Image.new('RGB',(1100,850),(19,24,30));im.paste(photo,(0,100));d=ImageDraw.Draw(im)
 def txt(x,y,s,size=16,bold=False):d.text((x,y),s,font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',size),fill=(229,233,236))
 txt(22,15,'WASP / EXPORTED-PACKAGE MATERIAL PREVIEW',25,True)
 txt(22,52,'Actual albedo + normal + roughness + metallic maps | neutral CPU studio lighting',16)
 txt(22,77,'Authored AO map NOT applied. Original mesh, UVs and material factors; no asset edits.',15)
 txt(22,809,'Not live game camera. No runtime lighting/post or visual acceptance. AO red not applied.',15)
 out=io.BytesIO();im.save(out,format='JPEG',quality=80,optimize=True);image=out.getvalue();assert len(image)<80*1024
 rec={'kind':'offline textured studio material reconstruction','blob':blob,'originalSha256':sha(raw),'originalBytes':len(raw),'inMemoryTransportDecodedGLBBytes':len(glb),'maps':evidence,'blenderEvidence':result['evidence'],'limits':'Authored AO not applied. No game-renderer/lighting/runtime or visual acceptance. No model, UV, normal, material assignment or factor edits. CPU studio reconstruction only. All model/texture data remained RAM; only JPEG/provenance saved. Adapted script executed in memory; no script file allocated.','image':{'bytes':len(image),'sha256':sha(image)},'scriptSha256':sha(RENDER_SCRIPT.encode())};receipt=(json.dumps(rec,indent=2)+'\n').encode()
 alloc=lambda n:((n+4095)//4096)*4096
 need=alloc(len(image))+alloc(len(receipt));assert need<=96*1024
 st=os.statvfs(R);assert st.f_bavail*st.f_frsize-need>=3072*1024
 assert not (R/'wasp-material-studio-20261024.jpg').exists() and not (R/'wasp-material-provenance-20261024.json').exists(), 'Refusing to overwrite frozen outputs'
 (R/'wasp-material-studio-20261024.jpg').write_bytes(image);(R/'wasp-material-provenance-20261024.json').write_bytes(receipt)
 print('SAVED',len(image),'ALLOC',need,'SHA',sha(image),flush=True)
