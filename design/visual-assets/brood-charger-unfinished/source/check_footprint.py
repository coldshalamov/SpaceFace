"""All actual fixed-tick action fractions and every cold-imported LOD.
Conservative finite-grid bidirectional footprint with exact reverse samples.
"""
from pathlib import Path
import json,math,sys,hashlib
import numpy as np
from scipy.ndimage import distance_transform_edt,binary_erosion
from PIL import Image,ImageDraw
sys.path.insert(0,str(Path(__file__).resolve().parent));from glb_geometry import Glb,fractions
R=Path(__file__).resolve().parents[1];O=R/'candidate-c6';G=Glb(O/'brood_charger_v01.glb');P=json.loads((R/'contracts/convex-proxy-proposal.json').read_text())
STEP=.010;X=-10.2;Z=-8.6;W=2161;H=1721
def mask(ps):
 im=Image.new('1',(W,H));d=ImageDraw.Draw(im)
 for p in ps:d.polygon([((v[0]-X)/STEP,(v[1]-Z)/STEP)for v in p],fill=1)
 return np.array(im,dtype=bool)
proxy=mask([p['vertices']for p in P['pieces']]);pd=distance_transform_edt(~proxy)*STEP;pb=proxy&~binary_erosion(proxy)
# Exact rectangle/convex clipping to certify true empty fork, not raster alone.
def clip(poly,axis,cut,sign):
 out=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  da=(a[axis]-cut)*sign;db=(b[axis]-cut)*sign
  if da>=0:out.append(a)
  if da<0<db or db<0<da:
   t=da/(da-db);out.append([a[k]+t*(b[k]-a[k])for k in range(2)])
 return out
def intersect_area(poly):
 for axis,cut,sign in [(0,3.65,1),(0,11.8,-1),(1,-1.1,1),(1,1.1,-1)]:
  poly=clip(poly,axis,cut,sign)
  if len(poly)<3:return 0.
 return abs(sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(poly,poly[1:]+poly[:1])))*.5
report={'sourceGLBSHA256':hashlib.sha256((O/'brood_charger_v01.glb').read_bytes()).hexdigest(),'method':'cold GLB triangle projection; all distinct fixed-tick action fractions','uniqueFractions':len(fractions()),'stepWU':STEP,'conservativeRasterAllowanceWU':2*STEP*math.sqrt(2),'allConsumerRuntimeAdmission':False,'forkNativeArea':sum(intersect_area(p['vertices'])for p in P['pieces']),'lods':[]}
for lod in range(3):
 cache={};rows=[];fork=0.;bounds=[np.full(3,np.inf),np.full(3,-np.inf)]
 for f in fractions():
  tris=G.triangles(lod,f);bounds[0]=np.minimum(bounds[0],tris.min(axis=(0,1)));bounds[1]=np.maximum(bounds[1],tris.max(axis=(0,1)));ps=tris[:,:,[0,2]];m=mask(ps);key=hashlib.sha256(m.tobytes()).hexdigest()
  if key not in cache:
   d=distance_transform_edt(~m)*STEP;mb=m&~binary_erosion(m);forward=float(pd[mb].max(initial=0));reverse=float(d[pb].max(initial=0));area=sum(intersect_area(t.tolist())for t in ps);fork=max(fork,area)
   cache[key]={'visibleToProxyMaxWU':forward,'proxyToVisibleMaxWU':reverse,'conservativeBoundWU':max(forward,reverse)+report['conservativeRasterAllowanceWU'],'forkProjectedTriangleArea':area}
  rows.append({'fraction':f,**cache[key]})
 worst=max(r['conservativeBoundWU']for r in rows);report['lods'].append({'lod':lod,'maxBoundWU':worst,'passed':worst<=.12 and fork<1e-9,'distinctRasterFootprints':len(cache),'forkAreaWU2':fork,'visualBoundsAllPoses':{'min':bounds[0].tolist(),'max':bounds[1].tolist()},'samples':rows});print('LOD',lod,'bound',worst,'footprints',len(cache),flush=True)
(O/'footprint-check.json').write_text(json.dumps(report,indent=2));print('PASS',all(r['passed']for r in report['lods']))
