"""SF20-07 Scissorwake: a ceramic open V and a compact stolen drive body.

Original Forge silhouette; the blades are render-only, not a second cut authority.
Build: blender -b --python tools/blender/forge/ships/scissorwake.py -- --live
Source metres +X nose/+Y port/+Z up; runtime source scale one.
"""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(HERE.parent))
sys.path.insert(0,str(HERE))
import forge as F
from concept_export import export_family

COLORS={'paint':'#303a3e','paint2':'#9a4b24','dark':'#20282d','ceramic':'#9e9785',
        'bare':'#7d7d76','stripe':'#793a20','glow_drive':'#7a9bb0','glow_amber':'#c47a36'}
PREFLIGHT={
    'idea':'Ceramic jaws commit one crossing','tier':'B',
    'authority':['design/program/world-depth-2026-10-02/TWENTY_CONCEPT_AMENDMENT.md',
       'design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/07_scissorwake.md'],
    'supportedViews':['chase-144','close-58','top-inspection'],
    'componentReferenceDecision':'not_needed','allSupportedViewZonesClassified':False,
    'zones':[
       {'id':'open-ceramic-V','dominates':True,
        'assembly':'Two thirteen-metre tapered ceramic cutting spars on visible dark Z-axis hinges; the long forward space remains truly empty.',
        'bill':'Warm dry ceramic with bevelled cutting shoulders, dark seated cutting shoes and narrow recessed amber inner apertures. Geometry carries the attack warning without neon or fake collision blades.'},
       {'id':'compact-drive-body','dominates':True,
        'assembly':'Low dark pressure loft entirely behind the blade tips, two recessed aft drives, raised cheek bearing seats and one crew canopy.',
        'bill':'Graphite lacquer and dark machinery, restrained rust-orange livery collar, warm gray machined fasteners. One main source convex only; negative V is never filled by a collision prism.'},
       {'id':'supported-dorsal-spool','dominates':True,
        'assembly':'One sodium-orange drum on a real cross axle, two bearing pedestals and restrained dark winding ribs.',
        'bill':'Orange pressure drum, exposed gray flange rims and dark cable returns. Y-axis drum turns only during a current accepted cutter commitment; no idle spin.'},
    ],'review':'Read actual Look top/chase/close at source scale one; root serial publication.'}
for zone in PREFLIGHT['zones']:
    zone['disposition']='billed';zone['supportedViews']=PREFLIGHT['supportedViews'][:]


def build():
    F.reset_scene();ship=F.Ship('scissorwake',COLORS)
    ship.refresh_lod_normals=True;ship.collision_scale=1
    hull=F.loft(ship,'CompactCutterPressureHull',[
        dict(x=-9.65,w=1.60,ht=.95,hb=.85,zc=0,n=2.7),
        dict(x=-8.3,w=2.50,ht=1.45,hb=1.15,zc=.05,n=3.1),
        dict(x=-4.0,w=2.55,ht=1.60,hb=1.25,zc=.05,n=3.4),
        dict(x=-.8,w=2.25,ht=1.18,hb=.85,zc=.0,n=3.1),
        dict(x=1.45,w=1.22,ht=.65,hb=.50,zc=.0,n=2.7),
        dict(x=2.0,w=.45,ht=.40,hb=.35,zc=.0,n=2.5),
    ],material='paint',belly='dark',back_material='dark',count=40,bevel=.045)
    F.band(ship,'CompactCutterPressureHull',(-7.4,0,0),(1,0,0),.55,'stripe')
    core=[hull]
    pads=F.boxes(ship,'BladeBearingSeats',[((-.25,side*2.35,.18),(1.6,1.0,.75)) for side in (-1,1)],
                material='dark',bevel=.10)
    core.append(pads)
    # The fixed bearing is mechanically continuous with the hull cheek.
    for side in (-1,1):
        F.cylinder(ship,'FixedBladeBearing'+str(side),(0,side*2.5,.05),(0,side*2.5,.39),
                   .70,material='bare',segments=36,bevel=.035)
        F.cylinder(ship,'BladeBearingCap'+str(side),(0,side*2.5,1.02),(0,side*2.5,1.11),
                   .34,material='dark',segments=28,bevel=.018)
    groups,pivots={},{}
    for side,label in ((1,'port'),(-1,'starboard')):
        angle=side*math.radians(8)
        def point(x,y,z=0):
            # Blade shapes are baked at their genuine 8-degree source rest spread.
            return (x*math.cos(angle)-y*math.sin(angle),side*2.5+x*math.sin(angle)+y*math.cos(angle),z)
        start=len(ship.objects)
        outline=[(-.20,-.72),(9.8,-.62),(13.0,-.04),(12.6,.59),(7.3,1.02),(-.20,1.02)]
        if side<0:outline=[(x,-y) for x,y in reversed(outline)]
        F.plate(ship,'CeramicCuttingSpar_'+label,[point(x,y)[:2] for x,y in outline],
                z0=.30,thickness=.65,material='ceramic',side_material='bare',chamfer=.13,
                chamfer_bottom=.055,bevel=.025)
        # The inner active edge is recessed behind a structural dark shoe.
        inner=-side*.66
        F.beams(ship,'CuttingShoe_'+label,[(point(.7,inner,.66),point(9.5,inner,.66)),
                  (point(9.5,inner,.66),point(12.5,-side*.06,.66))],.23,h=.26,material='dark',bevel=.025)
        F.beams(ship,'RecessedCutAperture_'+label,[(point(1.0,inner-side*.012,.805),point(9.3,inner-side*.012,.805)),
                  (point(9.3,inner-side*.012,.805),point(12.1,-side*.11,.805))],.075,h=.035,
                material='glow_amber',bevel=.006)
        F.beams(ship,'BladeBackbone_'+label,[(point(.8,side*.58,.965),point(7.4,side*.68,.965))],
                .24,h=.075,material='bare',bevel=.015)
        F.cylinder(ship,'MovingBladeHub_'+label,(0,side*2.5,.34),(0,side*2.5,.95),
                   .54,material='dark',segments=36,bevel=.022)
        key='scissorwake_blade_'+label
        groups[key]=ship.objects[start:];pivots[key]=ship.motion_group(key,(0,side*2.5,.4),groups[key])
    # A real transverse axle and two seated bearings support the orange dorsal drum.
    for side in (-1,1):
        F.plate_v(ship,'SpoolPedestal'+str(side),[(-4.1,1.2),(-1.9,1.2),(-2.15,2.65),(-3.85,2.65)],
                  offset=side*1.15-.15,thickness=.30,plane='xz',material='dark',chamfer=.055,bevel=.028)
    F.cylinder(ship,'FixedSpoolAxle',(-3,-1.35,2.5),(-3,1.35,2.5),.22,material='bare',segments=28,bevel=.015)
    start=len(ship.objects)
    F.cylinder(ship,'OrangeDorsalSpool',(-3,-.85,2.5),(-3,.85,2.5),1.02,material='paint2',segments=40,bevel=.035)
    for side in (-1,1):
        F.cylinder(ship,'SpoolEndFlange'+str(side),(-3,side*.87-.06,2.5),(-3,side*.87+.06,2.5),
                   1.13,material='bare',segments=40,bevel=.022)
    F.boxes(ship,'DarkSpoolWindingRibs',[((-3, y,3.48),(.80,.075,.035)) for y in (-.6,-.3,0,.3,.6)],
            material='dark',bevel=.005)
    key='scissorwake_spool';groups[key]=ship.objects[start:];pivots[key]=ship.motion_group(key,(-3,0,2.5),groups[key])
    F.box(ship,'CrewCanopyCoaming',(-6.0,0,1.53),(2.0,2.35,.3),material='dark',bevel=.09)
    F.canopy(ship,'CutterCrewCanopy',x0=-6.7,x1=-5.0,w=.92,h=.35,z=1.70,frame=True)
    F.plate(ship,'AftDriveShield',[(-9.3,-1.45),(-7.9,-1.45),(-7.9,1.45),(-9.3,1.45)],
            z0=1.48,thickness=.12,material='dark',chamfer=.08,bevel=.018)
    F.boxes(ship,'AftDriveHeatSlots',[((-8.55,y,1.625),(.76,.10,.035)) for y in (-.8,-.4,0,.4,.8)],material='bare',bevel=.007)
    for side in (-1,1):
        bell=F.nozzle(ship,'RecessedCutterDrive'+str(side),(-9.80,side*1.5,-.1),.64,.70,material='dark',segments=32)
        core.append(bell)
    F.light(ship,'PortNavigation',(-4,2.50,.55),'glow_red',.085)
    F.light(ship,'StarboardNavigation',(-4,-2.50,.55),'glow_green',.085)
    ship.socket('SOCKET_Engine_Main',(-9.80,1.5,-.1),(-1,0,0))
    ship.socket('SOCKET_Engine_Port',(-9.80,1.5,-.1),(-1,0,0))
    ship.socket('SOCKET_Engine_Starboard',(-9.80,-1.5,-.1),(-1,0,0))
    ship.socket('SOCKET_Trail_Main',(-9.92,0,-.1),(-1,0,0))
    ship.socket('SOCKET_Blade_Port',(0,2.5,.4))
    ship.socket('SOCKET_Blade_Starboard',(0,-2.5,.4))
    ship.socket('SOCKET_Camera_Focus',(0,0,1.0))
    ship.socket_names=list(ship.sockets);ship.finish()
    return ship,{'core':core},pivots,groups


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    ship,components,pivots,groups=build()
    out=ROOT/'.devshots/scissorwake-source'
    paths,contract=export_family(ship,out,family='scissorwake',asset_id='SF_SHIP_SCISSORWAKE',recipe=__file__,
       components=components,pivots=pivots,groups=groups,preflight=PREFLIGHT,negative_space=['open-forward-ceramic-V'])
    if args.live:
        source=ROOT/'assets/ships/parts/wholeships';provenance=ROOT/'assets/ships/forge/sources/scissorwake'
        source.mkdir(parents=True,exist_ok=True);provenance.mkdir(parents=True,exist_ok=True)
        for path in paths:shutil.copyfile(path,source/path.name)
        for name in ('scissorwake.blend','measured-contract.json'):shutil.copyfile(out/name,provenance/name)
        shutil.copyfile(out/'scissorwake.motion.json',ROOT/'assets/ships/motions/scissorwake.motion.json')
    print('SCISSORWAKE_SOURCE',json.dumps({k:contract[k] for k in ('assetId','lods','bounds','physicalBounds','sockets')}))

if __name__=='__main__':main()
