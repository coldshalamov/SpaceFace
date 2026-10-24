import os,sys,subprocess,json,hashlib,io
from pathlib import Path
import argparse
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image,ImageDraw,ImageFont
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE)); import raster_core as rc
parser=argparse.ArgumentParser()
parser.add_argument('--repo',type=Path,default=HERE.parents[3])
parser.add_argument('--output',type=Path,default=HERE/'hawser-completion.webp')
args=parser.parse_args()
repo=str(args.repo.resolve())
os.environ.update(SPACEFACE_REPO=repo,GIT_NO_LAZY_FETCH='1',GIT_OPTIONAL_LOCKS='0')
end=json.loads((HERE/'provenance.json').read_text())
dec=(HERE/'decode.cjs').read_text().replace('readFileSync(process.argv[2])','readFileSync(0)').replace('if(!mesh||node.getExtras().nonRender||node.getExtras().collision)continue;','if(!mesh)continue;').replace('name:node.getName(),','name:node.getName(),hidden:!!(node.getExtras().nonRender||node.getExtras().collision),')
rows=[('t','HAWSER','fcad6df00a88593df3a3d55b4ddddaa2a63d013c','9f33875afb48a38986d1232a46f43857fe9255c7e7e9b308266b303e9fdd2003'),('f','MULE','1d367b8174984e755ce67fcebe024e9a2e2505ca','39d4e8f04e22cdaa94b1f7ceaeb365438620c9b183dac234478835df940c9b62'),('player','WASP','6d9912a982090e1911f3932eef7b8cd9d8aae880','58aa882b40036e3af8ec56f190180443a4a6e937e13c38f2cc2e7adf7dc896c3')]
meshes=[];records=[]
for key,name,blob,sha in rows:
 raw=subprocess.check_output(['git','-C',repo,'cat-file','blob',blob]);assert hashlib.sha256(raw).hexdigest()==sha
 D=json.loads(subprocess.check_output(['node','-e',dec],input=raw));vs=[];ms=[]
 for m in D['meshes']:
  M=np.array(m['matrix']).reshape(4,4).T;v=np.array(m['v']);m['v']=(np.c_[v,np.ones(len(v))]@M.T)[:,:3];vs.append(m['v'])
  if m['hidden'] or not m['name'].startswith('LOD0'):continue
  n=np.array(m['n'])@np.linalg.inv(M[:3,:3]);m['n']=n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-8);m['ix']=np.array(m['ix']).reshape(-1,3);ms.append(m)
 v=np.concatenate(vs);pose=end['finalPose'][key];scale=1.72*pose['radius']/np.ptp(v,axis=0)[0]
 if key=='t':detail=ms
 meshes+=rc.trans(ms,scale=scale,off=(pose['pos']['x'],pose['pos']['y'],pose['pos']['z']),rot=pose['rot'])
 records.append(dict(name=name,blob=blob,sha256=sha,scale=scale,triangles=sum(len(m['ix']) for m in ms),pose=pose))
im=Image.new('RGB',(940,600),(11,18,26));d=ImageDraw.Draw(im);rc.im=im;rc.draw=d;rc.line=(43,61,76)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans'
def txt(x,y,s,size=15,bold=False):
 d.text((x,y),s,font=ImageFont.truetype(font+('-Bold' if bold else '')+'.ttf',size),fill=(222,231,239))
txt(20,14,'SALVAGE WATCH / MEASURED COMPLETION POSES',24,True)
txt(20,49,'Exported-model preview at measured native poses, not live game camera',17)
txt(20,76,'154.083 s | three existing ships isolated | exact positions, headings and radius-based fit',15)
project,k=rc.render((20,112,900,400),meshes,205,center=(238,0,-265))
rc.render((40,280,360,210),detail,32,center=(0,.5,0),cam=(-.3,1.6,1))
txt(50,290,'Hawser model detail',15,True)
txt(50,312,'Separate framing / actual LOD0',13)
for r in records:
 p=r['pose'];x,y=project(p['pos']['x'],p['pos']['z']);txt(x-45,y-58 if r['name']=='MULE' else y+54,r['name']+' / '+str(p['id']),14,True)
txt(20,530,'Actual released LOD0 geometry + material factors. Embedded KTX2 maps NOT sampled.',15)


txt(20,559,'No game lighting, effects or debris. Not code qualification or visual acceptance.',14)
for q in [85,80,75,70,65,60,55,50,45]:
 out=io.BytesIO();im.save(out,format='WEBP',quality=q,method=6);image=out.getvalue()
 if len(image)<=28*1024:break
assert len(image)<=28*1024,len(image)
args.output.write_bytes(image)
print(json.dumps({'output':str(args.output),'bytes':len(image),'quality':q,'sha256':hashlib.sha256(image).hexdigest(),'records':records}))
