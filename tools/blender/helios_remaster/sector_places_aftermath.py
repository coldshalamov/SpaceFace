"""Manufactured aftermath components, remastered in the inherited body envelopes.

The original pack supplies pivots, sockets, remnant identities and service history.
This pass replaces the six weak primary primitives with open, thick assemblies.
"""
import math
import bpy
from mathutils import Vector

class Craft:
    def __init__(self,base,p,objects):
        self.b,self.p,self.objects=base,p,objects
        self.original={o.name:o for o in objects}
        self.created=[]

    def at(self,name):
        a,b=self.b.bounds(self.original[name]);return (a+b)*.5

    def remove(self,*prefixes):
        for o in list(self.objects):
            if any(o.name==p or o.name.startswith(p+'__') or (p.endswith('*') and o.name.startswith(p[:-1])) for p in prefixes):
                self.objects.remove(o);bpy.data.objects.remove(o,do_unlink=True)

    def mesh(self,name,vertices,faces,mat='alloy',thickness=0):
        obj=self.b.mesh('Craft_'+name,vertices,faces,self.p[mat])
        if thickness:
            mod=obj.modifiers.new('Manufactured wall thickness','SOLIDIFY');mod.thickness=thickness
            bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
        self.created.append(obj);return obj

    def beam(self,name,a,b,w,d,mat='alloy'):
        obj=self.b.beam('Craft_'+name,a,b,w,d,self.p[mat]);self.created.append(obj);return obj

    def box(self,name,center,size,mat='alloy',edge=.04):
        obj=self.b.box('Craft_'+name,center,size,self.p[mat],edge);self.created.append(obj);return obj

    def tube(self,name,center,length,ro,ri,mat='alloy',axis='X',segments=24,flare=1):
        obj=self.b.tube('Craft_'+name,center,length,ro,ri,self.p[mat],axis,segments,flare);self.created.append(obj);return obj

    def shell(self,name,origin,stations,mat='blue',start=0,end=math.tau,segments=24,thick=.16,omit=None):
        """Rolled shell from explicit axial stations, with interior and torn openings."""
        verts=[];faces=[];steps=segments+1
        for inner in (False,True):
            for x,r in stations:
                for i in range(steps):
                    a=start+(end-start)*i/segments;rr=max(.03,r-thick if inner else r)
                    verts.append(tuple(origin+Vector((x,math.cos(a)*rr,math.sin(a)*rr))))
        layer=len(stations)*steps
        for j in range(len(stations)-1):
            for i in range(segments):
                angle=start+(end-start)*(i+.5)/segments
                if omit and omit(j,i,angle):continue
                a=j*steps+i;b=a+1;c=(j+1)*steps+i+1;d=c-1
                faces.extend([(a,b,c,d),(a+layer,d+layer,c+layer,b+layer)])
                # Exposed broken edge has a physical wall. Shared edges are harmless
                # interior boundaries but remain closed and correctly shaded.
                for u,v in ((a,b),(b,c),(c,d),(d,a)):faces.append((u,v,v+layer,u+layer))
        return self.mesh(name,verts,faces,mat)

    def rib(self,name,origin,x,r,mat='alloy',start=0,end=math.tau):
        return self.shell(name,origin,[(x-.10,r),(x+.10,r)],mat,start,end,24,.22)

    def plate(self,name,points,mat='blue',thick=.13):
        return self.mesh(name,points,[tuple(range(len(points)))],mat,thick)

    def corrugated(self,name,xs,edge_a,edge_b,offset,mat='blue'):
        vertices=[]
        for i,x in enumerate(xs):
            bulge=.16 if i%4 in (1,2) else 0
            a=Vector((x,edge_a[0],edge_a[1]));b=Vector((x,edge_b[0],edge_b[1]))
            a+=Vector(offset)*bulge;b+=Vector(offset)*bulge
            vertices.extend((tuple(a),tuple(b)))
        return self.mesh(name,vertices,[(i*2,i*2+2,i*2+3,i*2+1) for i in range(len(xs)-1)],mat,.12)

    def i_beam(self,name,a,b,width,height,mat='alloy'):
        a,b=Vector(a),Vector(b);length=(b-a).length
        direction=(b-a).normalized();side=Vector((0,1,0));up=direction.cross(side).normalized()
        if up.length<.1:side=Vector((1,0,0));up=direction.cross(side).normalized()
        side=up.cross(direction).normalized()
        # Explicit side/up sections keep a wide flange horizontal. A generic
        # track-to beam swaps these dimensions when its length lies on X.
        for sign in (-1,1):
            vertices=[]
            for endpoint in (a,b):
                for ss,uu in ((-1,-1),(1,-1),(1,1),(-1,1)):
                    vertices.append(tuple(endpoint+side*width*.5*ss+up*(height*.5*sign+height*.065*uu)))
            self.mesh(name+'_flange',vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
        # Web is a plate between flanges, leaving the manufactured I-section visible.
        self.plate(name+'_web',[tuple(a+up*height*.45),tuple(b+up*height*.45),tuple(b-up*height*.45),tuple(a-up*height*.45)],mat,height*.12)

def cargo(a):
    origin=a.at('ac_box');a.remove('ac_box','ac_rib_*','ac_petal_*','tear_seam_*')
    X=lambda x,y,z:tuple(origin+Vector((x,y,z)))
    # Open end and broken roof reveal the dimensional structural cage.
    for y in (-3.12,3.12):
        for z in (-3.05,3.05):a.i_beam('CargoCornerRail',X(-6.3,y,z),X(6.2,y,z),.30,.36)
    for x in (-6.25,-2.2,2.3,6.18):
        for y in (-3.1,3.1):a.i_beam('CargoUpright',X(x,y,-3),X(x,y,3),.28,.34)
        a.i_beam('CargoRoofBow',X(x,-3.1,3.0),X(x,3.1,3.0),.28,.31)
        a.i_beam('CargoFloorBearer',X(x,-3.1,-3),X(x,3.1,-3),.26,.32)
    # Long wall survives as folded corrugation, opposite wall is peeled down.
    xs=[-6.0+i*.24 for i in range(51)]
    for sign in (-1,1):
        verts=[]
        for i,x in enumerate(xs):
            y=sign*(3.0+(0.16 if i%4 in (1,2) else 0))
            top=2.8 if sign<0 else (2.45 if x<-1.7 else -.65+.38*math.sin(x*2.4))
            verts.extend((X(x,y,-2.9),X(x,y,top)))
        a.mesh('CargoCorrugatedWall',verts,[(2*i,2*i+2,2*i+3,2*i+1) for i in range(50)],'ochre',.11)
    # Only two roof panels remain; the opening is real and contains a retained cargo bed.
    for x0,x1 in ((-6.0,-2.45),(2.7,6.0)):
        a.plate('CargoSurvivingRoof',[X(x0,-2.95,2.88),X(x1,-2.95,2.88),X(x1,.2,2.88),X(x0,.2,2.88)],'blue')
    a.plate('CargoInteriorFloor',[X(-6,-2.9,-2.82),X(5.9,-2.9,-2.82),X(5.7,2.8,-2.8),X(-5.7,2.85,-2.82)],'ink')
    for x in (-4.8,-3,-1.2,.6,2.4,4.2):a.beam('CargoFloorRunner',X(x,-2.7,-2.64),X(x,2.7,-2.64),.14,.16)
    for sign in (-1,1):
        points=[X(-1.9,sign*3,-2.9),X(3.7,sign*3,-2.9),X(4.2,sign*4.2,-3.8),X(2.2,sign*5.3,-4.55),X(-.9,sign*4.8,-4.15)]
        a.plate('CargoPeeledSheet',points,'ochre',.12)
        a.beam('CargoShearedFold',points[0],points[2],.13,.20)

def cockpit(a):
    origin=a.at('ak_cabin')-Vector((-2,0,.2));a.remove('ak_cabin','ak_nose','ak_canopy','ak_canopy_side','break_aft_*')
    X=lambda x,y,z:tuple(origin+Vector((x,y,z)))
    # Faceted pressure shell: tapered nose, chamfered shoulders, open fractured stern.
    stations=[(-5.0,2.5,1.35),(-2.8,2.5,1.65),(.55,2.25,1.45),(2.2,1.9,1.1),(5.5,.80,.38),(7.4,.25,.18)]
    for side in (-1,1):
        verts=[]
        for x,w,h in stations:
            verts.extend((X(x,side*w*.78,-1.55),X(x,side*w,-.8),X(x,side*w,h*.46),X(x,side*w*.76,h)))
        faces=[]
        for i in range(len(stations)-1):
            for k in range(3):faces.append((i*4+k,(i+1)*4+k,(i+1)*4+k+1,i*4+k+1))
        a.mesh('CockpitPressureCheek',verts,faces,'blue',.19)
    # Exposed frame follows the glass footprint; one panel is a surviving dark shard.
    for x,w,h in stations[:4]:
        a.beam('CanopyFrameBow',X(x,-w*.76,h),X(x,w*.76,h),.17,.19)
    for side in (-1,1):
        for i in range(3):
            x,w,h=stations[i];xx,ww,hh=stations[i+1]
            a.beam('CanopyLongeron',X(x,side*w*.76,h),X(xx,side*ww*.76,hh),.17,.19)
    a.plate('SurvivingCanopyShard',[X(-2.72,-1.84,1.62),X(.4,-1.67,1.46),X(-.15,.55,1.45),X(-1.62,.88,1.57)],'mint',.065)
    a.plate('CockpitNoseBonnet',[X(.60,-1.65,1.42),X(2.2,-1.46,1.1),X(7.4,-.19,.18),X(7.4,.19,.18),X(2.2,1.46,1.1),X(.6,1.65,1.42)],'ivory',.16)
    # Torn deck with load runners and two exposed pressure bulkhead hoops.
    a.plate('CockpitTornFloor',[X(-7.2,-1.7,-1.8),X(-5,-2.0,-1.45),X(2.1,-1.45,-1.40),X(2.1,1.45,-1.40),X(-5,1.9,-1.45),X(-7.7,.8,-2.15),X(-6.6,-.2,-1.87)],'alloy',.19)
    for y in (-1.45,1.45):a.i_beam('CockpitKeelRunner',X(-7.1,y,-1.6),X(3.2,y,-1.42),.26,.33)
    for x in (-4.75,-2.80):
        for side in (-1,1):a.beam('CockpitPressureFrame',X(x,side*1.9,-1.4),X(x,side*2.30,1.0),.18,.23)
    a.box('BlackBoxProtectedSocket',X(-3.4,.80,-1.12),(1.1,.60,.33),'ochre',.05)

def engine(a):
    origin=a.at('ae_block');a.remove('ae_block','ae_bell','ae_bellring','ae_fire','crack_*')
    # A nozzle is a thin wall with an interior, not an opaque cone. One side is
    # fractured so the grazing camera can see both surfaces and the inner throat.
    a.shell('EngineNozzleBell',origin,[(-10.5,4.35),(-9.5,4.20),(-8.0,3.65),(-6.4,2.75),(-4.55,1.85)],'alloy',segments=32,thick=.20,
            omit=lambda j,i,t:j<2 and 0.92<t<1.52)
    a.shell('NozzleCeramicLiner',origin,[(-10.1,4.05),(-8.0,3.34),(-6.0,2.37),(-4.3,1.57)],'char',segments=28,thick=.12)
    a.rib('NozzleLipBacking',origin,-10.40,4.43,'alloy',start=1.62,end=math.tau+.82)
    # Dark reaction chamber remains inside separate curved jacket panels.
    a.shell('EngineReactionChamber',origin,[(-4,2.42),(0,2.47),(3.80,2.2)],'ink',segments=24,thick=.19)
    for i in range(7):
        angle=i*math.tau/8
        if i==2:continue
        a.shell('EngineRemovableJacket'+str(i),origin,[(-3.85,3.12),(-2.8,3.40),(.8,3.28),(3.2,2.84)],'blue' if i%3 else 'ochre',
            start=angle+.065,end=angle+math.tau/8-.065,segments=4,thick=.18)
    for x in (-3.65,-.4,2.6):a.rib('EnginePressureClamp',origin,x,3.43,'alloy',start=.13,end=math.tau-.13)
    a.rib('EngineExposedTurbineRim',origin,3.48,2.38,'alloy')
    for i in range(15):
        t=math.tau*i/15
        a.beam('EngineStatorVane',tuple(origin+Vector((3.35,math.cos(t)*2.27,math.sin(t)*2.27))),tuple(origin+Vector((3.63,math.cos(t+.23)*1.12,math.sin(t+.23)*1.12))),.18,.30)
    a.tube('EngineBearingHub',tuple(origin+Vector((3.45,0,0))),.8,1.15,.7,'ochre')
    for side in (-1,1):
        a.i_beam('EngineTornMount',tuple(origin+Vector((1.4,side*2.45,-2.45))),tuple(origin+Vector((5.4,side*2.55,-2.35))),.43,.66)

def tank(a):
    origin=a.at('at_shell');a.remove('at_shell','at_dome_*','at_petal_*','at_saddle_*','vent_vent_*')
    stations=[(-8,.30),(-7.5,1.70),(-6.5,2.85),(-4.5,3.60),(-2.2,3.60),(1.9,3.60),(4.5,3.60),(6.5,2.85),(7.5,1.70),(8,.30)]
    a.shell('TankRolledPressureCase',origin,stations,'blue',segments=32,thick=.19,
            omit=lambda j,i,t:j in (4,5) and .40<t<2.48)
    # The remaining dark inner wall reads through the missing top sheet.
    for x in (-4.45,4.45):a.rib('TankHeadWeld',origin,x,3.64,'alloy')
    for side in (-1,1):
        t=.43 if side==1 else 2.46
        verts=[]
        for x in (-2.2,-1.35,.1,1.4,3.9):
            rr=3.58+.10*math.sin(x*2.7)
            for dt,dr in ((0,0),(-side*.16,.38),(-side*.30,.27)):
                verts.append(tuple(origin+Vector((x,math.cos(t+dt)*(rr+dr),math.sin(t+dt)*(rr+dr)))))
        faces=[(i*3+k,(i+1)*3+k,(i+1)*3+k+1,i*3+k+1) for i in range(4) for k in range(2)]
        a.mesh('TankCurledRuptureLip',verts,faces,'alloy',.16)
    for x in (-3,3):
        a.shell('TankFormedSupportSaddle',origin,[(x-.42,3.90),(x+.42,3.90)],'alloy',start=math.pi,end=math.tau,segments=16,thick=.30)
        a.box('TankSaddleFoot',tuple(origin+Vector((x,0,-3.92))),(.95,6.5,.45),'ink',.07)
    a.tube('TankShearedValve',tuple(origin+Vector((5.25,0,3.04))),.63,.53,.32,'alloy','Z',16)
    a.tube('TankValveRootFlange',tuple(origin+Vector((5.25,0,2.80))),.20,.74,.36,'ochre','Z',16)

def turret(a):
    origin=a.at('cvt_house');a.remove('cvt_house','cvt_ring','shear_rib_*','shear_tear_*')
    X=lambda x,y,z:tuple(origin+Vector((x,y,z)))
    # A sheared bearing carries two armored cheeks around the open recoil cradle.
    a.shell('TurretBrokenBearing',Vector((0,0,0)),[(-.45,4.35),(.45,4.35)],'alloy',start=.35,end=math.tau-.35,segments=28,thick=.52)
    bearing=a.created[-1]
    # Shell helper is X-axis. Rotate the bearing into the inherited horizontal Z plane.
    from mathutils import Matrix
    bearing.data.transform(Matrix.Translation(origin+Vector((0,0,-1.8)))@Matrix.Rotation(math.pi*.5,4,'Y'))
    for side in (-1,1):
        pts=[X(-3.35,side*.68,-1.15),X(-3.2,side*2.8,-1.0),X(-2.3,side*2.9,1.15),X(.95,side*2.55,1.36),X(3.45,side*1.45,.60),X(3.25,side*.64,-.4)]
        a.plate('TurretCastArmorCheek',pts,'blue',.42)
        a.beam('TurretRecoilRail',X(-2.7,side*.77,-.08),X(2.8,side*.77,.20),.25,.28)
        a.tube('TurretRecoilCylinder',X(-.6,side*1.30,.25),3.5,.37,.23,'alloy')
    for x in (-2.5,.6):a.box('TurretCrossCradle',X(x,0,-.46),(.52,2.45,.43),'ochre',.08)
    for i in range(10):
        t=.6+i*(math.tau-1.2)/9
        a.beam('TurretShearedBearingTooth',X(math.cos(t)*4.1,math.sin(t)*4.1,-1.75),X(math.cos(t)*4.12,math.sin(t)*4.12,-2.6-.22*math.sin(i)),.28,.31)
    barrel=a.original.get('cvt_gun')
    if barrel:
        lo,hi=a.b.bounds(barrel);c=(lo+hi)*.5
        a.tube('TurretMuzzleBore',(hi.x-.08,c.y,c.z),.44,.65,.40,'ink',segments=16)

def spar(a):
    origin=a.at('as_spar');housing=a.at('as_housing');a.remove('as_spar','as_housing','as_rib_*','break_root_*','tear_tip_*')
    X=lambda x,y,z:tuple(origin+Vector((x,y,z)))
    a.i_beam('SparPrimaryISection',X(-8.45,0,0),X(8.3,0,.1),2.3,1.62)
    for x in (-6.3,-3.5,-.5,2.5,5.2):
        for side in (-1,1):a.plate('SparTriangularWebStiffener',[X(x,0,-.65),X(x,side*1.02,-.65),X(x,side*.85,.64),X(x,0,.64)],'blue',.14)
    # Missing top flange at the root shows layered torn web and load transition.
    a.plate('SparPeeledRootFlange',[X(7.5,-1.1,.86),X(10.6,-.9,1.35),X(12.0,.15,1.60),X(10.2,.92,1.07),X(7.5,1.1,.86)],'alloy',.15)
    for side in (-1,1):
        c=housing+Vector((0,side*.65,0))
        a.box('SparReceiverCheek',tuple(c),(3.6,.48,1.1),'blue',.12)
        a.tube('SparExposedReceiverBearing',tuple(housing+Vector((-.85,side*.55,.3))),.48,.42,.23,'alloy')
    a.box('SparReceiverBed',tuple(housing+Vector((0,0,-.55))),(3.75,1.8,.26),'ink',.05)
    barrel=a.original.get('as_barrel')
    if barrel:
        lo,hi=a.b.bounds(barrel);c=(lo+hi)*.5;a.tube('SparOpenBore',(lo.x+.07,c.y,c.z),.34,.50,.31,'ink',segments=16)

def rebuild(name,objects,p,base):
    craft=Craft(base,p,objects)
    builder={'place_aftermath_aft_cargo_module':cargo,'place_aftermath_aft_cockpit_section':cockpit,
       'place_aftermath_aft_engine_section':engine,'place_aftermath_aft_pressure_tank':tank,
       'place_aftermath_wreck_corvette_turret':turret,'place_aftermath_aft_weapon_spar':spar}[name]
    builder(craft)
    return [{'component':'primary manufactured assembly','rebuilt':builder.__name__,
       'construction':'Open structural sections, rooted interfaces, visible wall thickness and sheared load paths; inherited socket/origin unchanged.'}]
