"""Helios place/equipment remaster, preserving existing GLB assemblies and contracts.

Run Blender --background --python this_file -- --inspect or --build [asset ...].
Candidates and editable scenes stay in .devshots until controller review/promotion.
"""
from pathlib import Path
import sys, json, math, hashlib, struct, argparse
import bpy, bmesh
from mathutils import Vector, Matrix
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sector_places_metadata import repair_document

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/blender'))
import spaceface_export
OUT = ROOT / '.devshots/helios-remaster/sector-places'
ASSETS = {
 'places': ['place_station_trade_hub', 'var_station_trade_hub_scn_overlay_v01',
 'place_station_military','place_gate_jump_ring','place_lane_beacon','place_memorial_array',
 'place_lane_pin','place_tally_post','place_claim_mark','place_cold_locker','place_ash_pin',
 'place_whistle','place_mining_drone','place_47a_rescue_capsule','place_dead_hulk','place_debris_chunk',
 'place_aftermath_aft_engine_section','place_aftermath_aft_cockpit_section',
 'place_aftermath_aft_cargo_module','place_aftermath_wreck_corvette_turret',
 'place_aftermath_aft_weapon_spar','place_aftermath_aft_pressure_tank',
 'place_nav_buoy','place_station_billboard','place_dock_interior'],
 'pods': ['pod_47a_evidence_spindle','pod_cargo_container'],
 'weapons': ['weapon_gatling','weapon_turret_dual','weapon_railgun','weapon_heavy_cannon','weapon_lance','weapon_pulse_cannon']}
PATHS = {name: ROOT/'assets/ships/parts'/family/(name+'.glb') for family, names in ASSETS.items() for name in names}
for name in PATHS:
    if name.startswith('place_aftermath_'):
        PATHS[name]=ROOT/'assets/incubator/wreck_aftermath_pack/source'/(name.replace('place_aftermath_','')+'.glb')

def clear():
    for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
    # glTF importer writes scene custom properties. Object deletion alone keeps
    # the previous asset's identity alive during a multi-asset authoring batch.
    for scene in bpy.data.scenes:
        for key in list(scene.keys()): del scene[key]
    for bank in (bpy.data.meshes,bpy.data.materials,bpy.data.images):
        for item in list(bank):
            if not item.users: bank.remove(item)

def load(name):
    clear()
    prepared=OUT/'input'/(name+'.glb')
    bpy.ops.import_scene.gltf(filepath=str(prepared if prepared.exists() else PATHS[name]))
    return list(bpy.data.objects)

def helper(obj):
    n=obj.name.lower()
    return any(k in n for k in ('collision','socket','mount_','camera','light')) or obj.type!='MESH'

def bounds(obj):
    coords=[obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo=Vector([min(v[i] for v in coords) for i in range(3)])
    hi=Vector([max(v[i] for v in coords) for i in range(3)])
    return lo,hi

def scene_bounds(objects):
    values=[bounds(o) for o in objects if not helper(o) and not any(s in o.name.lower() for s in ('lod1','lod2'))]
    return Vector([min(a[i] for a,b in values) for i in range(3)]),Vector([max(b[i] for a,b in values) for i in range(3)])

def inspect(names):
    rows={}
    for name in names:
        if not PATHS[name].exists(): continue
        objects=load(name); lo,hi=scene_bounds(objects)
        rows[name]={'bounds':[list(lo),list(hi)],'meshes':[]}
        for obj in objects:
            if helper(obj) or any(s in obj.name.lower() for s in ('lod1','lod2')):continue
            a,b=bounds(obj)
            rows[name]['meshes'].append({'name':obj.name,'tris':sum(len(p.vertices)-2 for p in obj.data.polygons),'min':list(a),'max':list(b),'materials':[m.name for m in obj.data.materials]})
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'inspection.json').write_text(json.dumps(rows,indent=2))
    print('INSPECTION',str(OUT/'inspection.json'))

def material(name, color, metallic, rough, emission=0):
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metallic
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Coat Weight'].default_value=.22 if metallic<.3 else .06
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1)
        bs.inputs['Emission Strength'].default_value=emission
    # Portable, restrained substrate maps, not a tiled picture of panel construction.
    size=32
    for kind in ('base','rough','ao','normal'):
        image=bpy.data.images.new(name+'_'+kind,width=size,height=size,alpha=True)
        pixels=[]
        for y in range(size):
            for x in range(size):
                stripe=math.sin(y*2.17)*.016 if metallic>.5 else math.sin(x*1.91+y*3.7)*.004
                value=rough+stripe
                rgb=color if kind=='base' else (value,)*3 if kind=='rough' else (.5,.5,1) if kind=='normal' else (1,1,1)
                pixels.extend((*rgb,1))
        image.pixels=pixels;image.pack()
        image.colorspace_settings.name='sRGB' if kind=='base' else 'Non-Color'
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.name=name+'_'+kind;node.image=image
        if kind=='base':mat.node_tree.links.new(node.outputs['Color'],bs.inputs['Base Color'])
        if kind=='rough':mat.node_tree.links.new(node.outputs['Color'],bs.inputs['Roughness'])
        if kind=='ao':
            group=bpy.data.node_groups.get('glTF Material Output')
            if not group:
                group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
                group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
            output=mat.node_tree.nodes.new('ShaderNodeGroup');output.node_tree=group
            mat.node_tree.links.new(node.outputs['Color'],output.inputs['Occlusion'])
        if kind=='normal':
            normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');mat.node_tree.links.new(node.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    return mat

def palette():
    return {'ink':material('Material_Mechanical_ShadowEnamel',(.022,.035,.055),.16,.45),
      'alloy':material('Material_Mechanical_BrushedNickel',(.28,.34,.37),.86,.29),
      'ivory':material('Material_Hull_VitreousCeramic',(.66,.62,.47),.03,.34),
      'blue':material('Material_Hull_DeepSeaEnamel',(.09,.16,.20),.07,.42),
      'ochre':material('Material_Hull_ServiceOchre',(.47,.19,.045),.08,.44),
      'mint':material('Material_Glass_RecessedSignal',(.024,.31,.26),.05,.16,.7),
      'char':material('Material_Rubber_HeatScale',(.018,.012,.011),.03,.92)}

def mesh(name, vertices, faces, mat):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat)
    # Box/cylindrical projected UVs for low-amplitude portable substrate response.
    uv=data.uv_layers.new(name='UVMap')
    for poly in data.polygons:
        axes=sorted(range(3),key=lambda i:abs(poly.normal[i]))[:2]
        for li in poly.loop_indices:
            v=data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv=(v[axes[0]]*.15,v[axes[1]]*.15)
    return obj

def bevel(obj,width=.035):
    mod=obj.modifiers.new('Manufactured edge break','BEVEL');mod.width=width;mod.segments=2;mod.limit_method='ANGLE';mod.angle_limit=.5
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
    for p in obj.data.polygons:p.use_smooth=False

def box(name, center, size, mat, edge=0):
    x,y,z=size;cx,cy,cz=center
    vertices=[(cx+sx*x*.5,cy+sy*y*.5,cz+sz*z*.5) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    obj=mesh(name,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    if edge:bevel(obj,edge)
    return obj

def beam(name,a,b,width,depth,mat):
    a,b=Vector(a),Vector(b);d=b-a
    obj=box(name,(0,0,0),(width,depth,d.length),mat,min(width,depth)*.13)
    q=d.to_track_quat('Z','Y');obj.rotation_mode='QUATERNION';obj.rotation_quaternion=q;obj.location=(a+b)*.5
    return obj

def tube(name, center, length, ro, ri, mat, axis='X', segments=16, flare=1):
    # Four rings form a real open bore; no endcap disc or solid cylinder.
    verts=[];faces=[]
    for d,r in [(-length*.5,ro),(length*.5,ro*flare),(length*.5,ri*flare),(-length*.5,ri)]:
        for i in range(segments):
            a=math.tau*i/segments
            p=(d,r*math.cos(a),r*math.sin(a)) if axis=='X' else (r*math.cos(a),r*math.sin(a),d)
            verts.append(tuple(center[k]+p[k] for k in range(3)))
    for band in range(4):
        nxt=(band+1)%4
        for i in range(segments):
            j=(i+1)%segments;faces.append((band*segments+i,band*segments+j,nxt*segments+j,nxt*segments+i))
    return mesh(name,verts,faces,mat)

def world_mesh(obj):
    obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.matrix_world=Matrix.Identity(4)
    obj.data.update()

def carve(obj,center,size,depth,mat,normal=Vector((0,0,1)),damaged=False):
    # Subtract an actual machining/service aperture, backed by a separate recessed
    # substrate, with walls supplied by the surviving shell.
    normal=Vector(normal);width,height=size
    # Material batches contain unrelated manufactured solids. Isolate the connected
    # shell selected by the reviewed face before subtraction, leaving other solids
    # byte-for-byte in the untouched mesh. Welded position keys bridge glTF UV splits
    # for connectivity analysis without destroying their actual corner attributes.
    verts=obj.data.vertices
    keys=[tuple(round(c,5) for c in v.co) for v in verts]
    adjacency={}
    for poly in obj.data.polygons:
        facekeys=[keys[i] for i in poly.vertices]
        for key in facekeys:adjacency.setdefault(key,set()).update(facekeys)
    seed=min(obj.data.polygons,key=lambda f:(f.center-Vector(center)).length_squared)
    frontier=[keys[i] for i in seed.vertices];component=set(frontier)
    while frontier:
        key=frontier.pop()
        for other in adjacency.get(key,()):
            if other not in component:component.add(other);frontier.append(other)
    selected={i for i,k in enumerate(keys) if k in component}
    # Two bmesh copies retain original loop UVs/material assignments; only the
    # selected solid goes through Blender's Boolean solver.
    island=bpy.data.objects.new('TEMP_selectedShell',obj.data.copy());bpy.context.collection.objects.link(island)
    island.matrix_world=obj.matrix_world.copy()
    bm=bmesh.new();bm.from_mesh(island.data);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[v for i,v in enumerate(bm.verts) if i not in selected],context='VERTS')
    bm.to_mesh(island.data);bm.free()
    backup=island.data.copy()
    cutter=box('TEMP_cut',center,(width,height,depth*2.3),mat)
    cutter.rotation_mode='QUATERNION';cutter.rotation_quaternion=normal.to_track_quat('Z','Y')
    # Cutter starts local around its center; rotate around the center, not origin.
    cutter.data.transform(Matrix.Translation(-Vector(center)))
    cutter.location=center
    if damaged:
        for v in cutter.data.vertices:
            v.co.x*=1+.15*math.sin(v.co.y*9+v.co.z*13)
            v.co.y*=1+.12*math.cos(v.co.x*8+v.co.z*5)
    mod=island.modifiers.new('Open service throat','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.context.view_layer.objects.active=island
    try:bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception:
        bpy.data.objects.remove(island,do_unlink=True);bpy.data.objects.remove(cutter,do_unlink=True);return False
    bpy.data.objects.remove(cutter,do_unlink=True)
    if not len(island.data.vertices):
        bpy.data.objects.remove(island,do_unlink=True);return False
    # Remove exactly the replaced solid from the untouched original, then merge
    # its carved successor back into the original object's draw/material family.
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[v for i,v in enumerate(bm.verts) if i in selected],context='VERTS')
    bm.to_mesh(obj.data);bm.free()
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);island.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
    if not backup.users:bpy.data.meshes.remove(backup)
    floor=box('Remaster_ServiceWell_Inner',Vector(center)-normal*depth,(width*.9,height*.9,depth*.12),mat)
    floor.data.transform(Matrix.Translation(-floor.location)) if floor.location.length else None
    # box vertices are world positions; rotate offsets only.
    c=Vector(center)-normal*depth
    rot=normal.to_track_quat('Z','Y').to_matrix().to_4x4()
    floor.data.transform(Matrix.Translation(c)@rot@Matrix.Translation(-c))
    return True

def face_panels(obj,mat,minimum,maximum=8,depth=.08,scar=False):
    # Dissolve only coplanar triangles. UV seams and material boundaries survive.
    if len(obj.data.polygons)>100000:return []
    world_mesh(obj)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.dissolve_limit(bm,angle_limit=.002,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL','UV'})
    bm.normal_update()
    candidates=[f for f in bm.faces if f.calc_area()>minimum and f.normal.z>.55 and len(f.verts)<=8]
    candidates.sort(key=lambda f:f.calc_area(),reverse=True)
    plans=[]
    for f in candidates[:maximum]:
        c=f.calc_center_median();n=f.normal.copy()
        # Determine actual face footprint; avoid narrow bevel strips.
        vs=[v.co for v in f.verts];dx=max(v.x for v in vs)-min(v.x for v in vs);dy=max(v.y for v in vs)-min(v.y for v in vs)
        if min(dx,dy)<math.sqrt(minimum)*.35:continue
        plans.append((c.copy(),(dx*.53,dy*.48),n.copy()))
    bm.to_mesh(obj.data);bm.free()
    done=[]
    for c,size,n in plans:
        if carve(obj,c,size,depth,mat,n,scar):done.append({'center':list(c),'size':size,'depth':depth})
    return done

def fluted_shell(name, x0,x1,y,z, radius,mat, count=6, wing_width=.65):
    objects=[]
    for i in range(count):
        a=math.tau*i/count
        # Folded leaf in radial section; tapered ends leave the optic/accelerator visible.
        yy,zz=math.cos(a),math.sin(a)
        verts=[]
        for x,r,w in [(x0,radius*.82,wing_width*.52),(x0+(x1-x0)*.2,radius,wing_width),(x1-(x1-x0)*.18,radius*.92,wing_width*.89),(x1,radius*.75,wing_width*.42)]:
            for t in (-w,0,w):
                verts.append((x,y+yy*r-zz*radius*t,z+zz*r+yy*radius*t))
        faces=[]
        for k in range(3):
            faces.extend([(k*3,k*3+1,(k+1)*3+1,(k+1)*3),(k*3+1,k*3+2,(k+1)*3+2,(k+1)*3+1)])
        obj=mesh(name+str(i),verts,faces,mat)
        solid=obj.modifiers.new('Folded shield thickness','SOLIDIFY');solid.thickness=radius*.065
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=solid.name)
        objects.append(obj)
    return objects

def surface_z(objects,x,y):
    hits=[]
    for obj in objects:
        if helper(obj) or any(s in obj.name.lower() for s in ('lod1','lod2')):continue
        a,b=bounds(obj)
        if not a.x<=x<=b.x or not a.y<=y<=b.y:continue
        inv=obj.matrix_world.inverted();origin=inv@Vector((x,y,b.z+2));direction=(inv.to_3x3()@Vector((0,0,-1))).normalized()
        hit,location,normal,index=obj.ray_cast(origin,direction)
        if hit:hits.append((obj.matrix_world@location).z)
    return max(hits) if hits else None

def receiver_section(obj,p):
    """Re-form the inherited receiver in its exact envelope: broad rear shoulder,
    dropped forward throat and chamfered cast cheeks around an open service bay."""
    a,b=bounds(obj);d=b-a;c=(a+b)*.5
    vertices=[];faces=[]
    for tx,w,h,zshift in [(0,.83,.78,-.06),(.17,1,1,0),(.67,1,.96,-.02),(1,.72,.62,-.14)]:
        for yy,zz in [(-.72,-1),(.72,-1),(1,-.65),(1,.63),(.72,1),(-.72,1),(-1,.63),(-1,-.65)]:
            vertices.append((a.x+tx*d.x,c.y+yy*d.y*.5*w,c.z+(zz*h*.5+zshift)*d.z))
    for station in range(3):
        for k in range(8):faces.append((station*8+k,station*8+(k+1)%8,(station+1)*8+(k+1)%8,(station+1)*8+k))
    faces.extend([tuple(range(7,-1,-1)),tuple(range(24,32))])
    replacement=mesh('TEMP_castReceiver',vertices,faces,p['ivory'])
    old=obj.data;obj.data=replacement.data;obj.matrix_world=Matrix.Identity(4)
    bpy.data.objects.remove(replacement,do_unlink=True)
    bevel(obj,min(d)*.035)
    if obj.name=='Gatling_Housing':
        carve(obj,Vector((a.x+d.x*.58,c.y,c.z+d.z*.39)),(d.x*.77,d.y*.43),d.z*.64,p['ink'])
        for xx in (.31,.88):tube('Remaster_ReceiverBearing',(a.x+d.x*xx,c.y,c.z-d.z*.12),d.x*.075,d.y*.25,d.y*.16,p['alloy'],segments=10)
    else:face_panels(obj,p['ink'],d.x*d.y*.05,1,d.z*.30)

def reforge_batched_receiver(obj,p):
    """Pick the substantial rear case, never a barrel or another material island."""
    world_mesh(obj);keys=[tuple(round(c,5) for c in v.co) for v in obj.data.vertices];adj={}
    for f in obj.data.polygons:
        ks=[keys[i] for i in f.vertices]
        for k in ks:adj.setdefault(k,set()).update(ks)
    unseen=set(keys);eligible=[]
    while unseen:
        seed=next(iter(unseen));island={seed};queue=[seed];unseen.remove(seed)
        while queue:
            for key in adj.get(queue.pop(),()):
                if key in unseen:unseen.remove(key);island.add(key);queue.append(key)
        a=Vector([min(k[i] for k in island) for i in range(3)]);b=Vector([max(k[i] for k in island) for i in range(3)]);d=b-a
        if a.x<.5 and b.x<3.1 and d.y>.5 and d.z>.4:eligible.append((d.x*d.y*d.z,island))
    if not eligible:return False
    component=max(eligible,key=lambda r:r[0])[1];selected={i for i,k in enumerate(keys) if k in component}
    shell=bpy.data.objects.new('Remaster_CastReceiver',obj.data.copy());bpy.context.collection.objects.link(shell)
    bm=bmesh.new();bm.from_mesh(shell.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for i,v in enumerate(bm.verts) if i not in selected],context='VERTS');bm.to_mesh(shell.data);bm.free()
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for i,v in enumerate(bm.verts) if i in selected],context='VERTS');bm.to_mesh(obj.data);bm.free()
    receiver_section(shell,p)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);shell.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
    return True

def weapon(name,objects,p):
    if name=='weapon_gatling':
        # A legacy decorative heat disc floated four metres ahead of the actual
        # muzzle, inflating the envelope. Replace the floating disc and solid muzzle.
        for o in list(objects):
            if o.name in ('DET_heat_disc','Gatling_Muzzle'):
                objects.remove(o);bpy.data.objects.remove(o,do_unlink=True)
    if name=='weapon_turret_dual':
        for o in objects:
            if o.name=='Turret_Charge_Block':
                world_mesh(o)
                for v in o.data.vertices:v.co.x-=3.30
                o.data.materials.clear();o.data.materials.append(p['ink'])
    lo,hi=scene_bounds(objects);s=hi-lo;L=s.x;cy=0;cz=(lo.z+hi.z)*.5
    changes=[]
    for o in objects:
        if helper(o):continue
        token=o.name.lower()
        if o.name in ('Gatling_Housing','Turret_Head','Rail_Breech'):
            receiver_section(o,p)
            changes.append({'component':o.name,'castSectionShoulderAndOpenBay':True})
            continue
        if name in ('weapon_heavy_cannon','weapon_lance','weapon_pulse_cannon') and 'material_hull' in token:
            if reforge_batched_receiver(o,p):
                changes.append({'component':o.name,'isolatedCastReceiverRebuilt':True})
                continue
        if any(t in token for t in ('breech','housing','head','material_hull')):
            changes+=face_panels(o,p['ink'],L*L*.006,2,L*.016)
    tip=hi.x-L*.03
    if name=='weapon_gatling':
        fluted_shell('Remaster_VentedBarrelJacket_',1.85,4.32,0,0,.37,p['alloy'],4,wing_width=.20)
        tube('Remaster_RotaryBearing', (lo.x+L*.37,cy,cz),L*.038,min(s.y,s.z)*.46,min(s.y,s.z)*.32,p['ink'])
        for i in range(6):
            a=math.tau*i/6
            tube('Remaster_ActualRotaryBore'+str(i),(4.49,math.cos(a)*.235,math.sin(a)*.235),.24,.089,.053,p['ink'],segments=10)
        tube('Remaster_RotaryBoreSpider',(4.40,0,0),.14,.35,.29,p['alloy'],segments=12)
        for i in range(7):
            a=-1.2+i*.34
            tube('Remaster_LinkedFeedCartridge'+str(i),(lo.x+L*.16,cy+math.cos(a)*s.y*.43,cz+math.sin(a)*s.z*.43),L*.10,s.z*.067,s.z*.036,p['ochre'],segments=8)
    elif name=='weapon_turret_dual':
        for y in (-.62,.62):
            tube('Remaster_RecessedTwinBore'+str(y),(4.73,y,.58),.27,.235,.15,p['alloy'])
            beam('Remaster_TrunnionFork'+str(y),(lo.x+L*.1,y*.8,cz),(lo.x+L*.4,y*.8,cz+s.z*.19),s.z*.12,s.z*.10,p['alloy'])
        tube('Remaster_TraverseBearing',(lo.x+L*.23,cy,lo.z+s.z*.18),s.z*.16,s.y*.33,s.y*.24,p['ink'],axis='Z')
    elif name=='weapon_railgun':
        for sign in (-1,1):
            beam('Remaster_AccelerationRail'+str(sign),(lo.x+L*.32,cy+sign*s.y*.24,cz+s.z*.12),(hi.x-L*.055,cy+sign*s.y*.15,cz+s.z*.07),s.y*.13,s.z*.16,p['alloy'])
        for i in range(4):
            x=lo.x+L*(.4+i*.135)
            tube('Remaster_InsulatedRailClamp'+str(i),(x,cy,cz),L*.028,s.z*.33,s.z*.245,p['ivory'],segments=8)
    elif name=='weapon_lance':
        fluted_shell('Remaster_FoldedLancePetal_',lo.x+L*.34,hi.x-L*.065,cy,cz,s.z*.44,p['ivory'],4)
        tube('Remaster_OpticSocket',(tip-L*.012,cy,cz),L*.07,s.z*.19,s.z*.12,p['alloy'],segments=12,flare=.75)
    elif name=='weapon_pulse_cannon':
        fluted_shell('Remaster_PulseHeatShield_',lo.x+L*.29,hi.x-L*.13,cy,cz,s.z*.38,p['alloy'],3)
        for i in range(3):tube('Remaster_PulseCompressionCollar'+str(i),(lo.x+L*(.43+i*.18),cy,cz),L*.055,s.z*(.40-i*.05),s.z*(.32-i*.05),p['ivory'],segments=12)
        tube('Remaster_PulseAperture',(tip-L*.015,cy,cz),L*.085,s.z*.26,s.z*.17,p['ink'])
    else:
        for sign in (-1,1):
            tube('Remaster_RecoilSleeve'+str(sign),(lo.x+L*.43,cy+sign*s.y*.23,cz+s.z*.16),L*.23,s.z*.087,s.z*.055,p['alloy'])
            beam('Remaster_RecoilClevis'+str(sign),(lo.x+L*.24,cy+sign*s.y*.23,cz),(lo.x+L*.24,cy+sign*s.y*.23,cz+s.z*.19),s.z*.12,s.z*.11,p['ink'])
        tube('Remaster_HeavyRecessedBore',(tip-L*.03,cy,cz),L*.10,s.z*.25,s.z*.16,p['alloy'],segments=12,flare=1.08)
    return changes

def rip_panel(obj):
    """Crease an inherited torn plate across its actual section, retaining its roots."""
    world_mesh(obj);a,b=bounds(obj);s=b-a
    axis=max(range(3),key=lambda i:s[i]);cross=next(i for i in range(3) if i!=axis and s[i]>min(s)*1.2)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True)
    for v in bm.verts:
        t=(v.co[axis]-a[axis])/max(s[axis],1e-5)
        bend=math.sin(t*math.pi)*min(s[axis],s[cross])*.10
        v.co[cross]+=bend*(.4+math.sin(t*7.5)*.6)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()

def wreck(name,objects,p):
    if name.startswith('place_aftermath_'):
        sys.path.insert(0,str(Path(__file__).resolve().parent))
        import sector_places_aftermath
        return sector_places_aftermath.rebuild(name,objects,p,sys.modules[__name__])
    lo,hi=scene_bounds(objects);s=hi-lo;changes=[]
    targets=('ae_block','ak_cabin','ak_nose','ac_box','ac_crate','cvt_house','as_housing','as_spar','at_shell','material_hull','material_armor')
    for obj in objects:
        if helper(obj) or any(k in obj.name.lower() for k in ('lod1','lod2')):continue
        n=obj.name.lower()
        if any(k in n for k in targets):
            a,b=bounds(obj);d=b-a
            changes+=face_panels(obj,p['char'],max(d.x*d.y*.035,.03),3,max(min(d)*.17,.08),True)
        if any(k in n for k in ('petal','peel','tear_')):rip_panel(obj)
        # Surface response distinguishes intact coating, stripped edge, and heat scale.
        for slot in obj.material_slots:
            m=slot.material
            if not m:continue
            token=m.name.lower()
            if token.startswith('wrk_'):
                slot.material=p['char'] if 'scorch' in token else p['alloy'] if any(t in token for t in ('bare','frame','torn','pipe')) else p['ochre'] if 'paint' in token else m
    if name=='place_aftermath_aft_pressure_tank':
        for obj in list(objects):
            if obj.name.startswith('vent_vent_'):bpy.data.objects.remove(obj,do_unlink=True)
        for x in (-s.x*.2,s.x*.2):
            tube('Remaster_TornTankValve'+str(x),(x,0,hi.z*.50),s.z*.18,s.z*.07,s.z*.047,p['alloy'],axis='Z',segments=10)
    if name=='place_aftermath_aft_engine_section':
        # The inherited bell is retained; add an exposed wall-lined turbine throat.
        a,b=bounds(next(o for o in objects if o.name=='ae_bell'))
        c=(a+b)*.5; r=min((b-a).y,(b-a).z)*.34
        tube('Remaster_TurbineThroat',(a.x+(b.x-a.x)*.25,c.y,c.z),(b.x-a.x)*.38,r,r*.78,p['char'],segments=18,flare=1.15)
        for i in range(9):
            a0=math.tau*i/9
            beam('Remaster_FracturedTurbineStator'+str(i),(a.x+(b.x-a.x)*.45,c.y+math.cos(a0)*r,c.z+math.sin(a0)*r),(a.x+(b.x-a.x)*.36,c.y+math.cos(a0+.24)*r*.7,c.z+math.sin(a0+.24)*r*.7),r*.065,r*.11,p['alloy'])
    if name=='place_aftermath_aft_cargo_module':
        # Real remaining corrugated hoops describe the collapsed container, not clean slabs.
        for i in range(5):
            x=lo.x+s.x*(.15+i*.16)
            beam('Remaster_ExposedCargoRib'+str(i),(x,-s.y*.29,-s.z*.28),(x,-s.y*.29,s.z*.27),s.x*.025,s.y*.035,p['alloy'])
    if name=='place_debris_chunk':
        body=next(o for o in objects if o.name=='LOD0_Debris_Material_Hull')
        world_mesh(body)
        # The surviving pressure vessel was entirely closed. Open a localized
        # dorsal rupture into the shell and curl its surviving metal lip outward.
        if carve(body,Vector((7,0,2.66)),(3.2,1.8),.9,p['char'],damaged=True):
            changes.append({'component':body.name,'dorsalRuptureWithWallDepth':True})
        for sign in (-1,1):
            vertices=[]
            for x in (5.25,6.1,7.0,7.9,8.7):
                raisez=.2+.22*math.sin(x*2.1)
                vertices.extend([(x,sign*.88,2.66),(x,sign*1.12,2.90+raisez),(x,sign*1.29,2.80)])
            faces=[]
            for i in range(4):
                for k in range(2):faces.append((i*3+k,(i+1)*3+k,(i+1)*3+k+1,i*3+k+1))
            lip=mesh('Remaster_CurledPressureSkin',vertices,faces,p['alloy'])
            solid=lip.modifiers.new('Torn sheet wall','SOLIDIFY');solid.thickness=.06
            bpy.context.view_layer.objects.active=lip;bpy.ops.object.modifier_apply(modifier=solid.name)
    return changes

def furniture(name,objects,p):
    lo,hi=scene_bounds(objects);s=hi-lo;changes=[]
    for obj in objects:
        if helper(obj) or any(k in obj.name.lower() for k in ('lod1','lod2')):continue
        n=obj.name.lower()
        for slot in obj.material_slots:
            if not slot.material:continue
            tok=slot.material.name.lower()
            if tok.startswith('furniture_'):
                slot.material=p['ivory'] if 'structural' in tok else p['blue'] if 'painted' in tok else p['alloy'] if 'bare_steel' in tok else p['char'] if 'scorch' in tok else slot.material
        # Instrument/service opening is recessed into the load-bearing case itself.
        if any(k in n for k in ('pin_mast','tally_scale_house','claim_shaft','locker_drum','ash_base','whistle_drum')):
            world_mesh(obj);a,b=bounds(obj);d=b-a
            if min(d.x,d.y)>.12:
                c=Vector(((a.x+b.x)*.5,a.y+.025,(a.z+b.z)*.5))
                depth=min(d.x,d.y)*.18
                if carve(obj,c,(d.x*.46,d.z*.48),depth,p['ink'],Vector((0,-1,0))):
                    changes.append({'component':obj.name,'instrumentBay':True})
                    # An inset copper heat sink and a narrow signal lens sit behind the rim.
                    for i in range(5):
                        box('Remaster_InsetInstrumentFin'+str(i),(c.x-d.x*.15+i*d.x*.075,c.y+depth*.60,c.z),(d.x*.025,depth*.14,d.z*.33),p['alloy'])
        if any(k in n for k in ('vane_root','foot_brace','tally_tong','crank_arm')):
            a,b=bounds(obj);bevel(obj,max(min(b-a)*.08,.015))
    # A grounded collar around each painted mast visibly explains its load interface.
    for obj in objects:
        if helper(obj):continue
        if any(k in obj.name.lower() for k in ('pin_mast','tally_mast','claim_shaft','ash_mast')):
            a,b=bounds(obj);d=b-a;r=max(d.x,d.y)*.53
            tube('Remaster_ReplaceableMastCollar',((a.x+b.x)*.5,(a.y+b.y)*.5,a.z+d.z*.13),max(d.z*.028,.07),r,r*.83,p['alloy'],axis='Z',segments=8)
    return changes

def place(name,objects,p):
    lo,hi=scene_bounds(objects);s=hi-lo;changes=[]
    selectors={
      'place_station_military':('material_hull','material_blast'),
      'var_station_trade_hub_scn_overlay_v01':('bastion','cladding'),
      'place_gate_jump_ring':('material_hull',),
      'place_lane_beacon':('material_hull',),
      'place_memorial_array':('frame_coat','recovered_hull'),
      'place_mining_drone':('material_hull','material_safety'),
      'place_47a_rescue_capsule':('pressure_hull',),
      'pod_47a_evidence_spindle':('shell',),
      'pod_cargo_container':('shell',),
      'place_nav_buoy':('pressure_shell',),
      'place_station_billboard':('backplate',),
      'place_dock_interior':('material_hull','material_floor'),
    }
    for obj in objects:
        if helper(obj) or any(k in obj.name.lower() for k in ('lod1','lod2')):continue
        if any(token in obj.name.lower() for token in selectors.get(name,())):
            minimum=max(s.x*s.y*.002,.025)
            depth=max(min(s)*.016,.04)
            changes+=face_panels(obj,p['ink'],minimum,5 if 'station_' in name else 3,depth)
    if name=='place_station_trade_hub':
        # Preserve the detailed radial city. Add sheltered glazed walking galleries
        # across existing primary approach piers, mounted below the central skyline.
        for sign in (-1,1):
            yy=sign*11.6
            for i in range(6):
                x=21+i*5.0
                feet=[surface_z(objects,x,yy+sign*2.4) for sign in (-1,1)]
                if any(z is None for z in feet):continue
                z=max(feet)+2.8
                for sign,foot in zip((-1,1),feet):beam('Remaster_ArcadeColumn',(x,yy+sign*2.4,foot-.05),(x,yy+sign*2.4,z),.22,.22,p['ivory'])
                # Sectioned canopy with an actual shallow vault and open ends.
                vertices=[(x+dx,yy+dy,zz) for dx in (-2.25,2.25) for dy,zz in [(-2.5,z),(-1.4,z+.9),(1.4,z+.9),(2.5,z)]]
                mesh('Remaster_PublicArcadeGlazing',vertices,[(0,4,5,1),(1,5,6,2),(2,6,7,3)],p['mint'])
                beam('Remaster_ArcadeRidge',(x-2.3,yy,z+.95),(x+2.3,yy,z+.95),.18,.20,p['alloy'])
        changes.append({'component':'primary approach piers','shelteredArcades':12})
    elif name=='place_station_military':
        # Roof cooling parapets: paired louver combs descend into the existing roof
        # courts and expose a dark channel, with real supported end frames.
        for sign in (-1,1):
            for i in range(7):
                x=-12+i*3.1;y=sign*8.4;z=surface_z(objects,x,y)
                if z is None:continue
                beam('Remaster_BastionRoofLouvre',(x,y-2,z+.08),(x+1.1,y+2,z+.55),.34,.60,p['alloy'])
                for yy in (y-2,y+2):beam('Remaster_LouvreFoot',(x,yy,z-.1),(x+.5,yy,z+.3),.34,.38,p['ink'])
    elif name=='place_gate_jump_ring':
        # The gate lies in the YZ plane. Radial inward-facing iris shoes replace
        # the impression of a plain glowing hoop with an induction machine.
        c=(lo+hi)*.5;radius=min(s.y,s.z)*.40
        for i in range(16):
            a=math.tau*(i+.5)/16
            y=c.y+math.cos(a)*radius;z=c.z+math.sin(a)*radius
            radial=Vector((0,math.cos(a),math.sin(a)))
            beam('Remaster_GateIrisShoe'+str(i),(1.1,y,z),(1.1,y-radial.y*3.4,z-radial.z*3.4),1.3,1.05,p['alloy'])
            tube('Remaster_GateCeramicInsulator'+str(i),(2.4,y,z),2.2,1.18,.76,p['ivory'],segments=8)
    elif name=='place_memorial_array':
        # Twenty-four candles and intentionally unlit twenty-fifth place are retained.
        # Bronze register leaves sit under each existing candle bank, never add a flame.
        for i in range(6):
            x=.5+i*2.1
            box('Remaster_MemorialRegisterLeaf'+str(i),(x,-1.03,.36),(1.12,.30,.09),p['alloy'],.02)
            for k in range(3):box('Remaster_EngravedRegisterRule',(x-.34+k*.30,-1.05,.417),(.12,.21,.012),p['ink'])
    elif name=='place_mining_drone':
        for sign in (-1,1):
            beam('Remaster_DroneToolClevis'+str(sign),(2.5,sign*.70,.34),(3.75,sign*.51,.24),.14,.17,p['alloy'])
        tube('Remaster_DroneToolBore',(4.20,0,.37),.34,.24,.14,p['ink'],segments=10)
    elif name=='place_47a_rescue_capsule':
        # Docking clamps frame the existing collar; they do not obscure distress livery.
        for sign in (-1,1):
            beam('Remaster_CapsuleDockLatch'+str(sign),(2.74,sign*.87,.74),(3.24,sign*.62,.66),.16,.15,p['alloy'])
        tube('Remaster_CapsuleServiceCollar',(-2.84,0,0),.18,1.06,.95,p['ivory'],segments=12)
    elif name in ('pod_47a_evidence_spindle','pod_cargo_container'):
        # Recessed handling pockets and chamfered steel corner castings belong to
        # the original cargo frame; custody straps remain fully visible.
        for x in (lo.x+s.x*.06,hi.x-s.x*.06):
            for y in (lo.y+s.y*.065,hi.y-s.y*.065):
                roof=surface_z(objects,x,y)
                if roof is None:continue
                radius=min(s.x,s.y)*.062
                box('Remaster_CargoCastingMount',(x,y,roof+.04),(radius*2.1,radius*2.1,.14),p['ink'],.025)
                tube('Remaster_CargoCornerCasting',(x,y,roof+.13),.18,radius,radius*.56,p['alloy'],axis='Z',segments=8)
    elif name=='place_nav_buoy':
        tube('Remaster_BuoyLensWeatherHood',(0,0,hi.z-s.z*.18),s.z*.07,.77,.62,p['ivory'],axis='Z',segments=12)
    elif name=='place_station_billboard':
        for sign in (-1,1):
            beam('Remaster_DisplayCableRace',(-5.8,sign*1.5,-1.2),(5.8,sign*1.5,-1.2),.18,.18,p['alloy'])
    elif name=='place_lane_beacon':
        for i in range(5):
            x=1.7+i*1.25
            beam('Remaster_GantryLoadGusset'+str(i),(x,-.63,4.2),(x+.48,-.63,4.76),.16,.15,p['alloy'])
    elif name=='place_dock_interior':
        for sign in (-1,1):
            for i in range(5):
                x=-18+i*9
                beam('Remaster_DockServiceArch'+str(sign)+str(i),(x,sign*15.4,1),(x,sign*13.7,5.8),.28,.28,p['ivory'])
    return changes

def preflight(name,objects):
    zones=[]
    for o in objects:
        if helper(o) or any(k in o.name.lower() for k in ('lod1','lod2')):continue
        zones.append({'component':o.name,'disposition':'billed','supportedViews':['chase_60','chase_close_60','grazing_60'],
          'dominant':sum(len(p.vertices)-2 for p in o.data.polygons)>200,
          'retainedInterfaces':'Existing silhouette anchors, extent, attachment nodes and collision metadata are frozen.',
          'materialBill':'Retain existing mesh-aware maps; revise case surfaces only where wood-like or scorched substance is wrong. Added enamel is dielectric vitreous coating; cavity interiors are dry dark heat scale; functional rims are brushed nickel with two-segment edge breaks.',
          'forbiddenRead':'Unrooted greebles, flat dark rectangles pretending to be holes, solid glowing discs, default smooth plastic.'})
    row={'asset':name,'source':str(PATHS[name].relative_to(ROOT)),'sourceSha256':hashlib.sha256(PATHS[name].read_bytes()).hexdigest(),
       'canon':'docs/worldbuilding/vibe/vibe-CANONICAL.md; src/data/sectors.js; ART EXTRAPOLATION: maintained industrial service assemblies share cast enamel and nickel repair interfaces.',
       'componentReferenceDecision':'not_needed','allSupportedViewZonesClassified':False,'zones':zones,
       'workingScene':str((OUT/(name+'.blend')).relative_to(ROOT)),
       'review':'Controller independent full-asset view of exact candidate plus live integration remains required; no script grants art acceptance.'}
    (OUT/(name+'.preflight.json')).write_text(json.dumps(row,indent=2))
    return row

def restore_metadata(path,source):
    data=path.read_bytes();n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n])
    old=source.read_bytes();on=struct.unpack_from('<I',old,12)[0];original=json.loads(old[20:20+on])
    repair_document(doc, original, path.stem)
    doc['asset']['generator']='SpaceFace Helios remaster / Blender '+bpy.app.version_string
    oldnodes={n.get('name'):n for n in original.get('nodes',[])}
    for node in doc.get('nodes',[]):
        prior=oldnodes.get(node.get('name'))
        if prior and 'extras'in prior:node['extras']=prior['extras']
        if 'collision' in node.get('name','').lower():node.pop('mesh',None)
    raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
    body=struct.pack('<II',len(raw),0x4e4f534a)+raw+data[20+n:]
    path.write_bytes(b'glTF'+struct.pack('<II',2,12+len(body))+body)

def build(name):
    OUT.mkdir(parents=True,exist_ok=True);objects=load(name);record=preflight(name,objects);p=palette()
    oldnames={o.name for o in objects};lo,hi=scene_bounds(objects)
    if name.startswith('weapon_'):changes=weapon(name,objects,p)
    elif any(k in name for k in ('aftermath','dead_hulk','debris_chunk')):changes=wreck(name,objects,p)
    elif name in ('place_lane_pin','place_tally_post','place_claim_mark','place_cold_locker','place_ash_pin','place_whistle'):changes=furniture(name,objects,p)
    else:changes=place(name,objects,p)
    # Join additions by material to keep the new assembly at one draw per substance.
    additions=[o.name for o in bpy.data.objects if o.type=='MESH' and o.name not in oldnames]
    has_lods=any(n.startswith('LOD1_') for n in oldnames)
    groups=[]
    for mat in p.values():
        group=[bpy.data.objects[n] for n in additions if n in bpy.data.objects and bpy.data.objects[n].data.materials and bpy.data.objects[n].data.materials[0]==mat]
        if not group:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();o=bpy.context.object
        o.name=('LOD0_' if has_lods else '')+'Remaster_'+mat.name
        o['spaceface']={'lod':'lod0','chamfered':True};groups.append(o)
        if has_lods:
            for level in (1,2):
                clone=o.copy();clone.data=o.data.copy();bpy.context.collection.objects.link(clone)
                clone.name='LOD'+str(level)+'_Remaster_'+mat.name
                clone['spaceface']={'lod':'lod'+str(level),'chamfered':True}
    bpy.ops.object.select_all(action='DESELECT')
    export_objects=list(bpy.data.objects)
    for o in export_objects:
        if helper(o):o.hide_render=True
        elif any(len(face.vertices)>4 for face in o.data.polygons):
            bm=bmesh.new();bm.from_mesh(o.data)
            bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>4],quad_method='BEAUTY',ngon_method='BEAUTY')
            bm.to_mesh(o.data);bm.free()
    for m in bpy.data.materials:
        m['spacefaceRemasterGeometry']=True
    output=OUT/(name+'.glb')
    # Imported materials already contain mesh-specific portable maps. Explicit role
    # material parameters are acceptable for newly modeled interior/metal hardware.
    spaceface_export.export_gltf(str(output),{'id':name,'kind':'part','slot':'weapon' if name.startswith('weapon_') else 'pod' if name.startswith('pod_') else 'place','required_maps':[]},export_objects)
    restore_metadata(output,PATHS[name])
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
    record.update({'candidate':str(output.relative_to(ROOT)),'candidateSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'changes':changes,'newDrawGroups':len(groups),'state':'integration_candidate','visualVerdict':'pending independent root review'})
    (OUT/(name+'.report.json')).write_text(json.dumps(record,indent=2))
    print('BUILT',name,len(changes),len(groups),flush=True)

def finish_maps(name):
    """Wire already authored white AO substrates for portable source-map coverage."""
    bpy.ops.wm.open_mainfile(filepath=str(OUT/(name+'.blend')))
    for mat in bpy.data.materials:
        mat['spacefaceRemasterGeometry']=True
        if not mat.use_nodes:continue
        ao=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.name.endswith('_ao')),None)
        if not ao or ao.outputs['Color'].is_linked:continue
        group=bpy.data.node_groups.get('glTF Material Output')
        if not group:
            group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
            group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
        output=mat.node_tree.nodes.new('ShaderNodeGroup');output.node_tree=group
        mat.node_tree.links.new(ao.outputs['Color'],output.inputs['Occlusion'])
    output=OUT/(name+'.glb')
    spaceface_export.export_gltf(str(output),{'id':name,'kind':'part','required_maps':[]},list(bpy.data.objects))
    restore_metadata(output,PATHS[name]);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
    report_path=OUT/(name+'.report.json');record=json.loads(report_path.read_text())
    record['candidateSha256']=hashlib.sha256(output.read_bytes()).hexdigest();record['portableAoBound']=True
    report_path.write_text(json.dumps(record,indent=2));print('MAPS_FINAL',name,flush=True)

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    selected=[a for a in args if not a.startswith('--')] or list(PATHS)
    if '--finish-maps' in args:
        for name in selected:finish_maps(name)
    elif '--build' in args:
        for name in selected:build(name)
    else:inspect(selected)
