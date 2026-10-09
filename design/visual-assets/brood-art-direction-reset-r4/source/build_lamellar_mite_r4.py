"""Original lamellar-Mite design prototype, NOT a production asset.

Blender 4.3+. +X forward, +Y port, +Z dorsal. All output stays in this packet.
Deliberately separate from rejected sources and runtime. No third-party geometry.
"""
import bpy, bmesh, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'prototype'; OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def linear(c): return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
def material(name,hexcol,rough,coat=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    rgb=tuple(linear(int(hexcol[i:i+2],16)/255) for i in (0,2,4))
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=0
    p.inputs['Roughness'].default_value=rough
    p.inputs['Coat Weight'].default_value=coat
    p.inputs['Coat Roughness'].default_value=.23
    m.diffuse_color=(*rgb,1)
    m['physical_role']=name; m['prototype_not_runtime_finish']=True
    return m
M={
 'shell':material('Prototype_GrownWineCarapace','4d1024',.38,.12),
 'lip':material('Prototype_LamellarEdge','854254',.43,.08),
 'soft':material('Prototype_GraphiteFlexure','241f30',.58),
 'bone':material('Prototype_DenseCuttingChitin','c8b59c',.4),
}
def mesh(name,verts,faces,mat='shell',smooth=False):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
    me.materials.append(M[mat]); ob['anatomy_role']=name
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    for p in me.polygons:p.use_smooth=smooth
    return ob

def interp(rows,steps=3):
    # Local section interpolation, deliberately no global subdivision smoothing.
    out=[]
    for i in range(len(rows)-1):
        for j in range(steps):
            t=j/steps;out.append(tuple(a*(1-t)+b*t for a,b in zip(rows[i],rows[i+1])))
    out.append(rows[-1]);return out

def swept(name,rows,mat='shell',sides=10,steps=2,shape='keel'):
    # Changing blade section on a designed centreline: width, top, lower thickness.
    rows=interp(rows,steps);vs=[];fs=[]
    for i,(x,y,z,w,h,b) in enumerate(rows):
        p=Vector(rows[max(0,i-1)][:3]);q=Vector(rows[min(len(rows)-1,i+1)][:3])
        t=q-p;side=Vector((-t.y,t.x,0)).normalized()
        for j in range(sides):
            a=2*math.pi*j/sides;c=math.cos(a);sn=math.sin(a)
            # Tapered lenticular section with a stronger dorsal ridge, not a cylinder.
            zz=h*(max(0,sn)**.75) if sn>=0 else -b*(-sn)**.8
            v=Vector((x,y,z))+side*w*c;v.z+=zz;vs.append(tuple(v))
    for i in range(len(rows)-1):
        for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;fs.append((a,b,b+sides,a+sides))
    fs+=[tuple(reversed(range(sides))),tuple((len(rows)-1)*sides+j for j in range(sides))]
    return mesh(name,vs,fs,mat,shape=='soft')

def roof(name,sections,mat='shell',thickness=.14):
    # Full closed lamella with flanged shoulders, crowned roof and concave undercut.
    # Rows are x, halfwidth, rim height, crown height, sweep of side edge.
    ys=[-1,-.88,-.65,-.25,0,.25,.65,.88,1]
    profile=[0,.11,.48,.86,1,.86,.48,.11,0]
    vs=[];fs=[]
    for x,w,z,h,sweep in interp(sections,3):
        for u,f in zip(ys,profile):vs.append((x+sweep*abs(u)**1.6,u*w,z+h*f))
    sections=interp(sections,3)
    n=len(ys);count=len(vs)
    for v in vs[:]:vs.append((v[0],v[1],v[2]-thickness))
    for i in range(len(sections)-1):
        for j in range(n-1):
            a=i*n+j;fs.append((a,a+n,a+n+1,a+1));fs.append((a+count+1,a+count+n+1,a+count+n,a+count))
    perimeter=list(range(n))+[i*n+n-1 for i in range(1,len(sections))]+list(reversed(range((len(sections)-1)*n,(len(sections)-1)*n+n-1)))+[i*n for i in range(len(sections)-2,0,-1)]
    for a,b in zip(perimeter,perimeter[1:]+perimeter[:1]):fs.append((a,b,b+count,a+count))
    return mesh(name,vs,fs,mat)

def tube(name,points,radius,mat='shell',sides=7):
    # Only used as finite anatomical spars and lamellar lip growth, never full bodies.
    rows=[]
    for i,p in enumerate(points):
        q=max(.12,math.sin(math.pi*(i+.6)/(len(points)+.2)))
        rows.append((*p,radius*q,radius*q,radius*.6*q))
    return swept(name,rows,mat,sides,2,'soft')

# Continuous ventral tissue, buried below the lamellae rather than a visible ball.
swept('Ventral_muscular_core',[
 (-5.12,0,-.1,.025,.03,.025),(-4.7,0,-.05,.70,.36,.28),
 (-3.6,0,.03,1.50,.65,.5),(-2.1,0,.02,1.75,.60,.55),
 (-.8,0,-.02,1.68,.50,.48),(.7,0,-.08,1.24,.25,.36),
 (1.55,0,-.2,.40,.14,.2),(1.8,0,-.23,.1,.07,.07)],'soft',16,3,'soft')

# Three stepped dorsal sections with broad visible dark interfaces.
roof('Tergite_03_posterior_spear',[
 (-5.28,.04,.0,.04,0),(-4.68,.82,.06,.67,.06),
 (-3.86,1.58,.08,1.11,-.05),(-3.32,1.68,.09,1.17,-.16),
 (-3.20,1.59,.075,1.08,-.13)],thickness=.18)
roof('Tergite_02_overlap_saddle',[
 (-3.12,1.60,.25,1.22,-.20),(-2.69,2.07,.11,1.43,-.56),
 (-2.01,2.18,.06,1.40,-.48),(-1.48,1.79,.035,1.00,-.33),
 (-1.29,1.39,.02,.82,-.20)],thickness=.19)
roof('Tergite_01_cranial_keel',[
 (-1.22,1.13,.30,1.13,-.23),(-.69,1.43,.22,1.23,-.34),
 (-.08,1.42,.10,1.08,-.35),(.53,1.14,-.02,.77,-.25),
 (1.09,.77,-.10,.42,-.14),(1.53,.35,-.18,.21,-.05),
 (1.68,.035,-.20,.08,0)],thickness=.16)
# Edge growth stays narrow and real. Each rim follows its source plate.
for name,x,w,z,h,sw in [('Abdomen',-3.12,1.60,.25,1.22,-.20),('Cranium',-1.22,1.13,.30,1.13,-.23)]:
    pts=[]
    for u,f in zip([-1,-.88,-.65,-.25,0,.25,.65,.88,1],[0,.11,.48,.86,1,.86,.48,.11,0]):
        pts.append((x+sw*abs(u)**1.6,u*w,z+h*f+.018))
    tube(name+'_grown_rim',pts,.033,'lip',6)

for side,label in [(1,'port'),(-1,'starboard')]:
    # Shoulder cheek shields expose a deliberate dark interface to the cranial keel.
    swept('Shoulder_'+label+'_overlap_guard',[(-1.11,side*1.58,.10,.21,.35,.12),(-.60,side*1.79,.08,.38,.39,.15),(.09,side*1.84,.06,.42,.33,.11),(.62,side*1.69,.0,.18,.19,.08)],'shell',10,3)
    # Protected flexure runs continuously from shoulder to fixed feeding jaw.
    rows=[(.22,side*1.32,-.13,.48,.42,.35),(.85,side*1.88,-.15,.54,.49,.34),(1.61,side*2.24,-.13,.53,.44,.31),(2.20,side*2.38,-.08,.37,.31,.26)]
    swept('Jaw_'+label+'_buried_flexure',rows,'soft',14,3,'soft')
    # Rib loops are non-circular closed elliptical collars seated on this tissue.
    for k in range(4):
        x=.76+k*.29;y=side*(1.86+k*.17);z=-.12
        points=[]
        for j in range(17):
            a=2*math.pi*j/16
            points.append((x-.10*math.cos(a),y+.46*math.cos(a),z+.43*math.sin(a)))
        tube('Jaw_'+label+'_flexure_fold_'+str(k),points,.041,'soft',6)
    # Overhanging root cuff and distal cheliceral shield are stepped shell sections.
    swept('Jaw_'+label+'_root_cuff',[(.06,side*1.29,.04,.38,.40,.08),(.56,side*1.72,.12,.57,.56,.12),(1.13,side*2.07,.14,.59,.41,.10),(1.42,side*2.19,.11,.46,.33,.075)],'shell',10,2)
    swept('Jaw_'+label+'_distal_shield',[(1.91,side*2.38,.03,.32,.27,.22),(2.51,side*2.58,.10,.67,.47,.27),(3.35,side*2.60,.12,.66,.36,.21),(4.07,side*2.37,.08,.45,.25,.15),(4.65,side*2.02,.04,.16,.10,.065)],'shell',10,2)
    # Pale material is a tapered cutting insert-like growth, not an entire banana.
    swept('Jaw_'+label+'_ivory_cutting_lip',[(3.10,side*2.58,-.15,.44,.13,.07),(3.73,side*2.53,-.10,.39,.15,.08),(4.34,side*2.27,-.06,.32,.13,.07),(5.11,side*1.90,-.018,.19,.095,.04),(5.60,side*1.65,-.005,.075,.055,.02),(6,side*1.6,0,.005,.009,.006)],'bone',8,2)
    # Lateral vanes: thick anchored root, continuous membrane, structural spars.
    swept('Vane_'+label+'_coxal_sheath',[(-1.51,side*1.61,.02,.33,.31,.12),(-2.04,side*2.15,.09,.37,.27,.11),(-2.63,side*2.75,.10,.30,.19,.07),(-3.13,side*3.10,.08,.16,.12,.04)],'shell',10,2)
    swept('Vane_'+label+'_taut_membrane',[(-2.47,side*2.75,.025,.10,.07,.045),(-3.23,side*3.21,.01,.55,.055,.04),(-4.14,side*3.53,.045,.64,.06,.04),(-4.90,side*3.92,.10,.24,.05,.03),(-5.20,side*4.19,.16,.008,.01,.008)],'soft',12,3,'soft')
    paths=[
      [(-2.16,2.39,.09),(-2.9,3.41,.10),(-3.9,3.97,.13),(-5.20,4.19,.17)],
      [(-2.48,2.76,.08),(-3.29,3.29,.10),(-4.55,3.81,.13),(-5.20,4.19,.17)],
      [(-2.52,2.72,.06),(-3.43,2.84,.08),(-4.38,3.14,.11),(-5.20,4.19,.17)],
    ]
    for i,path in enumerate(paths):tube('Vane_'+label+'_structural_spar_'+str(i),[(x,side*y,z) for x,y,z in path],.085 if i!=1 else .05,'shell',7)
    swept('Vane_'+label+'_terminal_edge',[(-4.90,side*4.06,.16,.065,.025,.015),(-5.13,side*4.22,.17,.12,.055,.028),(-5.27,side*4.32,.18,.01,.007,.003)],'bone',7,2)
    # A short rooted sub-cheek stays below the existing shield footprint.
    swept('Cheek_'+label+'_support',[(-.31,side*1.72,-.16,.23,.22,.15),(-.12,side*2.32,-.23,.22,.16,.12),(-.72,side*2.94,-.25,.16,.13,.06),(-1.28,side*3.05,-.15,.006,.01,.008)],'soft',8,2)

# Mouth cavity is constructed as a hood and floor with a real open mouth between.
roof('Preoral_roof',[(.92,.65,-.16,.16,0),(1.52,.54,-.21,.16,0),(1.88,.22,-.26,.12,0)],'soft',.08)
roof('Preoral_floor',[(1.02,.55,-.47,.04,0),(1.6,.48,-.47,.035,0),(1.99,.1,-.39,.03,0)],'soft',.07)

meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Finishing: tiny physically appropriate edge rounding, no global soap smoothing.
for ob in meshes:
    if ob.data.materials[0] in (M['shell'],M['bone'],M['lip']):
        mod=ob.modifiers.new('Small grown edge roll','BEVEL');mod.width=.026;mod.segments=2;mod.limit_method='ANGLE';mod.angle_limit=.38
        bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
        # Flat regions retained; normals do not smooth across the silhouette crown.
    # Angle-aware normals preserve the carapace's keel and flange breaks.
    for face in ob.data.polygons: face.use_smooth=True
    ob.data.set_sharp_from_angle(angle=math.radians(39))
    wn=ob.modifiers.new('Area-weighted hard-edge normals','WEIGHTED_NORMAL');wn.keep_sharp=True;wn.weight=40
    bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=wn.name)
    ob['prototype']=True

for name,p in {'SOCKET_BROOD_CONTACT_PORT':(6,1.6,0),'SOCKET_BROOD_CONTACT_STARBOARD':(6,-1.6,0),'SOCKET_BROOD_TETHER_DORSAL':(-.7,0,1.86),'SOCKET_BROOD_SIGNAL':(.8,0,.58)}.items():
    ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob.location=p
    ob['reference_only']=True

scene=bpy.context.scene;scene['status']='FORM_STUDY_NOT_RUNTIME';scene['design']='Lamellar shear Mite R4'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mite-lamellar-r4.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'mite-lamellar-r4.glb'),export_format='GLB',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
pts=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
report={'status':'design prototype, not runtime accepted','axes':'Blender +X forward +Y port +Z up; glTF standard Y-up conversion','materialSlots':4,'meshCount':len(meshes),'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),'boundsBlender':{'min':[min(v[i] for v in pts) for i in range(3)],'max':[max(v[i] for v in pts) for i in range(3)]},'runtimeEdits':False,'rigged':False,'uvBaked':False,'lodsBuilt':False,'trueGameLookVerified':False,'sourceGlbSha256':hashlib.sha256((OUT/'mite-lamellar-r4.glb').read_bytes()).hexdigest()}
(OUT/'prototype-facts-r4.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
