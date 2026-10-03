"""Exact Euclidean reverse distance at <=.005WU exposed native edge samples.
Coarse raster only culls points already bounded below .12; remaining samples
measure the union of actual cold-imported projected triangles, not nearest vertices.
"""
from pathlib import Path
import json,math,numpy as np
R=Path(__file__).resolve().parents[1]
ns={'__file__':str(R/'source/check_lod_coverage.py')}
exec((R/'source/check_lod_coverage.py').read_text().split("report={'kind'")[0],ns)
STEP=ns['STEP'];X=ns['X'];Z=ns['Z'];W=ns['W'];H=ns['H'];geometry=ns['geometry'];doc=ns['doc'];matrix=ns['matrix'];mask=ns['mask'];proxy=ns['proxy'];distance_transform_edt=ns['distance_transform_edt']
polys=[np.array(p['vertices']) for p in ns['proposed']['collision']['primitives']]
points=[]
def inside(p,poly):
 a=poly;b=np.roll(poly,-1,axis=0);v=b-a;d=p-a;cross=v[:,0]*d[:,1]-v[:,1]*d[:,0];return bool(np.min(cross)>1e-7)
for i,poly in enumerate(polys):
 for a,b in zip(poly,np.roll(poly,-1,axis=0)):
  n=max(1,math.ceil(np.linalg.norm(b-a)/.005))
  for k in range(n):
   p=a+(b-a)*k/n
   if not any(inside(p,other) for j,other in enumerate(polys) if j!=i):points.append(p)
P=np.array(points)
def exact_distance(ps,tris):
 A=tris[:,0];B=tris[:,1];C=tris[:,2];result=[]
 for chunk in np.array_split(ps,max(1,math.ceil(len(ps)/64))):
  if not len(chunk):continue
  q=chunk[:,None,:];cross=[];dist=[]
  for a,b in [(A,B),(B,C),(C,A)]:
   v=b-a;d=q-a;cross.append(v[:,0]*d[:,:,1]-v[:,1]*d[:,:,0]);vv=(v*v).sum(axis=1);t=np.clip((d*v).sum(axis=2)/np.maximum(vv,1e-20),0,1);res=d-t[:,:,None]*v;dist.append(np.sqrt((res*res).sum(axis=2)))
  area=(B[:,0]-A[:,0])*(C[:,1]-A[:,1])-(B[:,1]-A[:,1])*(C[:,0]-A[:,0]);inside_tri=((np.minimum.reduce(cross)>=-1e-10)|(np.maximum.reduce(cross)<=1e-10))&(np.abs(area)>1e-12)
  d=np.minimum.reduce(dist);d[inside_tri]=0;result.extend(np.min(d,axis=1).tolist())
 return np.array(result)
report={'method':'Exact point-to-projected-triangle-union distance on exposed convex edge samples, no runtime interpretation','edgeMaxStepWU':.005,'edgeSamplingAllowanceWU':.0025,'rasterCullLimitWU':.075,'rasterCullAllowanceWU':STEP*math.sqrt(2)*2,'sampleCount':len(P),'source':'cold combined candidate-m7/brood_mite_v01.glb','lods':[]}
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
fractions={0.,1.,.1,.6}
fractions.update(smooth(a/30) for a in range(30))
fractions.update(1+(.1-1)*smooth(a/8) for a in range(48))
fractions.update(.1+(.6-.1)*smooth(a/8) if a<8 else .6*(1-smooth((a-8)/40)) for a in range(48))
fractions=sorted(fractions);report['poseEnumeration']='Every distinct fixed-tick fold fraction from unchanged 30/48/48 profile, including reduced-motion endpoints'
report['uniqueFoldFractions']=len(fractions)
for lod in range(3):
 rows=[]
 for fraction in fractions:
  tris=[]
  for i,parts in geometry.items():
   if not doc['nodes'][i]['name'].startswith('LOD'+str(lod)+'_'):continue
   m=matrix(i,float(fraction))
   for vs,fs in parts:
    w=(m[:3,:3]@vs.T).T+m[:3,3];p=w[:,[0,2]];tris.extend(p[t] for t in fs)
  tris=np.array(tris);current=mask(tris);d=distance_transform_edt(~current)*STEP
  ix=np.clip(np.round((P[:,0]-X)/STEP).astype(int),0,W-1);iz=np.clip(np.round((P[:,1]-Z)/STEP).astype(int),0,H-1)
  choose=d[iz,ix]>.075;selected=P[choose];dist=exact_distance(selected,tris);error=float(dist.max(initial=0));witness=selected[int(dist.argmax())].tolist() if len(dist) else None
  conservative=max(.075+report['rasterCullAllowanceWU'],error+.0025)
  rows.append({'foldFraction':float(fraction),'exactMeasuredMaxWU':error,'maximumGuaranteedBoundWU':conservative,'witnessXZ':witness,'exactSampleCount':len(selected)})
 report['lods'].append({'lod':lod,'maxBoundWU':max(r['maximumGuaranteedBoundWU'] for r in rows),'passedFinitePoseSamples':all(r['maximumGuaranteedBoundWU']<=.12 for r in rows),'samples':rows})
(R/'candidate-m7/precise-boundary-check.json').write_text(json.dumps(report,indent=2));print(json.dumps({**report,'lods':[{k:v for k,v in r.items() if k!='samples'} for r in report['lods']]},indent=2))
