"""Three original working crew hulls, with real jobs and one finite inert yard frame.

Build: blender -b --python tools/blender/forge/ships/towline_table.py -- --live
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

SPEC = 'design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/06_towline_table.md'
COLORS = {'paint': '#6a746a', 'paint2': '#8b4327', 'stripe': '#a69d8a', 'dark': '#252a27',
          'glass': '#263f3e', 'glow_drive': '#6aa4a8', 'glow_warm': '#b89a62'}

def crew_details(s, width, top, stern, windows_x=5.6, knot_top=None, window_top=None, xoff=0):
    # The common slash is seated in the roof, and the mark is an original three-ended knot.
    # knot_top/window_top let a hull whose deck steps down forward of the shoulder seat each
    # mark on its own surface instead of hovering at the shoulder's height. xoff slides the
    # whole mark layout along the hull so it lands inside the deck that carries it.
    if knot_top is None: knot_top = top
    if window_top is None: window_top = top
    F.beams(s, 'CrewWhiteSlash', [((-3+xoff,-width*.60,top),(.7+xoff,width*.65,top))], .40,
            h=.035, material='stripe', bevel=.006)
    F.beams(s, 'ThreeEndedKnot', [((2.4+xoff,0,knot_top),(3.6+xoff,0,knot_top)),((3.1+xoff,0,knot_top),(2.7+xoff,.9,knot_top)),
            ((3.1+xoff,0,knot_top),(2.7+xoff,-.9,knot_top))], .14,h=.04,material='stripe',bevel=.005)
    F.boxes(s, 'SeatedCrewWindows', [((windows_x+xoff,y,window_top+.025),(.55,.20,.07)) for y in (-.65,0,.65)],
            material='glow_warm', bevel=.018)
    for y in (-width*.50,width*.50):
        F.nozzle(s, 'WorkingDrive'+str(y), (stern,y,-.2), .82,.63,
                 material='dark',segments=24)
    s.socket('SOCKET_Engine_Main',(stern-.1,0,-.2),(-1,0,0))
    s.socket('SOCKET_Trail_Main',(stern-.2,0,-.2),(-1,0,0))
    s.socket('SOCKET_Camera_Focus',(0,0,top*.5))
    s.socket('SOCKET_Massline',(10.2,0,-.4),(1,0,0))

def source_ship(family, colors):
    F.reset_scene()
    s=F.Ship(family,colors)
    s.refresh_lod_normals=True
    s.collision_scale=1
    return s

def build_mara():
    s=source_ship('towline_mara',COLORS)
    core=F.loft(s,'ClampTugCore',[
        dict(x=-12,w=2.3,ht=1.9,hb=1.5,n=3),dict(x=-9,w=4.4,ht=2.6,hb=1.7,n=3),
        dict(x=3,w=4.0,ht=2.6,hb=1.7,n=3),dict(x=5,w=2.5,ht=2.1,hb=1.5,n=3)],
        material='paint',belly='dark',count=28,bevel=.08)
    components={'core':[core]}
    pivots,groups={},{}
    for side in (-1,1):
        support_start=len(s.objects)
        F.beams(s,'JawRootSupport'+str(side),[((1.6,side*3.0,-.15),(2.7,side*6.2,-.15))],
                1.35,h=1.55,material='dark',bevel=.055)
        support=s.objects[support_start:]
        # The inner rail roots into the core flank (hull half-width ~4.0 at x=3): a clamp jaw
        # that meets the body reads as one machined arm, not a pontoon floating beside it.
        outline=[(1,side*3.3),(11,side*3.3),(12.5,side*5.6),(11.5,side*8.0),(2,side*7.7)]
        if side < 0: outline.reverse()
        jaw=F.plate(s,'SupportedJaw'+str(side),outline, z0=-1.15,thickness=2.5,
            material='paint2',chamfer=.26,bevel=.035)
        components['jaw_'+('port' if side>0 else 'starboard')]=[jaw,*support]
        F.beams(s,'JawDarkRail'+str(side),[((3,side*6.25,1.42),(10.8,side*6.25,1.42))],
                .36,h=.15,material='dark',bevel=.018)
        start=len(s.objects)
        F.box(s,'RecessedClampShoe'+str(side),(10.1,side*5.35,1.43),(2.1,.65,.28),
              material='stripe',bevel=.055)
        key='towline_jaw_'+('port' if side>0 else 'starboard')
        groups[key]=s.objects[start:]
        pivots[key]=s.motion_group(key,(4,side*5.35,1.43),groups[key])
    F.box(s,'BridgeShoulder',(-.6,0,2.43),(4.1,3.6,.35),material='dark',bevel=.16)
    # Deck steps: shoulder panel top is 2.605, the bare roof runs flat at 2.6 to x=3 then falls
    # toward ~2.42 at the window row — seat each mark on its own surface, not on thin air.
    crew_details(s,4.2,2.62,-12.20,windows_x=3.7,knot_top=2.62,window_top=2.44)
    s.socket_names=list(s.sockets)
    s.finish()
    return s,components,pivots,groups,['Open forward throat between the two original jaw solids']

def build_odo():
    s=source_ship('towline_odo',{**COLORS,'paint':'#3a6c69','paint2':'#875138'})
    core=F.loft(s,'WinchSpine',[
        dict(x=-13,w=1.4,ht=1.5,hb=1.2,n=2.6),dict(x=-9,w=2.8,ht=2.1,hb=1.5,n=3),
        dict(x=6,w=2.4,ht=2.1,hb=1.5,n=3),dict(x=12,w=1.2,ht=1.3,hb=1.0,n=3)],
        material='paint',belly='dark',count=28,bevel=.055)
    drum_base=F.box(s,'SupportedDrumBed',(-8,0,2.0),(5.8,6.0,.65),material='dark',bevel=.16)
    # Cosmetic drum follows measured line payout. It is not an extra simulation rope.
    start=len(s.objects)
    F.cylinder(s,'WorkingWinchDrum',(-8,-1.75,3.25),(-8,1.75,3.25),2.4,
               material='paint2',cap_material='dark',segments=32)
    F.boxes(s,'DrumSpokes',[((-8+dx,0,3.25+dz),(.22,3.75,.22))
            for dx,dz in ((1.5,0),(-1.5,0),(0,1.5),(0,-1.5))],material='stripe',bevel=.02)
    key='towline_winch'
    groups={key:s.objects[start:]}
    pivots={key:s.motion_group(key,(-8,0,3.25),groups[key])}
    F.beams(s,'FairleadYokes',[((7,-2,1.1),(10,-2,1.1)),((7,2,1.1),(10,2,1.1)),
            ((8.3,-2,1.1),(8.3,2,1.1))],.42,h=.48,material='dark',bevel=.04)
    F.boxes(s,'FairleadRollers',[((9,side*1.65,1.25),(1.2,.45,.6)) for side in (-1,1)],
            material='paint2',bevel=.14)
    crew_details(s,2.65,2.20,-13.10)
    s.socket_names=list(s.sockets)
    s.finish()
    return s,{'core':[core],'drum_bed':[drum_base]},pivots,groups,[]

def build_kit():
    s=source_ship('towline_kit',{**COLORS,'paint':'#6d8581','paint2':'#a69d8a'})
    core=F.plate(s,'SkiffRescueDeck',[(-11,-7),(-8,-9),(0,-9),(8,-5),(12,-2),
            (12,2),(8,5),(0,9),(-8,9),(-11,7)], z0=-.8,thickness=1.7,
            material='paint',chamfer=.28,bevel=.045)
    cabin=F.loft(s,'LowRescueCabin',[dict(x=-2,w=2.7,ht=1.7,hb=.1,zc=.7,n=3),
            dict(x=5,w=2.4,ht=1.7,hb=.1,zc=.7,n=3),dict(x=7,w=1.5,ht=1.2,hb=.1,zc=.7,n=3)],
            material='paint2',belly='dark',count=24,bevel=.06)
    for side in (-1,1):
        # Empty mounts communicate a working rescue configuration without fabricated patients.
        F.box(s,'EmptyPatientMount'+str(side),(-5,side*4.6,1.06),(5.2,2.1,.38),
              material='dark',bevel=.10)
        F.beams(s,'PatientCradleRim'+str(side),[((-7.2,side*4.6-1.0,1.3),(-2.8,side*4.6-1.0,1.3)),
            ((-7.2,side*4.6+1.0,1.3),(-2.8,side*4.6+1.0,1.3))],.19,h=.17,
            material='paint2',bevel=.02)
    start=len(s.objects)
    # Lamp post must root into the cabin roof (top ~2.4), not hover above it.
    F.beams(s,'RescueLampArm',[((-1.8,0,2.38),(-1.8,0,3.30)),
            ((-1.8,0,3.3),(-.1,0,3.30))],.22,h=.20,material='dark',bevel=.02)
    F.box(s,'RescueLampHead',(-.1,0,3.30),(.60,.70,.35),material='paint2',bevel=.08)
    F.box(s,'RescueLampLens',(-.1,-.365,3.30),(.40,.035,.18),material='glow_warm',bevel=.02)
    key='towline_acknowledge'
    groups={key:s.objects[start:]}
    pivots={key:s.motion_group(key,(-1.8,0,2.38),groups[key])}
    # Marks belong on the cabin roof (top 2.4, footprint x -2..7, half-width ~2.6): the old
    # 6.2-wide layout hovered 0.07-0.2 up and ended mid-air off the cabin edge.
    crew_details(s,4.4,2.44,-11.12,windows_x=4.6,window_top=2.26,xoff=1.0)
    s.socket_names=list(s.sockets)
    s.finish()
    return s,{'deck':[core],'cabin':[cabin]},pivots,groups,[]

def build_debris():
    s=source_ship('towline_debris',{**COLORS,'paint':'#6f6c58'})
    components={}
    for name,center,size in [('spine',(-3,0,0),(1.5,7,1.3)),
            ('upper',(0,3,0),(6,1.3,1.3)),('lower',(0,-3,0),(6,1.3,1.3)),
            ('bent-tip',(3,1.9,0),(1.3,3.4,1.3))]:
        components[name]=[F.box(s,'YardFrame_'+name,center,size,material='paint',bevel=.12)]
    F.beams(s,'BentFrameRibs',[((-3,-2.5,.72),(-1,-2.5,.72)),
            ((-3,2.5,.72),(1.1,2.5,.72))],.16,h=.08,material='dark',bevel=.012)
    s.socket('SOCKET_Massline',(-3,0,0))
    s.socket('SOCKET_Camera_Focus',(0,0,.65))
    s.socket_names=list(s.sockets)
    s.finish()
    return s,components,{}, {},['Real empty middle and missing corner in the bent inert yard frame']

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for family,asset,builder,idea in [
        ('towline_mara','SF_SHIP_TOWLINE_MARA',build_mara,'Orange clamp with an open throat'),
        ('towline_odo','SF_SHIP_TOWLINE_ODO',build_odo,'Teal winch spine pays real line'),
        ('towline_kit','SF_SHIP_TOWLINE_KIT',build_kit,'Wide skiff keeps two berths empty'),
        ('towline_debris','SF_PROP_TOWLINE_DEBRIS',build_debris,'Bent yard frame is finite work')]:
        s,components,pivots,groups,gaps=builder()
        preflight={'idea':idea,'authority':[SPEC],'supportedViews':['chase','close','top'],
            'palette':'Mid orange or teal work paint; light shared slash; dark machinery and real warm windows',
            'role':'A source-owned real cleanup or tow job; idle winch motion forbidden',
            'review':'Open the real game renderer image and repair material defects'}
        out=ROOT/'assets/ships/forge/preview'/family
        paths,contract=export_family(s,out,family=family,asset_id=asset,recipe=Path(__file__),
            components=components,pivots=pivots,groups=groups,preflight=preflight,negative_space=gaps)
        if args.live:
            source=ROOT/'assets/ships/parts/wholeships'
            provenance=ROOT/'assets/ships/forge/sources'/family
            source.mkdir(parents=True,exist_ok=True)
            provenance.mkdir(parents=True,exist_ok=True)
            for path in paths:shutil.copyfile(path,source/path.name)
            for name in (family+'.blend','measured-contract.json'):shutil.copyfile(out/name,provenance/name)
            bank=out/(family.replace('_','-')+'.motion.json')
            if bank.exists():shutil.copyfile(bank,ROOT/'assets/ships/motions'/bank.name)
        print('TOWLINE_SOURCE',json.dumps({k:contract[k] for k in ('assetId','lods','bounds','physicalBounds','sockets')}))

if __name__=='__main__':main()
