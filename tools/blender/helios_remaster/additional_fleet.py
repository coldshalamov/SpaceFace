"""Mule/Atlas convoy completion; imports pinned original source, never writes live assets."""
from __future__ import annotations
import argparse, hashlib, json, struct, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import hero_fleet as h

ROOT=h.ROOT
OUT=ROOT/'.devshots/helios-remaster/additional-fleet'
NAMES=['mule_production_v1','atlas_production_v1']
VARIANTS={'helios_span_dmc':'helios_span','helios_span_mts':'helios_span','helios_span_reach':'helios_span',
          'wasp_free_militia':'wasp_production_v1','wasp_mts_escort':'wasp_production_v1','wasp_scn_patrol':'wasp_production_v1'}
REFITTED_VARIANTS={'helios_span_mts','wasp_mts_escort','wasp_scn_patrol'}
REGISTRY=Path(__file__).with_name('additional_fleet_sources.json')

def source_bytes(name):
    pinned=json.loads(REGISTRY.read_text(encoding='utf-8-sig'))[name]
    data=subprocess.check_output(['git','cat-file','blob',pinned['sourceBlob']],cwd=ROOT)
    if hashlib.sha256(data).hexdigest()!=pinned['sha256']:raise RuntimeError('Pinned source mismatch: '+name)
    return data

h.OUT=OUT
h.source_bytes=source_bytes

def inspect_components(names):
    result={}
    for name in names:
        objects=h.import_ship(name)
        pieces=h.isolate_components(objects)
        result[name]=[{'name':ob.name,'bounds':h.bounds(ob),'materials':[m.name for m in ob.data.materials if m]}
          for ob in pieces if any(s in ' '.join(m.name.lower() for m in ob.data.materials if m) for s in ('hull','armor'))]
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'component_inventory.json').write_text(json.dumps(result,indent=2))

def convoy_materials(objects):
    authored=h.materials()
    existing=list({m for ob in objects for m in ob.data.materials if m})
    def choose(token,fallback):return next((m for m in existing if token in m.name.lower()),fallback)
    authored['dark']=choose('mechanical',authored['dark'])
    authored['ceramic']=choose('ceramic',authored['ceramic'])
    authored['copper']=authored['dark']
    if h.LOD_DETAIL:
        authored=h.lod_materials(objects,authored)
        authored['enamel']=choose('hull',authored['enamel'])
    return authored

def lifting_pocket(shells,mats,level,x,y,length,width,label):
    z,hit=h.top_at(shells,x,y)
    if z is None:raise RuntimeError('No freight lid '+label)
    depth=.24
    changed=h.cut(shells,x,y,length,width,z,depth,label)
    p=f'LOD{level}_Remaster_{label}'
    # Seat coaming below the original top edge: the cargo bounding envelope is unchanged.
    h.rim(p+'_InsetHandlingCoaming',x,y,length,width,z-.045,depth-.045,mats['steel'])
    h.section_solid(p+'_RecessFloor',x,y,length-.13,width-.13,z-depth-.01,z-depth+.018,mats['dark'])
    # One physical lifting bridge spans the recess; no heat-exchanger louvres on freight.
    h.pipe(p+'_ForgedLiftingBridge',[(x,y-width*.32,z-.19),(x,y-width*.29,z-.11),(x,y+width*.29,z-.11),(x,y+width*.32,z-.19)],.055,mats['steel'],8)
    if h.LOD_DETAIL==0:
        for sign in (-1,1):h.box(p+'_BridgeBearing',(x,y+sign*width*.32,z-.18),(.21,.12,.12),mats['dark'],.015)
    return {'label':label,'sourceObjects':changed,'center':[x,y,z],'size':[length,width,depth]}

def transfer_bay(shells,mats,level,atlas):
    x,l,w,depth=(-6.65,4.9,2.12,.67) if atlas else (-4.0,4.8,1.48,.49)
    z,hit=h.top_at(shells,x,0)
    if z is None:raise RuntimeError('Missing service deck')
    p=f'LOD{level}_Remaster_'+('AtlasTransferSaddle' if atlas else 'MuleTractionBus')
    changed=h.cut(shells,x,0,l,w,z,depth,p)
    h.rim(p+'_MachinedReveal',x,0,l,w,z-.035,depth-.035,mats['steel'])
    h.section_solid(p+'_ServiceFloor',x,0,l-.1,w-.1,z-depth-.015,z-depth+.025,mats['dark'])
    radius=.235 if atlas else .155
    cy=w*.23
    for sign in (-1,1):
        yy=cy*sign
        h.pipe(p+'_PressureHousing' if atlas else p+'_InsulatedPowerBus',
          [(x-l*.40,yy,z-depth*.51),(x+l*.40,yy,z-depth*.51)],radius,mats['ceramic'],12)
        if h.LOD_DETAIL==0:
            for xx in (x-l*.34,x,x+l*.34):
                h.pipe(p+'_Clamp',[(xx,yy-radius-.035,z-depth*.76),(xx,yy-radius-.04,z-depth*.27),
                    (xx,yy+radius+.04,z-depth*.27),(xx,yy+radius+.035,z-depth*.76)],.032,mats['steel'],6)
    for xx in (x-l*.23,x+l*.23):
        # Real folded channel arch: broad shoulders, a raised narrow ridge and open air below.
        stations=[(-w*.67,z+.025),(-w*.47,z+.09),(-w*.28,z+.36),(w*.28,z+.36),(w*.47,z+.09),(w*.67,z+.025)]
        verts=[(xx+dx,yy,zz) for yy,zz in stations for dx in (-.19,.19)]
        faces=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(stations)-1)]
        arch=h.mesh_obj(p+'_FoldedLoadSaddle',verts,faces,mats['enamel'])
        if h.LOD_DETAIL<2:
            solid=arch.modifiers.new('Folded load channel thickness','SOLIDIFY');solid.thickness=.035
        h.bevel(arch,.025,2)
        if atlas:
            for sign in (-1,1):
                h.pipe(p+'_TransferKnee',[(xx-.46,sign*w*.69,z+.02),(xx,sign*w*.43,z+.20),
                    (xx+.46,sign*w*.69,z+.02)],.07,mats['steel'],6)
        if h.LOD_DETAIL==0:
            for sign in (-1,1):h.box(p+'_SaddleFoot',(xx,sign*w*.60,z+.025),(.50,.26,.065),mats['dark'],.018)
    return {'label':'Atlas recessed load-transfer plant' if atlas else 'Mule recessed traction power bus',
            'sourceObjects':changed,'center':[x,0,z],'size':[l,w,depth]}

def finish_candidate(name,source_objects,report,source_mesh_count):
    additions=[ob for ob in bpy.context.scene.objects if ob not in source_objects and ob.type=='MESH']
    h.regroup_originals()
    groups={}
    for ob in additions:
        bpy.context.view_layer.objects.active=ob
        for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        if not ob.data.uv_layers:
            uv=ob.data.uv_layers.new(name='UVMap')
            for poly in ob.data.polygons:
                for li in poly.loop_indices:
                    co=ob.data.vertices[ob.data.loops[li].vertex_index].co
                    uv.data[li].uv=(co.x*.125,co.y*.125)
        groups.setdefault((ob.name[:4],ob.data.materials[0].name),[]).append(ob)
    for (lod,material),objects in groups.items():
        existing=next((ob for ob in bpy.context.scene.objects if ob not in additions and ob.type=='MESH'
          and ob.name.startswith(lod) and {m.name for m in ob.data.materials if m}=={material}
          and not any(t in ob.name.lower() for t in ('hook','fan','gimbal','gun_','mining_head'))),None)
        original_name=existing.name if existing else None
        if existing:objects=[existing]+objects
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        objects[0].name=original_name or lod+'_Remaster_'+material
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH' or not any(len(poly.vertices)>4 for poly in ob.data.polygons):continue
        bpy.context.view_layer.objects.active=ob
        mod=ob.modifiers.new('Triangulate manufactured openings','TRIANGULATE');mod.keep_custom_normals=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    data=source_bytes(name);doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    spec={'kind':'wholeship','id':name,'assetId':name,'slot':'hull','required_maps':[]}
    target=OUT/name;target.mkdir(parents=True,exist_ok=True)
    h.export_gltf(str(target/(name+'.glb')),spec,[ob for ob in bpy.context.scene.objects if ob.type not in ('LIGHT','CAMERA')])
    h.preserve_metadata(target/(name+'.glb'),doc,hashlib.sha256(data).hexdigest())
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH':ob.hide_render=not h.visible(ob)
    bpy.ops.wm.save_as_mainfile(filepath=str(target/(name+'.blend')))
    (target/'candidate.json').write_text(json.dumps({'asset':name,'sourceSha256':hashlib.sha256(data).hexdigest(),
      'candidateSha256':hashlib.sha256((target/(name+'.glb')).read_bytes()).hexdigest(),
      'sourceMeshCount':source_mesh_count,'geometryChanges':report,'reviewStatus':'candidate; controller review pending'},indent=2))
    print('ADDITIONAL_FLEET_BUILT',name,flush=True)

def build_convoy(name):
    h.import_ship(name)
    source_mesh_count=len([ob for ob in bpy.context.scene.objects if ob.type=='MESH'])
    groups={level:h.isolate_components(objects) for level,objects in h.scene_groups().items()}
    source_objects=list(bpy.context.scene.objects);report=[]
    semantic=2 if name.endswith('_lod2') else 1 if name.endswith('_lod1') else 0
    atlas=name.startswith('atlas')
    for level,objects in groups.items():
        h.LOD_DETAIL=max(level,semantic)
        mats=convoy_materials(objects)
        shells=[ob for ob in objects if any(s in ' '.join(m.name.lower() for m in ob.data.materials if m) for s in ('hull','armor'))]
        report.append(transfer_bay(shells,mats,level,atlas))
        for x in ((-1.98,1.32) if atlas else (-1.2,1.6)):
            for sign in (-1,1):
                report.append(lifting_pocket(shells,mats,level,x,sign*(2.95 if atlas else 2.55),
                  1.34 if atlas else 1.54,.52,('Atlas' if atlas else 'Mule')+f'_CargoLift_{x}_{sign}'))
    finish_candidate(name,source_objects,report,source_mesh_count)

def kit_materials(objects,mats):
    # The existing kit covers are painted Hull, not Mechanical. Keep their actual
    # faction paint/UV texture family and reuse the existing dark/optical groups.
    out=dict(mats)
    existing=[m for ob in objects for m in ob.data.materials if m]
    out['paint']=next(m for m in existing if m.name=='Material_Hull')
    out['glass']=next((m for m in existing if 'glass' in m.name.lower()),out['glass'])
    out['dark']=next((m for m in existing if m.name=='Material_Mechanical'),out['dark'])
    return out

def pressure_case(label,x,y,length,width,bottom,top,material):
    # A formed shell has a low stepped heel, broad canted shoulders and a prow
    # taper. Neither the longitudinal section nor the cross-section is a box.
    height=top-bottom
    stations=[(x-length*.5,width*.72,bottom,top-height*.34),
      (x-length*.38,width,bottom,top),(x+length*.31,width,bottom,top),
      (x+length*.5,width*.68,bottom+height*.12,top-height*.26)]
    ob=h.formed_housing(label,stations,material)
    for v in ob.data.vertices:v.co.y+=y
    return ob

def flush_access(label,body,x,y,length,width,z,depth,mats,optical=False):
    # Cut the actual case, then seat a gasket and an inset door/lens below its roof.
    h.cut([body],x,y,length,width,z,depth,label)
    h.rim(label+'_MachinedGasket',x,y,length,width,z-.02,depth-.02,mats['steel'])
    h.section_solid(label+'_Recess',x,y,length-.10,width-.10,z-depth-.01,z-depth+.025,mats['dark'])
    h.box(label+'_InsetOpticalDoor' if optical else label+'_InsetServiceDoor',
      (x,y,z-depth+.055),(length*.74,width*.70,.07),mats['glass'] if optical else mats['paint'],.025)
    if h.LOD_DETAIL==0 and not optical:
        h.pipe(label+'_DoorHandle',[(x,y-width*.18,z-depth+.10),(x,y-width*.18,z-depth+.17),
          (x,y+width*.18,z-depth+.17),(x,y+width*.18,z-depth+.10)],.035,mats['steel'],6)

def remove_kit(objects,tokens):
    removed=[]
    for ob in list(objects):
        if any(token in ob.name for token in tokens):
            removed.append(ob.name);objects.remove(ob);bpy.data.objects.remove(ob,do_unlink=True)
    return removed

def span_mts_pressure_deck(objects,mats,level):
    p=f'LOD{level}_Remaster_MTS'
    # Replace only these add-on covers and their now-obsolete parting screws.
    # Hull/cargo service openings, engines, cabin and source livery stay intact.
    removed=remove_kit(objects,('VAR_MTS_clamshell','VAR_MTS_goldzone','VAR_MTS_parting_rail','VAR_MTS_seal'))
    cases=[]
    for label,x,length,width,top in [('Aft',-7.6625,8.5,6.6,3.50),
        ('Mid',.3375,10,7.4,3.70),('Fore',7.8375,6,5.2,3.375)]:
        body=pressure_case(p+'_'+label+'PressureCover',x,0,length,width,2.40,top,mats['paint'])
        cases.append(body)
        # The continuous center passage is real empty volume, with staggered
        # pressure covers defining its walls rather than a slot painted on top.
        h.cut([body],x,0,length+1,1.72,top,top-2.65,p+'_'+label+'BoardingChannel')
        h.section_solid(p+'_'+label+'PassageFloor',x,0,length-.14,1.62,2.635,2.67,mats['dark'])
        for sign in (-1,1):
            if h.LOD_DETAIL<2:
                h.pipe(p+'_'+label+'ProtectedConduit',[(x-length*.40,sign*.66,2.75),
                  (x+length*.40,sign*.66,2.75)],.055,mats['steel'],6)
            # Actual corner saddles root each cover onto the retained freight body.
            for xx in (x-length*.29,x+length*.27):
                h.box(p+'_'+label+'RootSaddle',(xx,sign*width*.43,2.52),(.42,width*.12,.30),mats['dark'],.025)
        if h.LOD_DETAIL==0:
            for sign in (-1,1):
                xx=x+length*.15;yy=sign*width*.32
                flush_access(p+'_'+label+'PressureLatch'+str(sign),body,xx,yy,
                  min(1.35,length*.2),.60,top-.07,.22,mats)
    # Raised sealed control bridge crosses the channel once, leaving both
    # entrances open; it keeps the faction's original central gold-zone location.
    bridge=pressure_case(p+'_BoardingControlBridge',.3375,0,3.30,2.30,3.10,3.96,mats['paint'])
    for sign in (-1,1):
        h.box(p+'_BridgeBearing',(.3375,sign*.90,2.98),(1.12,.25,.68),mats['dark'],.03)
    if h.LOD_DETAIL<2:flush_access(p+'_BoardingControlOptics',bridge,.3375,0,1.60,.78,3.93,.30,mats,True)
    for ob in objects:
        if 'VAR_MTS_cabinstrip' in ob.name:ob.location.y-=1.0
        if 'VAR_MTS_logo' in ob.name:ob.location.y+=1.1;ob.location.z+=.19
    return {'label':'MTS Span formed pressure covers and recessed continuous boarding passage',
      'replacedSourceObjects':removed,'nativeLod':level,'construction':'Stepped shoulders, real center channel, recessed pressure latches, grounded cover saddles and one supported control bridge'}

def wasp_mts_casings(objects,mats,level):
    p=f'LOD{level}_Remaster_MTSEscort'
    removed=remove_kit(objects,('VAR_MTS_clamshell','VAR_MTS_goldzone'))
    for label,x,length,width,bottom,top in [('Aft',-3.9,4.4,3.3,1.26,2.56),
      ('Mid',.70,7.4,4.0,1.26,2.96),('Fore',5.6,4.4,3.0,1.50,2.7491)]:
        h.box(p+'_'+label+'FittedSkirt',(x,0,bottom-.03),(length*.91,width*.90,.28),mats['dark'],.06)
        body=pressure_case(p+'_'+label+'ArmoredAvionicsCase',x,0,length,width,bottom,top,mats['paint'])
        # Offset service doors remain visible alongside the narrow central bridge.
        flush_access(p+'_'+label+'Service',body,x-.12,-width*.22,length*.42,width*.31,top-.035,.32,mats,label=='Fore')
        for sign in (-1,1):
            h.box(p+'_'+label+'RootedClamp',(x-length*.24,sign*width*.43,bottom+.08),(.45,.25,.50),mats['dark'],.025)
    # Existing light-strip/gold-zone nodes were floating ~2m above the covers.
    # Build the protective control spine beneath them instead of retaining air gaps.
    lantern=pressure_case(p+'_LongitudinalControlLantern',2.15,0,9.8,1.12,2.49,4.74,mats['paint'])
    for x in (-1.4,2.1,5.8):
        h.box(p+'_LanternRoot',(x,0,2.80),(.72,1.45,.70),mats['dark'],.035)
    flush_access(p+'_LanternDorsalOptics',lantern,2.1,0,4.9,.62,4.74,.28,mats,True)
    for sign in (-1,1):
        # Closed side apertures: finite-height Boolean cutters leave the roof
        # and lower sill intact. Recessed glass is physically inside the shell.
        cutter=h.section_solid('CUTTER_LanternSide',1.20,sign*.58,5.9,.50,3.20,4.15,None)
        mod=lantern.modifiers.new('Recessed side glazing','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        bpy.context.view_layer.objects.active=lantern;bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter,do_unlink=True)
        h.box(p+'_RecessedSideGlazing',(1.20,sign*.39,3.68),(5.72,.045,.84),mats['glass'],.02)
        for x in (-.65,2.95):
            h.pipe(p+'_WindowMullion',[(x,sign*.48,3.23),(x,sign*.48,4.12)],.035,mats['steel'],6)
    # Re-seat round radar/pressure blisters onto the now-fitted case shoulders.
    for ob in objects:
        if 'VAR_MTS_blister' in ob.name:ob.location.z-=1.15
        if 'VAR_MTS_logo' in ob.name:ob.location.x+=1.2
        if 'VAR_MTS_cabinstrip' in ob.name:
            inv=ob.matrix_world.inverted()
            for v in ob.data.vertices:
                pt=ob.matrix_world@v.co;pt.x=1.4+(pt.x-1.5)*(3.8/5.4);v.co=inv@pt
    return {'label':'MTS Wasp fitted three-case avionics pack and rooted optical command spine',
      'replacedSourceObjects':removed,'construction':'Sloping pressure-case shoulders, recessed service doors, dark fitted skirts, integral bridge roots and re-seated blisters'}

def wasp_scn_housings(objects,mats,level):
    p=f'LOD{level}_Remaster_SCNPatrol'
    removed=remove_kit(objects,('VAR_SCN_plate','VAR_SCN_band'))
    for index,x,bottom,top in [(0,5.6,1.34,2.0791),(1,1.9,1.10,1.84),(2,-2.4,1.10,1.84)]:
        h.box(p+'_InstrumentSkirt'+str(index),(x,0,bottom+.04),(2.16,2.21,.25),mats['dark'],.04)
        body=pressure_case(p+'_FacetedInstrumentCase'+str(index),x,0,2.30,2.40,bottom,top,mats['paint'])
        flush_access(p+'_RecessedCaseLens'+str(index),body,x,0,1.17,.91,top,.22,mats,index!=1)
    # The old cross stripe becomes a formed load bridge, sweeping down into both
    # side saddles; its underside makes the armor/case attachment legible.
    stations=[(-3.7,.96),(-2.75,1.04),(-1.28,1.72),(1.28,1.72),(2.75,1.04),(3.7,.96)]
    verts=[(-.4+dx,y,z+dz) for dz in (-.16,.14) for y,z in stations for dx in (-.52,.52)]
    n=len(stations)*2
    faces=[]
    for layer in (0,1):
        for i in range(len(stations)-1):faces.append((layer*n+2*i,layer*n+2*i+1,layer*n+2*i+3,layer*n+2*i+2))
    for i in range(len(stations)-1):
        for side in (0,1):faces.append((2*i+side,2*i+side+2,n+2*i+side+2,n+2*i+side))
    faces += [(0,1,n+1,n),(n-2,n-1,2*n-1,2*n-2)]
    h.bevel(h.mesh_obj(p+'_FormedArmorYoke',verts,faces,mats['paint']),.045,2)
    for sign in (-1,1):
        side=pressure_case(p+'_RootedFlankCase'+str(sign),1.4,sign*2.9,1.9,1.8,.68,1.2111,mats['paint'])
        flush_access(p+'_FlankService'+str(sign),side,1.4,sign*2.9,.88,.67,1.2111,.20,mats)
        # Recessed luminous perimeter remains faction-specific, but now sits in
        # a real protective rail with posts transferring loads into the cases.
        h.box(p+'_ProtectiveOpticalRail', (1.30,sign*1.00,2.20),(10.8,.27,.27),mats['dark'],.025)
        for x in (-2.40,1.90,5.60):h.box(p+'_RailBearing',(x,sign*1.00,1.94),(.40,.40,.52),mats['paint'],.025)
    return {'label':'SCN Wasp faceted sensor housings, inset optics and formed wing-root armor yoke',
      'replacedSourceObjects':removed,'construction':'Three gasketed cases; recessed optical/service doors; bent cross yoke rooted in wing saddles; supported luminous perimeter'}

def build_refitted_variant(name):
    h.import_ship(name)
    source_mesh_count=len([ob for ob in bpy.context.scene.objects if ob.type=='MESH'])
    groups={level:h.isolate_components(objects) for level,objects in h.scene_groups().items()}
    source_names={ob.name for ob in bpy.context.scene.objects};report=[];authored=h.materials()
    for level,objects in groups.items():
        h.LOD_DETAIL=level;mats=kit_materials(objects,h.lod_materials(objects,authored))
        shells=[ob for ob in objects if any(s in ' '.join(m.name.lower() for m in ob.data.materials if m) for s in ('hull','armor','ceramicpaint'))]
        # MTS Span's pressure covers conceal the base cargo tops. Their six fitted
        # pressure latches below replace those now-invisible generic service wells.
        if name!='helios_span_mts':
            for entry in h.CAVITIES[VARIANTS[name]]:report.append(h.cavity(shells,*entry,mats,level))
        if name=='helios_span_mts':report.append(span_mts_pressure_deck(objects,mats,level))
        elif name=='wasp_mts_escort':report.append(wasp_mts_casings(objects,mats,level))
        else:report.append(wasp_scn_housings(objects,mats,level))
    source_objects=[ob for ob in bpy.context.scene.objects if ob.name in source_names]
    finish_candidate(name,source_objects,report,source_mesh_count)

def preview(name, source=False):
    if source:h.import_ship(name)
    else:
        h.clear();bpy.ops.import_scene.gltf(filepath=str(OUT/name/(name+'.glb')))
    bpy.context.view_layer.update()
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH':ob.hide_render=not h.visible(ob)
    points=[ob.matrix_world@Vector(c) for ob in bpy.context.scene.objects if h.visible(ob) for c in ob.bound_box]
    focus=Vector(tuple((min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)))
    scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH'
    scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.display.shading.light='STUDIO';scene.display.shading.studio_light='paint.sl'
    scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True
    scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH'
    scene.display.shading.background_type='WORLD';scene.world.color=(.025,.035,.06)
    data=bpy.data.cameras.new('Chase');cam=bpy.data.objects.new('Chase',data);scene.collection.objects.link(cam);scene.camera=cam
    for label,distance,heading in [('chase_close',58,0),('chase',144,0),('abeam',144,90)]:
        h.apply_chase_camera(cam,distance=distance,heading_deg=heading,focus=focus)
        target=OUT/name;target.mkdir(parents=True,exist_ok=True)
        scene.render.filepath=str(target/(('source_' if source else '')+label+'.png'))
        bpy.ops.render.render(write_still=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--inspect',action='store_true');parser.add_argument('--components',action='store_true');parser.add_argument('--build',action='store_true');parser.add_argument('--lods',action='store_true');parser.add_argument('--preview',action='store_true');parser.add_argument('--source',action='store_true');parser.add_argument('--only',default='')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    names=args.only.split(',') if args.only else NAMES+list(VARIANTS)
    if args.inspect:h.inspect(names)
    if args.components:inspect_components(names)
    if args.build:
        for name in names:
            if name in REFITTED_VARIANTS:build_refitted_variant(name)
            elif name in VARIANTS:h.build_one(VARIANTS[name],name)
            else:
                build_convoy(name)
                if args.lods:
                    for level in (1,2):build_convoy(name+'_lod'+str(level))
    if args.preview:
        for name in names:preview(name,args.source)

if __name__=='__main__':main()
