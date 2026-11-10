"""Original section-authored Charger; readonly Forge finishing and shared Brood maps.
No decimation. The plan contour is authored explicitly and preserved by all LODs.
Blender +X forward +Y port +Z dorsal. Runtime +X/+Y up/+Z starboard.
"""
import bpy,bmesh,math,sys,json,os
from pathlib import Path
from mathutils import Vector,Quaternion
R=Path(__file__).resolve().parents[1];OUT=R/os.environ.get('CHARGER_OUT','study-c2');OUT.mkdir(exist_ok=True)
FROOT=Path(os.environ.get('SPACEFACE_FORGE_ROOT','/workspace/shared/SpaceFace-integration-d0ae/tools/blender/forge'))
sys.path.insert(0,str(FROOT));import forge as F,forge_export as E,brood_kit as K
bpy.ops.wm.read_factory_settings(use_empty=True)
s=F.Ship('brood_charger',{'carapace':'#70314f','chitin':'#a18d9a','membrane':'#211b2b','glow_brood':'#c4a7dd'});K.apply_chitin_surface(s)
MAT=[s.mat('carapace'),s.mat('membrane'),s.mat('chitin')]
LOD=int(os.environ.get('CHARGER_LOD','0'))
# Equal plan contour across all tiers; density changes only around the section.
PROFILES=[ [(-1,0),(-.96,.20),(-.82,.54),(-.55,.83),(-.22,.99),(0,1.08),(.22,.99),(.55,.83),(.82,.54),(.96,.20),(1,0),(.83,-.68),(.42,-.94),(0,-1),(-.42,-.94),(-.83,-.68)],
 [(-1,0),(-.84,.55),(-.48,.87),(0,1.08),(.48,.87),(.84,.55),(1,0),(.64,-.85),(0,-1),(-.64,-.85)],
 [(-1,0),(-.55,.83),(0,1.08),(.55,.83),(1,0),(.50,-.91),(0,-1),(-.50,-.91)]]
# All sections x, center lateral y, z, half-width, roof height, ventral depth.
def rows_between(rows,sub=1):
 out=[]
 for a,b in zip(rows,rows[1:]):
  for j in range(sub):out.append(tuple(x+(y-x)*j/sub for x,y in zip(a,b)))
 return out+[rows[-1]]
def mesh(name,verts,faces,mats,group='fixed'):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
 for mat in MAT:me.materials.append(mat)
 for p,i in zip(me.polygons,mats):p.material_index=i;p.use_smooth=True
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob['anatomical_group']=group;ob['forge_bevel']=0;ob['forge_smooth']=70;ob['forge_uv_scale']=1;s.add(ob);return ob

def section(name,rows,group='fixed',topmat=0,bottommat=1,side=1,sub=1):
 rows=rows_between(rows,sub);prof=PROFILES[LOD];vs=[];fs=[];mi=[];n=len(prof)
 for x,y,z,w,ht,hb in rows:
  for u,v in prof:vs.append((x,side*(y+w*u),z+v*(ht if v>=0 else hb)))
 for i in range(len(rows)-1):
  for j in range(n):
   a=i*n+j;fs.append((a,i*n+(j+1)%n,(i+1)*n+(j+1)%n,a+n));mi.append(topmat if prof[j][1]>=0 and prof[(j+1)%n][1]>=0 else bottommat)
 fs += [tuple(reversed(range(n))),tuple((len(rows)-1)*n+j for j in range(n))];mi +=[bottommat,topmat]
 return mesh(name,vs,fs,mi,group)

# Continuous fixed muscular keel: a heavy forward sternum narrows into the rear.
section('CHARGER_fixed_keel',[(-9.7,0,-.20,.10,.12,.10),(-9.0,0,-.18,1.25,.35,.38),(-7.5,0,-.12,2.52,.60,.68),(-5.8,0,-.02,3.1,.85,.95),(-3.9,0,.0,3.3,1.10,1.12),(-2.2,0,.0,3.55,1.18,1.14),(-.6,0,.0,4.55,1.2,1.22),(.85,0,.0,5.2,1.20,1.28),(2.10,0,-.02,4.6,1.02,1.14),(2.8,0,-.06,3.35,.71,.88),(3.2,0,-.10,1.6,.25,.46),(3.32,0,-.12,.30,.08,.18)],topmat=1,bottommat=1,sub=1)
# Unified horseshoe pressure carapace. Across the midline and horn roots this is
# ONE closed surface, not a torso intersected with two rounded pills.
# x,y,z,half span, dorsal rise,ventral depth; authored half-centerline.
PATH=[(.2,0,.05,3.10,2.82,1.08),(.30,1.25,.055,3.14,2.90,1.10),(.60,2.70,.065,3.05,2.87,1.12),(1.25,4.18,.07,2.83,2.67,1.13),(2.27,5.42,.07,2.52,2.37,1.13),(3.60,6.02,.05,2.18,1.94,1.08),(4.97,6.10,.035,1.94,1.54,.96),(6.20,5.89,.02,1.63,1.17,.83),(7.34,5.49,0,1.30,.86,.66),(8.35,4.99,0,.99,.57,.48),(9.27,4.45,0,.66,.32,.31),(10.11,3.98,0,.36,.15,.17),(10.63,3.81,0,.16,.07,.09),(11,3.8,0,.006,.01,.01)]
# A deliberately asymmetric armor section: broad front bevel, hard growth ridge,
# long sloping posterior roof and an undercut ventral roll.
SHIELD_PROFILES=[ [(-1,0),(-.97,.14),(-.86,.50),(-.66,.82),(-.38,1.05),(-.20,1.08),(-.05,.91),(.28,.70),(.62,.40),(.89,.10),(1,0),(.84,-.64),(.45,-.9),(0,-1),(-.46,-.90),(-.83,-.61)],
[(-1,0),(-.86,.5),(-.38,1.05),(-.20,1.08),(.28,.70),(.70,.31),(1,0),(.64,-.83),(0,-1),(-.64,-.83)],
[(-1,0),(-.38,1.05),(-.2,1.08),(.42,.58),(1,0),(.5,-.90),(0,-1),(-.5,-.90)]]
prof=SHIELD_PROFILES[LOD];n=len(prof);vs=[];fs=[];mi=[]
# Travel from port tip through center to starboard tip. Midline is welded.
path=[(x,y,z,w,ht,hb) for x,y,z,w,ht,hb in reversed(PATH[1:])]+[(x,-y,z,w,ht,hb) for x,y,z,w,ht,hb in PATH]
for i,(x,y,z,w,ht,hb) in enumerate(path):
 prev=Vector(path[max(0,i-1)][:2]);nxt=Vector(path[min(len(path)-1,i+1)][:2]);t=(nxt-prev).normalized();cross=Vector((-t.y,t.x))
 for u,v in prof:
  xy=Vector((x,y))+cross*w*u;vs.append((min(11,xy.x),xy.y,z+v*(ht if v>=0 else hb)))
for i in range(len(path)-1):
 for j in range(n):
  a=i*n+j;fs.append((a,i*n+(j+1)%n,(i+1)*n+(j+1)%n,a+n))
  # White striking chitin wraps only the continuous distal section, never a badge.
  mi.append(2 if min(i,len(path)-2-i)<4 else (0 if prof[j][1]>=0 and prof[(j+1)%n][1]>=0 else 1))
fs +=[tuple(reversed(range(n))),tuple((len(path)-1)*n+j for j in range(n))];mi +=[2,2]
mesh('CHARGER_unified_ramming_carapace',vs,fs,mi)
for side,label in [(1,'PORT'),(-1,'STARBOARD')]:
 # Fixed lateral scutes carry the actual body footprint; taper is a swept rooted foot.
 section('CHARGER_stabilizer_support_'+label,[(-8.8,5.83,-.34,.035,.025,.035),(-8.15,5.73,-.30,.52,.13,.19),(-7.2,5.43,-.24,.93,.22,.29),(-6.1,4.98,-.18,1.18,.28,.38),(-5.0,4.31,-.13,1.27,.32,.47),(-4.0,3.46,-.08,1.08,.49,.55),(-3.35,2.74,-.02,.43,.38,.38)],side=side,sub=1)
 # Live .42rad folding inner vane stays above its fixed support, inset perimeter.
 section('CHARGER_folding_paddle_'+label,[(-8.18,5.48,.22,.035,.035,.035),(-7.5,5.22,.23,.42,.18,.08),(-6.63,4.89,.25,.61,.27,.10),(-5.62,4.46,.27,.70,.33,.12),(-4.75,3.93,.27,.62,.38,.13),(-4.10,3.48,.25,.30,.21,.10)],group='paddle_'+label,side=side,topmat=0,bottommat=0,sub=1)
# Three overlapping telescoping tergites: staggered as load-bearing armor, not badges.
# Underlying keel remains continuous and sole source of the physical footprint.
for name,rows in [('posterior',[(-9.38,0,.27,.09,.10,.10),(-8.94,0,.32,.94,.53,.12),(-8.06,0,.36,1.82,1.02,.13),(-7.15,0,.39,2.41,1.46,.15),(-6.72,0,.40,2.48,1.40,.13)]),('middle',[(-7.38,0,.42,2.18,1.36,.12),(-6.79,0,.43,2.63,1.66,.14),(-5.98,0,.44,2.94,1.87,.15),(-5.02,0,.44,3.04,1.98,.15),(-4.58,0,.43,2.96,1.83,.12)]),('anterior',[(-5.20,0,.43,2.84,1.78,.12),(-4.56,0,.45,3.08,2.13,.13),(-3.68,0,.45,3.10,2.39,.14),(-2.81,0,.44,3.02,2.36,.13),(-2.28,0,.42,2.58,2.02,.12)])]:
 section('CHARGER_telescoping_'+name,rows,group='abdomen',topmat=0,bottommat=0,sub=1)
# Small raised oral sill sits beneath the shield overhang, inside the open fork.
section('CHARGER_labrum',[ (2.6,0,-.62,1.28,.07,.10),(3.04,0,-.59,1.02,.07,.1),(3.35,0,-.57,.44,.06,.08)],topmat=1,bottommat=1)
# Attach authored moving regions at exact existing semantic pivots.
PIVOTS={'paddle_PORT':(-5.3,4.25,.25),'paddle_STARBOARD':(-5.3,-4.25,.25),'abdomen':(-2,0,.4)}
NAMES={'paddle_PORT':'MOTION_CHARGER_PADDLE_PORT','paddle_STARBOARD':'MOTION_CHARGER_PADDLE_STARBOARD','abdomen':'MOTION_CHARGER_ABDOMEN'}
for group,pivot in PIVOTS.items():
 node=E._root_empty(NAMES[group],{'anatomical_group':group});node.location=pivot
 for ob in list(s.objects):
  if ob.get('anatomical_group')==group:
   for v in ob.data.vertices:v.co-=Vector(pivot)
   ob.parent=node
for ob in s.objects:
 F.finish_object(ob)
 if ob.data.has_custom_normals:
  bpy.context.view_layer.objects.active=ob;bpy.ops.mesh.customdata_custom_splitnormals_clear()
 for edge in ob.data.edges:edge.use_edge_sharp=False
 for p in ob.data.polygons:p.use_smooth=True
E._rename_materials(s)
for name,p in {'SOCKET_BROOD_CONTACT_PORT':(11,3.8,0),'SOCKET_BROOD_CONTACT_STARBOARD':(11,-3.8,0),'SOCKET_BROOD_TETHER_DORSAL':(1.3,0,2.1),'SOCKET_BROOD_SIGNAL':(3.15,0,.78)}.items():
 node=E._root_empty(name,{'review_only':True});node.location=p
bpy.context.view_layer.update()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];pts=[o.matrix_world@v.co for o in meshes for v in o.data.vertices];lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)])
report={'candidate':OUT.name,'lod':LOD,'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),'meshCount':len(meshes),'boundsBlender':{'min':list(lo),'max':list(hi)},'decimation':False,'actualGameLookVerified':False,'physicsTuningChanged':False}
(OUT/f'lod{LOD}-study.json').write_text(json.dumps(report,indent=2));print(report)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'charger-LOD{LOD}-source.blend'))
E._export(list(bpy.context.scene.objects),str(OUT/f'charger-LOD{LOD}-source.glb'))
if os.environ.get('CHARGER_NO_RENDER'):sys.exit(0)
exec((R/'source/render_diagnostic.py').read_text(),globals())
