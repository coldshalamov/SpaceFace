"""Compare exact Forge tier projections to the proposed shared convex compound."""
from pathlib import Path
import json,hashlib,math
import numpy as np
from scipy.ndimage import distance_transform_edt,binary_erosion
from PIL import Image,ImageDraw
from gltf_geometry import read_geometry
R=Path(__file__).resolve().parents[1];proposal=json.loads((R/'contracts/lamellar-collision-proposal.json').read_text());STEP=.008;MINX=-5.6;MINZ=-4.55;W=1483;H=1139
px=lambda p:((p[0]-MINX)/STEP,(p[1]-MINZ)/STEP)
def mask(polys):
 im=Image.new('1',(W,H));d=ImageDraw.Draw(im)
 for p in polys:d.polygon([px(x) for x in p],fill=1)
 return np.array(im,dtype=bool)
proxy=mask([p['vertices'] for p in proposal['pieces']]);pd=distance_transform_edt(~proxy)*STEP;pb=proxy&~binary_erosion(proxy);out=[]
for lod in range(3):
 path=R/f'artifacts/preflight/lamellar-lod{lod}.glb';rows,sockets,doc=read_geometry(path);poses={}
 for phase,f in {'approach':0,'windup':1,'attack':.1,'recovery':.6}.items():
  polys=[]
  for row in rows:
   v=row['v'].copy();side=row['side']
   if side:
    pivot=np.array([-3,.18,-side*2.45]);a=side*.3*f;c=math.cos(a);s=math.sin(a);rot=np.array([[1,0,0],[0,c,-s],[0,s,c]]);v=(v-pivot)@rot.T+pivot
   q=v[:,[0,2]];polys.extend(q[t].tolist() for t in row['t'])
  m=mask(polys);md=distance_transform_edt(~m)*STEP;mb=m&~binary_erosion(m);poses[phase]={'visibleToProxyMaxWU':float(pd[mb].max(initial=0)),'proxyToVisibleMaxWU':float(md[pb].max(initial=0))}
 out.append({'lod':lod,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sockets':sockets,'poses':poses})
report={'status':'finite-raster geometry fit, not gameplay/solver performance approval','stepWU':STEP,'conservativeUncertaintyWU':2*math.sqrt(2)*STEP,'thresholdWU':.12,'rows':out}
report['withinConservativeTarget']=all(v+report['conservativeUncertaintyWU']<=.12 for row in out for p in row['poses'].values() for v in p.values())
(R/'contracts/lod-proxy-fit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
