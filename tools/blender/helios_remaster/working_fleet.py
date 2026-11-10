"""Helios working fleet remaster: retain occupations, rework actual shell construction.

Blender --background --python tools/blender/helios_remaster/working_fleet.py -- --only repair_tender
Run without --only for all eight. Candidate outputs stay outside the shipping asset tree.
Existing per-craft builder supplies retained assemblies; existing GLBs supply their surfaced
materials, exact socket graph and collision hull. This script owns the replacement construction.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools' / 'blender'))
import build_npc_work_fleet as fleet
import spaceface_export
from spaceface_chase_camera import apply_chase_camera

OUT = ROOT / '.devshots' / 'helios-remaster' / 'working-fleet'
IDS = ['repair_tender','rescue_lifter','prospector_skiff','scrap_sweeper','apron_shuttle','salvage_cutter','yard_tug','ore_barge']

def clear_scene():
    # Reset scene datablocks only; keep the user's Blender preferences/add-ons.
    if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
    for scene in bpy.data.scenes:
        for key in list(scene.keys()): del scene[key]
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    for collection in list(bpy.data.collections):bpy.data.collections.remove(collection)
    for group in (bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.cameras,bpy.data.lights):
        for item in list(group):
            if item.users==0:group.remove(item)

fleet.reset_scene=clear_scene

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

class Rework:
    def __init__(self, key, parts, coll, mats):
        self.key, self.parts, self.coll, self.mats = key, parts, coll, mats
        self.H = mats['Material_Hull']; self.M = mats['Material_Mechanical']
        self.W = mats['Material_Warm']; self.C = mats['Material_Cyan']; self.G = mats['Material_Glass']
        self.changed = []

    def remove(self, *names):
        for o in list(self.parts):
            if any(o.name == n or (n.endswith('*') and o.name.startswith(n[:-1])) for n in names):
                self.parts.remove(o); bpy.data.objects.remove(o, do_unlink=True)

    def box(self, name, size, loc, mat=None, bevel=.035, **kw):
        o = fleet.make_box(name,size,loc,mat or self.M,self.coll,bevel=bevel,**kw)
        self.parts.append(o); return o

    def cyl(self,name,r,depth,loc,mat=None,axis='X',n=12,**kw):
        rot = {'X':fleet.ROT_ALONG_X,'Y':(0,0,0),'Z':fleet.ROT_ALONG_Y_PORT}[axis]
        o=fleet.make_cylinder(name,r,depth,loc,mat or self.M,self.coll,rot=rot,verts=n,**kw)
        self.parts.append(o); return o

    def ring(self,name,x,y,z,radius,inner,height,mat=None):
        verts=[];faces=[];n=24
        for rr,yy in ((radius,y-height/2),(radius,y+height/2),(inner,y+height/2),(inner,y-height/2)):
            for i in range(n):
                a=i*2*math.pi/n;verts.append(fleet.L(x+rr*math.cos(a),yy,z+rr*math.sin(a)))
        for row in range(4):
            for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,((row+1)%4)*n+(i+1)%n,((row+1)%4)*n+i))
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
        o=bpy.data.objects.new(name,mesh);self.coll.objects.link(o);o.data.materials.append(mat or self.M)
        fleet._tug_normals_outward(o);self.parts.append(o);return o

    def loft(self,name,stations,mat=None,z=0,bevel=.07):
        o=fleet._tug_loft(name,stations,mat or self.H,self.coll,z_off=z,bevel=bevel)
        self.parts.append(o); return o

    def beam(self,name,a,b,width=.16,depth=.2,mat=None):
        a,b=Vector(fleet.L(*a)),Vector(fleet.L(*b))
        o=fleet.make_box(name,(width,(b-a).length,depth),(0,0,0),mat or self.M,self.coll,bevel=.02)
        o.location=(a+b)*.5; o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
        self.parts.append(o); return o

    def cut(self,shell,name,loc,size):
        # Real removed shell volume; floor and coaming are separate fabricated parts.
        cutter=fleet.make_box(name+'_cutter',size,loc,None,self.coll,bevel=min(.15,size[2]*.08))
        bpy.context.view_layer.objects.active=shell
        mod=shell.modifiers.new(name,'BOOLEAN'); mod.operation='DIFFERENCE'; mod.solver='EXACT'; mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter,do_unlink=True)

    def well(self,shell,name,x,z,length,width,top,depth=1.0,kind='radiator'):
        self.cut(shell,name,(x,top-depth*.35,z),(length,depth*1.7,width))
        floor=top-depth
        self.box(name+'_floor',(length-.12,.10,width-.12),(x,floor,z))
        # Rim with a true opening; side walls reach the floor rather than hover.
        for side in (-1,1):
            self.box(name+'_side_'+str(side),(length,.15,.13),(x,top+.055,z+side*width*.5),self.H)
            self.box(name+'_wall_'+str(side),(length,depth,.07),(x,top-depth*.5,z+side*(width*.5-.055)),self.M)
            self.box(name+'_end_'+str(side),(.14,.15,width),(x+side*length*.5,top+.055,z),self.H)
        if kind=='radiator':
            count=max(4,round(length/.42))
            for i in range(count):
                px=x-length*.4+length*.8*i/(count-1)
                self.box(name+'_fin_'+str(i),(.11,depth*.55,width*.76),(px,floor+depth*.30,z),self.M,bevel=.012,
                         rot=(0,math.radians(-18),0))
            self.box(name+'_header',(length*.83,.10,.12),(x,floor+.10,z-width*.35),self.W)
        elif kind=='receiver':
            self.cyl(name+'_receiver',width*.26,length*.74,(x,floor+depth*.40,z),self.M,n=16)
            for side in (-1,1):
                self.cyl(name+'_collar_'+str(side),width*.32,.16,(x+side*length*.25,floor+depth*.40,z),self.H,n=16)
            self.box(name+'_status',(.65,.04,.12),(x-length*.3,top-.15,z+width*.36),self.C,bevel=.01)
        self.changed.append(name)

    def canopy(self,prefix,x,z,length,width,top):
        # Pressure-window pocket. The roof is a sloped section, never an opaque slab.
        self.box(prefix+'_seal',(length+.26,.14,width+.26),(x,top-.06,z),self.M,bevel=.13)
        self.loft(prefix+'_glass',[(x-length*.5,width*.40,top+.08,top-.10),
            (x-length*.15,width*.50,top+.32,top-.10),
            (x+length*.35,width*.43,top+.20,top-.10),
            (x+length*.5,width*.28,top+.04,top-.10)],self.G,z=z,bevel=.02)
        for side in (-1,1):
            self.beam(prefix+'_rim_'+str(side),(x-length*.45,top+.10,z+side*width*.44),
                (x+length*.35,top+.23,z+side*width*.42),.10,.10,self.H)
        self.beam(prefix+'_mullion',(x+.1,top+.34,z-width*.48),(x+.1,top+.34,z+width*.48),.07,.07,self.M)

    def hinge(self,prefix,x,y,z,r=.26):
        self.cyl(prefix+'_bearing',r,.34,(x,y,z),self.M,'Y',16)
        self.cyl(prefix+'_cap',r*.65,.055,(x,y+.20,z),self.H,'Y',12)
        self.cyl(prefix+'_pin',r*.22,.065,(x,y+.235,z),self.W,'Y',8)

    def duct(self,prefix,x,z,length,width,top):
        self.loft(prefix,[(x-length*.5,width*.32,top-.2,top-.6),
            (x-length*.2,width*.5,top,top-.6),(x+length*.4,width*.48,top-.08,top-.6),
            (x+length*.5,width*.30,top-.22,top-.5)],self.H,z=z,bevel=.04)
        for i in range(4):
            self.box(prefix+'_slit_'+str(i),(.11,.07,width*.62),(x-length*.20+i*length*.14,top+.012,z),self.M,bevel=.01)

    def repair_tender(self):
        self.remove('Tender_HullMid','Tender_HullAft','Tender_Bow','Tender_BowStem','Tender_Canopy','TenderMid*','Tender_UmbilicalDrum','Tender_SoftCollar')
        hull=self.loft('Tender_FormedWorkshopShell',[(-12.2,2.6,1.4,-1.0),(-8.7,3.6,1.7,-1.15),
            (-6.7,4.25,1.9,-1.2),(3.7,4.25,1.9,-1.2),(6.2,3.5,1.8,-.95),
            (10.2,2.75,1.5,-.75),(12.3,1.3,.95,-.35)])
        self.well(hull,'Tender_ServiceTrench',-2.2,1.8,8.7,2.35,1.9,1.55,'receiver')
        self.well(hull,'Tender_HeatExchanger',-6.2,-1.9,3.1,1.4,1.9,1.0)
        self.canopy('Tender_PressureCab',7.4,0,2.55,2.1,1.85)
        # Raised hose-reel saddle: open between two standards, visible from above.
        for side in (-1,1):
            self.loft('Tender_ReelStandard_'+str(side),[(-3.4,.20,2.1,1.8),(-2.3,.24,3.25,1.8),
                (-1.2,.20,2.1,1.8)],self.H,z=-.75+side*.90,bevel=.05)
        self.cyl('Tender_HoseWinding',.58,1.6,(-2.3,2.50,-.75),self.M,'Z',24)
        for side in (-1,1):
            self.cyl('Tender_ReelFlange_'+str(side),.77,.13,(-2.3,2.50,-.75+side*.78),self.W,'Z',24)
        for i in range(6):
            self.cyl('Tender_HoseCoil_'+str(i),.61,.065,(-2.3,2.50,-1.37+i*.24),self.M,'Z',24)
        for px in (1.0,2.9):
            self.loft('Tender_ServiceCassette_'+str(px),[(px-.65,.7,2.15,1.85),(px-.40,.75,2.70,1.85),
                (px+.5,.70,2.65,1.85),(px+.65,.50,2.1,1.85)],self.H,z=-1.30,bevel=.04)
            self.box('Tender_CassetteLatch_'+str(px),(.30,.10,1.2),(px,2.75,-1.3),self.W)
        # Articulated weld boom's forces run through two pinned links and a ram.
        self.hinge('Tender_BoomRoot',6.4,1.4,3.05,.48)
        self.hinge('Tender_BoomElbow',6.25,1.75,3.13,.26)
        self.beam('Tender_BoomPistonBody',(4.0,1.5,3.1),(6.3,1.9,3.1),.20,.20,self.H)
        self.beam('Tender_BoomPistonRod',(6.3,1.9,3.1),(7.8,1.95,3.1),.075,.075,self.M)

    def rescue_lifter(self):
        self.remove('Rescue_HullMid','Rescue_HullAft','Rescue_BayBox','Rescue_BayPad','Rescue_BayMouth','RescueMid*','Rescue_Basket','Rescue_BasketRail','Rescue_Canopy','Rescue_BarRed*','Rescue_BarWhite*')
        hull=self.loft('Rescue_AmbulanceShell',[(-13.4,2.4,1.5,-1.2),(-10.0,3.05,1.8,-1.4),
            (-5.2,3.6,2.0,-1.35),(.8,3.6,2.0,-1.35),(3.0,3.3,1.4,-1.35)])
        # Forward half is an actual open casualty cradle. Tall side sponsons carry
        # the hoist load around it; there is no roof to hide the loading mechanism.
        self.loft('Rescue_CradleKeel',[(2.7,2.7,-.35,-1.25),(10.5,3.0,-.35,-1.25),
            (14.6,2.3,-.2,-.85)],self.M,bevel=.06)
        for side in (-1,1):
            self.loft('Rescue_CradleSponson_'+str(side),[(2.8,.48,1.7,-.9),(5.0,.5,2.3,-1.1),
                (10.5,.48,2.0,-1.1),(14.8,.38,.75,-.55)],self.H,z=side*2.85,bevel=.07)
            self.box('Rescue_BedRail_'+str(side),(10.8,.25,.21),(8.6,-.02,side*1.65),self.W)
            for bx in (4.8,8.,11.2):
                self.loft('Rescue_Pad_'+str(side)+'_'+str(bx),[(bx-.7,.46,.32,-.27),
                    (bx+.7,.46,.32,-.27)],self.H,z=side*.92,bevel=.06)
                self.beam('Rescue_LoadStrap_'+str(side)+'_'+str(bx),(bx,-.25,side*1.9),(bx,.4,side*.48),.14,.12,self.W)
            self.box('Rescue_EmergencyEnamel_'+str(side),(6.4,.12,.38),(7.4,2.12,side*2.85),self.W)
            for i in range(3):
                self.box('Rescue_StretcherGuide_'+str(side)+'_'+str(i),(1.2,.045,.12),(5.4+i*2.6,-.12,side*1.78),self.C,bevel=.01)
        self.well(hull,'Rescue_LifeSupport',-3.3,-1.75,3.4,1.25,2.,1.0,'receiver')
        self.well(hull,'Rescue_CoolingBank',-3.3,1.75,3.4,1.25,2.,.9)
        self.canopy('Rescue_Overlook',-8,0,2.2,1.9,2.80)
        self.box('Rescue_BasketBase',(2.2,.15,1.45),(10,3.25,0),self.H,bevel=.12)
        for side in (-1,1):
            self.box('Rescue_BasketSide_'+str(side),(2.2,.55,.12),(10,3.52,side*.70),self.W)
        for px in (9,11): self.box('Rescue_BasketEnd_'+str(px),(.12,.55,1.45),(px,3.52,0),self.M)
        self.hinge('Rescue_HoistTurntable',3.6,2.1,0,.6)
        self.beam('Rescue_HoistRam',(3.6,2.5,0),(6.8,3.8,0),.16,.16,self.H)

    def prospector_skiff(self):
        self.remove('Skiff_Hull','Skiff_Nose','SkiffMid*','Skiff_Canopy','Skiff_StakeRack')
        hull=self.loft('Skiff_ClaimBoatShell',[(-5.8,1.7,1.15,-.9),(-3.3,2,1.35,-.9),
            (1.6,2,1.35,-.9),(4.4,1.7,1.25,-.7),(7.7,.35,.6,-.15)])
        self.well(hull,'Skiff_AssayWell',-.7,0,3.6,2.8,1.35,1.25,'empty')
        self.ring('Skiff_AssayBearing',-.7,1.45,0,1.30,.99,.28,self.H)
        self.ring('Skiff_AssaySeal',-.7,1.32,0,1.06,.84,.13,self.M)
        self.ring('Skiff_SampleCarousel',-.7,.59,0,.88,.61,.18,self.W)
        for i in range(6):
            a=i*math.pi/3
            self.cyl('Skiff_SampleCan_'+str(i),.15,.40,(-.7+.73*math.cos(a),.47,.73*math.sin(a)),self.M,'Y',10)
        self.beam('Skiff_AssayBridge',(-1.8,1.66,-.2),(.45,1.66,-.2),.18,.16,self.M)
        self.cyl('Skiff_OpticHead',.35,.40,(-.7,1.53,-.2),self.H,'Y',16)
        self.cyl('Skiff_OpticAperture',.18,.045,(-.7,1.31,-.2),self.C,'Y',16)
        self.canopy('Skiff_Cab',3.4,0,1.9,1.45,1.30)
        for side in (-1,1):self.duct('Skiff_CoolingCheek_'+str(side),-3.9,side*1.28,2.1,.65,1.15)
        self.hinge('Skiff_ArmRoot',1.6,.7,-2.05,.32)
        self.hinge('Skiff_ArmElbow',4.6,.45,-2.2,.23)
        self.beam('Skiff_ArmHydraulic',(1.8,.55,-2.1),(4.3,.4,-2.2),.11,.11,self.H)
        # Open cartridge cradle exposes three claim stakes and their locking saddles.
        self.box('Skiff_StakeCradle',(1.7,.16,.60),(4.6,.3,2.02),self.H)
        for i in range(3):
            self.box('Skiff_StakeClamp_'+str(i),(.18,.50,.60),(4.2+i*.36,.55,2.02),self.M)

    def scrap_sweeper(self):
        self.remove('Sweep_Hull','SweepMid*','Sweep_Scoop','Sweep_LipA','Sweep_LipB','Sweep_Throat','Sweep_CageRail*','Sweep_CageAft','Sweep_Canopy')
        hull=self.loft('Sweep_HopperChassis',[(-7.1,2.45,1.2,-1.0),(-4.8,2.8,1.45,-1.0),
            (1.9,2.8,1.55,-1.0),(4.7,2.6,1.45,-.9)])
        self.well(hull,'Sweep_ScrapHopper',-4.75,0,4.5,3.85,1.45,1.9,'empty')
        # Flared open scoop: lower formed bed plus two side cheeks. No cap or glowing plug.
        self.loft('Sweep_ScoopFloor',[(4.5,1.8,-.50,-.82),(6.6,2.5,-.60,-.92),(9.4,3.1,-.80,-1.04)],self.M)
        for side in (-1,1):
            self.loft('Sweep_ScoopCheek_'+str(side),[(4.5,.40,1.42,-.70),(6.5,.32,1.0,-.80),
                (9.4,.21,.28,-.85)],self.H,z=side*2.75)
            self.beam('Sweep_LipWear_'+str(side),(5.0,-.38,side*1.72),(9.4,-.70,side*2.95),.2,.2,self.W)
            self.box('Sweep_CageUpperRail_'+str(side),(4.6,.14,.16),(-4.75,2.0,side*2.02),self.H)
        self.box('Sweep_CageRearRail',(.16,.14,4.0),(-7.05,2.0,0),self.H)
        self.box('Sweep_CollectorRoof',(1.0,.30,3.8),(4.7,1.30,0),self.H)
        for i in range(6):
            self.cyl('Sweep_CollectorRoller_'+str(i),.23,3.7,(4.5+i*.73,-.30,0),self.M,'Z',12)
            for side in (-1,1):
                self.box('Sweep_RollerTooth_'+str(i)+'_'+str(side),(.26,.20,.45),(4.5+i*.73,-.04,side*.9),self.W,bevel=.035)
        self.box('Sweep_CollectorSignal',(.08,.12,2.6),(4.76,.35,0),self.W)
        self.canopy('Sweep_MunicipalCab',2.1,-1.3,1.85,1.1,1.55)
        for i in range(4):
            self.box('Sweep_CaughtStock_'+str(i),(1.4,.35,.6),(-5.5+(i%2)*1.6,.05,(-.75 if i<2 else .65)),self.M,bevel=.06,
                rot=(.06*i,.12*i,.15*i))
        self.hinge('Sweep_MagnetBoomRoot',1.4,1.55,0,.48)

    def apron_shuttle(self):
        self.remove('Shuttle_Fuselage','Shuttle_Bow','ShuttleMid*','Shuttle_Window*','Shuttle_Canopy','Shuttle_TailFair')
        hull=self.loft('Shuttle_PressureCoach',[(-8.65,1.15,1.05,-.65),(-6.2,1.8,1.35,-.95),
            (-4.0,2.08,1.48,-.95),(3.6,2.08,1.48,-.95),(5.9,1.65,1.15,-.7),(8.45,.9,.8,-.4)])
        # Two long skylight ribbons are actual window pockets readable from above.
        for side in (-1,1):
            self.well(hull,'Shuttle_Lightwell_'+str(side),-.7,side*.89,7.5,.65,1.48,.45,'empty')
            self.box('Shuttle_GlassRibbon_'+str(side),(7.2,.065,.50),(-.7,1.14,side*.89),self.G,bevel=.08)
            for i in range(5):
                self.box('Shuttle_WindowMullion_'+str(side)+'_'+str(i),(.11,.20,.75),(-3.7+i*1.5,1.39,side*.89),self.H,bevel=.018)
        self.canopy('Shuttle_PilotCab',4.55,0,2.4,1.75,1.37)
        self.well(hull,'Shuttle_AftCooling',-5.4,0,1.7,1.4,1.35,.72)
        # Pressure door and hinge run break one flank without inventing another cabin.
        self.box('Shuttle_DoorGasket',(1.35,1.30,.095),(-1.4,.1,-2.07),self.M,bevel=.10)
        self.box('Shuttle_DoorSkin',(1.12,1.10,.07),(-1.4,.1,-2.12),self.H,bevel=.08)
        self.box('Shuttle_DoorLight',(.12,.40,.04),(-1.02,.23,-2.14),self.C,bevel=.012)

    def salvage_cutter(self):
        self.remove('Cutter_HullMid','Cutter_HullFwd','Cutter_BowStem','CutterMid*','Cutter_Canopy','Cutter_ShearJawUpper','Cutter_ShearJawLower','Cutter_ShearTipA','Cutter_ShearTipB')
        hull=self.loft('Cutter_PatchedShell',[(-8.9,2.3,1.35,-1.0),(-5.8,3.05,1.75,-1.15),
            (2.8,3.05,1.8,-1.1),(5.4,2.45,1.65,-.85),(7.8,2.,1.3,-.6),(9.75,.85,.7,-.2)])
        self.well(hull,'Cutter_HydraulicWell',.0,1.45,4.7,1.35,1.8,1.12,'receiver')
        self.well(hull,'Cutter_HeatDump',-4.8,-1.85,2.3,1.1,1.75,.9)
        self.canopy('Cutter_SalvorCab',5.3,0,2.3,1.65,1.65)
        for side in (-1,1):
            # Jaws open in the horizontal plane so the actual overhead camera sees
            # both the forged sections and their cutting gap rather than overlap.
            zz=2.5+side*.70
            self.loft('Cutter_ShearJaw_'+str(side),[(6.8,.36,.85,-.1),
                (8.0,.46,.92,-.15),(9.5,.36,.64,-.10),(10.7,.10,.40,.06)],self.M,z=zz,bevel=.055)
            self.loft('Cutter_ReplaceableBite_'+str(side),[(8.0,.16,.97,.75),(9.5,.15,.71,.52),
                (10.65,.07,.44,.29)],self.W,z=zz-side*.22,bevel=.025)
            self.hinge('Cutter_JawBearing_'+str(side),6.8,.95,zz,.39)
        self.hinge('Cutter_ShearJoint',6.9,.35,2.4,.48)
        self.box('Cutter_RepairSkin',(2.8,.05,1.0),(1.0,1.83,-1.3),self.W,bevel=.03)

    def yard_tug(self):
        # Preserve the existing substantial tug reauthor; cut real machinery wells into
        # its refined pod shells and replace blank hatch plates with open bearing boxes.
        for side,tag in ((-1,'P'),(1,'S')):
            pod=next(o for o in self.parts if o.name=='Tug_PodAft_'+tag)
            self.well(pod,'Tug_PodCooling_'+tag,-8.4,side*2.62,3.4,.75,1.50,.72)
        hull=next(o for o in self.parts if o.name=='Tug_Hull')
        self.remove('Tug_HatchCoaming_1','Tug_HatchLid_1','Tug_HatchCoaming_2','Tug_HatchLid_2')
        self.well(hull,'Tug_DeckCapstanWell',-.7,0,3.2,1.2,1.52,.72,'receiver')
        for side in (-1,1):
            self.beam('Tug_LoadStay_'+str(side),(-5.1,1.7,side*.7),(-3.9,1.15,side*2.0),.14,.16,self.M)

    def ore_barge(self):
        self.remove('Barge_Deck','Barge_BowSection','Barge_BowStem','Barge_ArmorProw*')
        deck=self.loft('Barge_LoadBearingSpine',[(-17.2,2.7,1.18,-.5),(-13.5,3.65,1.20,-.7),
            (7.8,3.65,1.20,-.7),(10.2,3.0,1.55,-.6),(14.8,2.6,1.70,-.55),(17.85,.8,1.0,-.15)],bevel=.10)
        # The six existing baskets stay; their deck seats become cut wells and
        # curved outer reinforcement straps replace the blank full-width bow plate.
        for row,z in enumerate((-1.95,1.95)):
            for i,x in enumerate((-9.2,-2.2,4.8)):
                self.cut(deck,'Barge_BasketSeat_'+str(row)+'_'+str(i),(x,1.2,z),(3.5,1.5,2.95))
                self.box('Barge_BasketSaddle_'+str(row)+'_'+str(i),(3.8,.3,3.15),(x,.30,z),self.M,bevel=.08)
                for side in (-1,1):
                    self.beam('Barge_LoadTie_'+str(row)+'_'+str(i)+'_'+str(side),(x+side*1.5,.9,z-side*.9),
                        (x+side*1.7,2.4,z-side*1.5),.12,.18,self.M)
        self.well(deck,'Barge_BowHydraulics',11.8,0,3.1,2.0,1.68,1.0,'receiver')
        for side in (-1,1):
            self.loft('Barge_BowWearCheek_'+str(side),[(9.3,.32,1.7,1.45),(12,.42,1.85,1.5),
                (15.5,.25,1.7,1.4)],self.M,z=side*1.7,bevel=.05)
        for i,x in enumerate((-12.5,-5.7,1.3,8.2)):
            self.box('Barge_TransverseLoadMember_'+str(i),(.30,.5,7.0),(x,.4,0),self.M,bevel=.04)

def imported_contract(key):
    source=ROOT/'assets'/'ships'/'parts'/'wholeships'/f'{key}.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    mats={name:bpy.data.materials.get(name) for name in fleet.CANONICAL_MATERIAL_NAMES}
    if not all(mats.values()):
        raise RuntimeError('Source canonical materials missing: '+str({k:bool(v) for k,v in mats.items()}))
    # Blender's glTF import gives packed ORM image nodes generic names. Preserve
    # their real bound channel graph and make its AO semantic visible to the shared
    # exporter (which otherwise recognizes only an AO image-node name).
    for mat in mats.values():
        mat['spacefaceRemasterGeometry']=True
        for node in mat.node_tree.nodes:
            if node.type=='GROUP' and node.inputs.get('Occlusion') and node.inputs['Occlusion'].is_linked:
                channel=node.inputs['Occlusion'].links[0].from_node
                for socket in channel.inputs:
                    if socket.is_linked and socket.links[0].from_node.type=='TEX_IMAGE':
                        socket.links[0].from_node.name='Baked_AO_Roughness_Metallic'
    helpers=[o for o in bpy.data.objects if o.name.startswith('SOCKET_') or o.name=='COLLISION_HULL']
    for o in helpers:
        world=o.matrix_world.copy(); o.parent=None; o.matrix_world=world
        if o.type=='MESH':
            o.data.materials.clear();o.data.materials.append(mats['Material_Hull'])
    for o in list(bpy.data.objects):
        if o not in helpers: bpy.data.objects.remove(o,do_unlink=True)
    return source,mats,helpers

def render_candidate(key,path,close_only=False):
    # Reload exact exported bytes before judging; avoid authoring/export mismatch.
    fleet.reset_scene(); bpy.ops.import_scene.gltf(filepath=str(path))
    for o in bpy.data.objects:
        if o.type=='MESH':
            o.hide_render = not o.name.startswith('LOD0_')
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=12
    scene.cycles.use_denoising=True; scene.render.resolution_x=1440; scene.render.resolution_y=900
    scene.render.resolution_percentage=100; scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('Helios_PooledInk');scene.world.color=(.09,.08,.12)
    scene.view_settings.view_transform='AgX'
    for name,loc,color,power,size in [('warm',(15,10,35),(1,.79,.57),3500,20),
            ('cool',(-15,-10,18),(.31,.52,1),2200,16),('rim',(-10,15,7),(1,.53,.25),1400,10)]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
        o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
        o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    cam=bpy.data.objects.new('ChaseCamera',bpy.data.cameras.new('ChaseCamera'));scene.collection.objects.link(cam);scene.camera=cam
    for label,d,h in ([('close',58,0)] if close_only else [('chase',144,0),('abeam',144,90),('close',58,0)]):
        apply_chase_camera(cam,distance=d,heading_deg=h)
        scene.render.filepath=str(OUT/f'{key}-{label}.png'); bpy.ops.render.render(write_still=True)

def build(key,render=False):
    fleet.reset_scene()
    source,mats,helpers=imported_contract(key)
    source_hash=sha(source)
    coll=fleet.new_collection(key+'_EDITABLE_COMPONENTS')
    parts=fleet.SHIP_BUILDERS[key](coll,mats)
    rw=Rework(key,parts,coll,mats);getattr(rw,key)()
    export_coll=fleet.new_collection(key+'_EXPORT')
    root=bpy.data.objects.new(fleet.SHIP_SPECS[key]['rootName'],None);export_coll.objects.link(root)
    root['spacefaceAsset']={**fleet.SHIP_SPECS[key],'heliosRemaster':True}
    for o in helpers: fleet.move_to_collection(o,export_coll);fleet.set_parent_keep_world(o,root)
    targets=[];stats=[]
    # Preserve all meso construction in LOD1. The old close-only cull erased the
    # occupation at normal distance; only insignificant screws remain LOD0-only.
    for lod,ratio,drop in [('lod0',1.,False),('lod1',.62,False),('lod2',.30,True)]:
        _,objs,st=fleet.build_lod_collection(parts,lod,ratio,drop,mats)
        for o in objs:fleet.set_parent_keep_world(o,root);fleet.move_to_collection(o,export_coll)
        targets.extend(objs);stats.append(st)
    for o in parts:o.hide_render=True;o.hide_set(True)
    export_objects=[root]+helpers+targets
    out=OUT/f'{key}.glb'
    # Use the shared contract exporter; restore source asset metadata below with
    # the established family metadata stamper, including packed ORM assignments.
    spaceface_export.export_gltf(str(out),{'id':key,'kind':'wholeship','forward':'+X','up':'+Y',
        'starboard':'+Z','unit':'metre','chamfered':True},export_objects)
    meta=fleet.stamp_glb_metadata(out,fleet.SHIP_SPECS[key],stats)
    for o in helpers:
        if o.name=='COLLISION_HULL':o.hide_render=True;o.hide_set(True)
    for o in targets:o.hide_render=not o.name.startswith('LOD0_');o.hide_set(not o.name.startswith('LOD0_'))
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.shading.type='MATERIAL'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{key}.blend'))
    report={'id':key,'source':str(source.relative_to(ROOT)),'sourceSha256':source_hash,
        'candidate':str(out.relative_to(ROOT)),'candidateSha256':sha(out),'bytes':out.stat().st_size,
        'builderSha256':sha(__file__),'construction':rw.changed,'lods':stats,'metadata':meta,
        'reviewState':'candidate awaiting controller review'}
    (OUT/f'{key}.json').write_text(json.dumps(report,indent=2)+'\n')
    print('HELIOS_CANDIDATE '+json.dumps({'id':key,'hash':sha(out),'tris':[s['triangles'] for s in stats]}),flush=True)
    if render:render_candidate(key,out)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--only',choices=IDS);p.add_argument('--skip',default='');p.add_argument('--render',action='store_true');p.add_argument('--render-only',action='store_true')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True,exist_ok=True)
    for key in ([args.only] if args.only else IDS):
        if key in args.skip.split(','):continue
        if args.render_only:render_candidate(key,OUT/f'{key}.glb')
        else:build(key,args.render)
