"""SF20-08: a stolen furnace tug with two finite external coolant casks.

Original Forge geometry. +X nose/+Y port/+Z up; runtime source scale is one.
Build: blender -b --python tools/blender/forge/ships/kilnback.py -- --live
The identical cask recipe authors attached assemblies and the loose world body.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import forge as F
from concept_export import export_family

COLORS = {'paint': '#514744', 'paint2': '#786c5b', 'dark': '#22292c',
          'ceramic': '#a29a86', 'stripe': '#702d26', 'hazard': '#93612d',
          'glow_drive': '#748f9a', 'glow_cyan': '#68868c', 'glow_warm': '#b79a66', 'glow_amber': '#bc752f'}
PREFLIGHT = {
    'idea': 'Stolen furnace with finite coolant', 'tier': 'B',
    'authority': ['design/program/world-depth-2026-10-02/TWENTY_CONCEPT_AMENDMENT.md',
      'design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/08_kilnback.md'],
    'supportedViews': ['chase-144', 'close-58', 'top-inspection'],
    'componentReferenceDecision': 'not_needed', 'allSupportedViewZonesClassified': False,
    'zones': [
      {'id': 'furnace-pressure-body', 'dominates': True,
       'assembly': 'Short wide stepped pressure body, broad insulated front, deep aft engine well and dark-red occupation belt.',
       'bill': 'Dark warm alloy lacquer, pale machined casing courses, seated armor and ceramic mouth lip. Broad corners and proud courses catch the Look; no generic freighter clone.'},
      {'id': 'radiator-comb', 'dominates': True,
       'assembly': 'Six independent long slats on actual X-axis bearings above a dark heat-return well.',
       'bill': 'Mid-value fin cases, dark underside, narrow amber recessed return slots. Finite opening is sourced from preheat/burn/vent, never idle oscillation.'},
      {'id': 'external-casks', 'dominates': True,
       'assembly': 'Two seven-metre pressure casks outside the hull, supported by lower brackets and keyed break collars. Open longitudinal air gaps survive source and native compound.',
       'bill': 'Warm ivory ceramic insulation, gray end protection rings, dark red collar course and recessed sight glass. Same authored cask becomes the loose body; no decorative copy remains.'},
      {'id': 'mouth-and-plumbing', 'dominates': True,
       'assembly': 'Recessed rectangular prow throat inside four ceramic lip members, four thick coolant pipes supported between casks and hull, two housed rear drives.',
       'bill': 'Dark throat depth, restrained hot inner louvers, supported metal pipes and dark bell coamings. No luminous card or light floating ahead of the prow.'},
    ], 'review': 'Actual Look top/chase/close; repair observed craft, then root publishes serially.'}
for zone in PREFLIGHT['zones']:
    zone['disposition'] = 'billed'
    zone['supportedViews'] = PREFLIGHT['supportedViews'][:]


def cask(ship, label, x=0, y=0):
    body = F.loft(ship, label + 'PressureCask', [
        dict(x=x-3.5, y=y, w=.35, ht=.35, hb=.35, zc=0, n=2.0),
        dict(x=x-3.15, y=y, w=1.17, ht=1.17, hb=1.17, zc=0, n=2.1),
        dict(x=x-2.45, y=y, w=1.50, ht=1.50, hb=1.50, zc=0, n=2.2),
        dict(x=x+2.45, y=y, w=1.50, ht=1.50, hb=1.50, zc=0, n=2.2),
        dict(x=x+3.15, y=y, w=1.17, ht=1.17, hb=1.17, zc=0, n=2.1),
        dict(x=x+3.5, y=y, w=.35, ht=.35, hb=.35, zc=0, n=2.0),
    ], material='ceramic', belly='ceramic', count=36, bevel=.025)
    solids = [body]
    for dx in (-2.72, 2.72):
        ring = F.cylinder(ship, label+'ProtectionRing'+str(dx), (x+dx-.16,y,0),
                          (x+dx+.16,y,0),1.52,material='paint2',segments=32,bevel=.025)
        solids.append(ring)
        F.band(ship, ring.name, (x+dx,y,0), (1,0,0), .12, 'stripe')
    F.box(ship, label+'SightCoaming', (x,y,1.46), (2.4,.38,.15), material='dark', bevel=.035)
    F.box(ship, label+'CoolantSightGlass', (x,y,1.55), (1.95,.14,.035), material='glow_cyan', bevel=.007)
    F.cylinder(ship,label+'EndValve',(x+3.43,y,0),(x+3.65,y,0),.22,material='dark',segments=20)
    return solids


def build_tug():
    F.reset_scene()
    ship=F.Ship('kilnback',COLORS)
    ship.refresh_lod_normals=True
    ship.collision_scale=1
    hull=F.loft(ship,'FurnacePressureBody',[
        dict(x=-13.65,w=4.5,ht=2.15,hb=2.45,zc=0,n=3.2),
        dict(x=-11.8,w=6.1,ht=2.9,hb=3.2,zc=0,n=3.5),
        dict(x=-5.0,w=6.8,ht=3.4,hb=3.35,zc=0,n=3.8),
        dict(x=7.5,w=6.7,ht=3.4,hb=3.35,zc=0,n=3.8),
        dict(x=11.1,w=5.6,ht=2.9,hb=2.8,zc=0,n=3.7),
        dict(x=12.75,w=3.85,ht=2.15,hb=2.25,zc=0,n=3.6),
    ],material='paint',belly='dark',back_material='dark',count=36,bevel=.065)
    F.band(ship,'FurnacePressureBody',(7.5,0,0),(1,0,0),1.05,'stripe')
    core=[hull]
    core_components={}
    # Proud ceramic cheeks and a genuine dark, recessed mouth inside a four-piece lip.
    cheeks=F.boxes(ship,'InsulatedProwCheeks', [((11.45,side*4.25,.3),(2.2,1.2,3.8)) for side in (-1,1)],
                   material='paint2',bevel=.14)
    core.append(cheeks)
    lip=F.boxes(ship,'CeramicFurnaceLip', [((13.50,0,1.35),(1.0,5.7,.52)),
        ((13.50,0,-1.05),(1.0,5.7,.52)), ((13.50,-2.63,.15),(1.0,.48,1.88)),
        ((13.50,2.63,.15),(1.0,.48,1.88))],material='ceramic',bevel=.075)
    core.append(lip)
    F.box(ship,'DeepFurnaceThroat',(12.93,0,.15),(.16,5.15,1.90),material='dark',bevel=.025)
    F.boxes(ship,'RecessedHotLouvers',[((13.05,y,.15),(.055,.22,1.4)) for y in (-1.6,-.8,0,.8,1.6)],
            material='glow_amber',bevel=.01)
    F.box(ship,'ProwThermalReturn',(12.25,0,2.30),(1.55,4.5,.20),material='dark',bevel=.055)
    F.boxes(ship,'ProwThermalSlots',[((12.35,y,2.42),(.72,.075,.035)) for y in (-1.4,-.7,0,.7,1.4)],
            material='glow_amber',bevel=.004)
    # The roof has a seated central comb. Each slat has a visible bearing/load line.
    F.plate(ship,'RadiatorReturnWell',[(-7,-3.7),(3.8,-3.7),(3.8,3.7),(-7,3.7)],
            z0=3.30,thickness=.20,material='dark',chamfer=.16,bevel=.035)
    F.boxes(ship,'RadiatorBearingFeet',[((-2,y,3.59),(8.7,.30,.38)) for y in (-3.0,-1.8,-.6,.6,1.8,3.0)],
            material='dark',bevel=.04)
    groups,pivots={},{}
    for i,y in enumerate((-3.0,-1.8,-.6,.6,1.8,3.0),1):
        start=len(ship.objects)
        F.plate(ship,f'RadiatorSlat{i}',[(-6.3,y-.48),(1.95,y-.48),(2.4,y-.22),(2.4,y+.22),
                    (1.95,y+.48),(-6.3,y+.48)],z0=3.77,thickness=.27,material='paint2',
                side_material='dark',chamfer=.055,bevel=.022)
        F.boxes(ship,f'SlatHeatReturns{i}',[((x,y,4.055),(1.1,.105,.035)) for x in (-5,-3.3,-1.6,.1)],
                material='glow_amber',bevel=.004)
        key=f'kilnback_slat_{i}'
        groups[key]=ship.objects[start:]
        pivots[key]=ship.motion_group(key,(-2,y-.47,3.78),groups[key])
    # Lower brackets leave the whole space between hull and tanks visibly open.
    for side,label in ((1,'cask_port'),(-1,'cask_starboard')):
        y=side*10
        F.beams(ship,'LowerCaskBrackets_'+label,[((-3.3,side*6.4,-1.2),(-3.3,side*9.5,-1.2)),
                   ((1.3,side*6.4,-1.2),(1.3,side*9.5,-1.2))],.43,h=.38,material='dark',bevel=.045)
        F.boxes(ship,'KeyedCaskSaddles_'+label,[((x,side*9.3,-1.05),(.8,.60,.8)) for x in (-3.3,1.3)],
                material='hazard',bevel=.075)
        start=len(ship.objects)
        cask_solids=cask(ship,label,-1,y)
        key='kilnback_'+label
        groups[key]=ship.objects[start:]
        pivots[key]=ship.motion_group(key,(-1,y,0),groups[key])
        # A fixed four-pipe route stops at the detachable collar instead of floating.
        for x in (-2.3,.3):
            F.sweep(ship,f'CoolantPipe_{label}_{x}',[(x,side*6.3,2.1),(x,side*7.4,2.1),
                    (x,side*7.9,1.5),(x,side*8.6,1.0)],.20,.20,material='gunmetal',bevel=.02)
        F.boxes(ship,'PipeCollars_'+label,[((x,side*8.55,1.0),(.43,.35,.40)) for x in (-2.3,.3)],
                material='stripe',bevel=.04)
        ship.socket('SOCKET_'+label.upper(),(-1,y,0))
        core_components[label]=cask_solids
    # Deep aft engine well with discrete seated bells; small bridge is visibly crewed.
    F.box(ship,'AftEngineWell',(-13.58,0,-.15),(.32,8.0,3.6),material='dark',bevel=.08)
    for side in (-1,1):
        bell=F.nozzle(ship,'RecessedRearDrive'+str(side),(-13.70,side*2.3,-.15),1.05,.78,
                      material='dark',segments=30)
        core.append(bell)
    F.box(ship,'CrewBridgeBase',(5.2,0,3.52),(3.6,3.3,.55),material='dark',bevel=.12,taper=.90)
    F.canopy(ship,'CrewBridge',x0=3.8,x1=6.7,w=1.35,h=.55,z=3.78,frame=True)
    F.boxes(ship,'CrewWarmWindows',[((6.63,y,4.0),(.045,.62,.15)) for y in (-.78,0,.78)],material='glow_warm',bevel=.01)
    F.plate(ship,'AftServiceRoof',[(-12.3,-3.8),(-8.0,-3.8),(-8.0,3.8),(-12.3,3.8)],
            z0=3.11,thickness=.18,material='paint2',chamfer=.1,bevel=.028)
    F.boxes(ship,'AftServiceSlots',[((-10.3,y,3.32),(2.4,.12,.04)) for y in (-2.1,-1.4,-.7,0,.7,1.4,2.1)],
            material='dark',bevel=.008)
    # Navigation belongs to the fixed hull, so a detached cask leaves no orphan lamp.
    F.light(ship,'PortLamp',(4,6.55,.8),'glow_red',.11)
    F.light(ship,'StarboardLamp',(4,-6.55,.8),'glow_green',.11)
    ship.socket('SOCKET_JET',(14,0,.15),(1,0,0))
    ship.socket('SOCKET_Engine_Main',(-13.70,2.3,-.15),(-1,0,0))
    ship.socket('SOCKET_Engine_Port',(-13.70,2.3,-.15),(-1,0,0))
    ship.socket('SOCKET_Engine_Starboard',(-13.70,-2.3,-.15),(-1,0,0))
    ship.socket('SOCKET_Trail_Main',(-14.1,0,-.15),(-1,0,0))
    ship.socket('SOCKET_Camera_Focus',(0,0,1.4))
    ship.socket_names=list(ship.sockets)
    ship.finish()
    return ship,{'core':core,**core_components},pivots,groups


def build_loose_cask():
    F.reset_scene()
    ship=F.Ship('kilnback_cask',COLORS)
    ship.refresh_lod_normals=True
    ship.collision_scale=1
    solid=cask(ship,'Loose')
    ship.socket('SOCKET_Massline',(0,0,-1.4))
    ship.socket('SOCKET_Camera_Focus',(0,0,.3))
    ship.socket_names=list(ship.sockets)
    ship.finish()
    return ship,{'cask':solid},{},{}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for family,asset,builder in [('kilnback','SF_SHIP_KILNBACK',build_tug),
                               ('kilnback_cask','SF_PROP_KILNBACK_CASK',build_loose_cask)]:
        ship,components,pivots,groups=builder()
        out=ROOT/'.devshots'/('kilnback-source-'+family)
        paths,contract=export_family(ship,out,family=family,asset_id=asset,recipe=__file__,
            components=components,pivots=pivots,groups=groups,preflight=PREFLIGHT,
            negative_space=['port-and-starboard-cask-air-gaps'] if family=='kilnback' else [])
        if args.live:
            source=ROOT/'assets/ships/parts/wholeships'
            provenance=ROOT/'assets/ships/forge/sources'/family
            source.mkdir(parents=True,exist_ok=True)
            provenance.mkdir(parents=True,exist_ok=True)
            for path in paths:shutil.copyfile(path,source/path.name)
            for name in (family+'.blend','measured-contract.json'):shutil.copyfile(out/name,provenance/name)
            bank=out/(family.replace('_','-')+'.motion.json')
            if bank.exists():shutil.copyfile(bank,ROOT/'assets/ships/motions'/bank.name)
        print('KILNBACK_SOURCE',json.dumps({k:contract[k] for k in ('assetId','lods','bounds','physicalBounds','sockets')}))

if __name__=='__main__':main()
