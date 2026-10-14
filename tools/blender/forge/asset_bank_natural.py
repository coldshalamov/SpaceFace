"""36 reusable geology, host-contact growth and ancient ceramic Forge assets, metres.
Regenerate with Blender: --python tools/blender/forge/asset_bank_natural.py -- --render.
Authoring-library candidates, no species/canon invention or runtime acceptance claim.
"""
import argparse,json,math,os,sys,bpy,bmesh
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
import forge as F
from asset_bank_export import export_asset,render_preview,render_glb_preview
ROOT=os.path.abspath(os.path.join(HERE,'../../..'));OUT=os.path.join(ROOT,'assets/models/asset-bank/natural')
GEO=['seam_bearing_quarried_parent_rock','matched_removable_wedge','stepped_fracture_shelf','bore_plug','bored_rock_collar','rock_bridge_span','cleaved_slab','rubble_berm','ice_pressure_ridge','split_ice_plate','crystal_fan','metallic_vein_rib']
GROW=['nerve_lace_corner','branching_nerve_mat','calcified_pipe_collar','ribbed_vent_lung','spore_chimney_stalk','short_tendril_bridge','arched_tendril_bridge','supported_cyst_nest','hull_leech_attachment_bed','root_anchor_pad','severed_tendril_stump','dead_crown']
ANCIENT=['threshold_jamb','threshold_lintel','shutter_vane','repair_face_tile','sealed_vault_seam','quarantine_pylon_foot','prism_instrument_mount','dormant_machine_rack','measuring_rail','boundary_vane','service_plinth','ossuary_spine_segment']
for key,role,rough,metal in [('tissue','geology',.82,0),('calcite','geology',.88,0),('ancient','ceramic',.76,0),('substrate','ceramic',.9,0),('ice','geology',.38,0),('vein','mechanical',.38,.85)]:F.FINISHES[key]=dict(role=role,rough=rough,metal=metal,tex=None)
COLORS={'stone':'#777369','stone.cut':'#9b9483','tissue':'#8e9690','calcite':'#bbb9a4','ancient':'#aaa58f','substrate':'#353f40','ice':'#8eaab1','vein':'#9b7750'}
def proxy(s,p,size):s.bank_boxes.append({'center':list(p),'size':list(size)})
def mesh(s,n,verts,faces,mat,bevel=.015):
 d=bpy.data.meshes.new(n);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(n,d);bpy.context.collection.objects.link(o);o.data.materials.append(s.mat(mat));o['forge_bevel']=bevel;return s.add(o)
def slab(s,n,outline,z,h,mat='stone',coll=False):
 o=F.plate(s,n,outline,z,h,material=mat,chamfer=.025,bevel=.012)
 if coll:
  xs=[p[0] for p in outline];ys=[p[1] for p in outline];proxy(s,((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,z+h/2),((max(xs)-min(xs))*.8,(max(ys)-min(ys))*.8,h))
 return o
def rect(s,n,p,size,mat='ancient',collision=True):
 o=F.box(s,n,p,size,mat,bevel=.04)
 if collision:proxy(s,p,size)
 return o
def stem(s,n,path,r=.15,mat='tissue',end=.045):
 # Smooth tapered tube with continuously transported frame, no segment caps or frame flips.
 points=[Vector(p) for p in path];curve=[]
 for i in range(len(points)-1):
  p0=points[max(0,i-1)];p1=points[i];p2=points[i+1];p3=points[min(len(points)-1,i+2)]
  for step in range(5):
   t=step/5;curve.append(.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
 curve.append(points[-1]);verts=[];faces=[];sides=10;previous_u=None
 for i,p in enumerate(curve):
  tangent=(curve[min(i+1,len(curve)-1)]-curve[max(0,i-1)]).normalized();ref=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))
  u=tangent.cross(ref).normalized() if previous_u is None else (previous_u-tangent*previous_u.dot(tangent)).normalized();previous_u=u;v=tangent.cross(u).normalized();rad=r+(end-r)*i/(len(curve)-1)
  for j in range(sides):
   a=j*2*math.pi/sides;verts.append(tuple(p+rad*(math.cos(a)*u+math.sin(a)*v)))
 for i in range(len(curve)-1):
  for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
 faces.extend([tuple(reversed(range(sides))),tuple((len(curve)-1)*sides+j for j in range(sides))]);obj=mesh(s,n,verts,faces,mat,0)
 for poly in obj.data.polygons:poly.use_smooth=True
 return obj
def foot(s,p=(0,0,0),r=1,mat='calcite'):
 return slab(s,'contact_foot',[(p[0]+r*math.cos(i*math.pi/5)*(1+.09*math.cos(i*3)),p[1]+r*math.sin(i*math.pi/5)) for i in range(10)],p[2],.18,mat,True)
def sockets(s,a,b):s.socket('SOCKET_A',a,(-1,0,0));s.socket('SOCKET_B',b,(1,0,0))
def sector(s,n,inner,outer,z,h,mat='stone',count=18):
 obj=F.annulus(s,n,(0,0),inner,outer,z,h,mat,segments=count)
 for i in range(count):
  a=2*math.pi*i/count;r=(inner+outer)/2;w=(outer-inner)*.7;proxy(s,(r*math.cos(a),r*math.sin(a),z+h/2),(w,w,h))
 return obj
def geo(s,k):
 if k in GEO[:2]:
  parent=k==GEO[0];obj=F.rock(s,'quarried_parent' if parent else 'removed_wedge',(0,0,1.3),2.05,41,material='stone',subdiv=3,relief=.38,terrace=.7)
  bm=bmesh.new();bm.from_mesh(obj.data);cut=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=Vector((.9,0,0)),plane_no=Vector((1,0,0)),clear_outer=parent,clear_inner=not parent)
  edges=[e for e in cut['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary];filled=bmesh.ops.holes_fill(bm,edges=edges,sides=0);obj.data.materials.append(s.mat('stone.cut'))
  for face in filled['faces']:face.material_index=1
  bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free();proxy(s,(-.1 if parent else 1.25,0,1.3),(1.6 if parent else .5,1.8,2))
  for j in range(3):
   z=.7+j*.5;x=.902 if parent else .898;stem(s,'exposed_seam',[(x,-.85,z),(x,-.2,z+.08),(x,.35,z-.04),(x,.85,z+.05)],.012,'vein',.012)
  s.socket('SOCKET_MATCHED_CUT',(.9,0,1.3),(1 if parent else -1,0,0))
 elif k=='stepped_fracture_shelf':
  for i in range(4):
   x=-2+i*.7;slab(s,'cleavage_terrace',[(x,-1.2),(x+.35,-1.6),(1.2,-1.45),(2.2,-1.1),(2.05,-.3),(2.4,.45),(1.6,1.4),(.55,1.3),(x+.25,1.65),(x-.25,.7)],i*.3,.34,'stone.cut' if i%2 else 'stone',True)
 elif k=='bore_plug':
  F.cylinder(s,'core_sample',(0,0,0),(0,0,2.4),.83,.83,'stone',segments=18);proxy(s,(0,0,1.2),(1.2,1.2,2.4))
  for z in (.4,1.1,1.8):F.ring(s,'core_stratum',(0,0,z),.84,.025,axis=(0,0,1),material='vein',segments=18,sides=4)
  s.socket('SOCKET_BORE',(0,0,0),(0,0,-1))
 elif k=='bored_rock_collar':
  obj=sector(s,'open_cored_stone',.9,2,0,1.4,'stone',24)
  for v in obj.data.vertices:
   if math.hypot(v.co.x,v.co.y)>1.5:
    a=math.atan2(v.co.y,v.co.x);f=1+.1*math.sin(a*5)+.07*math.cos(a*7);v.co.x*=f;v.co.y*=f
    if v.co.z>1:v.co.z+=.15*math.sin(a*3)
  s.socket('SOCKET_BORE',(0,0,0),(0,0,-1))
 elif k=='rock_bridge_span':
  for i,x in enumerate((-2,2)):
   obj=F.rock(s,'fractured_abutment',(x,0,.8),1.3,71+i,subdiv=3,terrace=.85,relief=.28)
   for v in obj.data.vertices:v.co.x=x+(v.co.x-x)*.7;v.co.z=.8+(v.co.z-.8)*1.2
   proxy(s,(x,0,.8),(1.2,1.5,1.8))
  slab(s,'cleaved_bridge',[(-2.7,-.5),(-2,-1),(-.7,-.8),(.3,-1),(1.9,-.8),(2.7,-.4),(2.45,.6),(1.3,1.1),(-.2,.8),(-1.7,1.15),(-2.6,.6)],1.75,.62,'stone.cut',True);sockets(s,(-2.6,0,2.05),(2.6,0,2.05))
 elif k=='cleaved_slab':
  edge=[(-2,-1.3),(-.8,-1.6),(1.7,-1.25),(2.25,-.2),(1.2,-.12),(.3,-.38),(-.6,-.13),(-2.1,-.25)]
  for side in (-1,1):
   outline=[(x,y*side) for x,y in edge]
   if side<0:outline.reverse()
   slab(s,'split_half',outline,0,.55,'stone.cut',True)
 elif k=='rubble_berm':
  for i in range(7):
   x=-2.4+i*.8;y=.22*math.sin(i*3);F.rock(s,'interlocked_rubble',(x,y,.45),.7,23+i,subdiv=2,terrace=.8);proxy(s,(x,y,.45),(.75,.8,.75))
 elif k=='ice_pressure_ridge':
  for i in range(6):
   x=-2.3+i*.8;h=1.1+i%2*.4;mesh(s,'compression_tooth',[(x-.55,-.8,0),(x+.6,-.8,0),(x+.6,.8,0),(x-.55,.8,0),(x+.2,-.5,h),(x+.2,.6,h)],[(0,3,2,1),(0,1,4),(1,2,5,4),(2,3,5),(3,0,4,5)],'ice');proxy(s,(x,0,.4),(.6,1.2,.7))
 elif k=='split_ice_plate':
  for side in (-1,1):
   pts=[(-2,side*.15),(-1,side*.35),(0,side*.16),(1,side*.42),(2,side*.2),(2.1,side*1.7),(-1.8,side*1.6)]
   if side<0:pts.reverse()
   slab(s,'tension_split',pts,0,.55,'ice',True)
 elif k=='crystal_fan':
  foot(s,r=1.3,mat='stone')
  for i in range(7):
   a=-.9+i*.3;p=(math.sin(a)*2,.22*math.cos(i*2),1.5+math.cos(a));F.cylinder(s,'prismatic_crystal',(0,0,.15),p,.28,.015,'ice',segments=6,bevel=.006)
 elif k=='metallic_vein_rib':
  slab(s,'mineral_host',[(-2,-.65),(1.7,-.8),(2.2,.4),(-1.8,.85)],0,.7,'stone',True)
  for j in range(3):F.sweep(s,'exposed_vein',[(-2,j*.25-.25,.7),(-.6,j*.25-.35,.92),(.3,j*.25-.1,.77),(2,j*.25-.15,.8)],.1,.13,'vein')
 s.socket('SOCKET_CONTACT',(0,0,0),(0,0,-1))
def growth(s,k):
 if k in ('nerve_lace_corner','branching_nerve_mat'):
  foot(s,(-1.5,0,0),.55);stem(s,'main_nerve',[(-1.5,0,.18),(-.4,0,.3),(1,0,.24),(2.1,.2,.18)],.2)
  for i in range(5):
   x=-1.1+i*.65;dy=(-1 if i%2 else 1)*(1+i*.1);h=.25 if k=='branching_nerve_mat' else .25+abs(dy)*.55;stem(s,'nerve_branch',[(x,0,.25),(x+.2,dy*.5,h),(x+.6,dy,h)],.105);stem(s,'side_filament',[(x+.2,dy*.5,h),(x-.25,dy*.85,h)],.07)
  sockets(s,(-1.5,0,.2),(2.1,.2,.18))
 elif k=='calcified_pipe_collar':
  sector(s,'hollow_calcified_collar',.85,1.23,0,1,'calcite',24)
  for i in range(9):
   a=i*2*math.pi/9;stem(s,'attachment_root',[(math.cos(a)*1.1,math.sin(a)*1.1,.55),(math.cos(a)*1.5,math.sin(a)*1.5,.12),(math.cos(a)*1.9,math.sin(a)*1.9,.07)],.15)
  s.socket('SOCKET_PIPE',(0,0,0),(0,0,-1))
 elif k=='ribbed_vent_lung':
  foot(s,r=1.55);stem(s,'vent_spine',[(-1.6,0,.25),(0,0,.65),(1.6,0,.25)],.28)
  for i in range(9):
   x=-1.3+i*.325;w=1.3*math.sqrt(max(.1,1-(x/1.7)**2));stem(s,'vent_rib',[(x,-w,.2),(x,-w*.7,.75),(x,0,1),(x,w*.7,.75),(x,w,.2)],.11,'calcite',.11)
 elif k=='spore_chimney_stalk':
  foot(s,r=1);stem(s,'stalk_support',[(0,0,.1),(.2,0,1),(-.1,0,2)],.4,'tissue',.3);F.annulus(s,'open_chimney_lip',(-.1,0),.29,.58,2,.55,'calcite',segments=24)
  for i in range(7):
   a=i*math.pi*2/7;stem(s,'stalk_root',[(.25*math.cos(a),.25*math.sin(a),1),(.8*math.cos(a),.8*math.sin(a),.15)],.12)
  proxy(s,(0,0,1),(.5,.5,2))
 elif k in ('short_tendril_bridge','arched_tendril_bridge'):
  h=.35 if k.startswith('short') else 1.6
  for x in (-2,2):foot(s,(x,0,0),.65)
  for y in (-.25,.25):stem(s,'load_tendril',[(-2,y,.15),(-1.3,y,h),(0,y,h+.2),(1.3,y,h),(2,y,.15)],.22,'tissue',.22)
  for x,z in [(-1.3,h),(0,h+.2),(1.3,h)]:stem(s,'cross_lace',[(x,-.25,z),(x,.25,z)],.075,'calcite',.075)
  sockets(s,(-2,0,0),(2,0,0))
 elif k=='supported_cyst_nest':
  foot(s,r=1.5)
  for x,y,r in [(-.55,-.35,.58),(.5,-.3,.65),(0,.65,.48)]:
   F.sphere(s,'seated_cyst',(x,y,r*.7+.17),r,'tissue',segments=18)
   for a in (0,2.1,4.2):stem(s,'cyst_sling',[(x+math.cos(a)*r,y+math.sin(a)*r,.18),(x+math.cos(a)*r*.75,y+math.sin(a)*r*.75,.7),(x,y,1)],.08,'calcite')
 elif k=='hull_leech_attachment_bed':
  for x in (-1.3,0,1.3):foot(s,(x,0,0),.8)
  stem(s,'attachment_spine',[(-2,0,.25),(0,0,.55),(2,0,.25)],.32)
  for i in range(7):
   x=-1.5+i*.5
   for sign in (-1,1):stem(s,'clasp_root',[(x,0,.5),(x+.15,sign*.65,.4),(x+.3,sign*1,.13)],.15)
 elif k=='root_anchor_pad':
  foot(s,r=1.2)
  for i in range(9):
   a=i*math.pi*2/9;stem(s,'radial_root',[(0,0,.45),(.8*math.cos(a),.8*math.sin(a),.2),(1.9*math.cos(a),1.9*math.sin(a),.08)],.2)
  s.socket('SOCKET_STALK',(0,0,.5),(0,0,1))
 elif k=='severed_tendril_stump':
  foot(s,r=.9);sector(s,'severed_wall',.3,.6,.18,1.2,'tissue',18)
  for i in range(7):
   a=i*math.pi*2/7;stem(s,'torn_fibre',[(.5*math.cos(a),.5*math.sin(a),1.2),(.55*math.cos(a),.55*math.sin(a),1.5+.13*math.sin(i))],.08,'calcite')
 elif k=='dead_crown':
  foot(s,r=.7)
  for i in range(7):
   a=i*math.pi*2/7;stem(s,'desiccated_branch',[(0,0,.2),(.6*math.cos(a),.6*math.sin(a),1),(1.4*math.cos(a),1.4*math.sin(a),.85),(1.8*math.cos(a),1.8*math.sin(a),.45)],.14,'calcite')
 s.socket('SOCKET_HOST_CONTACT',(0,0,0),(0,0,-1))
def ancient(s,k):
 if k=='threshold_jamb':
  rect(s,'jamb_back',(0,0,1.8),(.5,1.1,3.6));rect(s,'rebate',(.32,.35,1.8),(.24,.4,3.6),'substrate');rect(s,'foot',(0,0,.15),(1,1.5,.3));s.socket('SOCKET_LINTEL',(0,0,3.6),(0,0,1))
 elif k=='threshold_lintel':
  rect(s,'lintel',(0,0,0),(5,1,.5));rect(s,'rebated_seal',(0,.38,-.29),(4.5,.2,.12),'substrate')
  for x in (-2.2,2.2):rect(s,'tenon',(x,0,-.4),(.5,.7,.3));s.socket('SOCKET_JAMB_'+str(x),(x,0,-.55),(0,0,-1))
 elif k=='shutter_vane':
  slab(s,'tapered_vane',[(-2,-.8),(2,-.45),(2,.2),(-2,.65)],0,.22,'ancient',True);rect(s,'hinge_spine',(-1.8,0,-.15),(.3,1.4,.25),'substrate');s.socket('SOCKET_HINGE',(-1.8,0,0),(0,1,0))
 elif k=='repair_face_tile':
  slab(s,'patch_face',[(-1,-.8),(.7,-.8),(1,-.45),(1,.8),(-1,.8)],.1,.16,'ancient',True);rect(s,'lower_lap',(0,0,.04),(2.15,1.75,.1),'substrate')
  for x in (-.72,.72):rect(s,'locking_key',(x,0,.28),(.09,1.1,.04),'vein',False)
 elif k=='sealed_vault_seam':
  for x in (-.65,.65):rect(s,'vault_leaf',(x,0,0),(1.2,2.6,.4))
  rect(s,'seam_seal',(0,0,-.04),(.08,2.6,.24),'substrate')
  for y in (-.9,.9):rect(s,'seal_clamp',(0,y,.28),(.8,.2,.17),'vein')
 elif k=='quarantine_pylon_foot':
  slab(s,'splayed_foot',[(-1.2,-1),(.9,-1),(1.3,0),(.9,1),(-1.2,1)],0,.35,'ancient',True)
  for y in (-.55,.55):rect(s,'socket_cheek',(0,y,.8),(1.3,.25,1.15))
  rect(s,'socket_bottom',(0,0,.4),(1.3,1.2,.18),'substrate');s.socket('SOCKET_PYLON',(0,0,.55),(0,0,1))
 elif k=='prism_instrument_mount':
  foot(s,r=1.1,mat='ancient')
  for y in (-.62,.62):rect(s,'prism_saddle',(0,y,.7),(1.4,.22,1.1),'substrate')
  F.cylinder(s,'seated_prism',(-.65,0,.85),(.65,0,.85),.47,.47,'ice',segments=6,bevel=.012);s.socket('SOCKET_INSTRUMENT',(0,0,.9),(1,0,0))
 elif k=='dormant_machine_rack':
  rect(s,'rack_base',(0,0,.15),(3,1.7,.3),'substrate')
  for x in (-1.35,1.35):rect(s,'rack_cheek',(x,0,1.2),(.28,1.7,2.2))
  for z in (.65,1.35,2.05):rect(s,'shelf',(0,0,z),(2.7,1.5,.16))
  rect(s,'back_rail',(0,.7,1.2),(2.7,.12,2),'substrate')
 elif k=='measuring_rail':
  rect(s,'rail_back',(0,0,.13),(5,.65,.26),'substrate')
  for y in (-.27,.27):rect(s,'guide_edge',(0,y,.34),(5,.14,.25))
  for i in range(13):rect(s,'index_notch',(-2.25+i*.375,0,.285),(.045,.2 if i%3 else .35,.025),'vein',False)
  sockets(s,(-2.5,0,.2),(2.5,0,.2))
 elif k=='boundary_vane':
  rect(s,'foot',(0,0,.15),(1.5,1.2,.3),'substrate');F.plate_v(s,'boundary_blade',[(-.5,.2),(.5,.2),(.3,3.2),(-.2,3.6)],-.12,.24,'xz','ancient',chamfer=.035);proxy(s,(0,0,1.7),(.5,.24,2.8));rect(s,'inset_line',(.02,-.135,1.8),(.045,.035,2.3),'vein',False)
 elif k=='service_plinth':
  rect(s,'base',(0,0,.15),(2.5,1.9,.3),'substrate');rect(s,'pedestal',(0,0,.6),(1.5,1.3,.7));rect(s,'service_top',(0,0,1.05),(2.4,1.8,.2))
  for x in (-.7,.7):rect(s,'receiver_slot',(x,0,1.16),(.16,1.1,.03),'substrate',False)
  s.socket('SOCKET_SERVICE',(0,0,1.15),(0,0,1))
 elif k=='ossuary_spine_segment':
  rect(s,'spine',(0,0,.3),(3,.55,.6),'substrate')
  for i in range(5):
   x=-1.2+i*.6
   for sign in (-1,1):F.plate(s,'splayed_ceramic_rib',[(x-.16,sign*.15),(x+.16,sign*.15),(x+.28,sign*1.15),(x-.2,sign*1.35)][::sign],.3,.22,'ancient',chamfer=.035)
  sockets(s,(-1.5,0,.3),(1.5,0,.3))
 s.socket('SOCKET_MOUNT',(0,0,0),(0,0,-1))
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--only');parser.add_argument('--render',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);requested=set(args.only.split(',')) if args.only else None;rows=[]
 for cat,names,build in [('geology',GEO,geo),('growth',GROW,growth),('ancient',ANCIENT,ancient)]:
  for k in names:
   if requested and k not in requested:continue
   F.reset_scene();s=F.Ship(k,COLORS);s.bank_boxes=[];s.bank_source='tools/blender/forge/asset_bank_natural.py';build(s,k);out=os.path.join(OUT,k)
   row=export_asset(s,out,k,cat,k.replace('_',' ')+'; reusable '+cat+' assembly in metres',s.bank_boxes,tags=[cat,'modular','authoring-candidate']);rows.append(row)
   if args.render:
    preview=os.path.join(ROOT,'.devshots/asset-bank-natural');os.makedirs(preview,exist_ok=True);render_preview(s,os.path.join(preview,k+'_source.png'),width=600,height=450,samples=32);render_glb_preview(os.path.join(out,k+'_lod0.glb'),os.path.join(preview,k+'_export.png'),width=600,height=450,samples=32)
   print('BANK_DONE '+k,flush=True)
 if not requested:
  p=os.path.join(ROOT,'design/asset-bank/natural.json');doc=json.load(open(p));doc['assets']=[{'assetId':r['assetId'],'category':r['category'],'manifest':'assets/models/asset-bank/natural/'+r['assetId']+'/'+r['assetId']+'.json'} for r in rows]
  with open(p,'w') as f:json.dump(doc,f,indent=2);f.write('\n')
if __name__=='__main__':main()
