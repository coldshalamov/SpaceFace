"""SF20-09: squat mustard forklift; three actual solids leave the load gap open."""
import argparse
import json
import shutil
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parent)); sys.path.insert(0, str(HERE))
import forge as F
from concept_export import export_family

COLORS = {'paint': '#4c5153', 'paint2': '#6c7370', 'dark': '#22282b',
          'stripe': '#95702d', 'hazard': '#95702d', 'bare': '#728081',
          'glow_drive': '#748f9a', 'glow_warm': '#a88c61', 'glow_amber': '#aa743c'}
SPEC = 'design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/09_pallet_jack.md'
PREFLIGHT = {'idea': 'Mustard forklift steals real freight', 'authority': [SPEC],
    'supportedViews': ['chase', 'close', 'top'],
    'values': 'Mid dark-steel crossbody, mustard tine crowns, charcoal machinery and an asymmetric warm cabin.',
    'silhouette': 'Squat H; two broad separated tines, a supported sliding bridge, four forward reverse mouths.',
    'custody': 'Source gap is actual empty space; only the existing native grip moves the actual cargo body.'}


def build():
    F.reset_scene(); s = F.Ship('pallet_jack', COLORS); s.refresh_lod_normals = True; s.collision_scale = 1
    body = F.loft(s, 'SquatForkliftCrossbody', [dict(x=-14,w=3.9,ht=1.8,hb=1.7,zc=0,n=3),
        dict(x=-12.4,w=5,ht=2.5,hb=2.5,zc=0,n=4), dict(x=-2,w=5,ht=2.5,hb=2.5,zc=0,n=4),
        dict(x=0,w=4.4,ht=1.7,hb=1.7,zc=0,n=3)], material='paint',belly='dark',count=28,bevel=.07)
    F.band(s, body.name, (-4.0,0,0), (1,0,0), 1.1, 'stripe')
    parts = {'core': [body]}
    for side, label in [(-1,'starboard'), (1,'port')]:
        tine = F.plate(s, 'ThickForwardTine_'+label, [(0,side*6),(11,side*6),(12,side*6.5),
            (12,side*7.5),(11,side*8),(0,side*8)], z0=-.75, thickness=1.35,
            material='paint2',top_material='stripe',chamfer=.16,bevel=.055)
        parts[label] = [tine]
        # The shoulder and rails visibly bolt the tine into the rear block.
        F.beams(s, 'TineShoulder_'+label, [((-2.4,side*4.2,.45),(1.2,side*6.8,.45))],
                .85,h=.7,material='dark',bevel=.05)
        F.box(s,'TelescopingRailSleeve_'+label,(2.6,side*6.8,.91),(7.6,.62,.58),material='dark',bevel=.06)
        F.box(s,'RailSleeveCrown_'+label,(2.6,side*6.8,1.22),(7.0,.42,.07),material='bare',bevel=.008)
        F.boxes(s,'TineWearShoes_'+label,[((x,side*7,.64),(1.6,1.25,.08)) for x in (2.3,8.5)],material='bare',bevel=.018)
    start = len(s.objects)
    F.box(s,'SlidingCargoClampBridge',(2,0,3.1),(1.4,14,1.2),material='stripe',bevel=.14)
    for side in (-1,1):
        F.box(s,'ClampDownwardJaw'+str(side),(2,side*5.25,1.91),(1.15,.70,1.45),material='dark',bevel=.07)
        F.box(s,'ClampPad'+str(side),(2.08,side*4.85,1.92),(.90,.17,1.08),material='paint2',bevel=.04)
        F.box(s,'TelescopingInnerRail'+str(side),(.2,side*6.8,1.18),(4.4,.30,.24),material='bare',bevel=.025)
        F.beams(s,'ClampBearingPost'+str(side),[((2,side*6.8,1.3),(2,side*6.8,3.1))],.38,h=.38,material='dark',bevel=.04)
    key='pallet_jack_clamp';groups={key:s.objects[start:]};pivots={key:s.motion_group(key,(2,0,3.1),groups[key])}
    F.box(s,'CabinSupportedFoot',(-8.1,2.4,2.45),(3.4,3.0,.32),material='dark',bevel=.08)
    F.canopy(s,'AsymmetricForkliftCabin',x0=-9.4,x1=-6.8,w=1.1,h=.7,z=2.62,y=2.4,frame=True)
    F.boxes(s,'CabinWarmWindows',[((-9.8,2.4,2.0),(.06,1.25,.26)),((-8.0,3.72,2.65),(1.5,.045,.25))],material='glow_warm',bevel=.015)
    F.box(s,'RearHydraulicReservoir',(-8.3,-2.7,2.45),(4.0,2.3,.50),material='dark',bevel=.12)
    F.boxes(s,'ReservoirCoolingSlots',[((-8.3,-2.7+dy,2.715),(2.6,.10,.035)) for dy in (-.6,-.3,0,.3,.6)],material='bare',bevel=.008)
    for index,(side,z) in enumerate([(-1,-1.35),(-1,1.35),(1,-1.35),(1,1.35)],1):
        center=(-.20,side*3.85,z)
        F.box(s,'ReverseBankSeat'+str(index),(-1.45,side*3.85,z),(1.9,1.65,1.65),material='dark',bevel=.12)
        nozzle=F.nozzle(s,'ForwardReverseBell'+str(index),center,.64,1.55,material='paint2',segments=28)
        # Forge's nozzle is authored facing -X. Reflect the actual mesh for a
        # forward-facing reverse bank; a socket alone must not claim that geometry.
        for vertex in nozzle.data.vertices:vertex.co.x=2*center[0]-vertex.co.x
        s.hook_part('HOOK_REVERSE_'+str(index),nozzle)
        s.socket('SOCKET_Engine_Reverse_'+str(index),center,(1,0,0))
    for side,label in [(-1,'Starboard'),(1,'Port')]:
        F.nozzle(s,'SmallAftDrive'+label,(-14.1,side*2.2,-.4),.48,.7,material='dark',segments=24)
        s.socket('SOCKET_Engine_'+label,(-14.1,side*2.2,-.4),(-1,0,0))
    s.socket('SOCKET_Engine_Main',(-14.1,2.2,-.4),(-1,0,0))
    s.socket('SOCKET_Cargo_Cradle',(7,0,0));s.socket('SOCKET_Camera_Focus',(-1,0,1.2))
    s.socket_names=list(s.sockets);s.finish()
    return s,parts,pivots,groups


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    s,parts,pivots,groups=build();family='pallet_jack';out=ROOT/'assets/ships/forge/preview'/family
    paths,contract=export_family(s,out,family=family,asset_id='SF_SHIP_PALLET_JACK',recipe=__file__,components=parts,
        pivots=pivots,groups=groups,preflight=PREFLIGHT,negative_space=['Open rectangular load gap X0..12 Y-6..6', 'Three separate native convex solids; moving clamp is cosmetic'])
    if args.live:
        raw=ROOT/'assets/ships/parts/wholeships';provenance=ROOT/'assets/ships/forge/sources'/family
        raw.mkdir(parents=True,exist_ok=True);provenance.mkdir(parents=True,exist_ok=True)
        for path in paths:shutil.copyfile(path,raw/path.name)
        for name in (family+'.blend','measured-contract.json'):shutil.copyfile(out/name,provenance/name)
        shutil.copyfile(out/'pallet-jack.motion.json',ROOT/'assets/ships/motions/pallet-jack.motion.json')
    print('PALLET_JACK_SOURCE',json.dumps({k:contract[k] for k in ('assetId','bounds','physicalBounds','sockets','lods')}))


if __name__=='__main__':main()
