"""Original SF20-04 Ilex pressure ark and six recoverable conservatories.

The same source pod recipe builds the parent assemblies and loose vault body.
Rigid release roots preserve local identity; no soft-body or decorative breakage.
Build: blender -b --python tools/blender/forge/ships/ilex_ark.py -- --live
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

COLORS = {'paint': '#647369', 'paint2': '#a7b777', 'dark': '#252e2a',
          'glass': '#354f42', 'glow_drive': '#73c9d2', 'glow_warm': '#c6a569'}
PREFLIGHT = {
    'idea': 'A seed bank with six separable futures', 'tier': 'B',
    'authority': ['design/program/world-depth-2026-10-02/TWENTY_CONCEPT_AMENDMENT.md',
      'design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/04_ilex_seed_ark.md'],
    'supportedViews': ['chase-144', 'close-58', 'top-inspection'],
    'componentReferenceDecision': 'not_needed', 'allSupportedViewZonesClassified': False,
    'zones': [
      {'id': 'seed-pressure-spine', 'disposition': 'billed', 'dominates': True,
       'assembly': 'Blunt tapered vessel with a stepped sealed roof, restrained lime band and four recessed aft bells.',
       'bill': 'Welded gray-green alloy skin, dark replaceable roof courses and lime identity paint; hard pressure seams and actual restrained radiused edges.'},
      {'id': 'six-conservatories', 'disposition': 'billed', 'dominates': True,
       'assembly': 'Six oval sealed vaults, each with a shallow dark green glazed recess, structural rib course and raised end collars.',
       'bill': 'Tinted laminated conservatory glazing over opaque dark foliage silhouettes, seated warm cultivation light strips and pale green alloy frame. No transparent interior jungle or glowing jelly.'},
      {'id': 'couplings', 'disposition': 'billed', 'dominates': False,
       'assembly': 'Two broad dark struts per pod support two visible keyed break collars and a nested release root.',
       'bill': 'Load-bearing alloy box spars and pale machined collars. Each released pod loses exactly its source assembly and native collider; empty slots remain empty.'},
    ], 'review': 'Open actual Look top/chase/close, repair seen defects, then publish.'}
for zone in PREFLIGHT['zones']:
    zone['supportedViews'] = PREFLIGHT['supportedViews'][:]


def pod(ship, label, x, y, hull_material='paint2'):
    hull = F.loft(ship, label + 'SealedVault', [
        dict(x=x-4.5, y=y, w=.65, ht=.65, hb=.60, zc=0, n=2.4),
        dict(x=x-3.6, y=y, w=2.15, ht=1.50, hb=1.55, zc=0, n=2.6),
        dict(x=x-2.0, y=y, w=2.5, ht=1.80, hb=1.55, zc=.10, n=2.8),
        dict(x=x+2.0, y=y, w=2.5, ht=1.80, hb=1.55, zc=.10, n=2.8),
        dict(x=x+3.6, y=y, w=2.15, ht=1.50, hb=1.55, zc=0, n=2.6),
        dict(x=x+4.5, y=y, w=.65, ht=.65, hb=.60, zc=0, n=2.4),
    ], material=hull_material, belly='dark', count=28, bevel=.035)
    # The glazing is seated on a shallow service recess, with actual opaque planting beds.
    F.plate(ship, label+'RoofCoaming', [(x-2.8,y-1.55),(x+2.8,y-1.55),
             (x+3.2,y-.65),(x+3.2,y+.65),(x+2.8,y+1.55),(x-2.8,y+1.55),
             (x-3.2,y+.65),(x-3.2,y-.65)], z0=1.74, thickness=.13,
             material='dark', chamfer=.08, bevel=.018)
    F.plate(ship, label+'CultivationGlazing', [(x-2.55,y-1.32),(x+2.55,y-1.32),
             (x+2.9,y-.55),(x+2.9,y+.55),(x+2.55,y+1.32),(x-2.55,y+1.32),
             (x-2.9,y+.55),(x-2.9,y-.55)], z0=1.855, thickness=.065,
             material='glass', chamfer=.055, bevel=.012)
    F.beams(ship,label+'GlazingRibs', [((x+dx,y-1.28,1.94),(x+dx,y+1.28,1.94))
             for dx in (-2,-.7,.7,2)], .105, h=.08, material='paint2', bevel=.013)
    # Opaque foliage silhouettes seated in the glazing recess. They remain six
    # readable conservatories without translucent overdraw or a second interior.
    foliage=[]
    for dx in (-1.35,0,1.35):
        foliage += [((x+dx,y-.72,1.932),(x+dx,y+.67,1.932)),
                    ((x+dx,y-.40,1.932),(x+dx-.30,y-.62,1.932)),
                    ((x+dx,y-.10,1.932),(x+dx+.33,y-.36,1.932)),
                    ((x+dx,y+.23,1.932),(x+dx-.31,y+.03,1.932)),
                    ((x+dx,y+.52,1.932),(x+dx+.28,y+.31,1.932))]
    F.beams(ship,label+'OpaqueFoliageBeds',foliage,.10,h=.026,material='dark',bevel=.004)
    F.boxes(ship,label+'WarmCultivationBands', [((x,y+s*1.15,1.93),(4.5,.045,.035)) for s in (-1,1)],
            material='glow_warm', bevel=.004)
    for dx in (-3.45,3.45):
        F.band(ship,label+'SealedVault',(x+dx,y,0),(1,0,0),.30,'dark')
    return hull


def build_ark():
    F.reset_scene()
    ship = F.Ship('ilex_ark', COLORS)
    ship.refresh_lod_normals = True
    ship.collision_scale = 1
    core = F.loft(ship,'SeedPressureSpine',[
        dict(x=-21,w=2.35,ht=2.2,hb=1.7,zc=0,n=2.7),
        dict(x=-18,w=3.8,ht=2.9,hb=2.1,zc=.2,n=3),
        dict(x=-7,w=3.7,ht=3.1,hb=2.2,zc=.3,n=3),
        dict(x=8,w=3.4,ht=3.0,hb=2.1,zc=.25,n=3),
        dict(x=18,w=2.8,ht=2.65,hb=1.8,zc=.15,n=2.8),
        dict(x=21,w=.9,ht=1.15,hb=1,zc=0,n=2.5),
    ], material='paint', belly='dark', count=36, bevel=.06)
    components, groups, pivots = {'core':[core]}, {}, {}
    F.plate(ship,'DorsalServiceRoof',[(-16,-1.7),(14,-1.5),(17,-.8),(17,.8),(14,1.5),(-16,1.7)],
            z0=3.27,thickness=.26,material='dark',chamfer=.15,bevel=.03)
    F.plate(ship,'LimeIdentityRoof',[(-14,-.35),(12,-.35),(13,0),(12,.35),(-14,.35)],
            z0=3.525,thickness=.035,material='paint2',chamfer=.025,bevel=.006)
    F.boxes(ship,'SeatedServiceHatches',[((x,0,3.59),(2.2,1.55,.18)) for x in (-11,-3,5)],
            material='paint',bevel=.08)
    F.boxes(ship,'RoofHeatReturns',[((x,0,3.70),(.11,1.26,.035)) for x in (-11.4,-11,-10.6,-3.4,-3,-2.6,4.6,5,5.4)],
            material='dark',bevel=.004)
    F.box(ship,'BridgeCoaming',(17.2,0,2.44),(3.1,2.8,.65),material='dark',bevel=.14,taper=.8)
    F.box(ship,'WarmBridge',(17.3,0,2.80),(2.3,2.15,.25),material='glass',bevel=.08,taper=.87)
    F.box(ship,'BridgeInteriorLight',(18.05,0,2.94),(.32,1.75,.07),material='glow_warm',bevel=.015)
    for n,(x,y) in enumerate([(x,y) for x in (-12,0,12) for y in (10,-10)],1):
        side = 1 if y > 0 else -1
        F.beams(ship,f'CouplingSpars{n}', [((x+dx,side*3.35,.05),(x+dx,side*8.2,.05))
                 for dx in (-1.55,1.55)], .65, h=.62, material='dark', bevel=.055)
        start=len(ship.objects)
        vault=pod(ship,f'Vault{n}',x,y)
        components[f'vault_{n}']=[vault]
        F.boxes(ship,f'KeyedReleaseCollars{n}', [((x+dx,side*7.90,.05),(.95,.72,1.1))
                 for dx in (-1.55,1.55)], material='paint2',bevel=.065)
        key=f'ilex_vault_{n}'
        groups[key]=ship.objects[start:]
        pivots[key]=ship.motion_group(key,(x,y,0),groups[key])
        pivots[key]['spacefaceSocket']=True
        pivots[key]['spacefaceInstance']=False
        ship.socket(f'SOCKET_Vault_{n}',(x,y,0))
    for y,z in [(-1.55,-.85),(1.55,-.85),(-1.55,1.2),(1.55,1.2)]:
        F.nozzle(ship,f'RecessedDrive{y}_{z}',(-21.28,y,z),.7,.65,material='dark',segments=24)
    ship.socket('SOCKET_Engine_Main',(-21.3,0,.1),(-1,0,0))
    ship.socket('SOCKET_Trail_Main',(-21.4,0,.1),(-1,0,0))
    ship.socket('SOCKET_Camera_Focus',(0,0,1.5))
    ship.socket_names=list(ship.sockets)
    ship.finish()
    return ship,components,pivots,groups


def build_vault():
    F.reset_scene()
    ship=F.Ship('ilex_vault',{**COLORS,'paint':COLORS['paint2']})
    ship.refresh_lod_normals=True
    ship.collision_scale=1
    hull=pod(ship,'Recoverable',0,0,hull_material='paint')
    ship.socket('SOCKET_Massline',(0,0,-1.4))
    ship.socket('SOCKET_Camera_Focus',(0,0,.7))
    ship.socket_names=list(ship.sockets)
    ship.finish()
    return ship,{'vault':[hull]},{},{}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for family,asset,builder in [('ilex_ark','SF_SHIP_ILEX_ARK',build_ark),
                                 ('ilex_vault','SF_PROP_ILEX_VAULT',build_vault)]:
        ship,components,pivots,groups=builder()
        out=ROOT/'.devshots'/('ilex-source-'+family)
        paths,contract=export_family(ship,out,family=family,asset_id=asset,recipe=__file__,
            components=components,pivots=pivots,groups=groups,preflight=PREFLIGHT,
            negative_space=['six-conservatory-clearances'] if family=='ilex_ark' else [])
        if args.live:
            source=ROOT/'assets/ships/parts/wholeships'
            provenance=ROOT/'assets/ships/forge/sources'/family
            source.mkdir(parents=True,exist_ok=True)
            provenance.mkdir(parents=True,exist_ok=True)
            for path in paths:shutil.copyfile(path,source/path.name)
            for name in (family+'.blend','measured-contract.json'):shutil.copyfile(out/name,provenance/name)
            bank=out/(family.replace('_','-')+'.motion.json')
            if bank.exists():shutil.copyfile(bank,ROOT/'assets/ships/motions'/bank.name)
        print('ILEX_SOURCE',json.dumps({k:contract[k] for k in ('assetId','lods','bounds','physicalBounds','sockets')}))

if __name__=='__main__':main()
