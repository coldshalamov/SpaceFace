#!/usr/bin/env python3
"""Build the authored claim/outpost growth family.

The family has one shared uncommissioned chassis and three complete commissioned states matching
the live claim authority: refinery, relay, and bastion. Geometry is authored from the same shared
base function so every state visibly grows from the player's original claim.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import time
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / 'tools' / 'blender' / 'build_station_visual_family.py'
spec = importlib.util.spec_from_file_location('station_family_helpers', MODULE_PATH)
sf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sf)

PACKET_ROOT = ROOT / 'assets' / 'ships' / 'm5_claim_outposts'
SOURCE = PACKET_ROOT / 'source' / 'places'
BLENDS = PACKET_ROOT / 'blender'
EVIDENCE = PACKET_ROOT / 'evidence'
PACKET = 'M5-CLAIM-OUTPOST-VISUAL-GROWTH-001'
FAMILY = 'player_claim_growth_family'

ASSETS = {
    'place_claim_outpost_base': ('claim_base', 'Claim Anchor'),
    'place_claim_outpost_refinery': ('spec_refinery', 'Industrial Refinery Claim'),
    'place_claim_outpost_relay': ('spec_relay', 'Trade Relay Claim'),
    'place_claim_outpost_bastion': ('spec_bastion', 'Defense Bastion Claim'),
}


def log(message):
    print(f'[claim-outposts] {message}', flush=True)


def create_materials(asset_id):
    accents = {
        'place_claim_outpost_base': ((0.18, 0.72, 0.94), (0.04, 0.38, 0.72), 1.1),
        'place_claim_outpost_refinery': ((0.96, 0.40, 0.07), (0.84, 0.20, 0.02), 1.7),
        'place_claim_outpost_relay': ((0.20, 0.82, 0.94), (0.04, 0.50, 0.76), 1.5),
        'place_claim_outpost_bastion': ((0.26, 0.60, 0.96), (0.05, 0.32, 0.84), 1.5),
    }
    accent = accents[asset_id]
    return {
        'Material_Hull': sf.textured_material('Material_Hull', 'hull', (0.30, 0.34, 0.39), 0.64, 0.43),
        'Material_Mechanical': sf.textured_material('Material_Mechanical', 'mechanical', (0.14, 0.17, 0.21), 0.78, 0.50),
        'Material_Warm': sf.textured_material('Material_Warm', 'warm', (0.58, 0.28, 0.08), 0.53, 0.46),
        'Material_Accent': sf.textured_material('Material_Accent', 'accent', accent[0], 0.34, 0.28, (accent[1], accent[2])),
        'Material_Glass': sf.textured_material('Material_Glass', 'glass', (0.09, 0.35, 0.53), 0.14, 0.14, ((0.02, 0.18, 0.30), 0.7)),
    }


def build_shared_base(col, mats, lod):
    # A clamp-ring around a rocky moonlet: unmistakably constructed, but still rooted in the body.
    sf.ico(col, mats, lod, 'ClaimRock', 18, (0, -5, 0), 'Material_Hull', (1.32, .72, 1.05), 71)
    sf.torus(col, mats, lod, 'ClaimClamp', 23, 2.0, (0, -2, 0), 'Material_Mechanical', rot=(math.pi/2, 0, 0))
    sf.torus(col, mats, lod, 'ClaimPowerBus', 19.5, .55, (0, -2, 0), 'Material_Accent', rot=(math.pi/2, 0, 0))
    sf.box(col, mats, lod, 'ClaimCore', (24, 11, 18), (0, 7, 0), 'Material_Hull', .72)
    sf.box(col, mats, lod, 'DockTongue', (36, 4.5, 11), (29, 1, 0), 'Material_Mechanical', .38)
    sf.box(col, mats, lod, 'DockHead', (15, 8, 17), (48, 2, 0), 'Material_Hull', .55)
    sf.windows_strip(col, mats, lod, 'ControlWindows', (48, 5, 8.7), 7, 1.8, (1.0, .55, .24), 'x')
    # Four physical module hardpoints; their positions stay stable across every growth state.
    for i in range(4):
        a = math.tau * i / 4 + math.pi/4
        x = math.cos(a)*29; z = math.sin(a)*29
        sf.box(col, mats, lod, f'ModulePad_{i}', (8.5, 2.4, 8.5), (x, 1.0, z), 'Material_Warm', .30, (0, -a, 0))
        sf.beam_between(col, mats, lod, f'PadTruss_{i}', (math.cos(a)*18,-2,math.sin(a)*18), (x,1,z), 1.1, 'Material_Mechanical')
    # Navigation lights make the player's structure legible on the dark belt side.
    for i in range(8 if lod == 0 else 4):
        a = math.tau * i / (8 if lod == 0 else 4)
        sf.box(col, mats, lod, f'ClaimLight_{i}', (1.0, .45, .32), (math.cos(a)*24, 1.4, math.sin(a)*24), 'Material_Accent', .04)


def add_refinery(col, mats, lod):
    # Hopper/crusher at one pad, cracking towers at the other, storage tanks and visible pipe runs.
    sf.torus(col, mats, lod, 'OreCrusher', 9.0, 1.4, (-20, 9, -20), 'Material_Warm', rot=(math.pi/2,0,0))
    sf.torus(col, mats, lod, 'OreCrusherGlow', 6.3, .55, (-20, 9, -20), 'Material_Accent', rot=(math.pi/2,0,0))
    tower_count = 4 if lod == 0 else 3 if lod == 1 else 2
    for i in range(tower_count):
        x = -17 + i*10
        h = 24 + (i%2)*7
        sf.cyl(col,mats,lod,f'CrackingTower_{i}',3.6,h,(x,9+h/2,20),'Material_Mechanical')
        sf.torus(col,mats,lod,f'TowerBand_{i}',3.8,.35,(x,15+h*.38,20),'Material_Warm')
    tank_count = 6 if lod == 0 else 4 if lod == 1 else 2
    for i in range(tank_count):
        x=18+(i%3)*8; z=-21+(i//3)*10
        sf.cyl(col,mats,lod,f'RefinedTank_{i}',3.4,10,(x,6,z),'Material_Hull',rot=(0,0,math.pi/2))
    for i in range(6 if lod == 0 else 3):
        sf.cyl(col,mats,lod,f'PipeRun_{i}',.42+(i%2)*.12,55,(0,5+i*.8,-13+i*2.4),'Material_Warm',rot=(0,math.pi/2,0))
    sf.box(col,mats,lod,'RefineryControl',(18,10,14),(-30,9,18),'Material_Hull',.55)
    sf.windows_strip(col,mats,lod,'RefineryWindows',(-30,11,25.2),7,1.7,(1.0,.55,.24),'x')


def add_relay(col, mats, lod):
    # Freight silos and two docking spines form an obvious transfer/convoy silhouette.
    for side in (-1,1):
        x=-14
        z=side*26
        sf.cyl(col,mats,lod,f'DepotSilo_{side}',8.0,25,(x,11,z),'Material_Hull')
        for band in range(3 if lod < 2 else 2):
            sf.torus(col,mats,lod,f'SiloBand_{side}_{band}',8.2,.45,(x,4+band*8,z),'Material_Warm')
        sf.box(col,mats,lod,f'ConvoyDock_{side}',(45,4.5,11),(23,2,z),'Material_Mechanical',.38)
        sf.box(col,mats,lod,f'CargoHead_{side}',(14,9,17),(47,3,z),'Material_Hull',.55)
        sf.windows_strip(col,mats,lod,f'DockLights_{side}',(47,6,z+side*8.7),6,1.7,(1,.5,.25),'x')
    sf.cyl(col,mats,lod,'RelayMast',1.8,35,(-2,27,0),'Material_Mechanical')
    sf.torus(col,mats,lod,'RelayDish',9,.65,(-2,37,0),'Material_Accent',rot=(math.pi/2,.2,0))
    sf.torus(col,mats,lod,'RelayDishInner',5,.4,(-2,37,0),'Material_Accent',rot=(math.pi/2,.2,0))
    panel_count=8 if lod==0 else 4
    sf.radial_boxes(col,mats,lod,'RelayAntenna',panel_count,19,(5,.65,2.8),20,'Material_Mechanical',True)


def add_bastion(col, mats, lod):
    # Four armored emplacements cover every approach while the command citadel owns the center.
    sf.wedge(col,mats,lod,'CommandCitadel',31,15,25,(-7,13,0),'Material_Hull',.8)
    sf.wedge(col,mats,lod,'CommandArmor',25,4,19,(-10,22.5,0),'Material_Mechanical',.5)
    for i in range(4):
        a=math.tau*i/4+math.pi/4
        x=math.cos(a)*36; z=math.sin(a)*36
        sf.cyl(col,mats,lod,f'TurretBase_{i}',5.5,6,(x,8,z),'Material_Mechanical')
        barrels=2 if lod<2 else 1
        for barrel in range(barrels):
            offset=(barrel-(barrels-1)/2)*1.7
            sf.cyl(col,mats,lod,f'TurretBarrel_{i}_{barrel}',.62,13,(x+math.cos(a)*5.5,12+offset,z+math.sin(a)*5.5),'Material_Accent',rot=(0,math.pi/2-a,0))
        sf.box(col,mats,lod,f'BlastShield_{i}',(12,8,4),(x-math.cos(a)*4,10,z-math.sin(a)*4),'Material_Hull',.45,(0,-a,0))
    sf.cyl(col,mats,lod,'BastionMast',1.5,27,(0,31,0),'Material_Mechanical')
    sf.torus(col,mats,lod,'ThreatSensor',7,.55,(0,39,0),'Material_Accent',rot=(math.pi/2,0,0))
    plate_count=12 if lod==0 else 6
    sf.radial_boxes(col,mats,lod,'PerimeterArmor',plate_count,38,(7,.8,3.2),4,'Material_Mechanical',True)


ADDITIONS = {
    'place_claim_outpost_base': None,
    'place_claim_outpost_refinery': add_refinery,
    'place_claim_outpost_relay': add_relay,
    'place_claim_outpost_bastion': add_bastion,
}


def add_marker(col, name, loc, role, root):
    obj=bpy.data.objects.new(name,None)
    obj.empty_display_type='PLAIN_AXES'; obj.location=loc
    obj['spaceface.socketRole']=role; obj.parent=root; col.objects.link(obj)


def build_one(asset_id):
    sf.reset_scene()
    mats=create_materials(asset_id)
    col=sf.collection(asset_id.upper())
    for lod in range(3):
        build_shared_base(col,mats,lod)
        addition=ADDITIONS[asset_id]
        if addition: addition(col,mats,lod)
    draw=[]; lod_stats={}
    for lod in range(3):
        groups=sf.join_draw_groups(col,lod); draw.extend(groups)
        lod_stats[f'lod{lod}']={'triangles':sum(sf.triangles(o) for o in groups),'drawGroups':len(groups)}
    root=bpy.data.objects.new(f'SF_{asset_id.upper()}_ROOT',None); root.empty_display_type='CUBE'; col.objects.link(root)
    for obj in draw: obj.parent=root
    lod0=[o for o in draw if o.name.startswith('LOD0_')]
    mn,mx,dims=sf.bounds(lod0)
    sf.add_collision(col,mats,root,dims)
    role,title=ASSETS[asset_id]
    root['spaceface.assetId']=f'SF_{asset_id.upper()}'
    root['spaceface.partId']=asset_id; root['spaceface.family']=FAMILY; root['spaceface.packet']=PACKET
    add_marker(col,'SOCKET_Structure_Core',(0,0,0),'structure_core',root)
    add_marker(col,'SOCKET_Dock_Approach',(48,2,0),'dock_approach',root)
    add_marker(col,'SOCKET_Emissive',(0,max(8,mx.y*.65),0),'emissive',root)
    module_sockets={
        'Depot':(-20,1,-20), 'Refinery':(-20,1,20),
        'Defense':(20,1,-20), 'Teleporter':(20,1,20),
    }
    for name,loc in module_sockets.items(): add_marker(col,f'SOCKET_Module_{name}',loc,f'module_{name.lower()}',root)
    meta={'contractVersion':1,'assetId':f'SF_{asset_id.upper()}','partId':asset_id,'liveId':asset_id,
        'slot':'place','forward':'+X','up':'+Y','starboard':'+Z','unit':'metre','normalConvention':'OpenGL',
        'ormChannels':'R=AO,G=Roughness,B=Metallic','textureCompression':'PNG-source','textureSize':1024,
        'chamfered':True,'bevelRadiusM':.05,'family':FAMILY,'packet':PACKET,'role':role,'title':title,
        'kind':'claim_outpost','deliverableRole':'production_multi_lod','lods':['lod0','lod1','lod2'],
        'triangleCount':lod_stats['lod0']['triangles'],'lodTriangles':{k:v['triangles'] for k,v in lod_stats.items()},
        'drawGroupsPerLod':{k:v['drawGroups'] for k,v in lod_stats.items()},'lod0AabbSize':[round(v,4) for v in dims],
        'wiringStatus':'isolated_candidate'}
    bpy.context.scene['spacefaceAssetJson']=json.dumps(meta,separators=(',',':'))
    root['spacefaceAssetJson']=json.dumps(meta,separators=(',',':'))
    SOURCE.mkdir(parents=True,exist_ok=True);BLENDS.mkdir(parents=True,exist_ok=True);EVIDENCE.mkdir(parents=True,exist_ok=True)
    blend=BLENDS/f'{asset_id}.blend'; glb=SOURCE/f'{asset_id}.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.objects: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,
        export_apply=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,
        export_materials='EXPORT')
    report={'schema':'spaceface.claimOutpostBuild.v1','packet':PACKET,'family':FAMILY,'assetId':asset_id,
        'claimSpecId':None if role=='claim_base' else role,'title':title,
        'source':str(glb.relative_to(ROOT)).replace('\\','/'),'blend':str(blend.relative_to(ROOT)).replace('\\','/'),
        'bytes':glb.stat().st_size,'lod':lod_stats,'aabb':{'min':[round(v,4) for v in mn],
        'max':[round(v,4) for v in mx],'size':[round(v,4) for v in dims]},'materials':sorted(mats.keys()),
        'metadata':meta,'builtAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    (EVIDENCE/f'{asset_id}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    log(f"{asset_id}: {glb.stat().st_size:,} bytes lod={lod_stats} aabb={[round(v,1) for v in dims]}")
    return report


def main():
    argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser=argparse.ArgumentParser();parser.add_argument('--only',choices=ASSETS.keys());args=parser.parse_args(argv)
    targets=[args.only] if args.only else list(ASSETS)
    t=time.time();reports=[build_one(asset) for asset in targets]
    summary={'schema':'spaceface.claimOutpostFamily.v1','packet':PACKET,'family':FAMILY,
        'elapsedSeconds':round(time.time()-t,2),'assets':[{'id':r['assetId'],'bytes':r['bytes'],'lod':r['lod'],'aabb':r['aabb']} for r in reports]}
    EVIDENCE.mkdir(parents=True,exist_ok=True);(EVIDENCE/'family_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    log(f"completed {len(reports)} assets in {summary['elapsedSeconds']}s")


if __name__=='__main__': main()
