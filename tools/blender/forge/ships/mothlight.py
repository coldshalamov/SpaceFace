"""SF20-10: copper-black triangular tender and four finite ballistic lamps."""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
sys.path.insert(0,str(HERE.parent));sys.path.insert(0,str(HERE))
import forge as F
from concept_export import export_family

COLORS={'paint':'#32383b','paint2':'#735345','dark':'#20262a','bare':'#718084',
        'stripe':'#985c3c','ceramic':'#8b8f8b','glow_amber':'#b47938','glow_drive':'#738993','glow_warm':'#a98c65'}
SPEC='design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/10_mothlight.md'
PREFLIGHT={'idea':'Copper shutter defeats drifting lamps','authority':[SPEC],
    'supportedViews':['chase','close','top'],'values':'Black triangular lacquer, copper bowls and iris, dry pale lamp fins.',
    'read':'Only the large real tender has a six-petal mechanical iris and engine bells. Little lamps have neither.',
    'release':'Four measured mouths outside retained native skin, no repositioning at custody transfer.'}
SOCKETS=[(-8,13,.10),(-8,-13,.10),(-3,10.4,.10),(-3,-10.4,.10)]


def source(family):
    F.reset_scene();s=F.Ship(family,COLORS);s.refresh_lod_normals=True;s.collision_scale=1;return s


def lamp(s,label,center=(0,0,0)):
    x,y,z=center
    needle=F.loft(s,label+'SealedNeedle',[dict(x=x-1.4,y=y,w=.12,ht=.12,hb=.12,zc=z,n=2),
        dict(x=x-1.05,y=y,w=.34,ht=.34,hb=.34,zc=z,n=2.5),dict(x=x+1.05,y=y,w=.34,ht=.34,hb=.34,zc=z,n=2.5),
        dict(x=x+1.4,y=y,w=.12,ht=.12,hb=.12,zc=z,n=2)],material='paint2',belly='paint2',count=20,bevel=.018)
    parts=[needle]
    for side in (-1,1):
        parts.append(F.plate(s,label+'SideFin'+str(side),[(x-.65,y+side*.29),(x+.65,y+side*.29),
                    (x+.25,y+side*.85),(x-.40,y+side*.85)],z0=z-.045,thickness=.09,
                    material='ceramic',chamfer=.035,bevel=.008))
        parts.append(F.plate_v(s,label+'VerticalFin'+str(side),[(x-.65,z+side*.29),(x+.65,z+side*.29),
                    (x+.25,z+side*.85),(x-.40,z+side*.85)],offset=y-.045,thickness=.09,
                    material='ceramic',bevel=.008))
    F.cylinder(s,label+'OpaqueBackSeal',(x-1.405,y,z),(x-1.35,y,z),.13,material='dark',segments=16,bevel=.004)
    cap=F.cylinder(s,label+'FiniteLampCap',(x+1.30,y,z),(x+1.45,y,z),.23,
                   material='dark',cap_material='glow_amber',cap_back_material='dark',segments=20,bevel=.005)
    parts.append(cap)
    return parts


def build_tender():
    s=source('mothlight');pivots={};groups={}
    hull=F.plate(s,'TriangularTenderSkin',[(-10,-12),(13,0),(-10,12)],z0=-1.1,thickness=2.2,
                 material='paint',side_material='dark',chamfer=.25,bevel=.065)
    F.band(s,hull.name,(-8.8,0,0),(1,0,0),.60,'stripe')
    F.loft(s,'RaisedCentralRidge',[dict(x=-9,w=1.0,ht=.35,hb=.05,zc=1.05,n=3),
        dict(x=-4,w=1.3,ht=.70,hb=.05,zc=1.05,n=3),dict(x=6,w=.85,ht=.42,hb=.05,zc=1.05,n=3)],
        material='dark',count=20,bevel=.035)
    for side in (-1,1):
        # Each bowl has a visible forked cradle into the real triangular wing.
        F.beams(s,'SupportedDishCradle'+str(side),[((-6,side*5.2,1.12),(-2,side*7,1.20)),
              ((-5,side*8.2,1.12),(-2,side*9.5,1.20))],.35,h=.38,material='dark',bevel=.04)
        F.dish(s,'ShallowDishWing'+str(side),(-2,side*7,1.18),4.5,.62,axis=(0,0,1),
               material='paint2',face='paint2',feed=None,segments=40)
        # These are shallow dish wings, not antennae. Forge's dish primitive
        # creates a tall feed even without a lens; retire that source object.
        feed=s.objects[-1];s.objects.remove(feed);F.bpy.data.objects.remove(feed,do_unlink=True)
        # Outboard release rails terminate below the lamp, leaving its skin clear.
        for x,y,z in [p for p in SOCKETS if (p[1]>0)==(side>0)]:
            hull_edge=12*(13-x)/23
            F.beams(s,'SupportedReleaseLip'+str(x)+str(side),[((x,side*(hull_edge-.6),-.65),
                  (x,y,-.95)),((x-.5,y,-.95),(x+.5,y,-.95))],.24,h=.26,material='dark',bevel=.025)
            F.box(s,'ReleaseLipSeat'+str(x)+str(side),(x,y,-.86),(1.3,.42,.20),material='paint2',bevel=.045)
    # The fixed gun well and real forward barrel are distinct from decoy caps.
    F.cylinder(s,'RealIrisDarkWell',(8,0,1.10),(8,0,1.47),1.63,material='dark',segments=40,bevel=.015)
    F.cylinder(s,'ActualGunWellChargeLens',(8,0,1.43),(8,0,1.49),.44,material='dark',
               cap_material='glow_amber',cap_back_material='dark',segments=24,bevel=.008)
    F.ring(s,'RealIrisSupportedRim',(8,0,1.48),1.69,.13,axis=(0,0,1),material='paint2',segments=40,sides=8)
    F.cylinder(s,'ActualForwardGunSleeve',(8.4,0,.30),(12.5,0,.30),.39,material='dark',cap_material='bare',segments=24,bevel=.025)
    F.cylinder(s,'ActualGunChargeCore',(11.8,0,.30),(12.52,0,.30),.13,material='dark',cap_material='glow_amber',segments=20,bevel=.005)
    for i in range(6):
        theta=math.pi*2*i/6;half=math.radians(31)
        outline=[(8+.08*math.cos(theta),.08*math.sin(theta))]
        outline += [(8+1.58*math.cos(theta-half+2*half*k/5),1.58*math.sin(theta-half+2*half*k/5)) for k in range(6)]
        start=len(s.objects)
        F.plate(s,'CopperIrisPetal'+str(i+1),outline,z0=1.50,thickness=.13,material='stripe',chamfer=.04,bevel=.018)
        key='mothlight_iris_'+str(i+1);groups[key]=s.objects[start:]
        pivots[key]=s.motion_group(key,(8+1.61*math.cos(theta),1.61*math.sin(theta),1.50),groups[key])
    for i,center in enumerate(SOCKETS):
        start=len(s.objects);lamp(s,'StowedLamp'+str(i+1),center)
        key='mothlight_stock_'+str(i+1);groups[key]=s.objects[start:]
        pivots[key]=s.motion_group(key,center,groups[key])
        s.socket('SOCKET_Lamp_Release_'+str(i+1),center,(0,1 if center[1]>0 else -1,0))
    for side,index in [(1,1),(-1,2)]:
        outline=[(-9.5,side*11.2),(-1.5,side*8.4),(-1.5,side*12.0),(-9.5,side*14.5)]
        start=len(s.objects)
        F.plate(s,'DorsalSupplyHatch'+str(index),outline,z0=1.1,thickness=.24,material='paint',chamfer=.12,bevel=.035)
        F.beams(s,'HatchOuterFrame'+str(index),[((-9.1,side*14.2,1.34),(-1.9,side*11.7,1.34))],.12,h=.12,material='stripe',bevel=.015)
        key='mothlight_hatch_'+str(index);groups[key]=s.objects[start:]
        pivots[key]=s.motion_group(key,(-5.5,side*11.7,1.1),groups[key])
        F.beams(s,'HatchSupportedSlide'+str(index),[((-9,side*10.9,.95),(-9,side*16.0,.95)),
              ((-2,side*8.9,.95),(-2,side*13.9,.95))],.17,h=.20,material='bare',bevel=.02)
    F.box(s,'TenderCanopyCoaming',(-6.5,0,1.80),(2.7,2.0,.22),material='dark',bevel=.08)
    F.canopy(s,'TenderCanopy',x0=-7.6,x1=-5.5,w=.75,h=.38,z=1.89,frame=True)
    for side,label in [(-1,'Starboard'),(1,'Port')]:
        F.nozzle(s,'TenderDrive'+label,(-10.1,side*4,-.35),.60,.8,material='dark',segments=24)
        s.socket('SOCKET_Engine_'+label,(-10.1,side*4,-.35),(-1,0,0))
    s.socket('SOCKET_Engine_Main',(-10.1,4,-.35),(-1,0,0));s.socket('SOCKET_Weapon_Main',(12.52,0,.30),(1,0,0))
    s.socket('SOCKET_Camera_Focus',(0,0,1.2));s.socket_names=list(s.sockets);s.finish()
    return s,{'core':[hull]},pivots,groups,['Four actual release mouths outside retained hull skin']


def build_lamp():
    s=source('mothlight_lamp');parts=lamp(s,'BallisticLamp')
    s.socket('SOCKET_Camera_Focus',(0,0,0));s.socket_names=list(s.sockets);s.finish()
    return s,{'lamp':[p for p in parts]}, {}, {}, ['No engine mouth, weapon, active drive or duplicated stock']


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for family,asset,builder in [('mothlight','SF_SHIP_MOTHLIGHT_TENDER',build_tender),('mothlight_lamp','SF_PROP_MOTHLIGHT_LAMP',build_lamp)]:
        s,parts,pivots,groups,gaps=builder();out=ROOT/'assets/ships/forge/preview'/family
        paths,contract=export_family(s,out,family=family,asset_id=asset,recipe=__file__,components=parts,pivots=pivots,groups=groups,preflight=PREFLIGHT,negative_space=gaps)
        if args.live:
            raw=ROOT/'assets/ships/parts/wholeships';provenance=ROOT/'assets/ships/forge/sources'/family
            raw.mkdir(parents=True,exist_ok=True);provenance.mkdir(parents=True,exist_ok=True)
            for path in paths:shutil.copyfile(path,raw/path.name)
            for name in (family+'.blend','measured-contract.json'):shutil.copyfile(out/name,provenance/name)
            bank=out/(family.replace('_','-')+'.motion.json')
            if bank.exists():shutil.copyfile(bank,ROOT/'assets/ships/motions'/bank.name)
        print('MOTHLIGHT_SOURCE',json.dumps({k:contract[k] for k in ('assetId','bounds','physicalBounds','sockets','lods')}))


if __name__=='__main__':main()
