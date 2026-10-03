"""Mite anatomical rebuild. Isolated authored Forge source, never publishes.
Blender +X nose +Y port +Z dorsal; GLB +X forward +Y up +Z starboard.
"""
import bpy,bmesh,math,sys,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from forge_paths import forge_root
FROOT=forge_root()
sys.path.insert(0,str(FROOT));import forge as F,forge_export as E,brood_kit as K
HELPERS=Path(__file__).resolve().parent
ns={'__file__':str(HELPERS/'shape_base.py')}
exec((HELPERS/'shape_base.py').read_text(),ns)
catmull=ns['catmull'];sys.path.insert(0,str(HELPERS));from a6_shape_helpers import roof_shell,cutting_blade
OUT=R/'study-m6';OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
s=F.Ship('brood_mite',{'carapace':'#70314f','chitin':'#a18d9a','membrane':'#211b2b','glow_brood':'#c4a7dd'})
K.apply_chitin_surface(s)
MATS={'clay':s.mat('carapace'),'soft':s.mat('membrane'),'edge':s.mat('chitin')}
ns['MATS']=MATS
make_mesh=ns['make_mesh'];body=ns['body'];blade=ns['blade']
# Short posterior visceral volume, not a capsule: pointed tail, broad haunch,
# forward compression into a neck collar. The shell is the dominant mass.
body('MITE_continuous_ventral_core',[(-5.25,0,-.1,.02,.04,.03),(-4.6,0,-.05,.75,.65,.36),(-3.5,0,0,1.92,1.18,.55),(-2.1,0,0,2.18,1.20,.59),(-.95,0,.0,1.36,.87,.52),(-.25,0,-.01,1.45,.7,.5),(.8,0,-.08,1.60,.57,.45),(1.85,0,-.17,.72,.34,.3),(2.05,0,-.19,.12,.08,.05)],'body','soft',n=24)
# One genuinely vaulted posterior shell with shoulders and a firm growth keel.
abd=roof_shell('MITE_abdominal_carapace',[(-5.30,.04,-.02,.07),(-4.73,.76,.12,.85),(-3.72,1.92,.18,1.42),(-2.55,2.31,.19,1.65),(-1.45,1.99,.20,1.42),(-.68,1.34,.23,.91)],'body',make_mesh,catmull)
# Thoracic saddle overlaps the collar, and narrows to an anterior clypeus.
thorax=roof_shell('MITE_thoracic_saddle',[(-.90,.68,.12,.75),(-.52,1.31,.12,.94),(.14,1.72,.10,.97),(.91,1.44,.06,.76),(1.18,1.15,.02,.49),(1.64,.68,-.04,.25),(1.93,.44,-.14,.15)],'body',make_mesh,catmull)
# Thin lateral ecdysial margin grows from the shell's perimeter, not a badge.
for side,label in [(1,'PORT'),(-1,'STARBOARD')]:
 # Clefted mouth below brow, paired curved force path from collar to attack point.
 root=blade('MITE_cheliceral_muscle_'+label,[(.17,side*1.08,-.14,.53,.45),(.91,side*1.88,-.23,.60,.52),(1.88,side*2.34,-.25,.55,.39),(2.57,side*2.49,-.19,.34,.28)],'body','soft',n=16)
 # Hard shoulder socket seated over muscle; narrowing root feeds a flattened jaw.
 blade('MITE_cheliceral_coxa_'+label,[(.32,side*1.25,.01,.29,.33),(1.10,side*1.92,.06,.49,.39),(1.91,side*2.35,-.08,.44,.32),(2.47,side*2.48,-.16,.23,.21)],'body','clay',n=16)
 jaw=cutting_blade('MITE_contact_fang_'+label,[(2.08,side*2.39,-.20,.32,.31),(2.73,side*2.61,-.16,.43,.31),(3.70,side*2.60,-.10,.33,.27),(4.75,side*2.17,-.05,.20,.18),(5.52,side*1.70,-.015,.075,.075),(6.0,side*1.60,0,.006,.009)],side,'body',make_mesh,catmull,'edge')
 # Existing motion group names retained. Fin pivots are real ball-and-collar hips.
 pivot=Vector((-1.53,side*1.74,-.10))
 blade('MITE_hip_collar_'+label,[(-1.01,side*1.34,-.12,.48,.31),(-1.55,side*1.86,-.12,.49,.32),(-2.07,side*2.25,-.13,.32,.23)],'body','clay',n=14)
 start=set(bpy.context.scene.objects)
 blade('MITE_fin_femur_'+label,[(-1.53,side*1.74,-.10,.24,.24),(-2.16,side*2.63,-.14,.35,.28),(-2.79,side*3.19,-.11,.24,.18),(-3.09,side*3.38,-.08,.13,.12),(-3.35,side*3.54,-.055,.025,.045)],'fin','clay',n=12)
 # Swept broad tissue vane returns into the limb: closed, curved, finite thickness.
 blade('MITE_fin_membrane_'+label,[(-1.83,side*2.16,-.15,.11,.08),(-2.67,side*2.94,-.16,.52,.10),(-3.68,side*3.24,-.12,.70,.075),(-4.60,side*3.68,.11,.30,.045),(-5.16,side*4.21,.24,.008,.006)],'fin','soft',n=12)
 # Leading cartilage is seated on the actual outer curve of the finite vane.
 # Its base tucks into the shortening femur, never crosses the top of a sheath.
 blade('MITE_fin_leading_cartilage_'+label,[(-2.73,side*3.23,-.08,.10,.105),(-3.05,side*3.57,-.025,.11,.09),(-3.45,side*3.87,-.01,.10,.085),(-4.15,side*3.94,.085,.075,.06),(-4.78,side*4.02,.20,.04,.035),(-5.16,side*4.21,.24,.004,.007)],'fin','edge',n=10)
 # Short supporting tarsal limb: articulated taper and negative elbow opening.
 blade('MITE_foreleg_'+label,[(.0,side*1.5,-.3,.28,.26),(.38,side*2.25,-.47,.25,.20),(-.30,side*2.90,-.52,.17,.13),(-1.18,side*3.20,-.37,.055,.055),(-1.67,side*3.32,-.18,.004,.006)],'fin','clay',n=12)
 moving=[o for o in bpy.context.scene.objects if o not in start and o.type=='MESH']
 # Static foreleg has its own shoulder; do not rotate it around the posterior hip.
 moving=[o for o in moving if 'foreleg' not in o.name]
 node=E._root_empty('MOTION_MITE_MEMBRANE_'+label,{'source_pivot':list(pivot),'role':'locomotor-fin'})
 node.location=pivot
 for o in moving:
  for v in o.data.vertices:v.co-=pivot
  o.parent=node
# Actual oral floor and upper brow form an open wedge cavity between cheliceral roots.
body('MITE_oral_floor',[(.73,0,-.41,.13,.04,.025),(1.23,0,-.47,.75,.065,.07),(1.85,0,-.48,.50,.075,.06),(2.0,0,-.45,.035,.015,.015)],'body','soft',n=16)
# Real, open preoral cavity: subtract a tapered lumen from the existing ventral
# core, with continuous wall/floor/brow. No detached ring or painted black spot.
core=bpy.data.objects['MITE_continuous_ventral_core']
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=(1.92,0,-.20))
cut=bpy.context.object;cut.scale=(.77,.49,.265);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.context.view_layer.objects.active=core;mod=core.modifiers.new('Preoral lumen','BOOLEAN');mod.object=cut;mod.operation='DIFFERENCE';mod.solver='EXACT';bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
# Rigid shell wins the seating relation: compress soft tissue under the fixed roof.
core=bpy.data.objects['MITE_continuous_ventral_core'];bpy.context.view_layer.update()
for v in core.data.vertices:
 for host in [abd,thorax]:
  hit,p,normal,index=host.ray_cast(Vector((v.co.x,v.co.y,20)),Vector((0,0,-1)))
  if hit and v.co.z>p.z-.10:v.co.z=p.z-.10
# Flexible anterior tissue stays below the uninterrupted rigid shell rim.
# This is an anatomical seating rule, not per-face shell paint or a second mask.
for v in core.data.vertices:
 if v.co.x>-.75:
  rim=.02 if v.co.x<.7 else .02-(min(v.co.x,1.98)-.7)*.14
  if v.co.z>rim:v.co.z=rim
core.data.update()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Flatten the resting distal fin centerline, preserving its real section and
# .3-radian hip fold. This keeps the fixed projected anatomy within tolerance
# through anticipation instead of inventing per-pose native collider motion.
for o in meshes:
 if o.parent and o.parent.name.startswith('MOTION_'):
  for v in o.data.vertices:
   world_x=v.co.x+o.parent.location.x
   v.co.z-=.34*max(0,min(1,(-world_x-3.5)/1.66))
  o.data.update()
for o in meshes:
 o['forge_bevel']=0;o['forge_smooth']=70;o['forge_uv_scale']=1
 s.add(o);F.finish_object(o)
 if o.data.has_custom_normals:
  bpy.context.view_layer.objects.active=o;bpy.ops.mesh.customdata_custom_splitnormals_clear()
 for e in o.data.edges:e.use_edge_sharp=False
 for p in o.data.polygons:p.use_smooth=True
E._rename_materials(s)
# Preserve sockets exactly at source locations for this form study.
for name,p in {'SOCKET_BROOD_CONTACT_PORT':(6,1.6,0),'SOCKET_BROOD_CONTACT_STARBOARD':(6,-1.6,0),'SOCKET_BROOD_TETHER_DORSAL':(-.7,0,1.86),'SOCKET_BROOD_SIGNAL':(.8,0,.58)}.items():
 n=E._root_empty(name,{'review_only':True});n.location=p
scene=bpy.context.scene;scene['candidate']='M6 compact spring-mite';scene['runtime_accepted']=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mite-M6-source.blend'))
# Neutral diagnostic views only. These are not actual Look/GPU evidence.
pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
lo=Vector([min(v[i] for v in pts) for i in range(3)]);hi=Vector([max(v[i] for v in pts) for i in range(3)]);center=(lo+hi)*.5;extent=max(hi-lo)
for name,loc,power,size in [('key',(.2,-.7,1),1700,.8),('fill',(-.8,.2,.5),800,1),('rim',(.5,.8,.6),1800,.6)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power*extent*extent/100;d.shape='DISK';d.size=extent*size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=center+Vector(loc)*extent;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('Neutral diagnostic');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.12,.12,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=850;scene.render.resolution_y=680;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.render.film_transparent=True
cd=bpy.data.cameras.new('ReviewCamera');cam=bpy.data.objects.new('ReviewCamera',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.type='ORTHO';cd.ortho_scale=extent*1.25
ld=bpy.data.lights.new('Ventral diagnostic fill','AREA');ld.energy=650;ld.size=6;ll=bpy.data.objects.new('Ventral diagnostic fill',ld);scene.collection.objects.link(ll);ll.location=(3,-4,-7);ll.rotation_euler=(-ll.location).to_track_quat('-Z','Y').to_euler()
for view,pos in [('top',(0,0,3)),('chase60',(0,-1.5,2.598076)),('close',(1.6,-2,1.8)),('mouth',(3,-1.0,.55)),('underside',(1.7,-1.1,-1.0)),('side',(.3,-3,.25))]:
 target=Vector((1.75,0,-.16)) if view=='mouth' else center
 cd.ortho_scale=4.2 if view=='mouth' else extent*1.25
 cam.location=target+Vector(pos)*extent;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/f'M6-{view}.png');bpy.ops.render.render(write_still=True)
# The two old event-bound fin roots stay authoritative. Actual target contact
# is a native impact anywhere inside the 48-tick commit, not an invented bite event.
cd.ortho_scale=extent*1.25;target=center;cam.location=center+Vector((.3,-2,1.8))*extent;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
for phase,fraction in [('approach',0),('windup',1),('attack',.1),('recovery',.6)]:
 for side,label in [(1,'PORT'),(-1,'STARBOARD')]:bpy.data.objects['MOTION_MITE_MEMBRANE_'+label].rotation_euler.x=side*.3*fraction
 bpy.context.view_layer.update();scene.render.filepath=str(OUT/f'M6-pose-{phase}.png');bpy.ops.render.render(write_still=True)
for label in ['PORT','STARBOARD']:bpy.data.objects['MOTION_MITE_MEMBRANE_'+label].rotation_euler.x=0
report={'candidate' :'M6 form study','boundsBlender':{'min':list(lo),'max':list(hi)},'combatStatsChanged':False,'sourceAxes':'+X nose,+Y port,+Z dorsal','review':'unreviewed; not runtime promoted','meshCount':len(meshes),'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),'notes':['Dominant short abdominal shell, narrow collar, low thoracic saddle','Rooted cheek muscle/coxal socket transfers contact to fixed tapering fangs','Paired locomotor fins preserve named motion roots at revised anatomical pivots','Fixed fang tips retain exact named contact socket coordinates; static contact anatomy']}
(OUT/'study.json').write_text(json.dumps(report,indent=2))
