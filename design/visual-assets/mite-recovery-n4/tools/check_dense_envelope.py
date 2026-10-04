"""Exact decoded vertex envelope over every retained cosmetic fan angle, without simulation edits."""
from pathlib import Path
import numpy as np,math,json,hashlib
from gltf_geometry import read_geometry
R=Path(__file__).resolve().parents[1];SRC=R/'artifacts/n4/brood_mite_v01.glb'
rows,sockets,doc=read_geometry(SRC);out=[];peak=0
for lod in range(3):
 verts=[];maximum=0
 for row in rows:
  if not row['name'].startswith(f'LOD{lod}_'):continue
  v=row['v'];verts.append(v);side=row['side'];rad=np.hypot(v[:,0],v[:,2]);maximum=max(maximum,float(rad.max()))
  if side:
   pivot=np.array([-3,.18,-side*2.45]);dy=v[:,1]-pivot[1];dz=v[:,2]-pivot[2];lo=min(0,side*.3);hi=max(0,side*.3)
   angles=[np.full(len(v),lo),np.full(len(v),hi)]
   critical=np.arctan2(dy,dz)
   for k in range(-2,3):
    a=critical+k*math.pi;angles.append(np.clip(a,lo,hi))
   for a in angles:
    z=pivot[2]+np.sin(a)*dy+np.cos(a)*dz;maximum=max(maximum,float(np.hypot(v[:,0],z).max()))
 out.append({'lod':lod,'maximumPlanarRadiusWU':maximum,'decodedVertices':sum(len(v) for v in verts)})
 peak=max(peak,maximum)
scale=2.4/(peak+1e-5)
for row in out:row['normalizedMaximumRadiusWU']=row['maximumPlanarRadiusWU']*scale;assert row['normalizedMaximumRadiusWU']<2.4
report={'candidate':'N4 NEW','sourceSha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'sourceCoordinateFrame':'+X forward, +Y up, +Z starboard','denseRadiusWU':2.4,'sourceScaleToDense':scale,'method':'Decoded all-LOD vertices, exact endpoint and stationary-angle extrema for every retained fan angle within0..side*0.3 radians','gameplay':'Radius-only dense-tier compromise; does not prove jaw-gap or articulated native collision','rows':out,'sockets':sockets}
(R/'contracts/n4-dense-envelope.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
