"""SF20-13: two broken sewing-eye rim arms around a real flat-XZ through-passage."""
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

COLORS={'paint':'#606568','paint2':'#8a816d','dark':'#262d31','bare':'#728085',
        'stripe':'#776343','ceramic':'#969588','glow_cyan':'#658f95','glow_warm':'#a18a63'}
SPEC='design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/13_thimble_door.md'
PREFLIGHT={'idea':'A broken sewing eye with two real mouths','authority':[SPEC],
 'supportedViews':['top','chase','close'],'values':'Pale worn freighter ribs around a broad empty route; quiet metal recesses and a single cyan survey lamp.',
 'read':'Twelve supported rim solids on two separate arms. Nothing spans either mouth or the central void.',
 'release':'Original Forge source metres; collision is twelve source assemblies, never a whole-wreck convex hull.'}
KNOTS=[-60,-40,-20,0,20,40,60]
def inner(x):return 17+7*abs(x)/60
def outer(x):return 40-10*(x/60)**2
def top_surface(x,y):
    for a,b in zip(KNOTS,KNOTS[1:]):
        if a<=x<=b:
            a+=.18;b-=.18;t=max(0,min(1,(x-a)/(b-a)))
            lo=inner(a)*(1-t)+inner(b)*t;hi=outer(a)*(1-t)+outer(b)*t
            u=min(1,abs((abs(y)-(lo+hi)/2)/((hi-lo)/2)))
            return 14*max(0,1-u**3.6)**(1/3.6)
    return 0
def source(family):
    F.reset_scene();s=F.Ship(family,COLORS);s.refresh_lod_normals=True;s.collision_scale=1;return s

def build_door():
    s=source('thimble_door');parts={};pivots={};groups={}
    for side,label in [(-1,'starboard'),(1,'port')]:
        for i,(a,b) in enumerate(zip(KNOTS,KNOTS[1:]),1):
            # Tiny visible rib joints separate twelve solids; neither inner edge
            # moves into the route's promised 17m minimum half-width.
            a+=.18;b-=.18
            sections=[]
            for x in (a,b):
                lo=inner(x);hi=outer(x)
                sections.append(dict(x=x,y=side*(lo+hi)/2,w=(hi-lo)/2,ht=14,hb=14,zc=0,n=3.6))
            bulk=F.loft(s,'RimWedge_'+label+'_'+str(i),sections,material='paint',belly='dark',count=32,bevel=.14)
            parts[label+'_rim_'+str(i)]=[bulk]
            m=(a+b)/2;lo=inner(m);hi=outer(m)
            # Exterior arch ribs are wholly over their own wall; there is no
            # decorative bridge that would falsely look solid across the void.
            arch=[(m,side*y,top_surface(m,y)+.55) for y in (lo+1.0,lo+3.0,(lo+hi)/2,hi-3.0,hi-1.0)]
            F.beams(s,'ArchedFreighterRib_'+label+'_'+str(i),list(zip(arch,arch[1:])),.82,h=.72,material='bare',bevel=.10)
            # Two missing armour panels expose the existing dark structural rib.
            if not ((side==1 and i==2) or (side==-1 and i==5)):
                outline=[(a+1,side*(inner(a)+3)),(b-1,side*(inner(b)+3)),
                         (b-1,side*(outer(b)-2)),(a+1,side*(outer(a)-2))]
                F.plate(s,'WornRaisedSkin_'+label+'_'+str(i),outline,z0=14.08,thickness=.35,
                        material='paint2',side_material='dark',chamfer=.30,bevel=.09)
                for x,y in outline:
                    h=top_surface(x,y)
                    F.box(s,'ArmorPhysicalSeat_'+label+'_'+str(i),(x,y,(h+14.08)/2),
                          (.55,.55,max(.2,14.08-h)),material='dark',bevel=.04)
            else:
                outline=[(a+1,side*(inner(a)+3)),(b-1,side*(inner(b)+3)),
                         (b-1,side*(outer(b)-2)),(a+1,side*(outer(a)-2))]
                F.plate(s,'ExposedDarkBay_'+label+'_'+str(i),outline,z0=14.015,thickness=.06,
                        material='dark',bevel=.012)
                F.beams(s,'ExposedPanelLattice_'+label+'_'+str(i),[
                    ((a+2,side*(inner(a)+3),14.25),(b-2,side*(outer(b)-2),14.25)),
                    ((a+2,side*(outer(a)-2),14.25),(b-2,side*(inner(b)+3),14.25))],.55,h=.52,material='bare',bevel=.05)
            # Short inset seams express the load-bearing interior wall without
            # intruding into the broad passage.
            F.beams(s,'InnerRimWear_'+label+'_'+str(i),[((a+.6,side*(inner(a)+.45),0),
                   (b-.6,side*(inner(b)+.45),0))],.16,h=.70,material='bare',bevel=.025)
        # Three bent outer strips stay beyond the safe interior margin.
        for j in range(3):
            x=51+j*2.6;y=side*(outer(x)-1.2)
            F.beams(s,'ShearedOuterPlate_'+label+'_'+str(j),[((x,y,3.5),(x+2,y-side*.5,6.0)),
                    ((x+2,y-side*.5,6.0),(x+3.5,y-side*1.2,5.0))],.42,h=1.2,material='paint2',bevel=.045)
    # A supported, restrained loose cable hangs outside the route. Its source
    # pivot remains on one wall; runtime sways only this cosmetic wire.
    start=len(s.objects);cable=[]
    for i in range(13):
        t=i/12;x=-46+22*t;y=outer(x)-2;z=-2.0-3.5*math.sin(math.pi*t)
        cable.append((x,y,z))
    F.beams(s,'RetainedOuterCable',list(zip(cable,cable[1:])),.15,h=.15,material='dark',bevel=.02)
    groups['thimble_cable']=s.objects[start:];pivots['thimble_cable']=s.motion_group('thimble_cable',cable[0],groups['thimble_cable'])
    for p in (cable[0],cable[-1]):F.box(s,'CablePhysicalAnchor',p,(.7,.7,.7),material='bare',bevel=.10)
    # One surveyed lamp on a real rim seat, six short solid markers. Private
    # hook surfaces permit a single causal sweep, never free-running glitter.
    lamp_y=inner(-43)+1.5;lamp_z=top_surface(-43,lamp_y)
    F.box(s,'SurveyLampRimSeat',(-43,lamp_y,lamp_z+.5),(2.0,2.2,1.0),material='dark',bevel=.18)
    lamp_start=len(s.objects)
    F.work_lamp(s,'SurveyLamp',(-43,lamp_y,lamp_z+1.1),aim=(.6,-1,0),size=.8,lens='glow_cyan',halo=False)
    s.hook_part('HOOK_THIMBLE_SURVEY_LAMP',*s.objects[lamp_start:])
    marker_positions=[]
    for side in (-1,1):
        for x in (-44,4,44):
            y=side*(inner(x)+1.25);marker_positions.append((x,y,top_surface(x,y)+.35))
    for i,p in enumerate(marker_positions,1):
        F.box(s,'SurveyMarkerRecess_'+str(i),p,(3.5,.9,.65),material='dark',bevel=.09)
        marker=F.box(s,'SurveyMarker_'+str(i),(p[0],p[1],p[2]+.38),(2.7,.38,.10),material='glow_cyan',bevel=.025)
        s.hook_part('HOOK_THIMBLE_MARKER_'+str(i),marker)
    # Modeled arrows sit on the rim; their direction never claims a current fit.
    for side in (-1,1):
        x=-52;y=side*(inner(x)+4)
        F.plate(s,'BroadMouthDirection_'+str(side),[(x-1.8,y-.55),(x+.2,y-.55),(x+.2,y-1.0),
                (x+2.0,y),(x+.2,y+1.0),(x+.2,y+.55),(x-1.8,y+.55)],z0=14.45,thickness=.18,material='ceramic',bevel=.018)
    s.socket('SOCKET_Camera_Focus',(0,0,0));s.socket_names=list(s.sockets);s.finish()
    return s,parts,pivots,groups,['Both +/-X mouths open','Minimum inner half-width17m, flaring to24m at X+/-60',
           'Two separated wall arms; twelve source convex rib wedges; no solid or skin across the route']

def build_recorder():
    s=source('thimble_recorder')
    case=F.box(s,'OriginalSurveyRecorder',(0,0,0),(2.0,1.35,1.2),material='dark',bevel=.13)
    F.box(s,'RecorderTopPlate',(-.05,0,.61),(1.60,1.06,.09),material='paint2',bevel=.06)
    F.boxes(s,'RecorderFasteners',[((x,y,.67),(.09,.09,.035)) for x in (-.65,.65) for y in (-.40,.40)],material='bare',bevel=.01)
    F.box(s,'RecorderEyePhysicalSeat',(.88,0,.26),(.35,.55,.4),material='bare',bevel=.04)
    F.ring(s,'ActualRecorderTowEye',(1.20,0,.26),.25,.075,axis=(0,0,1),material='bare',segments=24,sides=8)
    F.box(s,'HOOK_THIMBLE_RECORDER_STATUS',(-.35,-.686,.05),(.55,.035,.13),material='glow_cyan',bevel=.01)
    F.boxes(s,'RecorderLabelNotches',[((-.35+i*.20,-.688,-.18),(.10,.035,.05)) for i in range(4)],material='bare',bevel=.006)
    s.socket('SOCKET_Tow_Eye',(1.20,0,.26));s.socket('SOCKET_Camera_Focus',(0,0,0));s.socket_names=list(s.sockets);s.finish()
    return s,{'recorder':[case]}, {}, {}, ['Independent original recorder with a physical exposed tow eye']

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for family,asset,builder in [('thimble_door','SF_PLACE_THIMBLE_DOOR',build_door),('thimble_recorder','SF_PROP_THIMBLE_RECORDER',build_recorder)]:
        s,parts,pivots,groups,gaps=builder();out=ROOT/'assets/ships/forge/preview'/family
        paths,c=export_family(s,out,family=family,asset_id=asset,recipe=__file__,components=parts,pivots=pivots,groups=groups,preflight=PREFLIGHT,negative_space=gaps)
        if args.live:
            raw=ROOT/'assets/ships/parts/wholeships';provenance=ROOT/'assets/ships/forge/sources'/family
            raw.mkdir(parents=True,exist_ok=True);provenance.mkdir(parents=True,exist_ok=True)
            for p in paths:shutil.copyfile(p,raw/p.name)
            for name in (family+'.blend','measured-contract.json'):shutil.copyfile(out/name,provenance/name)
            bank=out/(family.replace('_','-')+'.motion.json')
            if bank.exists():shutil.copyfile(bank,ROOT/'assets/ships/motions'/bank.name)
        print('THIMBLE_SOURCE',json.dumps({k:c[k] for k in ('assetId','bounds','physicalBounds','groups','lods')}))

if __name__=='__main__':main()
