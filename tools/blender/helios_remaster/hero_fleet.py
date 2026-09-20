"""Surgical Helios hero/traffic remaster; imports and retains existing authored ships.

Run in Blender 5.1: --background --python this_file -- --inspect (or --build).
Candidates never touch live manifests or release packages. Runtime axes remain +X forward,
+Y up; Blender's importer maps this to +X forward, +Z up, -Y starboard.
"""
from __future__ import annotations
import argparse, copy, hashlib, json, math, struct, subprocess, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / 'tools/blender'
sys.path.insert(0, str(TOOLS))
from spaceface_export import export_gltf
from spaceface_chase_camera import apply_chase_camera

NAMES = ['kestrel','helios_lark','helios_cradle','helios_span','ashline_rig','survey_pin',
 'massline_express_liner_v1','helios_arclight','volatiles_tanker','inspection_cutter',
 'wasp_production_v1','hornet_production_v1','bastion_production_v1','drifter_production_v1']
OUT = ROOT / '.devshots/helios-remaster/hero-fleet'
SOURCE = ROOT / 'assets/ships/parts/wholeships'
LOD_DETAIL=0

def source_bytes(name):
    data=(SOURCE/(name+'.glb')).read_bytes()
    doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    if doc.get('asset',{}).get('extras',{}).get('spacefaceAsset',{}).get('surfaceGeometryRemaster')=='helios-hero-fleet-2026-09-19':
        registry=json.loads((Path(__file__).with_name('hero_fleet_sources.json')).read_text(encoding='utf-8-sig'))
        source=registry[name]
        data=subprocess.check_output(['git','cat-file','blob',source['sourceBlob']],cwd=ROOT)
        if hashlib.sha256(data).hexdigest()!=source['sha256']:raise RuntimeError('Pinned source hash mismatch: '+name)
    return data

def clear():
    # glTF import preserves unrelated scene extras; never carry the previous asset's identity.
    for key in list(bpy.context.scene.keys()): del bpy.context.scene[key]
    for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
    for meshes in (bpy.data.meshes,bpy.data.materials,bpy.data.images):
        for item in list(meshes):
            if item.users == 0: meshes.remove(item)

def visible(obj):
    n = obj.name.lower()
    return obj.type == 'MESH' and 'collision' not in n and not n.startswith(('lod1','lod2')) and not obj.get('nonRender')

def bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return [[round(min(p[i] for p in pts),4) for i in range(3)],
            [round(max(p[i] for p in pts),4) for i in range(3)]]

def import_ship(name):
    clear()
    temp=OUT/'.source-input';temp.mkdir(parents=True,exist_ok=True)
    file=temp/(name+'.glb');file.write_bytes(source_bytes(name))
    bpy.ops.import_scene.gltf(filepath=str(file))
    bpy.context.view_layer.update()
    return [o for o in bpy.context.scene.objects if visible(o)]

def inspect(names):
    data={}
    for name in names:
        meshes=import_ship(name)
        data[name]={'sha256':hashlib.sha256((SOURCE/(name+'.glb')).read_bytes()).hexdigest(),
          'objects':[{'name':o.name,'bounds':bounds(o),'tris':sum(len(p.vertices)-2 for p in o.data.polygons),
             'materials':[m.name if m else None for m in o.data.materials]} for o in meshes]}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'source_inventory.json').write_text(json.dumps(data,indent=2))
    print('HERO_FLEET_INSPECT',str(OUT/'source_inventory.json'))

def mat(name, color, metal=0.0, rough=.5, emission=0.0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metal
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Emission Color'].default_value=(*color,1)
    bs.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*color,1)
    m['spacefaceRemasterGeometry']=True
    return m

def mesh_obj(name, verts, faces, material):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(ob)
    if material: me.materials.append(material)
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    return ob

def bevel(ob,width=.03,segments=2):
    if LOD_DETAIL>=2:return ob
    mod=ob.modifiers.new('Machined edge breaks','BEVEL');mod.width=width;mod.segments=segments
    if LOD_DETAIL==1:mod.segments=1
    mod.limit_method='ANGLE';mod.angle_limit=.55
    wn=ob.modifiers.new('Planar plate normals','WEIGHTED_NORMAL');wn.keep_sharp=True;wn.weight=40
    return ob

def octagon(x,y,l,w,c=.16):
    c=min(l,w)*c
    return [(x-l/2+c,y-w/2),(x+l/2-c,y-w/2),(x+l/2,y-w/2+c),(x+l/2,y+w/2-c),
            (x+l/2-c,y+w/2),(x-l/2+c,y+w/2),(x-l/2,y+w/2-c),(x-l/2,y-w/2+c)]

def section_solid(name,x,y,l,w,z0,z1,material):
    pts=octagon(x,y,l,w)
    v=[(a,b,z) for z in (z0,z1) for a,b in pts]
    f=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    return mesh_obj(name,v,f,material)

def rim(name,x,y,l,w,z,depth,material):
    # Four contiguous folded rings: bright narrow horizontal flange, dark inner wall,
    # tapered liner. This is a hollow assembly, never a black rectangle on a roof.
    cross=[(l+.14,w+.14,z+.026),(l,w,z+.035),(l-.10,w-.10,z-depth),(l-.16,w-.16,z-depth)]
    verts=[(a,b,zz) for ll,ww,zz in cross for a,b in octagon(x,y,ll,ww)]
    faces=[]
    for k in range(len(cross)-1):
        for i in range(8): faces.append((k*8+i,k*8+(i+1)%8,(k+1)*8+(i+1)%8,(k+1)*8+i))
    return bevel(mesh_obj(name,verts,faces,material),.012,2)

def box(name,loc,scale,material,edge=.02):
    x,y,z=loc;l,w,h=scale
    return bevel(section_solid(name,x,y,l,w,z-h/2,z+h/2,material),edge,2)

def pipe(name,points,radius,material,sides=8):
    # Portable polygonal conduit, rooted at both endpoints with no curve runtime cost.
    sides=min(sides,4 if LOD_DETAIL>=2 else 6 if LOD_DETAIL==1 else sides)
    verts=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
        tangent.normalize(); u=tangent.cross(Vector((0,0,1)))
        if u.length<.01: u=tangent.cross(Vector((0,1,0)))
        u.normalize();v=tangent.cross(u).normalized()
        verts += [tuple(Vector(p)+radius*(math.cos(j*math.tau/sides)*u+math.sin(j*math.tau/sides)*v)) for j in range(sides)]
    faces=[tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+j for j in range(sides))]
    for i in range(len(points)-1):
        for j in range(sides): faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    return mesh_obj(name,verts,faces,material)

def top_at(meshes,x,y):
    hits=[]
    origin=Vector((x,y,100))
    for ob in meshes:
        if ob.type!='MESH':continue
        inv=ob.matrix_world.inverted(); direction=(inv.to_3x3()@Vector((0,0,-1))).normalized()
        hit,loc,normal,idx=ob.ray_cast(inv@origin,direction)
        if hit:
            world=ob.matrix_world@loc
            hits.append((world.z,ob))
    return max(hits,key=lambda x:x[0]) if hits else (None,None)

def cut(meshes,x,y,l,w,ztop,depth,tag):
    cutter=section_solid('CUTTER_'+tag,x,y,l,w,ztop-depth,ztop+1,None)
    altered=[]
    for ob in meshes:
        lo,hi=bounds(ob)
        if hi[0]<x-l/2 or lo[0]>x+l/2 or hi[1]<y-w/2 or lo[1]>y+w/2 or hi[2]<ztop-depth: continue
        mod=ob.modifiers.new('True recessed '+tag,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        bpy.context.view_layer.objects.active=ob
        try: bpy.ops.object.modifier_apply(modifier=mod.name);altered.append(ob.name)
        except Exception as err:
            ob.modifiers.remove(mod);raise RuntimeError('Cavity Boolean failed '+ob.name) from err
    bpy.data.objects.remove(cutter,do_unlink=True)
    return altered

def shutter(name,x,y,z,l,w,matr,tilt=.22):
    # Folded leaf has a peaked section and two return hems, rather than a beveled bar.
    stations=[(-l/2,z-tilt*.3),(-l/2+.06,z+.035),(l/2-.06,z+tilt),(l/2,z+tilt-.065)]
    verts=[(x+a,y+b,zz) for a,zz in stations for b in (-w/2,w/2)]
    faces=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(stations)-1)]
    ob=mesh_obj(name,verts,faces,matr)
    if LOD_DETAIL<2:
        s=ob.modifiers.new('Folded sheet thickness','SOLIDIFY');s.thickness=.018
    return bevel(ob,.012,2)

def cavity(meshes,label,x,y,l,w,depth,kind,mats,level=0):
    z,hit=top_at(meshes,x,y)
    if z is None: raise RuntimeError('No authored hull under '+label+' at '+str((x,y)))
    changed=cut(meshes,x,y,l,w,z,depth,label)
    if not changed: raise RuntimeError('No source modified by '+label)
    prefix=f'LOD{level}_Remaster_'
    before=set(bpy.data.objects)
    rim(prefix+label+'_NickelSeam',x,y,l,w,z,depth,mats['steel'])
    section_solid(prefix+label+'_OxidizedLiner',x,y,l-.1,w-.1,z-depth-.015,z-depth+.025,mats['dark'])
    count=(3 if kind=='heavy' else max(3,round(l/.54))) if LOD_DETAIL==0 else (2 if kind=='heavy' else max(2,round(l/1.25))) if LOD_DETAIL==1 else 1
    for i in range(count):
        px=x-l*.39+i*l*.78/max(1,count-1)
        if kind=='optical':
            if LOD_DETAIL<2:box(prefix+label+'_LensMount', (px,y,z-depth*.53),(l/count*.68,w*.72,depth*.22),mats['dark'],.015)
            box(prefix+label+'_RecessedGlazing',(px+.01,y,z-depth*.35),(l/count*.42,w*.49,.028),mats['glass'],.008)
            if LOD_DETAIL==0:box(prefix+label+'_Signal', (px-l/count*.23,y,z-depth*.34),(.03,w*.27,.019),mats['warm'],.005)
        else:
            shutter(prefix+label+'_FoldedLeaf',px,y,z-depth*.45,l/count*.69,w*.82,mats['ceramic'] if kind=='heavy' else mats['steel'],min(.13,depth*.25))
    # A pressure manifold and its two returns make the cooling unit's service connection clear.
    yy=y-w*.3
    if LOD_DETAIL==0:pipe(prefix+label+'_CoolantReturn',[(x-l*.38,yy,z-depth*.82),(x-l*.38,yy,z-depth*.6),(x+l*.38,yy,z-depth*.6),(x+l*.38,yy,z-depth*.82)],min(.05,w*.045),mats['copper'])
    return {'label':label,'center':[x,y,z],'size':[l,w,depth],'sourceObjects':changed,'newObjects':[o.name for o in set(bpy.data.objects)-before]}

# Parameters are deliberate placements on the inspected original construction, in Blender metres.
CAVITIES={
 'kestrel':[('AftPortHeatAccess',-6.4,-1.75,2.3,.67,.43,'cool'),('AftStarboardHeatAccess',-6.4,1.75,2.3,.67,.43,'cool')],
 'helios_lark':[('PortWingRootSlot',.15,-2.65,1.9,.60,.18,'cool'),('StarboardWingRootSlot',.15,2.65,1.9,.60,.18,'cool')],
 'helios_cradle':[('PortCargoArmService',-.7,-3.1,4.0,1.1,.60,'heavy'),('StarboardCargoArmService',-.7,3.1,4.0,1.1,.60,'heavy'),('AftHeatSump',-7.0,0,1.9,1.7,.5,'cool')],
 'helios_span':[('CargoPortA',-7.5,-2.8,2.1,.86,.43,'heavy'),('CargoPortB',-1.8,-2.8,2.1,.86,.43,'heavy'),('CargoPortC',4,-2.8,2.1,.86,.43,'heavy'),('CargoStarboardA',-7.5,2.8,2.1,.86,.43,'heavy'),('CargoStarboardB',-1.8,2.8,2.1,.86,.43,'heavy'),('CargoStarboardC',4,2.8,2.1,.86,.43,'heavy')],
 'ashline_rig':[('SalvageDeckCooling',-1.8,0,1.7,.68,.36,'heavy')],
 'survey_pin':[('PortInstrumentTray',0,-1.65,4.1,.85,.52,'optical'),('StarboardHeatTray',-1.1,1.65,3.8,.85,.48,'cool')],
 'massline_express_liner_v1':[],
 'helios_arclight':[('PortThermalGallery',-2.0,-2.7,9.2,1.24,.92,'cool'),('StarboardThermalGallery',-2.0,2.7,9.2,1.24,.92,'cool')],
 'inspection_cutter':[('AftScannerWell',-5.0,-.88,3.15,1.0,.73,'optical'),('ForeSpectrumWell',.1,.85,3.25,1.0,.68,'optical')],
 'wasp_production_v1':[('PortNacelleThermal',-3.7,-5.25,4.0,.72,.38,'cool'),('StarboardNacelleThermal',-3.7,5.25,4.0,.72,.38,'cool')],
 'hornet_production_v1':[('DorsalExchanger',-1.9,0,2.2,.66,.32,'heavy')],
 'bastion_production_v1':[('PortGunService',-4.2,-.83,4.1,.84,.55,'heavy'),('StarboardHeatExchanger',-3.1,.94,2.8,.62,.44,'cool')],
 'drifter_production_v1':[('AftMaintenance',-3.7,-.48,2.65,.79,.43,'heavy'),('StarboardCoolant',-.8,.95,2.1,.6,.37,'cool')]
}

def tube_ring(name,x,y,z,rad0,rad1,height,material,n=24):
    n=min(n,8 if LOD_DETAIL>=2 else 12 if LOD_DETAIL==1 else n)
    verts=[]
    for rr,zz in [(rad0,z),(rad0,z+height),(rad1,z+height),(rad1,z)]:
        verts += [(x+rr*math.cos(i*math.tau/n),y+rr*math.sin(i*math.tau/n),zz) for i in range(n)]
    faces=[(k*n+i,k*n+(i+1)%n,((k+1)%4)*n+(i+1)%n,((k+1)%4)*n+i) for k in range(4) for i in range(n)]
    return bevel(mesh_obj(name,verts,faces,material),.016,2)

def tanker(meshes,mats,level):
    report=[]
    for index,x in enumerate((-7.8,.2,8.2)):
        z,hit=top_at(meshes,x,0)
        if z is None: raise RuntimeError('Tanker head missing')
        tag=f'LOD{level}_Remaster_PressureHead{index}'
        # The retained lid receives a physically open valve cavity, pressure crown and flange.
        changed=cut(meshes,x,0,1.08,1.08,z,.55,tag)
        section_solid(tag+'_ValveRecess',x,0,1.1,1.1,z-.58,z-.49,mats['dark'])
        tube_ring(tag+'_ValveFlange',x,0,z,.76,.54,.12,mats['steel'])
        if LOD_DETAIL<2:pipe(tag+'_ValveBridge',[(x-.45,0,z-.29),(x+.45,0,z-.29)],.10,mats['copper'])
        tube_ring(tag+'_PressureSeat',x,0,z-.015,1.87,1.74,.11,mats['dark'])
        # A formed segmented crown bows off the original flat head, terminating at the valve flange.
        for j in range(6):
            a=j*math.tau/6
            pts=[]
            for r,h in [(1.76,.08),(1.32,.30),(.77,.21)]:
                for off in (-.35,.35): pts.append((x+r*math.cos(a+off),r*math.sin(a+off),z+h))
            ob=mesh_obj(tag+'_FormedCapSegment',pts,[(0,1,3,2),(2,3,5,4)],mats['ceramic'])
            if LOD_DETAIL<2:
                sol=ob.modifiers.new('Pressure plate thickness','SOLIDIFY');sol.thickness=.055
            bevel(ob,.025,2)
            if LOD_DETAIL==0:pipe(tag+'_RadialClamp',[(x+1.8*math.cos(a),1.8*math.sin(a),z+.08),(x+1.25*math.cos(a),1.25*math.sin(a),z+.35), (x+.77*math.cos(a),.77*math.sin(a),z+.23)],.042,mats['steel'])
        report.append({'label':tag,'center':[x,0,z],'sourceObjects':changed})
    return report

def ashline_truss(mats,level):
    p=f'LOD{level}_Remaster_DriveLoad'
    for sign in (-1,1):
        y=.34+sign*.36
        for z in (-.25,.4): pipe(p+'_Longeron',[(-7.3,y,z),(-5.4,y,z),(-3.25,y,z+.15)],.065,mats['steel'])
        for x in (-7.15,-6.25,-5.35,-4.45):
            pipe(p+'_Diagonal',[(x,y,-.25),(x+.8,y,.48)],.046,mats['copper'])
            if LOD_DETAIL==0:box(p+'_AttachmentShoe',(x,y,.4),(.22,.21,.10),mats['dark'],.018)

def formed_housing(name,sections,material):
    # Stepped manufactured transverse sections. Width, chine, sheer and roof heights
    # are authored per station; this replaces uninterrupted slab constructions.
    verts=[]
    for x,width,bottom,top in sections:
        h=top-bottom
        ring=[(-width*.40,bottom),(-width*.50,bottom+h*.22),(-width*.50,top-h*.32),(-width*.35,top),
              (width*.35,top),(width*.50,top-h*.32),(width*.50,bottom+h*.22),(width*.40,bottom)]
        verts += [(x,y,z) for y,z in ring]
    faces=[tuple(range(7,-1,-1)),tuple((len(sections)-1)*8+i for i in range(8))]
    for j in range(len(sections)-1):
        for i in range(8): faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
    return bevel(mesh_obj(name,verts,faces,material),.045,2)

def arclight_structure(objects,mats,level):
    p=f'LOD{level}_Remaster_Arclight'
    surfaces=[o for o in objects if 'hook' not in o.name.lower() and 'gun' not in o.name.lower()]
    # Remove the actual top slab and the two obsolete marker pegs in that footprint.
    # It becomes a deep, exposed service spine with two separate formed bridge islands.
    changed=cut(surfaces,-1.7,0,19.8,3.7,7,5.15,p+'_SpineOpening')
    section_solid(p+'_ServiceDeck',-1.7,0,19.8,3.6,1.81,1.9,mats['dark'])
    rim(p+'_DorsalCoaming',-1.7,0,19.8,3.7,2.28,.39,mats['steel'])
    formed_housing(p+'_AftReactorCowl',[(-11.2,2.65,1.89,2.36),(-9.8,3.42,1.9,3.08),(-7.7,3.05,1.9,3.34),(-5.95,2.1,1.9,2.75)],mats['enamel'])
    formed_housing(p+'_ForwardBridge',[ (3.1,1.10,1.90,2.48),(4.25,2.8,1.90,3.16),(6.5,3.20,1.9,3.42),(8.25,2.1,1.9,2.65)],mats['enamel'])
    # Wide glazing belt is recessed below a real metal overhang, not an emissive plate.
    for sign in (-1,1):
        window=box(p+'_BridgeSideGlazing',(5.6,sign*1.42,2.95),(2.85,.055,.28),mats['glass'],.025)
        box(p+'_GlazingBrow',(5.6,sign*1.46,3.15),(3.0,.13,.085),mats['steel'],.02)
        for x in ((4.8,5.65,6.5) if LOD_DETAIL==0 else (5.65,)):box(p+'_WarmCabinLight',(x,sign*1.452,2.90),(.30 if LOD_DETAIL==0 else 1.5,.028,.075),mats['warm'],.009)
        if LOD_DETAIL<2:pipe(p+'_RecessedServiceConduit',[(-6,sign*1.35,2.0),(-5,sign*1.35,2.25),(2.6,sign*1.35,2.25),(3.2,sign*1.15,2.01)],.085,mats['copper'])
        for x in (-4.8,.0,2.4):
            # Open-frame knee brackets transfer the raised equipment deck to side shoulders.
            pipe(p+'_GalleryKnee',[(x,sign*.85,1.92),(x,sign*1.75,2.12),(x,sign*2.1,2.55)],.075,mats['steel'])
    # The open central well contains a longitudinal heat exchanger, two pressure barrels
    # and a suspended inspection catwalk, visibly separated by dark negative space.
    for yy in (-.53,.53):
        pipe(p+'_PressureAccumulator',[(-4.2,yy,2.22),(1.7,yy,2.22)],.24,mats['ceramic'],12)
        if LOD_DETAIL==0:
            for xx in (-4.0,-1.8,1.5):
                pipe(p+'_AccumulatorStrap',[(xx,yy-.27,2.08),(xx,yy-.28,2.42),(xx,yy+.28,2.42),(xx,yy+.27,2.08)],.043,mats['steel'])
    for xx in (-3.0,.1):
        shutter(p+'_ServiceWalkway',xx,0,2.7,1.0,2.9,mats['enamel'],.02)
        for yy in (-1.15,1.15):box(p+'_WalkwayBearing',(xx,yy,2.4),(.22,.3,.56),mats['dark'],.02)
    return {'label':'Arclight stepped bridge islands and open service spine','sourceObjects':changed}

def liner_clerestory(shells,mats,level):
    p=f'LOD{level}_Remaster_PassengerLantern'
    x=4.8;y=0;l=10.3;w=2.5
    z,ob=top_at(shells,x,y)
    if z is None:raise RuntimeError('Passenger roof not found')
    changed=cut(shells,x,y,l,w,z,.88,p)
    rim(p+'_StructuralReveal',x,y,l,w,z,.88,mats['steel'])
    section_solid(p+'_ShadowWell',x,y,l-.12,w-.12,z-.91,z-.84,mats['dark'])
    for bay in range(3):
        xx=x+(bay-1)*3.20
        # Each lantern is a faceted glazed roof within the original envelope,
        # supported by formed transverse arches and separated by deep service gutters.
        verts=[]
        for sx in (-1.38,1.38):
            verts += [(xx+sx,-1.03,z-.32),(xx+sx,-.62,z-.02),(xx+sx,.62,z-.02),(xx+sx,1.03,z-.32)]
        glass=mesh_obj(p+'_SafetyGlazing',verts,[(0,4,5,1),(1,5,6,2),(2,6,7,3)],mats['glass'])
        if LOD_DETAIL<2:
            sol=glass.modifiers.new('Laminated glass thickness','SOLIDIFY');sol.thickness=.03
        for sx in (-1.40,1.40):
            pipe(p+'_BronzeArch',[(xx+sx,-1.15,z-.44),(xx+sx,-1.08,z-.27),(xx+sx,-.64,z+.04),(xx+sx,.64,z+.04),(xx+sx,1.08,z-.27),(xx+sx,1.15,z-.44)],.052,mats['copper'])
        for yy in (-1.05,1.05):
            box(p+'_WarmLightCove',(xx,yy,z-.39),(2.6,.045,.06),mats['warm'],.01)
        # Opaque enamel ridge segments make the silhouette and camera read architectural.
        box(p+'_RidgeCover',(xx,0,z+.015),(2.0,.22,.085),mats['enamel'],.035)
    return {'label':'Massline three-bay passenger clerestory','sourceObjects':changed,'center':[x,y,z]}

def lark_swept_wings(objects):
    count=0
    for ob in objects:
        inv=ob.matrix_world.inverted()
        for v in ob.data.vertices:
            co=ob.matrix_world@v.co
            if -1.15<co.x<2.5 and 1.68<abs(co.y)<3.71 and -.30<co.z<.45:
                amount=(abs(co.y)-1.68)/2.03
                co.x=.7+(co.x-.7)*(1-.35*amount)-amount*1.0
                co.z+=amount*.10
                v.co=inv@co;count+=1
        ob.data.update()
    return {'label':'Lark swept, gently folded courier canards','changedVertices':count}

def materials():
    return {'dark':mat('Material_Mechanical_RemasterOxidized',(0.028,.038,.056),.65,.60),
      'steel':mat('Material_BrushedMetal_RemasterNickel',(.29,.36,.40),.86,.26),
      'ceramic':mat('Material_EngineCeramic_RemasterGlazed',(.34,.39,.36),.04,.42),
      'copper':mat('Material_Mechanical_RemasterHeatCopper',(.27,.115,.045),.72,.38),
      'glass':mat('Material_Glass_RemasterOptical',(.025,.10,.115),.05,.18),
      'warm':mat('Material_Emissive_Warm_RemasterRecess',(.83,.36,.065),.0,.37,.75),
      'enamel':mat('Material_Hull_RemasterSeaEnamel',(.14,.31,.29),.03,.32)}

def lod_materials(objects,authored):
    if LOD_DETAIL==0:return authored
    existing=list({m for o in objects for m in o.data.materials if m})
    def choose(tokens,fallback):
        for token in tokens:
            found=next((m for m in existing if token in m.name.lower()),None)
            if found:return found
        return fallback
    mechanical=choose(('mechanical','frame_darkanodized','armordark','keel_forgeddark','armor'),authored['dark'])
    out=dict(authored)
    out['dark']=mechanical
    out['steel']=choose(('brushedmetal','mechanical','frame_darkanodized'),mechanical)
    out['copper']=mechanical
    out['ceramic']=choose(('engineceramic','ceramic','radiator','mechanical'),mechanical)
    out['glass']=choose(('glass','glazing','canopy'),authored['glass'])
    return out

def scene_groups():
    result={}
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH' or 'collision' in obj.name.lower():continue
        for level in range(3):
            if obj.name.lower().startswith('lod'+str(level)):
                result.setdefault(level,[]).append(obj);break
    if not result: result[0]=[o for o in bpy.context.scene.objects if visible(o)]
    return result

def isolate_components(objects,all_surfaces=False):
    result=[]
    for ob in objects:
        names=' '.join(m.name.lower() for m in ob.data.materials if m)
        if not (all_surfaces or any(s in names for s in ('hull','armor','ceramicpaint'))):
            result.append(ob);continue
        original=ob.name
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        # glTF splits vertices at UV and hard-normal seams. Reconnect coincident
        # geometry before finding manufactured islands; per-loop UVs remain intact.
        bm=bmesh.from_edit_mesh(ob.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005)
        bmesh.update_edit_mesh(ob.data)
        bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
        parts=list(bpy.context.selected_objects)
        print('HERO_FLEET_COMPONENTS',original,len(parts),flush=True)
        for part in parts:part['_remasterSourceGroup']=original
        result+=parts
    bpy.context.view_layer.update()
    return result

def regroup_originals():
    groups={}
    for ob in list(bpy.context.scene.objects):
        if ob.type=='MESH' and ob.get('_remasterSourceGroup'):
            groups.setdefault(ob['_remasterSourceGroup'],[]).append(ob)
    for name,obs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in obs:ob.select_set(True)
        bpy.context.view_layer.objects.active=obs[0]
        if len(obs)>1:bpy.ops.object.join()
        obs[0].name=name
        del obs[0]['_remasterSourceGroup']

def preserve_metadata(candidate,source_doc,source_hash):
    data=candidate.read_bytes();n=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+n]);tail=data[20+n:]
    extras=copy.deepcopy(source_doc.get('asset',{}).get('extras',{}))
    meta=extras.get('spacefaceAsset',{})
    if not meta:
        meta=next((copy.deepcopy(s.get('extras',{}).get('spacefaceAsset')) for s in source_doc.get('scenes',[]) if s.get('extras',{}).get('spacefaceAsset')),None)
    if not meta:
        # A few existing Hornet/Bastion LOD sources contain no metadata at all.
        # Their exact manifest mapping, not a filename-derived invented ID, is authority.
        parts=json.loads((ROOT/'assets/ships/parts/parts_manifest.json').read_text())['parts']
        relative='wholeships/'+candidate.name
        part=next(p for p in parts if p.get('file')==relative or relative in p.get('lodFamily',{}).values())
        meta={'contractVersion':2,'assetId':part['assetId'],'partId':part['id'],'category':'wholeships','slot':'hull',
          'forward':'+X','up':'+Y','starboard':'+Z','unit':'metre','normalConvention':'OpenGL','ormChannels':'R=AO,G=Roughness,B=Metallic','textureCompression':'PNG-source',
          'lod':('lod1' if candidate.stem.endswith('_lod1') else 'lod2' if candidate.stem.endswith('_lod2') else 'lod0'),
          'wiringStatus':part.get('wiringStatus','manifest_selected'),'identitySource':'parts_manifest.json exact file/lodFamily mapping'}
    # Identity, axis, sockets and collision stay authoritative. A previous hash-bound
    # acceptance claim must never be inherited by newly authored geometry.
    for key in ('acceptedCandidateSha256','acceptanceClaim'):
        meta.pop(key,None)
    meta['surfaceGeometryRemaster']='helios-hero-fleet-2026-09-19'
    meta['remasterSourceSha256']=source_hash
    meta['spacefaceRemasterGeometry']=True
    triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc.get('meshes',[]) for p in m.get('primitives',[]) if 'indices' in p)
    if 'triangleCount' in meta:meta['triangleCount']=triangles
    if 'triangleCount' in extras:extras['triangleCount']=triangles
    factors=list(meta.get('factorOnlyMaterials',[]))
    for m in doc.get('materials',[]):
        if 'Remaster' in m.get('name',''):
            m.setdefault('extras',{})['spacefaceRemasterGeometry']=True
            if m['name'] not in factors:factors.append(m['name'])
        elif any(s in m.get('name','').lower() for s in ('hull','armor','ceramicpaint')):
            m.setdefault('extras',{})['spacefaceRemasterGeometry']=True
    meta['factorOnlyMaterials']=factors
    extras['spacefaceAsset']=meta;doc['asset']['extras']=extras
    for index,scene in enumerate(doc.get('scenes',[])):
        old=source_doc.get('scenes',[])
        scene['extras']=copy.deepcopy(old[min(index,len(old)-1)].get('extras',{})) if old else {}
        scene['extras']['spacefaceAsset']=meta
    blob=json.dumps(doc,separators=(',',':')).encode();blob+=b' '*((-len(blob))%4)
    candidate.write_bytes(struct.pack('<III',0x46546c67,2,20+len(blob)+len(tail))+struct.pack('<II',len(blob),0x4e4f534a)+blob+tail)

def build_one(name,source_name=None):
    global LOD_DETAIL
    source_name=source_name or name
    import_ship(source_name)
    source_mesh_count=len([o for o in bpy.context.scene.objects if o.type=='MESH'])
    groups={level:isolate_components(objects,name=='helios_arclight') for level,objects in scene_groups().items()}
    source_objects=list(bpy.context.scene.objects)
    authored=materials();report=[]
    for level,objects in groups.items():
        semantic=2 if source_name.endswith('_lod2') else 1 if source_name.endswith('_lod1') else 0
        LOD_DETAIL=max(level,semantic)
        mats=lod_materials(objects,authored)
        shells=[o for o in objects if any(s in ' '.join(m.name.lower() for m in o.data.materials if m) for s in ('hull','armor','ceramicpaint'))]
        if not shells: raise RuntimeError('No hull shells '+source_name)
        for ob in shells:
            for m in ob.data.materials:
                if m:m['spacefaceRemasterGeometry']=True
        if name=='helios_arclight':report.append(arclight_structure(objects,mats,level))
        if name=='helios_lark':report.append(lark_swept_wings(objects))
        if name=='massline_express_liner_v1':report.append(liner_clerestory(shells,mats,level))
        for entry in CAVITIES.get(name,[]): report.append(cavity(shells,*entry,mats,level))
        if name=='volatiles_tanker':report+=tanker(shells,mats,level)
        if name=='ashline_rig':ashline_truss(mats,level)
    # Every new object remains a static authored mesh. Join by material/LOD to avoid
    # adding a draw call per shutter/pipe in source preview or runtime compiler.
    additions=[o for o in bpy.context.scene.objects if o not in source_objects and o.type=='MESH']
    regroup_originals()
    for ob in additions:
        bpy.context.view_layer.objects.active=ob
        for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        if not ob.data.uv_layers:
            uv=ob.data.uv_layers.new(name='UVMap')
            for poly in ob.data.polygons:
                for li in poly.loop_indices:
                    co=ob.data.vertices[ob.data.loops[li].vertex_index].co
                    uv.data[li].uv=(co.x*.125,co.y*.125)
    join_groups={}
    for ob in additions:
        key=(ob.name[:4],ob.data.materials[0].name)
        join_groups.setdefault(key,[]).append(ob)
    for (lod,material),obs in join_groups.items():
        # Reuse a static source material group for distant mechanisms. Animated
        # hooks, fans and gimbals stay separate and retain their node identity.
        matching=next((o for o in bpy.context.scene.objects if o not in additions and o.type=='MESH' and o.name.startswith(lod)
          and len(o.data.materials)==1 and o.data.materials[0].name==material
          and not any(t in o.name.lower() for t in ('hook','fan','gimbal','gun_','mining_head'))),None)
        original_name=matching.name if matching else None
        if matching:obs=[matching]+obs
        bpy.ops.object.select_all(action='DESELECT')
        for ob in obs:ob.select_set(True)
        bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join()
        obs[0].name=original_name or lod+'_Remaster_'+material
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH' or not any(len(p.vertices)>4 for p in ob.data.polygons):continue
        bpy.context.view_layer.objects.active=ob
        mod=ob.modifiers.new('Triangulate manufactured openings','TRIANGULATE')
        mod.keep_custom_normals=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    out=OUT/source_name;out.mkdir(parents=True,exist_ok=True)
    source_meta={}
    b=source_bytes(source_name);n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n])
    for scene in doc.get('scenes',[]):
        source_meta=scene.get('extras',{}).get('spacefaceAsset',{}) or source_meta
    spec={'kind':'wholeship','id':source_name,'assetId':source_meta.get('assetId','SF_WHOLESHIP_'+name.upper()),'slot':'hull','required_maps':[]}
    export_objects=[o for o in bpy.context.scene.objects if o.type not in ('LIGHT','CAMERA')]
    export_gltf(str(out/(source_name+'.glb')),spec,export_objects)
    preserve_metadata(out/(source_name+'.glb'),doc,hashlib.sha256(b).hexdigest())
    for o in bpy.context.scene.objects:
        if o.type=='MESH': o.hide_render=not visible(o)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(source_name+'.blend')))
    result={'asset':source_name,'sourceSha256':hashlib.sha256(b).hexdigest(),
      'candidateSha256':hashlib.sha256((out/(source_name+'.glb')).read_bytes()).hexdigest(),
      'sourceMeshCount':source_mesh_count,
      'candidateMeshCount':len([o for o in bpy.context.scene.objects if o.type=='MESH']),
      'geometryChanges':report,'reviewStatus':'candidate; independent whole-asset and runtime review pending',
      'materialContract':'Preserved source textures; added uniform manufactured-metal/ceramic/optical substances use explicit authored factors. Required maps are not asserted for new scalar materials. No procedural texture or fake bake.'}
    (out/'candidate.json').write_text(json.dumps(result,indent=2))
    print('HERO_FLEET_BUILT',source_name,result['candidateSha256'])
    return result

def render(name):
    clear();out=OUT/name
    bpy.ops.import_scene.gltf(filepath=str(out/(name+'.glb')))
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH':ob.hide_render=not visible(ob)
    meshes=[o for o in bpy.context.scene.objects if visible(o)]
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    focus=Vector(tuple((min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
    scene.cycles.use_denoising=True;scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Indigo inspection environment');scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.05,.075,.13,1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.5
    for nn,xyz,power,col,size in [('Key',(10,6,24),3400,(1,.82,.61),13),('Rim',(-12,-9,16),2900,(.39,.68,1),10),('Fill',(4,-3,18),850,(.85,.9,1),16)]:
        d=bpy.data.lights.new(nn,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size
        o=bpy.data.objects.new(nn,d);scene.collection.objects.link(o);o.location=focus+Vector(xyz);o.rotation_euler=(focus-o.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('Chase');cam=bpy.data.objects.new('Chase',d);scene.collection.objects.link(cam);scene.camera=cam
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.8
    for label,distance,heading in [('play_chase',144,0),('play_chase_abeam',144,90),('play_chase_close',58,0)]:
        apply_chase_camera(cam,distance=distance,heading_deg=heading,focus=focus)
        scene.render.filepath=str(out/(label+'.png'));bpy.ops.render.render(write_still=True)
    print('HERO_FLEET_RENDERED',name)

def main():
    p=argparse.ArgumentParser();p.add_argument('--inspect',action='store_true');p.add_argument('--build',action='store_true');p.add_argument('--render',action='store_true');p.add_argument('--lods',action='store_true');p.add_argument('--only',default='')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    names=a.only.split(',') if a.only else NAMES
    if a.inspect: inspect(names)
    if a.build:
        failures=[]
        for name in names:
            try:
                build_one(name)
                if a.lods:
                    for level in (1,2):
                        candidate=name+'_lod'+str(level)
                        if (SOURCE/(candidate+'.glb')).exists():build_one(name,candidate)
            except Exception as err:
                import traceback
                traceback.print_exc();failures.append({'asset':name,'error':str(err)})
        if failures:
            (OUT/'build-failures.json').write_text(json.dumps(failures,indent=2))
            raise RuntimeError('Incomplete assets: '+','.join(f['asset'] for f in failures))
    if a.render:
        for name in names:render(name)

if __name__=='__main__': main()
