"""Read cold plain glTF geometry, keeping all transform semantics explicit."""
import json,struct,math
import numpy as np
from scipy.spatial.transform import Rotation
from pathlib import Path
class Glb:
 def __init__(self,path):
  raw=Path(path).read_bytes();ln=struct.unpack_from('<I',raw,12)[0];self.doc=json.loads(raw[20:20+ln]);self.binary=raw[28+ln:];self.parents={c:i for i,n in enumerate(self.doc['nodes']) for c in n.get('children',[])}
  self.geometry={i:[(self.accessor(p['attributes']['POSITION']),self.accessor(p['indices']).reshape(-1,3)) for p in self.doc['meshes'][n['mesh']]['primitives']] for i,n in enumerate(self.doc['nodes']) if 'mesh' in n}
 def accessor(self,i):
  a=self.doc['accessors'][i];v=self.doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];n={'VEC3':3,'SCALAR':1,'VEC2':2,'VEC4':4}[a['type']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);size=np.dtype(dtype).itemsize
  return np.ndarray((a['count'],n),dtype=dtype,buffer=self.binary,offset=offset,strides=(v.get('byteStride',size*n),size)).copy()
 def matrix(self,i,f):
  n=self.doc['nodes'][i]
  if 'matrix'in n:m=np.array(n['matrix']).reshape(4,4).T
  else:
   m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
  if n.get('name','').startswith('MOTION_CHARGER_PADDLE_'):
   a=(1 if n['name'].endswith('PORT') else -1)*.42*f;m[:3,:3]=m[:3,:3]@Rotation.from_rotvec([a,0,0]).as_matrix()
  if n.get('name')=='MOTION_CHARGER_ABDOMEN':m[0,3]+=.8*f
  return self.matrix(self.parents[i],f)@m if i in self.parents else m
 def triangles(self,lod=None,f=0,named=False):
  rows=[]
  for i,parts in self.geometry.items():
   name=self.doc['nodes'][i].get('name','')
   if lod is not None and not name.startswith('LOD'+str(lod)+'_'):continue
   m=self.matrix(i,f)
   for v,t in parts:
    w=(m[:3,:3]@v.T).T+m[:3,3];tris=w[t]
    if named:rows.append((name,tris))
    else:rows.extend(tris)
  return rows if named else np.array(rows)
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def fractions():
 fs={0.,1.,.08,.65};fs.update(smooth(a/45)for a in range(45));fs.update(1+(.08-1)*smooth(a/8)for a in range(144));fs.update(.08+(.65-.08)*smooth(a/8)if a<8 else .65*(1-smooth((a-8)/76))for a in range(84));return sorted(fs)
