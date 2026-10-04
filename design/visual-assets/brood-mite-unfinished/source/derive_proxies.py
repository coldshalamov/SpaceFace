"""Offline geometry proposal only. No runtime/private collision consumer.
Conservative finite raster diagnostic .008 WU; exact source vertices/hulls retained.
"""
import json,math
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull
from scipy.ndimage import distance_transform_edt,binary_erosion
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1];D=json.loads((R/'contracts/anatomy-m6.json').read_text())
STEP=.008;MINX=-6.0;MAXX=6.6;MINZ=-4.8;MAXZ=4.8;W=round((MAXX-MINX)/STEP)+1;H=round((MAXZ-MINZ)/STEP)+1

def px(p):return ((p[0]-MINX)/STEP,(p[1]-MINZ)/STEP)
def polys(rows):
 out=[]
 for row in rows:
  vs=np.array(row['verts'])[:,[0,2]]
  out.extend(vs[t].tolist() for t in row['triangles'])
 return out

def mask(ps):
 im=Image.new('1',(W,H));d=ImageDraw.Draw(im)
 for p in ps:d.polygon([px(v) for v in p],fill=1)
 return np.array(im,dtype=bool)
MASK={p:mask(polys(rows)) for p,rows in D['poses'].items()};DIST={p:distance_transform_edt(~m)*STEP for p,m in MASK.items()}

def hull(ps):
 v=np.unique(np.concatenate([np.array(p) for p in ps]),axis=0)
 if len(v)<3:return None
 try:h=ConvexHull(v);return v[h.vertices].tolist()
 except:return None

def error(poly,phase='midfold'):
 m=mask([poly]);return max(float(DIST[p][m].max(initial=0)) for p in ['approach','windup','attack','recovery'])

def clip(p,axis,cut,sign):
 out=[]
 for a,b in zip(p,p[1:]+p[:1]):
  da=(a[axis]-cut)*sign;db=(b[axis]-cut)*sign
  if da>=-1e-10:out.append(a)
  if (da<0<db) or (db<0<da):
   t=da/(da-db);out.append([a[k]+t*(b[k]-a[k]) for k in range(2)])
 return out

def decompose(ps,id,depth=0):
 h=hull(ps)
 if h is None:return []
 e=error(h)
 if e<=.080:return [{'id':id,'points':h,'midfoldOverfillWU':e}]
 if depth>8:raise RuntimeError((id,e))
 a=np.array(h);axis=int(np.argmax(np.ptp(a,axis=0)));cut=(a[:,axis].min()+a[:,axis].max())/2
 result=[]
 for sign,tag in [(-1,'a'),(1,'b')]:
  cp=[q for p in ps if len(q:=clip(p,axis,cut,sign))>=3]
  if cp:result+=decompose(cp,id+tag,depth+1)
 return result
rows=D['poses']['midfold'];groups={}
for row in rows:
 n=row['name'];ps=polys([row])
 if any(k in n for k in ['continuous_ventral','abdominal_carapace','thoracic_saddle','oral_floor']):
  for sign,tag in [(-1,'abdomen'),(1,'thorax')]:
   groups.setdefault(tag,[]).extend(q for p in ps if len(q:=clip(p,0,-.70,sign))>=3)
 elif 'cheliceral' in n or 'contact_fang' in n:groups.setdefault(('port' if 'PORT' in n else 'starboard')+'_jaw',[]).extend(ps)
 elif 'foreleg' in n:groups.setdefault(('port' if 'PORT' in n else 'starboard')+'_foreleg',[]).extend(ps)
 else:groups.setdefault(('port' if 'PORT' in n else 'starboard')+'_fin',[]).extend(ps)
pieces=[]
for name,ps in groups.items():pieces+=decompose(ps,name)
initial=len(pieces)
# Merge only where the exact source union bounds the proposed convex addition.
# A greedy merge is a small bounded solution, not a proof of global minimum.
while True:
 candidates=[]
 for i in range(len(pieces)):
  for j in range(i+1,len(pieces)):
   a,b=pieces[i],pieces[j]
   if ('fin' in a['id'])!=('fin' in b['id']):continue
   h=hull([a['points'],b['points']]);e=error(h)
   if e<=.090:candidates.append((e,len(h),i,j,h))
 if not candidates:break
 e,_,i,j,h=min(candidates);a=pieces[i];b=pieces[j];pieces=[p for k,p in enumerate(pieces) if k not in (i,j)]+[{'id':a['id']+'_'+b['id'],'points':h,'midfoldOverfillWU':e}]
# Simplify nearly collinear hull vertices without changing convexity. Error checked again.
for p in pieces:
 points=p['points'];changed=True
 while changed and len(points)>3:
  changed=False
  for i in range(len(points)):
   a=np.array(points[i-1]);b=np.array(points[(i+1)%len(points)]);v=np.array(points[i]);ab=b-a;t=np.clip(np.dot(v-a,ab)/max(1e-15,np.dot(ab,ab)),0,1);dist=np.linalg.norm(v-a-t*ab)
   if dist<.012:points.pop(i);changed=True;break
 while len(points)>12:
  costs=[]
  for i in range(len(points)):
   a=np.array(points[i-1]);b=np.array(points[(i+1)%len(points)]);v=np.array(points[i]);ab=b-a;t=np.clip(np.dot(v-a,ab)/max(1e-15,np.dot(ab,ab)),0,1)
   costs.append((float(np.linalg.norm(v-a-t*ab)),i))
  _,i=min(costs);points.pop(i)
 p['points']=[[round(float(x),6),round(float(z),6)] for x,z in points]
 p['kind']='convex_polygon';p['queryAuthority']='proposal-only-not-runtime';p['sourcePose']='midfold' if 'fin' in p['id'] else 'static';p['gameplaySolid']=True
native=mask([p['points'] for p in pieces]);ndist=distance_transform_edt(~native)*STEP
stats={}
for phase in ['approach','windup','attack','recovery']:
 m=MASK[phase];boundary=m&~binary_erosion(m);nbound=native&~binary_erosion(native)
 stats[phase]={'visibleToProxyMaxWU':float(ndist[boundary].max(initial=0)),'proxyToVisibleMaxWU':float(DIST[phase][nbound].max(initial=0))}
clear=mask([[[2,-.65],[6.6,-.65],[6.6,.65],[2,.65]]]);clearPixels=int(np.count_nonzero(clear&native))
# Exact old 7 capsule family measured at same finite resolution and against same source.
old=json.loads((R/'contracts/frozen-mite-contract.json').read_text())
def capsule(p):
 ax,az,bx,bz,r=[p[k] for k in ['ax','az','bx','bz','r']];angle=math.atan2(bz-az,bx-ax)
 return [[cx+r*math.cos(a),cz+r*math.sin(a)] for cx,cz,start in [(bx,bz,angle-math.pi/2),(ax,az,angle+math.pi/2)] for a in np.linspace(start,start+math.pi,96)]
om=mask([capsule(p) for p in old['collision']['primitives']]);odist=distance_transform_edt(~om)*STEP;omedge=om&~binary_erosion(om);oldStats={}
for phase in ['approach','windup','attack','recovery']:
 m=MASK[phase];b=m&~binary_erosion(m);oldStats[phase]={'visibleToOldMaxWU':float(odist[b].max(initial=0)),'oldToVisibleMaxWU':float(DIST[phase][omedge].max(initial=0))}
report={'schema':'spaceface.broodConvexProposal.v1','status':'NOT runtime accepted or registered','sourceSha256':D['sourceSha256'],'units':'WU','projection':'GLB XZ','fixedPhysics':'total mass22, radius7.1, COM[-.7,0,0], attack profile unchanged','nativePlaneSlabY':[-.65,.08],'outlineErrorTargetWU':.12,'pieces':pieces,'pieceCount':len(pieces),'initialSplitCount':initial,'rasterStepWU':STEP,'quantizationErrorBoundWU':STEP*math.sqrt(2)*2,'poses':stats,'clearVolumeJawOverlapPixels':clearPixels,'oldProxyMismatch':oldStats,'minimality':'Greedy pairwise-minimal within .090 WU four-pose overfill; global minimum not claimed','neededRuntime':'Canonical convex subpart support shared by native, projectile, LOS, tether/query and metrics, not render-only interpretation'}
(R/'contracts/convex-proxy-proposal.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='pieces'},indent=2))
# Transparent source silhouettes + candidate boundaries for geometry review.
C=Image.new('RGB',(W*2,H*2),'#151c22');dr=ImageDraw.Draw(C)
for i,phase in enumerate(['approach','windup','attack','recovery']):
 im=Image.new('RGBA',(W,H));arr=np.zeros((H,W,4),dtype=np.uint8);arr[MASK[phase]]=[110,81,103,255];im=Image.fromarray(arr);d=ImageDraw.Draw(im)
 for p in pieces:d.line([px(v) for v in p['points']]+[px(p['points'][0])],fill=(90,255,180,255),width=2)
 d.rectangle([px([2,-.65]),px([6.6,.65])],outline=(255,180,70,255),width=3)
 C.paste(im,((i%2)*W,(i//2)*H),im);dr.text(((i%2)*W+20,(i//2)*H+20),phase+' / convex proposal only',fill='#ffffff')
C.thumbnail((1800,1500));C.save(R/'contracts/convex-overlay-poses.png')
