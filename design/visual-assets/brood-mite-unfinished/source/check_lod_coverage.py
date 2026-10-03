"""Cold GLB geometry check, offline only; shared runtime owner is authoritative."""
import json,struct,math
from pathlib import Path
import numpy as np
from scipy.ndimage import distance_transform_edt,binary_erosion
from scipy.spatial.transform import Rotation
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1];raw=(R/'candidate-m7/brood_mite_v01.glb').read_bytes();ln=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+ln]);binary=raw[28+ln:]
STEP=.008;X=-6;Z=-4.8;W=1576;H=1201
parents={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])}
def accessor(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];n={'VEC3':3,'SCALAR':1,'VEC2':2,'VEC4':4}[a['type']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);size=np.dtype(dtype).itemsize
 return np.ndarray((a['count'],n),dtype=dtype,buffer=binary,offset=offset,strides=(v.get('byteStride',size*n),size)).copy()
geometry={i:[(accessor(p['attributes']['POSITION']),accessor(p['indices']).reshape(-1,3)) for p in doc['meshes'][n['mesh']]['primitives']] for i,n in enumerate(doc['nodes']) if 'mesh' in n}
def matrix(i,fraction):
 n=doc['nodes'][i]
 if 'matrix' in n:m=np.array(n['matrix']).reshape(4,4).T
 else:
  m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
 if n.get('name','').startswith('MOTION_MITE_MEMBRANE_'):
  angle=(1 if n['name'].endswith('PORT') else -1)*.3*fraction;m[:3,:3]=m[:3,:3]@Rotation.from_rotvec([angle,0,0]).as_matrix()
 return matrix(parents[i],fraction)@m if i in parents else m

def mask(polygons):
 im=Image.new('1',(W,H));d=ImageDraw.Draw(im)
 for p in polygons:d.polygon([((v[0]-X)/STEP,(v[1]-Z)/STEP) for v in p],fill=1)
 return np.array(im,dtype=bool)
proposed=json.loads((R/'contracts/proposed-mite-contract.json').read_text());proxy=mask([p['vertices'] for p in proposed['collision']['primitives']]);pd=distance_transform_edt(~proxy)*STEP;pb=proxy&~binary_erosion(proxy)
report={'kind':'finite cold-GLB projected silhouette check','stepWU':STEP,'quantizationAllowanceWU':STEP*math.sqrt(2)*2,'lods':[],'noRuntimeClaim':True}
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
fractions={0.,1.,.1,.6}
fractions.update(smooth(a/30) for a in range(30))
fractions.update(1+(.1-1)*smooth(a/8) for a in range(48))
fractions.update(.1+(.6-.1)*smooth(a/8) if a<8 else .6*(1-smooth((a-8)/40)) for a in range(48))
fractions=sorted(fractions);report['uniqueFoldFractions']=len(fractions);report['poseEnumeration']='All distinct fixed-tick fractions of original action profile and reduced-motion endpoints'
for lod in range(3):
 rows=[]
 for fraction in fractions:
  tris=[]
  for i,parts in geometry.items():
   if not doc['nodes'][i]['name'].startswith('LOD'+str(lod)+'_'):continue
   m=matrix(i,float(fraction))
   for vs,fs in parts:
    w=(m[:3,:3]@vs.T).T+m[:3,3];p=w[:,[0,2]];tris.extend(p[t] for t in fs)
  current=mask(tris);bound=current&~binary_erosion(current);d=distance_transform_edt(~current)*STEP
  witness=np.unravel_index(np.argmax(np.where(pb,d,-1)),d.shape)
  rows.append({'proxyToVisibleWitnessXZ':[X+witness[1]*STEP,Z+witness[0]*STEP],'foldFraction':float(fraction),'visibleToProxyMaxWU':float(pd[bound].max(initial=0)),'proxyToVisibleMaxWU':float(d[pb].max(initial=0))})
 worst=max(max(r['visibleToProxyMaxWU'],r['proxyToVisibleMaxWU']) for r in rows);report['lods'].append({'lod':lod,'maxErrorWU':worst,'passesWithRasterAllowance':worst+report['quantizationAllowanceWU']<=.12,'samples':rows})
print(json.dumps(report,indent=2));(R/'candidate-m7/lod-coverage-check.json').write_text(json.dumps(report,indent=2))
