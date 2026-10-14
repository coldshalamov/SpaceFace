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
COLORS={'stone':'#625b4f','stone.cut':'#7c7363','stone.strata':'#423c35','tissue':'#8e9690','tissue.fold':'#52676a','tissue.mature':'#778a81','tissue.young':'#a0a58b','calcite':'#bbb9a4','ancient':'#96917f','substrate':'#353f40','ice':'#8eaab1','ice.fracture':'#b1c1bf','ice.deep':'#557b87','vein':'#9b7750'}
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
 curve.append(points[-1]);verts=[];faces=[];sides=16;previous_u=None
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
def foot(s,p=(0,0,0),r=1,mat='calcite',height_scale=1):
 if mat not in ('calcite','tissue'):
  return slab(s,'contact_foot',[(p[0]+r*math.cos(i*math.pi/5)*(1+.09*math.cos(i*3)),p[1]+r*math.sin(i*math.pi/5)) for i in range(10)],p[2],.18,mat,True)
 # Scalloped basal lamina with folded radial roots, not a flat polygonal token.
 count=40;verts=[];faces=[]
 for radius,z in [(r*.96,0),(r,.07),(r*.58,.21),(r*.07,.24)]:
  for i in range(count):
   a=i*2*math.pi/count;scallop=1+.1*math.cos(a*7)+.035*math.sin(a*11)
   verts.append((p[0]+radius*math.cos(a)*scallop,p[1]+radius*math.sin(a)*scallop,p[2]+height_scale*(z+.025*math.cos(a*7)*(z/.24))))
 for ring in range(3):
  for i in range(count):faces.append((ring*count+i,ring*count+(i+1)%count,(ring+1)*count+(i+1)%count,(ring+1)*count+i))
 faces.extend([tuple(reversed(range(count))),tuple(3*count+i for i in range(count))]);obj=mesh(s,'folded_contact_lamina',verts,faces,mat,0);proxy(s,(p[0],p[1],p[2]+.06*height_scale),(r*1.2,r*1.2,.12*height_scale))
 for i in range(7):
  a=i*2*math.pi/7;stem(s,'root_fold',[(p[0]+r*.2*math.cos(a),p[1]+r*.2*math.sin(a),p[2]+.23*height_scale),(p[0]+r*.6*math.cos(a),p[1]+r*.6*math.sin(a),p[2]+.2*height_scale),(p[0]+r*.98*math.cos(a),p[1]+r*.98*math.sin(a),p[2]+.065*height_scale)],r*.026,'tissue',r*.008)
 return obj

def lamina(s,n,base,angle,radius,mat='tissue'):
 # Thick scalloped lamina, derived from the established Borrowed Voice contact anatomy.
 u=Vector((math.cos(angle),math.sin(angle),0));v=Vector((-u.y,u.x,0));origin=Vector(base);cols=25;rows=5;verts=[];faces=[]
 for skin in (0,1):
  for row in range(rows):
   t=.04+.96*row/(rows-1)
   for col in range(cols):
    theta=-1.15+2.3*col/(cols-1);r=radius*t*(1-.045*(1+math.cos(theta*14))*t**4);p=origin+u*r*math.cos(theta)+v*r*math.sin(theta);p.z+=radius*(.13*t+.2*math.sin(math.pi*t)+.025*math.cos(theta*7)*t)-skin*.045;verts.append(tuple(p))
 layer=cols*rows
 for skin in (0,1):
  for row in range(rows-1):
   for col in range(cols-1):
    o=skin*layer+row*cols+col;q=(o,o+1,o+cols+1,o+cols);faces.append(q if skin==0 else tuple(reversed(q)))
 perimeter=list(range(cols))+[r*cols+cols-1 for r in range(1,rows)]+list(range(layer-2,layer-cols-1,-1))+[r*cols for r in range(rows-2,0,-1)]
 for a,b in zip(perimeter,perimeter[1:]+perimeter[:1]):faces.append((a,a+layer,b+layer,b))
 return mesh(s,n,verts,faces,mat,0)

def cyst_shell(s,name,center,length,width,height,yaw=0):
 """Asymmetric thick overlapping skin, split mature shell and branched root anchorage."""
 center=Vector(center);u=Vector((math.cos(yaw),math.sin(yaw),0));v=Vector((-u.y,u.x,0))
 def point(t,theta,inset=0):
  profile=max(.01,math.sin(math.pi*t))**.7
  w=width*profile*(1+.11*math.sin(t*math.pi*1.4));h=height*profile*(1+.09*math.cos(theta*2+t*2.3))
  return center+u*(length*(t-.5))+v*((w-inset)*math.cos(theta))+Vector((0,0,(h-inset)*math.sin(theta)+.08*math.sin(t*math.pi*2)))
 stem(s,name+'_living_core',[tuple(center-u*length*.52),tuple(center+Vector((0,0,height*.35))),tuple(center+u*length*.45)],width*.48,'tissue.fold',width*.25)
 intervals=[(.025,.22),(.16,.37),(.30,.53),(.46,.68),(.61,.82),(.76,.94),(.88,.985)] if length>2 else ([(.03,.34),(.23,.57),(.47,.78),(.70,.97)] if length>1.2 else [(.025,.43),(.30,.73),(.62,.98)])
 for index,(ta,tb) in enumerate(intervals):
  patches=[(.09,math.pi-.11)]
  if length>2 and index in (3,4):patches=[(.12,1.05 if index==3 else 1.19),(1.74 if index==3 else 1.65,math.pi-.13)]
  for patch,(theta0,theta1) in enumerate(patches):
   rows=7;cols=19;verts=[];faces=[]
   def rim_t(theta):return min(.985,tb+.025*math.sin(theta*3+index*.8)+.014*math.cos(theta*7+index))
   for skin in (0,1):
    for row in range(rows):
     q=row/(rows-1)
     for col in range(cols):
      theta=theta0+(theta1-theta0)*col/(cols-1);t=ta+(rim_t(theta)-ta)*q;p=point(t,theta,skin*.045)
      p.z+=.085*math.sin(theta)*(1+.3*math.cos(theta*3))*q**3
      verts.append(tuple(p))
   layer=rows*cols
   for skin in (0,1):
    for row in range(rows-1):
     for col in range(cols-1):
      o=skin*layer+row*cols+col;q=(o,o+1,o+cols+1,o+cols);faces.append(q if skin==0 else tuple(reversed(q)))
   perimeter=list(range(cols))+[r*cols+cols-1 for r in range(1,rows)]+list(range(layer-2,layer-cols-1,-1))+[r*cols for r in range(rows-2,0,-1)]
   for a,b in zip(perimeter,perimeter[1:]+perimeter[:1]):faces.append((a,a+layer,b+layer,b))
   mat=['tissue','tissue.mature','tissue','tissue.young'][index%4]
   obj=mesh(s,name+'_split_skin_'+str(index)+'_'+str(patch),verts,faces,mat,0)
   for poly in obj.data.polygons:poly.use_smooth=True
   s.detail=1
   edge=[]
   for j in range(13):
    theta=theta0+(theta1-theta0)*j/12;p=point(rim_t(theta),theta);p.z+=.085*math.sin(theta)*(1+.3*math.cos(theta*3));edge.append(tuple(p))
   stem(s,name+'_irregular_growth_rim',edge,.022,'calcite',.016);s.detail=0
 # Roots enter beneath the skin at broad necks, then fork into separate ground contacts.
 for sign in (-1,1):
  neck=center+u*(sign*length*.40);fork=center+u*(sign*length*.56)+Vector((0,0,-.1))
  stem(s,name+'_root_neck',[tuple(neck),tuple((neck+fork)*.5+v*(.07*sign)+Vector((0,0,.035))),tuple(fork)],width*.25,'tissue.mature',width*.14)
  for spread in (-1,0,1):
   end=fork+u*(sign*(.24+.16*(spread==0)+.08*(spread==1)))+v*(spread*width*(.65 if sign<0 else .85));end.z=.06
   mid=(fork+end)*.5+v*(spread*.06);mid.z=.14
   stem(s,name+'_branching_anchor',[tuple(fork),tuple(mid),tuple(end)],width*.13,'tissue.fold',.025)
   lamina(s,name+'_root_contact',tuple(end),yaw+(0 if sign>0 else math.pi)+spread*.6,width*.34,'tissue.mature')

def sockets(s,a,b):s.socket('SOCKET_A',a,(-1,0,0));s.socket('SOCKET_B',b,(1,0,0))
def sector(s,n,inner,outer,z,h,mat='stone',count=18):
 obj=F.annulus(s,n,(0,0),inner,outer,z,h,mat,segments=count)
 for i in range(count):
  a=2*math.pi*i/count;r=(inner+outer)/2;w=(outer-inner)*.7;proxy(s,(r*math.cos(a),r*math.sin(a),z+h/2),(w,w,h))
 return obj
def geo(s,k):
 if k in GEO[:2]:
  parent=k==GEO[0];obj=F.rock(s,'quarried_parent' if parent else 'removed_wedge',(0,0,1.3),2.05,41,material='stone',subdiv=4,relief=.34,terrace=.3)
  bm=bmesh.new();bm.from_mesh(obj.data);cut=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=Vector((.9,0,0)),plane_no=Vector((1,0,0)),clear_outer=parent,clear_inner=not parent)
  edges=[e for e in cut['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary];filled=bmesh.ops.holes_fill(bm,edges=edges,sides=0);obj.data.materials.append(s.mat('stone.cut'))
  for face in filled['faces']:face.material_index=1
  bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free();proxy(s,(-.1 if parent else 1.25,0,1.3),(1.6 if parent else .5,1.8,2))
  # Geological strata share the established belt-rock grammar; no applied copper-wire decoration.
  F.band(s,obj.name,(0,0,.65),(.14,.08,1),.20,'stone.strata')
  F.band(s,obj.name,(0,0,1.8),(-.12,.06,1),.13,'stone.strata')
  F.band(s,obj.name,(0,0,1.23),(.05,-.13,1),.035,'vein')
  s.socket('SOCKET_MATCHED_CUT',(.9,0,1.3),(1 if parent else -1,0,0))
 elif k=='stepped_fracture_shelf':
  for i in range(4):
   x=-2+i*.7;slab(s,'cleavage_terrace',[(x,-1.2),(x+.35,-1.6),(1.2,-1.45),(2.2,-1.1),(2.05,-.3),(2.4,.45),(1.6,1.4),(.55,1.3),(x+.25,1.65),(x-.25,.7)],i*.3,.34,'stone.cut' if i%2 else 'stone',True)
 elif k=='bore_plug':
  obj=F.cylinder(s,'core_sample',(0,0,0),(0,0,2.4),.83,.83,'stone',segments=32);proxy(s,(0,0,1.2),(1.2,1.2,2.4))
  for z in (.4,1.1,1.8):F.band(s,obj.name,(0,0,z),(.08,.15,1),.13,'stone.strata')
  F.band(s,obj.name,(0,0,1.55),(-.1,.1,1),.025,'vein')
  s.socket('SOCKET_BORE',(0,0,0),(0,0,-1))
 elif k=='bored_rock_collar':
  # Actual fractured boulder, cored through its irregular surface: no flat annular tabletop.
  obj=F.rock(s,'fractured_cored_mass',(0,0,.7),2.05,127,subdiv=4,relief=.34,terrace=.38)
  for v in obj.data.vertices:v.co.z=.7+(v.co.z-.7)*.64
  bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.90,depth=8,location=(0,0,.7));cutter=bpy.context.object
  # A drilled core subsequently spalled along mineral cleavage: broad chipped sectors, no perfect lip.
  for vertex in cutter.data.vertices:
   a=math.atan2(vertex.co.y,vertex.co.x);r=.90+.018*math.sin(a*9)+.095*max(0,math.cos(a*3+.5))**6
   vertex.co.x=r*math.cos(a);vertex.co.y=r*math.sin(a)
  bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('ActualCoreBore','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
  F.band(s,obj.name,(0,0,.35),(.17,-.11,1),.16,'stone.strata');F.band(s,obj.name,(0,0,1.07),(-.13,.06,1),.085,'stone.strata')
  # Exposed bore faces are fresh fracture/cut stone; avoid a painted black hoop inside the bore.
  obj.data.materials.append(s.mat('stone.cut'));cut_slot=len(obj.data.materials)-1
  for poly in obj.data.polygons:
   if math.hypot(poly.center.x,poly.center.y)<1.08:poly.material_index=cut_slot
  for i,(a,z,r) in enumerate([(0,.3,.45),(1.05,.7,.36),(2.1,.4,.5),(3.45,.8,.31),(4.5,.25,.4),(5.3,.55,.35)]):
   x=1.55*math.cos(a);y=1.55*math.sin(a);ledge=F.rock(s,'cleaved_outer_ledge',(x,y,z),r,170+i,subdiv=3,relief=.2,quarry_plane=((x,y,z+r*.2),(.14,-.08,1)),quarry_material='stone.cut')
  for i in range(16):
   a=i*math.pi/8;proxy(s,(1.32*math.cos(a),1.32*math.sin(a),.7),(.35,.35,1))
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
  # Compression fault: irregular fractured plates overlap grounded ice rubble.
  from mathutils import Matrix
  for i,(x,y,sx,sy) in enumerate([(-1.8,-.15,1.2,.8),(-.25,.2,1.25,.92),(1.5,.1,1.4,.85)]):
   obj=F.rock(s,'fractured_fault_bed',(0,0,0),1,410+i,material='ice.deep',subdiv=3,relief=.32,terrace=.45)
   for v in obj.data.vertices:v.co=Vector((x+v.co.x*sx,y+v.co.y*sy,.14+v.co.z*.19))
   proxy(s,(x,y,.15),(sx*1.2,sy*1.2,.25))
  # Several differently tilted thin sheets meet along the pressure fault; no dominant upright boulder.
  sheets=[(-2.05,.02,.39,.65,.65,-.72,-.18,.085),
          (-1.02,-.12,.58,.8,.67,.82,.30,.11),
          (-.60,.22,.48,.74,.78,-.56,-.35,.075),
          (.03,-.08,.70,.75,.70,.93,.16,.13),
          (.68,.12,.52,.78,.71,-.70,.43,.085),
          (.98,.13,.51,.7,.69,.71,-.25,.10),
          (2.03,.18,.32,.60,.57,-.44,.18,.07)]
  for i,(x,y,z,sx,sy,tilt,yaw,thickness) in enumerate(sheets):
   obj=F.rock(s,'overlapping_pressure_sheet_'+str(i),(0,0,0),1,460+i,material='ice.fracture' if i in (1,4,6) else 'ice',subdiv=3,relief=.30,terrace=.45)
   # Cleavage planes remove broad circular shoulders and expose angular broken sheet edges.
   bm=bmesh.new();bm.from_mesh(obj.data)
   for point,normal in [((.57 if i%2 else .72,0,0),(1,.35*(-1 if i%3 else 1),0)),((0,-.60 if i%2 else .65,0),(-.25,-1 if i%2 else 1,0))]:
    cut=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=Vector(point),plane_no=Vector(normal),clear_outer=True)
    edges=[e for e in cut['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
    if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
   bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free()
   rot=Matrix.Rotation(yaw+(.23 if i%2 else -.15),3,'Z')@Matrix.Rotation(tilt,3,'X')
   for v in obj.data.vertices:v.co=Vector((x,y,z))+rot@Vector((v.co.x*sx,v.co.y*sy,v.co.z*thickness))
  for i,(x,y,z,sx,sy,tilt) in enumerate([(-1.05,-.15,.3,.52,.35,.28),(.38,.15,.32,.42,.48,-.4),(1.65,.15,.21,.46,.30,.15)]):
   obj=F.rock(s,'buried_secondary_shear',(0,0,0),1,480+i,material='ice',subdiv=3,relief=.3,terrace=.6)
   rot=Matrix.Rotation(tilt,3,'X')
   for v in obj.data.vertices:v.co=Vector((x,y,z))+rot@Vector((v.co.x*sx,v.co.y*sy,v.co.z*.1))
  for i,(x,y,r) in enumerate([(-1.2,-.23,.18),(.25,.35,.20),(1.5,-.18,.16)]):
   F.rock(s,'tucked_compression_rubble',(x,y,.24),r,490+i,material='ice.fracture',subdiv=2,terrace=.6)
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
  obj=F.rock(s,'mineral_host',(0,0,.35),1.1,91,subdiv=3,relief=.3,quarry_plane=((0,0,.72),(0,0,1)),quarry_material='stone.cut')
  for v in obj.data.vertices:v.co.x*=2.5;v.co.y*=.65
  for y in (-.35,0,.32):F.band(s,obj.name,(0,y,0),(.03,1,.13),.095,'vein')
  proxy(s,(0,0,.3),(3.5,.8,.65))
 s.socket('SOCKET_CONTACT',(0,0,0),(0,0,-1))
def growth(s,k):
 if k in ('nerve_lace_corner','branching_nerve_mat'):
  foot(s,(-1.5,0,0),.55);stem(s,'main_nerve',[(-1.5,0,.18),(-.4,0,.3),(1,0,.24),(2.1,.2,.18)],.2)
  for i in range(5):
   x=-1.1+i*.65;dy=(-1 if i%2 else 1)*(1+i*.1);h=.25 if k=='branching_nerve_mat' else .25+abs(dy)*.55;stem(s,'nerve_branch',[(x,0,.25),(x+.2,dy*.5,h),(x+.6,dy,h)],.105);stem(s,'side_filament',[(x+.2,dy*.5,h),(x-.25,dy*.85,h)],.07)
  for i in range(3):lamina(s,'contact_fan',(-1+i,0,.2),(-1 if i%2 else 1)*1.4,.7,'tissue.fold')
  sockets(s,(-1.5,0,.2),(2.1,.2,.18))
 elif k=='calcified_pipe_collar':
  sector(s,'hollow_calcified_collar',.85,1.23,0,1,'calcite',24)
  for i in range(9):
   a=i*2*math.pi/9;stem(s,'attachment_root',[(math.cos(a)*1.1,math.sin(a)*1.1,.55),(math.cos(a)*1.5,math.sin(a)*1.5,.12),(math.cos(a)*1.9,math.sin(a)*1.9,.07)],.15)
  for i in range(6):
   a=i*math.pi/3;lamina(s,'collar_contact',(.95*math.cos(a),.95*math.sin(a),.12),a,.55,'tissue.fold')
  s.socket('SOCKET_PIPE',(0,0,0),(0,0,-1))
 elif k=='ribbed_vent_lung':
  foot(s,r=1.55)
  for i in range(6):lamina(s,'vent_lamina',(-1.25+i*.45,0,.28),math.pi/2 if i%2 else -math.pi/2,1.08,'tissue.fold')
  stem(s,'vent_spine',[(-1.6,0,.25),(0,0,.65),(1.6,0,.25)],.28)
  for i in range(9):
   x=-1.3+i*.325;w=1.3*math.sqrt(max(.1,1-(x/1.7)**2));stem(s,'vent_rib',[(x,-w,.2),(x,-w*.7,.75),(x,0,1),(x,w*.7,.75),(x,w,.2)],.11,'calcite',.11)
 elif k=='spore_chimney_stalk':
  # Continuous hollow, fluted growth stalk and irregular flared rim; no capped tube plus torus.
  stations=[(.14,.59),(.38,.48),(.72,.36),(1.1,.28),(1.5,.25),(1.85,.33),(2.15,.49),(2.42,.66),(2.63,.62)]
  count=48;verts=[];faces=[]
  for inner in (False,True):
   for row,(z,r) in enumerate(stations):
    t=row/(len(stations)-1);cx=.22*math.sin(t*math.pi*1.2);cy=.1*math.sin(t*math.pi)
    for i in range(count):
     a=i*2*math.pi/count;fold=(.075 if not inner else .025)*math.cos(a*7+t*1.4)*(.4+.6*math.sin(math.pi*t));rad=r+fold-(.075 if inner else 0)
     lip=(.13*math.sin(a*3)+.06*math.cos(a*5)-.27*max(0,math.cos(a-1.1))**18)*t**5
     verts.append((cx+rad*math.cos(a),cy+rad*math.sin(a),z+lip))
  layer=len(stations)*count
  for inner in (0,1):
   for row in range(len(stations)-1):
    for i in range(count):
     a=inner*layer+row*count+i;b=inner*layer+row*count+(i+1)%count;q=(a,b,b+count,a+count);faces.append(q if inner==0 else tuple(reversed(q)))
  for row in (0,len(stations)-1):
   for i in range(count):
    a=row*count+i;b=row*count+(i+1)%count;q=(a,a+layer,b+layer,b);faces.append(q if row==0 else tuple(reversed(q)))
  obj=mesh(s,'hollow_laminar_chimney',verts,faces,'tissue',0);obj.data.materials.append(s.mat('tissue.fold'));obj.data.materials.append(s.mat('tissue.mature'))
  outer=(len(stations)-1)*count
  for poly in obj.data.polygons:
   poly.use_smooth=True
   if outer<=poly.index<outer*2:poly.material_index=1
   elif poly.index<outer and (poly.index%count)//6 in (1,4):poly.material_index=2
  for i,a in enumerate((-.55,.65,2.05,3.0,4.25)):
   root=(.48*math.cos(a),.48*math.sin(a),.4);fork=(.82*math.cos(a),.82*math.sin(a),.18)
   stem(s,'stalk_root_buttress',[(.21+.1*math.cos(a),.09+.1*math.sin(a),1.1),(.18+.3*math.cos(a),.06+.3*math.sin(a),.74),root,fork],.115,'calcite',.085)
   for turn in (-.18,.24):
    end=(1.2*math.cos(a+turn),1.2*math.sin(a+turn),.04);stem(s,'anchoring_root',[fork,(end[0]*.9,end[1]*.9,.09),end],.065,'tissue.mature',.025);foot(s,end,.19,'tissue',height_scale=.3)
  s.socket('SOCKET_VENT_MOUTH',(.22*math.sin(1.2*math.pi),0,2.63),(0,0,1))
 elif k in ('short_tendril_bridge','arched_tendril_bridge'):
  h=.35 if k.startswith('short') else 1.6
  for x in (-2,2):foot(s,(x,0,0),.65)
  for y in (-.25,.25):stem(s,'load_tendril',[(-2,y,.15),(-1.3,y,h),(0,y,h+.2),(1.3,y,h),(2,y,.15)],.22,'tissue',.22)
  for x,z in [(-1.3,h),(0,h+.2),(1.3,h)]:stem(s,'cross_lace',[(x,-.25,z),(x,.25,z)],.075,'calcite',.075)
  sockets(s,(-2,0,0),(2,0,0))
 elif k=='supported_cyst_nest':
  # An asymmetric anchored nest with layered skins, projecting root necks and thick carrying membranes.
  for p,r in [((-.65,-.05,0),.4),((.75,.35,.03),.32),((.2,-.6,.015),.28)]:foot(s,p,r)
  for base,angle,r in [((-.8,-.1,.18),-.7,.72),((.6,.25,.23),2.1,.62),((.1,-.6,.16),1.0,.55)]:lamina(s,'load_carrying_membrane',base,angle,r,'tissue.fold')
  stem(s,'shared_root_anastomosis',[(-.65,-.05,.17),(.2,-.45,.18),(.75,.35,.2),(.6,.8,.22)],.11,'tissue.fold',.07)
  cyst_shell(s,'primary_folded_cyst',(-.3,0,.36),2.25,.58,.8,.12)
  cyst_shell(s,'younger_side_cyst',(.65,.8,.35),1.3,.38,.53,1.2)
  cyst_shell(s,'seated_small_cyst',(.15,-.8,.27),1.15,.34,.39,-.65)
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
  rect(s,'load_spine',(0,.12,1.75),(.4,.66,3.4),'substrate')
  slab(s,'splayed_jamb_foot',[(-.55,-.72),(.55,-.72),(.43,.65),(-.43,.65)],0,.3,'ancient',True)
  for z in (.68,1.82,2.96):
   # Replaceable ceramic channel sections sit on a continuous dark core, with real joint gaps.
   for x in (-.245,.245):rect(s,'channel_cheek',(x,-.29,z),(.15,.46,1.08))
   rect(s,'rear_channel_web',(0,.405,z),(.65,.18,1.08))
   rect(s,'recessed_key',(0,-.23,z),(.095,.1,.54),'vein',False)
  for z in (.3,3.48):rect(s,'load_shoulder',(0,0,z),(.76,1.05,.24))
  s.socket('SOCKET_LINTEL',(0,0,3.6),(0,0,1))
 elif k=='threshold_lintel':
  slab(s,'lintel_shell',[(-2.5,-.4),(-2.25,-.55),(2.25,-.55),(2.5,-.4),(2.5,.4),(2.1,.55),(-2.1,.55),(-2.5,.4)],-.25,.5,'ancient',True)
  rect(s,'underslung_core',(0,.22,-.28),(4.35,.32,.25),'substrate')
  for x in (-1.5,-.75,0,.75,1.5):rect(s,'compression_key',(x,-.1,-.32),(.14,.68,.13),'ancient')
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
  rect(s,'prism_bearing',(0,0,.36),(1.3,1.15,.14),'ancient')
  for x in (-.6,.6):
   F.plate_v(s,'saddle_gusset',[(-.9,.18),(.9,.18),(.65,.75),(-.65,.75)],x-.05,.1,'yz','ancient',chamfer=.025)
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
 parser=argparse.ArgumentParser();parser.add_argument('--only');parser.add_argument('--render',action='store_true');parser.add_argument('--out-dir',default=OUT);parser.add_argument('--preview-dir',default=os.path.join(ROOT,'.devshots/asset-bank-natural'));args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);requested=set(args.only.split(',')) if args.only else None;rows=[]
 for cat,names,build in [('geology',GEO,geo),('growth',GROW,growth),('ancient',ANCIENT,ancient)]:
  for k in names:
   if requested and k not in requested:continue
   F.reset_scene();s=F.Ship(k,COLORS);s.bank_boxes=[];s.bank_source='tools/blender/forge/asset_bank_natural.py';build(s,k);out=os.path.join(args.out_dir,k)
   description=('Engineered core bore through fractured geological mass, with cleavage-spalled lip, inset longitudinal tool scars and exposed fresh cut faces; metres' if k=='bored_rock_collar' else ('Asymmetric host-attached growth nest with split mature skin, recessed living membrane and branching root contacts; metres' if k=='supported_cyst_nest' else k.replace('_',' ')+'; reusable '+cat+' assembly in metres'))
   row=export_asset(s,out,k,cat,description,s.bank_boxes,tags=[cat,'modular','authoring-candidate']);rows.append(row)
   if args.render:
    preview=args.preview_dir;os.makedirs(preview,exist_ok=True);render_preview(s,os.path.join(preview,k+'_source.png'),width=600,height=450,samples=32);render_glb_preview(os.path.join(out,k+'_lod0.glb'),os.path.join(preview,k+'_export.png'),width=600,height=450,samples=32)
   print('BANK_DONE '+k,flush=True)
 if not requested and os.path.abspath(args.out_dir)==OUT:
  p=os.path.join(ROOT,'design/asset-bank/natural.json');doc=json.load(open(p));doc['assets']=[{'assetId':r['assetId'],'category':r['category'],'manifest':'assets/models/asset-bank/natural/'+r['assetId']+'/'+r['assetId']+'.json'} for r in rows]
  with open(p,'w') as f:json.dump(doc,f,indent=2);f.write('\n')
if __name__=='__main__':main()
