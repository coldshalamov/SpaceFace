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
  # Offset strata are complete rough geological bodies, with broken ledges rather than flat stacked polygons.
  for i,(x,z,sx,sy,h) in enumerate([(-.10,.12,2.3,1.4,.28),(.22,.43,1.94,1.28,.25),(.50,.75,1.60,1.05,.28),(.72,1.08,1.22,.82,.23)]):
   obj=F.rock(s,'fractured_stratum_'+str(i),(0,0,0),1,510+i,subdiv=3,relief=.27,terrace=.58,material='stone')
   for v in obj.data.vertices:v.co=Vector((x+v.co.x*sx,v.co.y*sy,z+v.co.z*h))
   F.band(s,obj.name,(0,0,z),(.03,-.02,1),.055,'stone.strata');proxy(s,(x,0,z),(sx*1.3,sy*1.3,h))
  for i,(x,y,z,r) in enumerate([(-1.3,-.8,.24,.24),(.8,-.95,.52,.21),(1.0,.48,1.0,.18)]):F.rock(s,'cleavage_spall',(x,y,z),r,530+i,subdiv=2,material='stone.cut')
 elif k=='bore_plug':
  # Extracted drill core: tool-scored cylindrical sides terminate in an irregular cleaved crown.
  level=getattr(s,'bank_lod_level',0);count=(48,32,20)[level];verts=[];faces=[]
  stations=[(0,.79),(.07,.83),(.27,.83),(.285,.810),(.32,.810),(.34,.83),(.72,.83),(1.06,.83),(1.08,.812),(1.115,.812),(1.13,.83),(1.65,.83),(1.67,.815),(1.70,.815),(1.72,.83),(2.02,.83),(2.19,.81)]
  def crown(x,y):
   # Two offset break planes with broad cleavage steps, not a flat cylinder cap or noise blanket.
   return 2.37+.18*x-.14*y+.065*math.sin(x*4+y*2)-(.12 if x>.22 and y<.28 else 0)
  for row,(z,r) in enumerate(stations):
   for i in range(count):
    a=i*2*math.pi/count;chip=(.13*max(0,math.cos(a-.3))**14+.085*max(0,math.cos(a-3.7))**10)*(row/(len(stations)-1))**12
    rad=r-chip+.006*math.sin(a*13);zz=z+(.035*math.sin(a*5)+.018*math.cos(a*9))*(row/(len(stations)-1))**8
    verts.append((rad*math.cos(a),rad*math.sin(a),zz))
  for row in range(len(stations)-1):
   for i in range(count):a=row*count+i;b=row*count+(i+1)%count;faces.append((a,b,b+count,a+count))
  faces.append(tuple(reversed(range(count))))
  # Four triangulated crown rings carry genuine non-flat exposed break anatomy and chipped perimeter.
  last=(len(stations)-1)*count
  for ring,r in enumerate((.77,.57,.30,.055)):
   start=len(verts)
   for i in range(count):
    a=i*2*math.pi/count;rad=r*(1+.035*math.sin(a*7))
    if ring==0:rad-=.12*max(0,math.cos(a-.3))**14+.07*max(0,math.cos(a-3.7))**10
    x=rad*math.cos(a);y=rad*math.sin(a);verts.append((x,y,crown(x,y)+(.018*math.sin(a*5) if ring==0 else 0)))
   for i in range(count):
    j=(i+1)%count;faces.extend([(last+i,last+j,start+j),(last+i,start+j,start+i)])
   last=start
  faces.append(tuple(last+i for i in range(count)))
  obj=mesh(s,'extracted_fractured_core',verts,faces,'stone',.003);proxy(s,(0,0,1.2),(1.2,1.2,2.4))
  # Inclined sediment layers cross the broken crown and continue through the cylindrical extraction face.
  F.band(s,obj.name,(0,0,1.03),(.9,.26,1),.24,'stone.cut')
  F.band(s,obj.name,(0,0,1.72),(.9,.26,1),.13,'stone.strata')
  F.band(s,obj.name,(0,0,2.21),(.9,.26,1),.30,'stone.cut')
  # Narrow irregular mineral-filled fracture is a separate volume intersected with the geological core.
  outline=[(-1.3,-.28),(-.55,-.19),(-.12,.04),(.42,-.015),(1.3,.25),(1.3,.33),(.40,.045),(-.14,.105),(-.58,-.12),(-1.3,-.20)]
  cutter=slab(s,'temporary_core_mineral_volume',outline,-.1,3,'vein');mineral=obj.copy();mineral.data=obj.data.copy();mineral.name='embedded_core_mineral_fracture';bpy.context.collection.objects.link(mineral);s.add(mineral);mineral.data.materials.clear();mineral.data.materials.append(s.mat('vein'))
  for poly in mineral.data.polygons:poly.material_index=0
  for target,operation in ((mineral,'INTERSECT'),(obj,'DIFFERENCE')):
   bpy.context.view_layer.objects.active=target;mod=target.modifiers.new('CoreMineralVolume','BOOLEAN');mod.operation=operation;mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name)
  s.objects.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
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
   obj=F.rock(s,'fractured_abutment',(x,0,.8),1.3,71+i,subdiv=3,terrace=.6,relief=.28)
   for v in obj.data.vertices:v.co.x=x+(v.co.x-x)*.7;v.co.z=.8+(v.co.z-.8)*1.2
   F.band(s,obj.name,(0,0,.6),(.08,.04,1),.16,'stone.strata');proxy(s,(x,0,.8),(1.2,1.5,1.8))
  obj=F.rock(s,'naturally_laminated_span',(0,0,0),1,552,subdiv=4,terrace=.48,relief=.26)
  for v in obj.data.vertices:v.co=Vector((v.co.x*2.6,v.co.y*.94,1.9+v.co.z*.36))
  F.band(s,obj.name,(0,0,1.94),(.03,.05,1),.065,'stone.strata');proxy(s,(0,0,1.93),(4.4,1.15,.30))
  for i,(x,y,z) in enumerate([(-1.7,-.58,1.78),(.7,.5,1.79),(1.6,-.49,1.83)]):
   o=F.rock(s,'fractured_span_ledge',(x,y,z),.45,560+i,subdiv=3,material='stone.cut')
   for v in o.data.vertices:v.co.z=z+(v.co.z-z)*.3
  sockets(s,(-2.6,0,2.05),(2.6,0,2.05))
 elif k=='cleaved_slab':
  # Two complementary jagged cut halves of one stratified parent, separated along cleavage.
  for side in (-1,1):
   obj=F.rock(s,'split_cleavage_half',(0,0,0),1,580,subdiv=4,relief=.25,terrace=.5)
   bm=bmesh.new();bm.from_mesh(obj.data);cut=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=Vector((0,0,0)),plane_no=Vector((0,1,0)),clear_outer=side<0,clear_inner=side>0)
   edges=[e for e in cut['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary];filled=bmesh.ops.holes_fill(bm,edges=edges,sides=0);obj.data.materials.append(s.mat('stone.cut'))
   for face in filled['faces']:face.material_index=1
   bm.to_mesh(obj.data);bm.free()
   for v in obj.data.vertices:
    x=v.co.x*2.1;y=v.co.y*1.4;v.co=Vector((x,y+side*.13+.10*math.sin(x*2)+.035*math.sin(x*7),.32+v.co.z*.33))
   F.band(s,obj.name,(0,0,.33),(.025,.03,1),.055,'stone.strata');proxy(s,(0,side*.67,.3),(2.6,.65,.35))
 elif k=='rubble_berm':
  from mathutils import Matrix
  chunks=[(-2.2,-.12,.36,.85,.62,.50,.2),(-1.45,.2,.4,.8,.66,.58,-.4),(-.6,-.05,.53,.95,.71,.74,.3),(.3,.25,.36,.78,.66,.55,-.5),(1.0,-.12,.45,.82,.60,.64,.4),(1.8,.14,.34,.75,.61,.46,-.3),(2.4,.05,.23,.50,.45,.33,.1)]
  for i,(x,y,z,sx,sy,sz,angle) in enumerate(chunks):
   obj=F.rock(s,'interlocked_angular_rubble',(0,0,0),1,610+i,subdiv=3,relief=.25,terrace=.45,quarry_plane=((0,0,.45),(.2,.1,1)),quarry_material='stone.cut');rot=Matrix.Rotation(angle,3,'Y')
   for v in obj.data.vertices:v.co=Vector((x,y,z))+rot@Vector((v.co.x*sx,v.co.y*sy,v.co.z*sz))
   proxy(s,(x,y,z),(sx,sy,sz))
  for i,(x,y) in enumerate([(-1.8,-.45),(-.7,.55),(.75,-.5),(1.7,-.4)]):F.rock(s,'buried_small_fragment',(x,y,.15),.22,630+i,subdiv=2,material='stone.cut')
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
   obj=F.rock(s,'tension_split_ice',(0,0,0),1,660,material='ice',subdiv=4,relief=.25,terrace=.35)
   bm=bmesh.new();bm.from_mesh(obj.data);cut=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=Vector((0,0,0)),plane_no=Vector((0,1,0)),clear_outer=side<0,clear_inner=side>0)
   edges=[e for e in cut['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary];filled=bmesh.ops.holes_fill(bm,edges=edges,sides=0);obj.data.materials.append(s.mat('ice.deep'))
   for face in filled['faces']:face.material_index=1
   bm.to_mesh(obj.data);bm.free()
   for v in obj.data.vertices:
    x=v.co.x*2.1;v.co=Vector((x,v.co.y*1.8+side*.17+.13*math.sin(x*2.4)+.06*math.sin(x*6),.3+v.co.z*.25))
   proxy(s,(0,side*.8,.3),(2.5,.8,.28))
  for i,(x,y) in enumerate([(-1.1,.45),(.8,-.65)]):
   obj=F.rock(s,'detached_frost_lamina',(x,y,.50),.5,670+i,material='ice.fracture',subdiv=3,relief=.25)
   for v in obj.data.vertices:v.co.z=.5+(v.co.z-.5)*.11
 elif k=='crystal_fan':
  obj=F.rock(s,'fractured_crystal_matrix',(0,0,.18),1,690,subdiv=3,relief=.3,terrace=.6)
  for v in obj.data.vertices:v.co=Vector((v.co.x*1.15,v.co.y*.75,.15+(v.co.z-.18)*.23))
  proxy(s,(0,0,.18),(1.4,.85,.3))
  for i,(a,length,r,y) in enumerate([(-.90,1.7,.23,-.06),(-.48,2.2,.27,.03),(-.12,2.8,.29,.1),(.31,2.35,.25,-.05),(.74,1.8,.21,.06),(.55,1.1,.16,-.35),(-.37,1.2,.17,-.38)]):
   direction=Vector((math.sin(a),.10*math.sin(i*2),math.cos(a)));origin=Vector((.12*math.sin(a),y,.21));u=direction.cross(Vector((0,1,0))).normalized();v=direction.cross(u);verts=[];faces=[]
   for z,rad in [(0,r*.8),(length*.78,r),(length*.91,r*.94),(length,r*.15)]:
    for j in range(6):theta=j*math.pi/3;verts.append(tuple(origin+direction*z+rad*(math.cos(theta)*u+math.sin(theta)*v)))
   for ring in range(3):
    for j in range(6):faces.append((ring*6+j,ring*6+(j+1)%6,(ring+1)*6+(j+1)%6,(ring+1)*6+j))
   faces.extend([tuple(reversed(range(6))),tuple(18+j for j in range(6))]);mesh(s,'terminated_hexagonal_crystal',verts,faces,'ice.fracture' if i%3==0 else 'ice',.004)
 elif k=='metallic_vein_rib':
  obj=F.rock(s,'fractured_mineral_host',(0,0,.35),1.1,91,subdiv=(4,3,2)[getattr(s,'bank_lod_level',0)],relief=.29,quarry_plane=((0,0,.72),(.025,.02,1)),quarry_material='stone.cut')
  for v in obj.data.vertices:v.co.x*=2.5;v.co.y*=.65
  # A branching mineral seam is a separate in-situ volume through the host, not painted racing stripes.
  for index,path in enumerate([[(-3,-.22,.13),(-1.5,-.16,.10),(-.55,.13,.17),(.45,.04,.11),(1.2,.25,.08),(3,.35,.13)],[(-.6,.13,.09),(.3,-.27,.075),(1.1,-.42,.05),(2.6,-.55,.04)]]):
   outline=[(x,y-w) for x,y,w in path]+[(x,y+w) for x,y,w in reversed(path)]
   cutter=slab(s,'temporary_mineral_volume',outline,-1,3,'vein');mineral=obj.copy();mineral.data=obj.data.copy();mineral.name='branching_in_situ_mineral';bpy.context.collection.objects.link(mineral);s.add(mineral);mineral.data.materials.clear();mineral.data.materials.append(s.mat('vein'))
   for poly in mineral.data.polygons:poly.material_index=0
   for target,operation in ((mineral,'INTERSECT'),(obj,'DIFFERENCE')):
    bpy.context.view_layer.objects.active=target;mod=target.modifiers.new('MineralSeamVolume','BOOLEAN');mod.operation=operation;mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name)
   s.objects.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
  proxy(s,(0,0,.3),(3.5,.8,.65))
 s.socket('SOCKET_CONTACT',(0,0,0),(0,0,-1))
def tissue_sleeve(s,n,stations,radius,mat='tissue',torn=False):
 # A continuous irregular hollow wall: thick basal folds, asymmetric rim, real lumen.
 count=40;verts=[];faces=[]
 for inner in (0,1):
  for row,(z,scale,cx,cy) in enumerate(stations):
   t=row/(len(stations)-1)
   for j in range(count):
    a=j*2*math.pi/count;rad=radius*scale*(1+.065*math.cos(a*5+t*2)+.03*math.sin(a*9))-(.105 if inner else 0)
    lip=(.055*math.sin(a*3)+(.20*math.sin(a*5)+.09*math.cos(a*8) if torn else .025*math.cos(a*7)))*t**4
    verts.append((cx+rad*math.cos(a),cy+rad*math.sin(a),z+lip))
 layer=len(stations)*count
 for inner in (0,1):
  for row in range(len(stations)-1):
   for j in range(count):
    a=inner*layer+row*count+j;b=inner*layer+row*count+(j+1)%count;q=(a,b,b+count,a+count);faces.append(q if inner==0 else tuple(reversed(q)))
 for row in (0,len(stations)-1):
  for j in range(count):
   a=row*count+j;b=row*count+(j+1)%count;q=(a,a+layer,b+layer,b);faces.append(q if row==0 else tuple(reversed(q)))
 obj=mesh(s,n,verts,faces,mat,0);obj.data.materials.append(s.mat('tissue.fold'))
 for poly in obj.data.polygons:
  poly.use_smooth=True
  if (len(stations)-1)*count<=poly.index<2*(len(stations)-1)*count:poly.material_index=1
 return obj

def growth(s,k):
 if k in ('nerve_lace_corner','branching_nerve_mat'):
  corner=k=='nerve_lace_corner'
  def height(y):return .12+(max(0,y-.35)*.8 if corner else .035*math.sin(y*3))
  foot(s,(-1.5,0,0),.38);stem(s,'main_nerve',[(-1.5,0,.18),(-.6,-.1,.28),(.5,.08,.23),(1.5,.04,.18),(2.1,.2,.18)],.17,'tissue.mature',.07)
  # Anastomosing curved branches form an irregular lace with attachment laminae, not straight cut sticks.
  for i,x in enumerate((-1.1,-.45,.22,.95,1.45)):
   sign=-1 if i%2 else 1;dy=sign*(.83+.13*(i%3));end=(x+.38,dy,height(dy))
   stem(s,'curved_nerve_branch',[(x,0,.22),(x+.08,dy*.35,height(dy*.35)+.10),(x+.18,dy*.7,height(dy*.7)+.04),end,(x+.62,dy*1.14,height(dy*1.14))],.085,'tissue',.014)
   fork=(x+.18,dy*.7,height(dy*.7)+.04)
   stem(s,'forked_filament',[fork,(x-.10,dy*.93,height(dy*.93)),(x-.38,dy*1.04,height(dy*1.04))],.055,'tissue.young',.010)
   if i<4:
    stem(s,'returning_nerve_lace',[(x+.08,dy*.35,height(dy*.35)+.10),(x+.43,dy*.48,height(dy*.48)),(x+.69,.04,.22)],.045,'tissue.fold',.035)
   lamina(s,'local_contact_skin',(x+.12,dy*.42,height(dy*.42)-.025),sign*1.35,.42,'tissue.fold')
  if corner:
   # Bend the complete branching anatomy around a quarter-turn, including branch frames and contact skins.
   def turn_point(x,y):
    u=x+1.5;radius=.40;arc=radius*math.pi/2
    if u<=1.1:cx,cy,tx,ty=-1.5+u,0,1,0
    elif u<1.1+arc:
     angle=-math.pi/2+(u-1.1)/radius;cx=-.4+radius*math.cos(angle);cy=.4+radius*math.sin(angle);tx=-math.sin(angle);ty=math.cos(angle)
    else:cx,cy,tx,ty=0,.4+u-1.1-arc,0,1
    return cx-ty*y,cy+tx*y
   for obj in s.objects:
    if obj.type=='MESH':
     for vertex in obj.data.vertices:
      x,y=turn_point(vertex.co.x,vertex.co.y);vertex.co.x=x;vertex.co.y=y
   lamina(s,'inside_corner_attachment',(-.32,.16,.1),math.pi*.24,.60,'tissue.mature')
   stem(s,'corner_membrane_root',[(-.58,0,.22),(-.2,.18,.24),(-.06,.55,.22)],.095,'calcite',.055)
   end=turn_point(2.1,.2);s.socket('SOCKET_A',(-1.5,0,.2),(-1,0,0));s.socket('SOCKET_B',(end[0],end[1],.18),(0,1,0))
  else:sockets(s,(-1.5,0,.2),(2.1,.2,.18))
 elif k=='calcified_pipe_collar':
  tissue_sleeve(s,'accreted_hollow_collar',[(.08,1.12,0,0),(.28,1.07,0,0),(.62,1.0,.035,0),(.94,1.06,.05,.025)],1.04,'calcite')
  for i,a in enumerate((0,.7,1.7,2.45,3.4,4.4,5.25)):
   seated_radius=1.04*1.041*(1+.065*math.cos(a*5+.94)+.03*math.sin(a*9))-.052; base=(seated_radius*math.cos(a),seated_radius*math.sin(a),.42);fork=(1.32*math.cos(a),1.32*math.sin(a),.16)
   stem(s,'collar_root_buttress',[base,(1.14*math.cos(a),1.14*math.sin(a),.28),fork],.045,'tissue.mature',.08)
   for turn in (-.17,.2):stem(s,'forked_attachment',[fork,(1.55*math.cos(a+turn),1.55*math.sin(a+turn),.11),(1.8*math.cos(a+turn),1.8*math.sin(a+turn),.04)],.075,'tissue',.022)
   lamina(s,'accreted_contact_fan',(1.1*math.cos(a),1.1*math.sin(a),.08),a,.62,'tissue.fold')
  for i in range(12):
   a=i*math.pi/6;proxy(s,(1.08*math.cos(a),1.08*math.sin(a),.45),(.17,.17,.7))
  s.socket('SOCKET_PIPE',(0,0,0),(0,0,-1))
 elif k=='ribbed_vent_lung':
  for x in (-1.2,1.12):foot(s,(x,0,0),.45)
  stem(s,'vent_spine',[(-1.6,0,.22),(-.8,0,.75),(.3,0,.84),(1.5,0,.24)],.16,'tissue.mature',.09)
  # Thick intercostal skins hang from asymmetric ribs; the lower sides retain real ventilation slits.
  for i in range(8):
   x=-1.3+i*.36;w=.94*math.sqrt(max(.15,1-(x/1.7)**2));h=.88+.10*math.sin(i*.6)
   stem(s,'supported_vent_rib',[(x,-w,.19),(x-.04,-w*.72,h*.72),(x,0,h),(x+.06,w*.68,h*.7),(x+.1,w,.20)],.078,'calcite',.05)
   if i<7:
    verts=[];faces=[];cols=17
    for skin in (0,1):
     for row in range(4):
      t=row/3
      for j in range(cols):
       a=.26+j*(math.pi-.52)/(cols-1);z=.16+(h-.16)*math.sin(a)-.06*math.sin(t*math.pi)-skin*.034;verts.append((x+t*.30,w*math.cos(a),z))
    layer=4*cols
    for skin in (0,1):
     for row in range(3):
      for j in range(cols-1):o=skin*layer+row*cols+j;q=(o,o+1,o+cols+1,o+cols);faces.append(q if skin==0 else tuple(reversed(q)))
    edge=list(range(cols))+[r*cols+cols-1 for r in range(1,4)]+list(range(layer-2,layer-cols-1,-1))+[r*cols for r in range(2,0,-1)]
    for a,b in zip(edge,edge[1:]+edge[:1]):faces.append((a,a+layer,b+layer,b))
    mesh(s,'intercostal_membrane',verts,faces,'tissue.fold' if i%3==0 else 'tissue.mature',0)
  for sign in (-1,1):stem(s,'lateral_root_contact',[(-1.25,sign*.28,.16),(0,sign*.75,.11),(1.15,sign*.3,.10)],.1,'tissue',.05)
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
  for x in (-2,2):
   foot(s,(x,0,0),.58)
   for dy in (-.5,.5):stem(s,'forked_bridge_anchor',[(x*.89,0,.30),(x,dy*.5,.13),(x*1.12,dy,.035)],.13,'tissue.mature',.025)
  for y in (-.36,.36):stem(s,'load_tendril',[(-2,y,.15),(-1.3,y,h),(0,y,h+.2),(1.3,y,h),(2,y,.15)],.145,'tissue',.145)
  # Suspended thick web connects both tendons, scalloped at the edges rather than a ladder of rods.
  count=25;verts=[];faces=[]
  for side in (0,1):
   for i in range(count):
    x=-1.7+i*3.4/(count-1);t=(x+2)/4;z=.18+(h+.06)*math.sin(math.pi*t)**.5
    for j in range(5):
     y=-.36+j*.18;verts.append((x,y,z-.12*(1-(y/.36)**2)-side*.045+.025*math.sin(i*1.8)))
  layer=count*5
  for side in (0,1):
   for i in range(count-1):
    for j in range(4):
     a=side*layer+i*5+j;q=(a,a+1,a+6,a+5);faces.append(q if not side else tuple(reversed(q)))
  edge=list(range(5))+[i*5+4 for i in range(1,count)]+list(range(layer-2,layer-6,-1))+[i*5 for i in range(count-2,0,-1)]
  for a,b in zip(edge,edge[1:]+edge[:1]):faces.append((a,a+layer,b+layer,b))
  mesh(s,'suspended_living_web',verts,faces,'tissue.fold',0)
  for x in (-.95,0,.95):
   z=.18+(h+.06)*math.sin(math.pi*(x+2)/4)**.5;stem(s,'web_cross_fibre',[(x-.14,-.36,z),(x,0,z-.08),(x+.13,.36,z)],.045,'calcite',.03)
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
  # Paired fleshy suction laminae grow out from the central anatomy, no row of disconnected pads.
  stem(s,'attachment_spine',[(-2,0,.18),(-.7,.05,.47),(.7,0,.5),(1.85,-.1,.22)],.28,'tissue.mature',.13)
  for i in range(5):
   x=-1.45+i*.70
   for sign in (-1,1):
    base=(x,sign*.10,.22);lamina(s,'host_gripping_lobe',base,sign*1.42,.72+.08*math.sin(i*2),'tissue')
    stem(s,'clasp_root',[(x,0,.45),(x+.1,sign*.45,.35),(x+.24,sign*.78,.12)],.12,'calcite',.035)
  for x in (-1.4,.0,1.3):proxy(s,(x,0,.2),(.65,.7,.2))
 elif k=='root_anchor_pad':
  foot(s,r=.82)
  tissue_sleeve(s,'root_neck_receiver',[(.14,1.2,0,0),(.33,1,0,0),(.52,.85,.03,0)],.38,'tissue.mature')
  for i,a in enumerate((0,.65,1.45,2.1,3.0,3.65,4.6,5.5)):
   fork=(.78*math.cos(a),.78*math.sin(a),.19);stem(s,'root_load_buttress',[(.23*math.cos(a),.23*math.sin(a),.4),fork],.17,'tissue',.1)
   for turn,length in ((-.16,1.65),(.25,1.4)):
    stem(s,'branching_ground_root',[fork,(1.1*math.cos(a+turn*.5),1.1*math.sin(a+turn*.5),.12),(length*math.cos(a+turn),length*math.sin(a+turn),.035)],.10,'tissue.mature',.025)
   if i%2==0:lamina(s,'root_contact_skin',fork,a,.55,'tissue.fold')
  s.socket('SOCKET_STALK',(0,0,.5),(0,0,1))
 elif k=='severed_tendril_stump':
  foot(s,r=.72)
  tissue_sleeve(s,'ragged_exposed_wall',[(.14,1.1,0,0),(.40,1,0,0),(.8,.9,.08,.02),(1.22,.88,.13,.06)],.58,'tissue',True)
  for i,a in enumerate((.25,1.1,2.6,3.8,5.1)):
   stem(s,'torn_longitudinal_fibre',[(.43*math.cos(a),.43*math.sin(a),.35),(.13+.51*math.cos(a),.06+.51*math.sin(a),1.0),(.13+.57*math.cos(a),.06+.57*math.sin(a),1.35+.1*math.sin(i*2))],.055,'calcite',.018)
  for i in range(8):
   a=i*math.pi/4;proxy(s,(.5*math.cos(a),.5*math.sin(a),.65),(.16,.16,.9))
 elif k=='dead_crown':
  foot(s,r=.55)
  for i,a in enumerate((0,.85,1.8,2.7,3.65,4.7,5.55)):
   height=.75+.25*math.sin(i*2);fork=(.6*math.cos(a),.6*math.sin(a),height)
   stem(s,'desiccated_primary',[(0,0,.18),fork,(1.05*math.cos(a),1.05*math.sin(a),height*.82),(1.42*math.cos(a+.08),1.42*math.sin(a+.08),.30)],.13,'calcite',.033)
   if i in (0,2,5):
    lamina(s,'collapsed_remaining_skin',(.48*math.cos(a),.48*math.sin(a),height*.82),a,.65,'tissue.fold')
    stem(s,'broken_secondary',[fork,(.82*math.cos(a+.4),.82*math.sin(a+.4),height+.07),(1.1*math.cos(a+.45),1.1*math.sin(a+.45),height*.6)],.075,'calcite',.018)
 s.socket('SOCKET_HOST_CONTACT',(0,0,0),(0,0,-1))
def recessed_box(obj,center,size):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center);cut=bpy.context.object;cut.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('MachinedRecess','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
def ceramic_web(s,n,outline,y,depth,mat='ancient'):
 # Shaped load webs with deliberate broad recesses rather than a box plus surface appliques.
 return F.plate_v(s,n,outline,y,depth,'xz',mat,chamfer=.025,bevel=.012)
def ancient(s,k):
 if k=='threshold_jamb':
  rect(s,'continuous_load_core',(0,.12,1.72),(.24,.45,3.4),'substrate')
  slab(s,'keyed_splayed_foot',[(-.61,-.66),(-.18,-.78),(.48,-.63),(.55,.46),(.25,.64),(-.46,.53)],0,.25,'ancient',True)
  # Paired swept ceramic blades leave a continuous deep service channel and a tapered silhouette.
  for sign in (-1,1):
   for z,h,w in [(.25,1.02,.48),(1.30,1.07,.35),(2.40,.99,.40)]:
    outline=[(sign*.12,z),(sign*w,z+.12),(sign*(w-.055),z+h-.18),(sign*.24,z+h),(sign*.12,z+h-.08)]
    if sign<0:outline.reverse()
    cheek=ceramic_web(s,'swept_replaceable_cheek',outline,-.46,.48)
    recessed_box(cheek,(sign*.235,-.447,z+h*.52),(.09,.135,h*.50))
    rect(s,'inset_load_channel',(sign*.235,-.382,z+h*.52),(.072,.025,h*.45),'substrate',False)
    rect(s,'channel_reference_key',(sign*.235,-.403,z+h*.40),(.058,.012,.13),'vein',False)
    proxy(s,(sign*.24,-.15,z+h*.5),(.19,.35,h*.8))
   ceramic_web(s,'rear_load_flange',[(sign*.1,.3),(sign*.32,.42),(sign*.28,3.3),(sign*.1,3.48)][::sign],.24,.18)
  for z in (.47,1.54,2.65):
   rect(s,'channel_termination',(0,-.11,z),(.15,.14,.26),'vein',False)
   rect(s,'recessed_bearing',(0,-.075,z+.30),(.13,.08,.18),'substrate',False)
  slab(s,'lintel_seat',[(-.4,-.5),(.4,-.5),(.38,.43),(.16,.53),(-.38,.43)],3.38,.22,'ancient',True)
  s.socket('SOCKET_LINTEL',(0,0,3.6),(0,0,1))
 elif k=='threshold_lintel':
  # Open-backed compression arch beam, split ceramic cladding follows the load path.
  for y in (-.49,.28):
   ceramic_web(s,'cambered_load_beam',[(-2.5,-.25),(-2.18,-.35),(-1.45,-.08),(1.45,-.08),(2.18,-.35),(2.5,-.25),(2.5,.15),(1.45,.40),(-1.45,.40),(-2.5,.15)],y,.20)
   proxy(s,(0,y+.1,.1),(4.8,.2,.3))
  rect(s,'recessed_longitudinal_key',(0,0,.10),(3.9,.24,.18),'substrate')
  for x in (-1.9,-.9,0,.9,1.9):
   rect(s,'transverse_load_bridge',(x,0,.15),(.18,.8,.17),'substrate')
   rect(s,'keyed_inset',(x,-.22,.22),(.11,.18,.12),'vein',False)
  for x in (-2.2,2.2):rect(s,'tenon',(x,0,-.4),(.5,.7,.3));s.socket('SOCKET_JAMB_'+str(x),(x,0,-.55),(0,0,-1))
 elif k=='shutter_vane':
  # Thin overlapping ceramic feathers carried by an exposed offset hinge spar.
  rect(s,'hinge_spar',(-1.72,0,.11),(.22,1.45,.30),'substrate')
  for i in range(4):
   y=-.64+i*.32
   slab(s,'overlapping_shutter_leaf',[(-1.85,y),(1.56-i*.12,y+.10),(2-i*.10,y+.27),(1.7-i*.1,y+.42),(-1.85,y+.28)],.04+i*.025,.15,'ancient',True)
  for y in (-.56,.48):
   F.cylinder(s,'hinge_bearing',(-1.72,y-.1,.12),(-1.72,y+.1,.12),.22,.22,'vein',segments=12)
  s.socket('SOCKET_HINGE',(-1.8,0,0),(0,1,0))
 elif k=='repair_face_tile':
  slab(s,'stepped_repair_back',[(-1.1,-.85),(.72,-.85),(1.1,-.46),(1.1,.85),(-.86,.85),(-1.1,.55)],0,.12,'substrate',True)
  # Broken-key joint in three replaceable ceramic sectors exposes the recessed backing.
  for pts in [[(-1,-.75),(-.12,-.75),(-.12,-.1),(-.32,.10),(-.32,.75),(-.94,.75)],[(0,-.75),(.66,-.75),(.98,-.4),(.98,-.05),(.22,-.05),(0,-.26)],[(-.18,.18),(.18,.04),(.98,.04),(.98,.75),(-.18,.75)]]:
   slab(s,'keyed_face_sector',pts,.13,.15,'ancient',True)
  for x,y in [(-.7,-.5),(.67,.48)]:
   slab(s,'wedge_lock',[(x-.14,y-.15),(x+.14,y-.15),(x+.08,y+.15),(x-.08,y+.15)],.27,.045,'vein')
 elif k=='sealed_vault_seam':
  for sign in (-1,1):
   pts=[(sign*.06,-1.3),(sign*1.30,-1.3),(sign*1.3,1.1),(sign*1.04,1.3),(sign*.06,1.3),(sign*.06,.4),(sign*.24,.22),(sign*.24,-.22),(sign*.06,-.4)]
   if sign<0:pts.reverse()
   slab(s,'interlocking_vault_leaf',pts,-.1,.38,'ancient',True)
   rect(s,'buried_seal_race',(sign*.32,0,-.1),(.24,2.4,.12),'substrate')
  rect(s,'recessed_seal',(0,0,-.02),(.11,2.6,.14),'substrate')
  for y in (-.88,.85):
   for sign in (-1,1):slab(s,'tapered_seal_dog',[(sign*.1,y-.12),(sign*.65,y-.22),(sign*.78,y+.12),(sign*.1,y+.12)][::sign],.28,.16,'substrate',True)
   rect(s,'seal_witness',(0,y,.26),(.12,.13,.09),'vein',False)
 elif k=='quarantine_pylon_foot':
  # Three splayed anchor toes hold an open keyed insertion throat.
  for a in (0,2.094,4.189):
   ca,sa=math.cos(a),math.sin(a);pts=[(.35,-.22),(1.35,-.30),(1.62,.0),(1.2,.31),(.35,.22)];slab(s,'radial_anchor_toe',[(x*ca-y*sa,x*sa+y*ca) for x,y in pts],0,.28,'ancient',True)
   stem(s,'buried_load_key',[(.35*ca,.35*sa,.25),(.85*ca,.85*sa,.25),(1.28*ca,1.28*sa,.15)],.075,'substrate',.05)
  for sign in (-1,1):
   ceramic_web(s,'keyed_socket_wall',[(-.64,.22),(.64,.22),(.57,.95),(.34,1.15),(-.25,1.15),(-.51,.85)],sign*.48-.08,.16)
   proxy(s,(0,sign*.48,.63),(1,.16,.75))
  rect(s,'insertion_stop',(0,0,.32),(.85,.92,.14),'substrate');s.socket('SOCKET_PYLON',(0,0,.55),(0,0,1))
 elif k=='prism_instrument_mount':
  # Kinematic three-point instrument cradle: a forked carrier, two jaws and an offset indexing tongue.
  for sign in (-1,1):
   slab(s,'forked_base_rail',[(-1.15,sign*.36),(.55,sign*.36),(1.0,sign*.65),(.6,sign*.88),(-1.0,sign*.82)][::sign],0,.18,'ancient',True)
   ceramic_web(s,'swept_instrument_jaw',[(-.86,.15),(-.60,.25),(-.44,.82),(.10,1.16),(.36,1.05),(.25,.87),(-.23,.66),(-.38,.14)],sign*.52-.1,.20)
   proxy(s,(-.5,sign*.52,.45),(.32,.2,.5))
   F.cylinder(s,'trunnion_seat',(-.04,sign*.44,.87),(-.04,sign*.64,.87),.17,.17,'substrate',segments=12)
   F.cylinder(s,'bearing_insert',(-.04,sign*.40,.87),(-.04,sign*.44,.87),.10,.10,'vein',segments=12)
  slab(s,'indexing_tongue',[(-.5,-.26),(.90,-.26),(1.2,0),(.9,.26),(-.5,.26)],.25,.13,'substrate',True)
  for x in (.25,.55,.85):rect(s,'recessed_reference_key',(x,0,.39),(.08,.22,.045),'vein',False)
  F.cylinder(s,'seated_prism',(-.64,0,.90),(.67,0,.90),.33,.33,'ice.deep',segments=6,bevel=.008)
  # Recessed optical terminal and two offset reference facets establish an instrument, not a blank crystal.
  F.cylinder(s,'optical_terminal_recess',(.669,0,.90),(.685,0,.90),.267,.267,'substrate',segments=6,bevel=.006)
  F.cylinder(s,'inset_optical_face',(.685,0,.90),(.689,0,.90),.205,.205,'ice',segments=6,bevel=.004)
  F.cylinder(s,'optical_inner_stop',(.690,0,.90),(.694,0,.90),.10,.10,'substrate',segments=6,bevel=.002)
  for x in (-.43,.39):
   rect(s,'inset_prism_reference',(x,-.287,.90),(.055,.018,.19),'substrate',False)
   rect(s,'prism_reference_mark',(x,-.30,.94),(.037,.012,.055),'vein',False)
  for sign in (-1,1):
   rect(s,'jaw_internal_bearing',(-.39,sign*.49,.67),(.15,.17,.24),'substrate',False)
  s.socket('SOCKET_INSTRUMENT',(0,0,.9),(1,0,0))
 elif k=='dormant_machine_rack':
  # Open rack with staggered instrument cassettes and longitudinal ceramic bearing cheeks.
  for sign in (-1,1):
   ceramic_web(s,'swept_rack_cheek',[(sign*1.1,0),(sign*1.48,.16),(sign*1.45,1.85),(sign*1.23,2.25),(sign*1.02,2.1),(sign*1.16,.32)][::sign],-.65,1.25)
   proxy(s,(sign*1.27,0,1.1),(.23,1.1,1.9))
  for i,z in enumerate((.3,.95,1.65)):
   rect(s,'recessed_cassette_frame',(0,.25,z),(2.35,.85,.17),'substrate')
   for x in (-.72,0,.72):
    slab(s,'instrument_drawer',[(x-.28,-.65),(x+.28,-.65),(x+.32,.55),(x-.28,.55)],z+.10,.20,'ancient',True)
    rect(s,'drawer_key',(x,-.69,z+.20),(.18,.10,.075),'vein',False)
  for x in (-.7,.7):rect(s,'rear_bus_spine',(x,.64,1.1),(.15,.15,1.7),'substrate')
 elif k=='measuring_rail':
  for y in (-.27,.27):
   slab(s,'ceramic_guide_rail',[(-2.5,y-.07),(2.35,y-.07),(2.5,y),(2.35,y+.07),(-2.5,y+.07)],.17,.18,'ancient',True)
  rect(s,'recessed_scale_bed',(0,0,.13),(5,.45,.15),'substrate')
  for i in range(17):rect(s,'inset_scale',(-2.35+i*.29375,0,.216),(.035,.16 if i%4 else .3,.012),'vein',False)
  for x in (-2.25,.6,2.25):rect(s,'guide_cross_bearing',(x,0,.075),(.25,.82,.15),'ancient')
  # Actual sliding reading fork straddles the open scale with a visible reading gap.
  for y in (-.36,.36):rect(s,'reader_shoe',(.6,y,.33),(.50,.20,.25),'substrate')
  for x in (.39,.81):rect(s,'reading_fork',(x,0,.49),(.08,.84,.1),'ancient')
  sockets(s,(-2.5,0,.2),(2.5,0,.2))
 elif k=='boundary_vane':
  slab(s,'keyed_anchor',[(-.8,-.5),(.65,-.5),(.86,.05),(.4,.52),(-.68,.45)],0,.25,'substrate',True)
  for sign in (-1,1):
   ceramic_web(s,'split_tapered_vane',[(sign*.1,.18),(sign*.5,.30),(sign*.39,2.55),(sign*.13,3.5),(sign*.09,2.9)][::sign],-.14,.28)
   proxy(s,(sign*.23,0,1.5),(.21,.28,2.6))
  ceramic_web(s,'recessed_inner_spine',[(-.06,.25),(.06,.25),(.045,3.02),(-.045,3.02)],-.02,.10,'substrate')
  for z in (.65,1.1,1.55):rect(s,'interrupted_reference_mark',(0,-.075,z),(.07,.06,.18),'vein',False)
 elif k=='service_plinth':
  for sign in (-1,1):
   ceramic_web(s,'splayed_service_trestle',[(sign*.3,.10),(sign*1.15,.10),(sign*.97,.34),(sign*.57,.80),(sign*.50,1.02),(sign*.24,.92)][::sign],-.64,1.28)
   proxy(s,(sign*.59,0,.47),(.4,1.1,.7))
  rect(s,'service_bus',(0,.30,.5),(.35,.55,.6),'substrate')
  for y in (-.48,.48):
   slab(s,'separated_service_seat',[(-1.2,y-.22),(.95,y-.22),(1.2,y),(1.0,y+.22),(-1.2,y+.22)],.99,.16,'ancient',True)
   for x in (-.7,.7):rect(s,'inset_receiver',(x,y,1.15),(.18,.2,.035),'substrate',False)
  s.socket('SOCKET_SERVICE',(0,0,1.15),(0,0,1))
 elif k=='ossuary_spine_segment':
  rect(s,'recessed_spine',(0,0,.34),(3,.28,.32),'substrate')
  for i in range(5):
   x=-1.2+i*.6
   for sign in (-1,1):
    pts=[(x-.18,sign*.12),(x+.14,sign*.12),(x+.3,sign*.88),(x+.10,sign*1.3),(x-.18,sign*1.04),(x-.24,sign*.48)]
    slab(s,'swept_ceramic_rib',pts[::sign],.22+.06*math.sin(i),.20,'ancient',True)
    rect(s,'vertebral_bearing',(x,sign*.23,.27),(.22,.21,.35),'substrate')
   slab(s,'dorsal_key',[(x-.12,-.17),(x+.12,-.17),(x+.18,0),(x+.12,.17),(x-.12,.17)],.51,.12,'ancient')
  sockets(s,(-1.5,0,.3),(1.5,0,.3))
 s.socket('SOCKET_MOUNT',(0,0,0),(0,0,-1))
def ancient_lod_factory(asset_id,level):
 # Retain hard-edge ceramic topology; generic decimation rounds broad planar ceramic faces.
 result=F.Ship(asset_id+'_authored_lod'+str(level),COLORS);result.bank_boxes=[];result.bank_lod_level=level;ancient(result,asset_id)
 fine=('reference_mark','reference_key','seal_witness','inset_scale','inset_prism_reference','channel_reference_key')
 secondary=('channel_termination','drawer_key','dorsal_key','optical_inner_stop','buried_load_key')
 for obj in list(result.objects):
  if any(n in obj.name for n in fine+(secondary if level==2 else ())):
   result.objects.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
 return result
def geology_lod_factory(asset_id,level):
 result=F.Ship(asset_id+'_authored_lod'+str(level),COLORS);result.bank_boxes=[];result.bank_lod_level=level;geo(result,asset_id);return result
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--only');parser.add_argument('--render',action='store_true');parser.add_argument('--out-dir',default=OUT);parser.add_argument('--preview-dir',default=os.path.join(ROOT,'.devshots/asset-bank-natural'));args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);requested=set(args.only.split(',')) if args.only else None;rows=[]
 for cat,names,build in [('geology',GEO,geo),('growth',GROW,growth),('ancient',ANCIENT,ancient)]:
  for k in names:
   if requested and k not in requested:continue
   F.reset_scene();s=F.Ship(k,COLORS);s.bank_boxes=[];s.bank_source='tools/blender/forge/asset_bank_natural.py';build(s,k);out=os.path.join(args.out_dir,k)
   if cat=='ancient':s.bank_lod_factory=lambda level,asset_id=k:ancient_lod_factory(asset_id,level)
   elif k in ('bore_plug','metallic_vein_rib'):s.bank_lod_factory=lambda level,asset_id=k:geology_lod_factory(asset_id,level)
   description=('Engineered core bore through fractured geological mass, with cleavage-spalled lip, inset longitudinal tool scars and exposed fresh cut faces; metres' if k=='bored_rock_collar' else ('Asymmetric host-attached growth nest with split mature skin, recessed living membrane and branching root contacts; metres' if k=='supported_cyst_nest' else k.replace('_',' ')+'; reusable '+cat+' assembly in metres'))
   row=export_asset(s,out,k,cat,description,s.bank_boxes,tags=[cat,'modular','authoring-candidate']);rows.append(row)
   if args.render:
    preview=args.preview_dir;os.makedirs(preview,exist_ok=True);render_preview(s,os.path.join(preview,k+'_source.png'),width=600,height=450,samples=32);render_glb_preview(os.path.join(out,k+'_lod0.glb'),os.path.join(preview,k+'_export.png'),width=600,height=450,samples=32)
   print('BANK_DONE '+k,flush=True)
 if not requested and os.path.abspath(args.out_dir)==OUT:
  p=os.path.join(ROOT,'design/asset-bank/natural.json');doc=json.load(open(p));doc['assets']=[{'assetId':r['assetId'],'category':r['category'],'manifest':'assets/models/asset-bank/natural/'+r['assetId']+'/'+r['assetId']+'.json'} for r in rows]
  with open(p,'w') as f:json.dump(doc,f,indent=2);f.write('\n')
if __name__=='__main__':main()
