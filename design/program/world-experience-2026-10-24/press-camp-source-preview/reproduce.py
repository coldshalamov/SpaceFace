#!/usr/bin/env python3
"""Generated CPU source-preview reproduction, not a game renderer.
Inputs: an existing SpaceFace Git repository with the exact public GLB blobs and
its installed Node dependencies (@gltf-transform/core, extensions, meshoptimizer);
Python numpy 2.3.5 / Pillow 12.3.0 and DejaVu Sans fonts.
Original Node packages: @gltf-transform/core 4.5.0 (MIT),
@gltf-transform/extensions 4.5.0 (MIT), meshoptimizer 1.2.0 (MIT).
Dependencies/fonts are referenced, not bundled. No third-party implementation
is copied here; the small rasterizer/decoder wrapper were generated for this
project. Keep dependency license notices with the installed packages. No fetch/install/browser is performed.
Usage: python3 -B reproduce.py --repo /path/to/SpaceFace --out source-preview.webp

Candidate scene: fc236adf692478d1eeb6738720378898d5813e4f
Measured arrival: c54634572ace36698982630cddcacd220d62e05d
Pending-boundary/native-parity proof: a6c6d48b718acb192dd60bc03f61b5c45ec0f1e8
The candidate binding is applied to recorded native arrival poses. Source-derived
GLB centering and node transforms are reconstructed on CPU. Material factors only;
no texture maps/AO, runtime material overrides, lighting/effects, attachments,
sampled animation, live camera, final GPU residency or visual acceptance.
The detail panels have separate framing. The overview never relocates actors.
Font and library versions can affect raster/encoding bytes; compare the printed
SHA256 with the provenance and inspect the generated image before using it.
"""
PUBLIC_SOURCE_PINS = {"partsLibrary":"69e3de815fba57fb8b8d625b5728642aab061d68","visualOverrides":"0ca35e9ef11c38a181e95a6ee57cc546c918236c","visualFactory":"e9a11cfaf1c16f483ea6bf01f1b9fb07f977f135","modelTruth":"706e7aa3768587e4cfcc1e6ad03dd3664dd5abdb","modelTruthMounts":"5a76018f09b307ef0fc3c77a73a579d6f9840b89","modelTruthCensus":"030a156d171f08667b7c900cba40f091982abbd5","collisionProxyManifests":"fa6d39e4a00de8f52c914ebeb9f67e1d18bb12ba","lootShards":"07802963aed6baa870d64ca9c9901b3a901df736"}
import os,sys,subprocess,json,hashlib,io,base64,math
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import types,argparse,pathlib
args=argparse.ArgumentParser(description='Reproduce a limited Press Camp candidate source-model preview from exact public GLB Git blobs.')
args.add_argument('--repo',required=True);args.add_argument('--out',required=True)
args=args.parse_args()
rc=types.ModuleType('raster_core')
exec("import math\nimport numpy as np\nfrom PIL import Image, ImageDraw, ImageFont\ndef trans(meshes,scale=1,off=(0,0,0),rot=0,center=None,tint=None):\n c,s=math.cos(rot),math.sin(rot);mat=np.array([[c,0,-s],[0,1,0],[s,0,c]]);out=[]\n for m in meshes:\n  v=m['v'].copy()\n  if center is not None:v-=center\n  v=(v*scale)@mat.T+np.array(off);n=m['n']@mat.T\n  q={**m,'v':v,'n':n}\n  if tint is not None:q['color']=(np.array(m['color'])*.42+np.array(tint)*.58).tolist();q['emissive']=(np.array(m['emissive'])*.3).tolist()\n  out.append(q)\n return out\ndef render(rect,meshes,span,center=(0,0,0),cam=None,grid=False):\n x0,y0,w,h=rect\n if cam is None:B=np.array([[1,0,0],[0,0,1],[0,1,0]])\n else:\n  f=np.array(cam,dtype=float);f/=np.linalg.norm(f);r=np.cross([0,1,0],f);r/=np.linalg.norm(r);u=np.cross(f,r);B=np.array([r,u,f])\n k=w/span;rgb=np.zeros((h,w,3),dtype=float)+np.array([19,30,41]);zbuf=np.full((h,w),-np.inf);light=np.array([-.3,.85,.4]);light/=np.linalg.norm(light)\n if grid:\n  for q in np.arange(-1000,1500,100):\n   xx=int((q-center[0])*k+w/2);yy=int(-(q-center[2])*k+h/2)\n   if 0<=xx<w:rgb[:,xx:xx+1,:]=[29,44,57]\n   if 0<=yy<h:rgb[yy:yy+1,:,:]=[29,44,57]\n for m in meshes:\n  p=(m['v']-center)@B.T;p[:,:2]*=[k,-k];p[:,:2]+=[w/2,h/2];n=m['n'];color=np.array(m['color']);emi=np.array(m['emissive'])\n  for ids in m['ix']:\n   a,b,c=p[ids];xmin=max(0,int(np.floor(min(a[0],b[0],c[0]))));xmax=min(w-1,int(np.ceil(max(a[0],b[0],c[0]))));ymin=max(0,int(np.floor(min(a[1],b[1],c[1]))));ymax=min(h-1,int(np.ceil(max(a[1],b[1],c[1]))));den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])\n   if abs(den)<1e-9 or xmax<xmin or ymax<ymin:continue\n   yy,xx=np.mgrid[ymin:ymax+1,xmin:xmax+1];xx=xx+.5;yy=yy+.5;wa=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;wb=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;wc=1-wa-wb;zz=wa*a[2]+wb*b[2]+wc*c[2];sub=zbuf[ymin:ymax+1,xmin:xmax+1];mask=(wa>=0)&(wb>=0)&(wc>=0)&(zz>sub)\n   if not mask.any():continue\n   norm=wa[...,None]*n[ids[0]]+wb[...,None]*n[ids[1]]+wc[...,None]*n[ids[2]];norm/=np.maximum(np.linalg.norm(norm,axis=-1,keepdims=True),1e-8);lighting=.28+1.3*np.maximum(0,norm@light);col=np.clip(color*lighting[...,None]+emi*.36,0,1);col=np.where(col<=.0031308,col*12.92,1.055*np.power(col,1/2.4)-.055)*255;rgb[ymin:ymax+1,xmin:xmax+1][mask]=col[mask];sub[mask]=zz[mask]\n im.paste(Image.fromarray(rgb.astype('uint8')),(x0,y0));draw.rectangle((x0,y0,x0+w-1,y0+h-1),outline=line,width=2)\n return lambda x,z:(x0+(x-center[0])*k+w/2,y0-(z-center[2])*k+h/2),k\n",rc.__dict__)
repo=str(pathlib.Path(args.repo).resolve())
os.environ.update(SPACEFACE_REPO=repo,GIT_NO_LAZY_FETCH='1',GIT_OPTIONAL_LOCKS='0')
dec="const {createRequire}=require('node:module');const req=createRequire(require('node:path').join(process.env.SPACEFACE_REPO,'package.json'));const {NodeIO}=req('@gltf-transform/core');const {ALL_EXTENSIONS}=req('@gltf-transform/extensions');const {MeshoptDecoder}=req('meshoptimizer');const {execFileSync}=require('node:child_process');\n(async()=>{await MeshoptDecoder.ready;const bytes=require('node:fs').readFileSync(process.argv[2]);const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});const doc=await io.readBinary(new Uint8Array(bytes));const meshes=[];for(const node of doc.getRoot().listNodes()){const mesh=node.getMesh();if(!mesh||node.getExtras().nonRender||node.getExtras().collision)continue;for(const p of mesh.listPrimitives()){const pos=p.getAttribute('POSITION'),n=p.getAttribute('NORMAL'),mat=p.getMaterial();if(!pos)continue;meshes.push({name:node.getName(),matrix:node.getWorldMatrix(),v:Array.from({length:pos.getCount()},(_,i)=>pos.getElement(i,[])),n:n?Array.from({length:n.getCount()},(_,i)=>n.getElement(i,[])):null,ix:p.getIndices()?Array.from(p.getIndices().getArray()):Array.from({length:pos.getCount()},(_,i)=>i),color:mat?mat.getBaseColorFactor().slice(0,3):[.6,.6,.6],emissive:mat?mat.getEmissiveFactor():[0,0,0]});}}console.log(JSON.stringify({meshes}));})().catch(e=>{console.error(e);process.exit(1)});\n".replace('readFileSync(process.argv[2])','readFileSync(0)').replace('if(!mesh||node.getExtras().nonRender||node.getExtras().collision)continue;','if(!mesh)continue;').replace('name:node.getName(),','name:node.getName(),hidden:!!(node.getExtras().nonRender||node.getExtras().collision),')
rows=[
('base','1384dbf052f779a4c3667bda469f6c5a793cdc48','cf59eaab5914ce68c5089c0f09d5071204de11b1da0a271d53cfd65dbea614a5'),
('mule','d4ceaa3dc1d47015b5f6107e937bd5f84745551c','4d7213c8faacbe826bee9f296849abcef563979677453453b38972e57b02c271'),
('hornet','1cf2d36dd02b7e817100408f88437d261cd67051','abfc0010067b94ad901029d9b0173f0acb9f397a831ecf1bb3e58d942a44d10f'),
('wasp','29fc1e63e44c3a70565e0f528484d44f68aa74c9','7cd7680caac82056c10644e433e40057e5f94ff2b2ac9290c7c6f03805a557c8')]
rows.append(('pod','de44357fda259683416e8379be15980da353e2f6','e2067c1de43533121f575a67147de67d70c11bcf515ecf81894e37c09995622a'))
models={};records=[]
for key,blob,sha in rows:
 raw=subprocess.check_output(['git','-C',repo,'cat-file','blob',blob]);assert hashlib.sha256(raw).hexdigest()==sha
 D=json.loads(subprocess.check_output(['node','-e',dec],input=raw));vs=[];ms=[]
 for m in D['meshes']:
  M=np.array(m['matrix']).reshape(4,4).T;v=np.array(m['v']);m['v']=(np.c_[v,np.ones(len(v))]@M.T)[:,:3];vs.append(m['v'])
  if m['hidden'] or not m['name'].startswith('LOD0'):continue
  n=np.array(m['n'])@np.linalg.inv(M[:3,:3]);m['n']=n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-8);m['ix']=np.array(m['ix']).reshape(-1,3);ms.append(m)
 v=np.concatenate(vs);models[key]=(ms,np.ptp(v,axis=0)[0],max(np.ptp(v,axis=0)))
 records.append(dict(model=key,blob=blob,sha256=sha,triangles=sum(len(m['ix']) for m in ms)))
poses=[
dict(model='base',id=7,x=-27072,z=31568,rot=0,radius=42),
dict(model='mule',id=2,x=-27038,z=31588,rot=0,radius=18),
dict(model='hornet',id=3,x=-26917.4140625,z=31631.025390625,rot=-.011650762060490353,radius=18),
dict(model='wasp',id=4,x=-27074.484375,z=31713.845703125,rot=-.006309252543456423,radius=12),
dict(model='wasp',id=5,x=-27221.298828125,z=31526.369140625,rot=.005165900557310688,radius=12),
dict(model='hornet',id=6,x=-27063.634765625,z=31434.912109375,rot=.011457722190609015,radius=18)]
poses += [dict(model='pod',id=8,x=-27105.072265625,z=31497.369140625,rot=0,radius=3),dict(model='pod',id=9,x=-27128.603515625,z=31509.599609375,rot=0,radius=3),dict(model='pod',id=10,x=-27000.4453125,z=31517.951171875,rot=0,radius=3)]
scene=[]
for p in poses:
 ms,width,envelope=models[p['model']];s=1.442292 if p['model']=='base' else 2*p['radius']/envelope if p['model']=='pod' else 1.72*p['radius']/width
 off=(p['x']+27072,p.get('y',0),p['z']-31568)
 if p['model']=='base':
  ms=rc.trans(ms,rot=77.5*math.pi/180)
  off=(off[0]+1.875944,off[1],off[2]+.00117)
 scene+=rc.trans(ms,scale=s,rot=p['rot'],off=off)
im=Image.new('RGB',(1000,720),(10,17,25));d=ImageDraw.Draw(im);rc.im=im;rc.draw=d;rc.line=(49,68,83)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans'
def txt(x,y,s,size=14,bold=False,col=(226,235,240)):
 d.text((x,y),s,font=ImageFont.truetype(font+('-Bold' if bold else '')+'.ttf',size),fill=col)
txt(22,16,'PRESS CAMP / CANDIDATE SOURCE PREVIEW',27,True)
txt(22,53,'Source-model preview at recorded native arrival',19)
txt(22,82,'Seed 24 | 59.8667 s | Corsair Blade / Ashline Dart / Helios Span | measured native poses',14)
project,k=rc.render((20,116,640,482),scene,430,center=(0,0,0))
# Fixed native origins and headings; leader lines mark positions, not visible geometry.
for p in poses:
 x,y=project(p['x']+27072,p['z']-31568)
 if p['model'] in ('base','pod'):continue
 name=('CAPTIVE MULE' if p['model']=='mule' else {'hornet':'CORSAIR','wasp':'DART'}[p['model']])+' / '+str(p['id'])
 offsets={2:(48,-33),3:(-44,-40),4:(-40,22),5:(-33,20),6:(-43,-35)}
 dx,dy=offsets[p['id']];tx,ty=x+dx,y+dy
 if p['id']==2:d.line((x,y,tx,ty+15),fill=(249,203,121),width=1)
 txt(tx,ty,name,12,True,col=(249,203,121) if p['id']==2 else (217,232,242))
txt(34,129,'MEASURED ARRIVAL / TOP VIEW',12,True)
txt(35,576,'Base 7 + three freight pods | true relative positions, common scale',11)
txt(688,123,'MODEL DETAILS',15,True)
txt(688,147,'Separate framing, not poses',11)
for key,rect,span,title in [
 ('mule',(680,173,300,115),39,'CAPTIVE / HELIOS SPAN'),
 ('hornet',(680,317,300,115),30,'GARRISON / CORSAIR BLADE'),
 ('wasp',(680,461,300,115),32,'GARRISON / ASHLINE DART')]:
 ms,_,_=models[key];rc.render(rect,ms,span,center=(0,.5,0),cam=(-.3,1.6,1))
 txt(rect[0]+9,rect[1]+rect[3]+6,title,12,True)
txt(22,619,'Actual public LOD0 geometry + material factors only. Texture maps and AO omitted.',14)
txt(22,644,'No runtime material overrides, lighting/effects, fitted attachments or animated poses.',13)
txt(22,672,'Not live game camera, escape-path proof, or visual acceptance.',15,True)
out=io.BytesIO();im.save(out,format='WEBP',quality=90,method=6);b=out.getvalue()
# Match the delivered compact variant: re-open the original quality90 output, then encode quality45.
src=Image.open(io.BytesIO(b));compact=io.BytesIO();src.save(compact,format='WEBP',quality=45,method=6);b=compact.getvalue()
pathlib.Path(args.out).write_bytes(b)
print(json.dumps(dict(bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),expectedSha256='e2d78a9960b07907977cd2d93e43344afb1d0a5c5a252699be4d776a55f343ac',models=records,poses=poses)))
