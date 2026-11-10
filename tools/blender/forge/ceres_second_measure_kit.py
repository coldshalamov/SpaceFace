"""Second Measure: stripped freighter, three islands.

P03 commissioned industrial hull, independent of the canon-bound Wreck Cathedral.
All design coordinates below are runtime WU. Conversion is applied exactly once:
Blender metres=(X/2,-Z/2,Y/2); exported glTF metres=(X/2,Y/2,Z/2).
The shell never includes the three removable sections. Do not convexify this hull.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import forge as F
import forge_export as E

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SCALE=2.0
COLORS={'paint':'#526568','paint2':'#313d46','stripe':'#926028',
        'dark':'#131c24','gunmetal':'#3b474c','bare':'#82938f','hazard':'#997029',
        'glow_amber':'#d58c35'}
PARTS={
 'shell':('place_ceres_second_measure','CeresSecondMeasure',(0,0,0),None),
 'long_plate':('place_ceres_second_measure_long_plate','CeresSecondMeasureLongPlate',(-80,0,0),(18,10,110)),
 'crossbeam':('place_ceres_second_measure_crossbeam','CeresSecondMeasureCrossbeam',(80,0,0),(18,12,110)),
 'keel':('place_ceres_second_measure_keel','CeresSecondMeasureKeel',(0,0,70),(70,12,20)),
}
PASSAGES=[{'id':'aft','x':[-112,-48],'z':[-70,70]}, {'id':'fore','x':[48,112],'z':[-70,70]}]
SUPPORTS={'SOCKET_Support_A':(-118,0,-55),'SOCKET_Support_B':(118,0,-55),
          'SOCKET_Support_C':(40.5,0,95),'SOCKET_Structure_Core':(0,0,0)}

def pos(p):return (p[0]/SCALE,-p[2]/SCALE,p[1]/SCALE)
def size(p):return (p[0]/SCALE,p[2]/SCALE,p[1]/SCALE)
def box(s,n,p,d,mat='paint2',bevel=.3):
    return F.box(s,n,pos(p),size(d),mat,bevel=bevel/SCALE,uv_scale=.35)
def beams(s,n,segs,w=2,mat='gunmetal'):
    return F.beams(s,n,[(pos(a),pos(b)) for a,b in segs],w/SCALE,mat,bevel=.08,uv_scale=.35)
def proxy(s,n,p,d):
    s.contract['collision']['boxes'].append({'name':n,'centerWU':list(p),'sizeWU':list(d),
        'centerBlender':list(pos(p)),'sizeBlender':list(size(d))})
def socket(s,n,p):s.socket(n,pos(p),(0,0,1));s.socket_names.append(n)
def spec(part,live=False):
    pid,file,_,_=PARTS[part]
    return {'layout':'place','file':pid if live else file,'part_id':pid,'asset_id':'SF_'+pid.upper(),
            'new_place':True,'no_collision':True}

def new_ship(part,reset=True):
    if reset:F.reset_scene()
    s=F.Ship(PARTS[part][0],COLORS);s.socket_names=[]
    s.contract={'schema':'spaceface.ceresSecondMeasure.v1','part':part,'sourceScale':SCALE,
        'origin':'authored center; never recenter from bounds','mountedCenterWU':PARTS[part][2],
        'dimensionsWU':PARTS[part][3], 'axesBlender':'+X nose,+Y port,+Z up',
        'axesRuntime':'+X nose,+Y up,+Z starboard',
        'collision':{'kind':'bounded-box-compound','units':'WU','boxes':[],
            'passages':PASSAGES if part=='shell' else [],'neverUseConvexHull':part=='shell',
            'clearExitRaysWU':([{'x':[-112,-48],'z':[-200,200]},
                {'x':[48,112],'z':[-200,200]},{'x':[-35,35],'z':[60,200]}] if part=='shell' else [])},
        'family':'Second Measure retired industrial freighter; not Concord Vigilant',
        'fracture':'cold bare scalloped structural cross sections; no emissive cut seam',
        'states':['mounted','released','recovered'] if part!='shell' else ['stripped-shell'],
        'runtimePhysicsAuthority':'Ceres shipbreak owner; visual LOD never changes collision'}
    return s

def _rib(s,name,x,r=62,notch=False):
    # A real open U frame: no opaque cross section and no top cap.
    pts=[(x,16,-r),(x,2,-r-4),(x,-13,-r*.8),(x,-20,-r*.42),
         (x,-22,0),(x,-20,r*.42),(x,-13,r*.8),(x,2,r+4),(x,16,r)]
    if notch:pts=[(a,b,min(c,57)) for a,b,c in pts]
    beams(s,name,list(zip(pts,pts[1:])),3.2,'gunmetal')
    # Reinforced flange strips run alongside each rib and catch the chase light.
    for dx in (-2.1,2.1):
        pp=[(a+dx,b,c) for a,b,c in pts]
        beams(s,name+'Flange'+str(dx),list(zip(pp,pp[1:])),1.0,'bare')

def shell(reset=True):
    s=new_ship('shell',reset)
    # Three local hull bays retain interrupted starboard gantry segments. The
    # removable shear tabs initially bridge the cuts; permanent geometry cannot
    # bridge the routes again. After release these are braced wreck islands.
    bays=[(-180,-114),(-46,46),(114,180)]
    for bi,(a,b) in enumerate(bays):
        length=b-a;cx=(a+b)/2
        if bi==1:
            proxy(s,'bay-1-main',(0,-1,-5),(92,60,130))
            for side in (-1,1):proxy(s,'keel-shoulder'+str(side),(side*40.5,-1,79.5),(11,46,39))
        else:proxy(s,f'bay-{bi}',(cx,-1,14.5),(length,46,169))
        for x in (a+5,a+length*.34,a+length*.67,b-5):
            r=62
            _rib(s,f'OpenRib{bi}_{x}',x,r,notch=bi==1 and abs(x)<35)
        # Exposed two-tier deck shelves, separated by a dark central service well.
        for side in (-1,1):
            z=side*38
            if bi==2:
                polygon=[(a+2,side*20),(b-2,side*20),(b-2,side*38),(b-18,side*56),(a+2,side*56)]
                outline=[(x/SCALE,-zz/SCALE) for x,zz in polygon]
                if side==1:outline.reverse()
                F.plate(s,f'Deck{bi}_{side}',outline,-14.5/SCALE,3/SCALE,'paint',chamfer=.45,bevel=.14,uv_scale=.35)
            else:box(s,f'Deck{bi}_{side}',(cx,-13,z),(length-4,3,36),'paint',.7)
            beams(s,f'DeckEdge{bi}_{side}',[((a+2,-10,side*23),(b-2,-10,side*23))],2.0,'stripe')
            # Faceted side shell made as a manufactured chamfered plate; upper
            # shoulder remains absent so rib topology reads at gameplay scale.
            for j in range(0 if bi==1 and side==1 else 3):
                xx=a+4+(j+.5)*(length-8)/3
                box(s,f'ShellTile{bi}_{side}_{j}',(xx,-5,side*61),((length-12)/3,15,5),'paint',1)
            if not (bi==1 and side==1):beams(s,f'Gunwale{bi}_{side}',[((a+2,8,side*66),(b-2,8,side*66))],3.3,'paint2')
        # Mechanical lower spine and interrupted deck equipment lie only in bays.
        F.truss(s,f'BaySpine{bi}',pos((a+2,-18,0)),pos((b-2,-18,0)),5/SCALE,5,
                material='gunmetal',chord=.55,web=.3,uv_scale=.35)
        for j in range(3):
            xx=a+12+j*(length-24)/2
            box(s,f'DeckMachinery{bi}_{j}',(xx,-8,42),(9,8,12),'dark',.6)
            box(s,f'RaisedServiceLid{bi}_{j}',(xx,-3.8,42),(7,.6,10),'paint2',.15)
        # Stripe band on a real casing, subordinate to the silhouette.
        box(s,f'IdentityCollar{bi}',(cx,4,-63),(length*.45,5,5.3),'stripe',.6)
        s.detail=1
        for j in range(7):
            xx=a+5+j*(length-10)/6
            box(s,f'DeckTie{bi}_{j}',(xx,-10.9,-38),(.65,.7,32),'bare',.08)
        s.detail=0
    # Previously continuous spine is already severed at both work windows.
    # Permanent intact crossbars would turn the supposed passages into traps.
    # Central bay also has a keel exit: the small shoulder ends do not bridge it.
    for i,(a,b) in enumerate(((-175,-119),(-44,-37),(37,44),(119,175))):
        F.truss(s,'OutboardSurvivorSpine'+str(i),pos((a,-3,92)),pos((b,-3,92)),10/SCALE,
                max(1,round((b-a)/22)),material='paint2',chord=1.1,web=.65,uv_scale=.35)
    for x in (-145,-40.5,40.5,145):
        beams(s,'SpineKnee'+str(x),[((x,-12,59),(x,-6,88)),((x,8,64),(x,-1,89))],4,'gunmetal')
        box(s,'SpineCollar'+str(x),(x,-3,92),(8,14,14),'stripe',.7)
    # Matching fixed shear collars terminate exactly on the passage boundaries.
    # The interlocking profile belongs to the detachable tab up to that plane.
    for x,interior in ((-114,-1),(-46,1),(46,-1),(114,1)):
        for z in (-48,48):
            box(s,f'FixedShearCollar{x}_{z}',(x+interior*2,0,z),(4,9,10),'paint2',.3)
            box(s,f'FixedBareCut{x}_{z}',(x+interior*.16,0,z),(.32,6,8),'bare',.04)
    for side in (-1,1):
        box(s,'KeelFixedCollar'+str(side),(side*39,0,70),(8,12,20),'paint2',.4)
        box(s,'KeelFixedCut'+str(side),(side*35.16,0,70),(.32,12,20),'bare',.04)
    # The former freighter's axial load spine is intentionally interrupted at
    # both 68-WU cut passages. Every segment belongs to one existing island.
    for bi,(a,b) in enumerate(bays):
        box(s,'AxialKeelWeb'+str(bi),((a+b)/2,-13,0),(b-a-4,12,8),'paint2',.5)
        box(s,'AxialKeelCrown'+str(bi),((a+b)/2,-6.2,0),(b-a-4,1.6,14),'bare',.25)
        for x in (a+8,b-8):
            beams(s,'SpineGusset'+str(x),[((x,-6,0),(x,-11,-23)),((x,-6,0),(x,-11,23))],3,'gunmetal')
    # Bow is the remaining armored collision prow, not another shelf bay.
    # It tapers inside the occupied fore island; the detachable corridors remain
    # untouched. The center remains a closed shell, never a false flying hole.
    F.loft(s,'FreighterCollisionProw',[
        dict(x=x/2,w=w/2,ht=ht/2,hb=7/2,zc=1/2,n=3.4)
        for x,w,ht in [(148,24,8),(160,30,13),(173,18,11),(179,6,5)]],
        material='paint',belly='paint2',count=24,bevel=.22,uv_scale=.35)
    F.band(s,'FreighterCollisionProw',(167/2,0,0),(1,0,0),3,'stripe',facing=(0,0,1))
    for side in (-1,1):
        beams(s,'ProwLoadKnee'+str(side),[((150,-5,side*23),(157,7,side*27)),
            ((157,7,side*27),(175,5,side*12))],3.8,'bare')
    # Two broad empty engine sockets terminate in blind dark service bulkheads.
    # These are dead freighter engines rather than illuminated working drives.
    for side in (-1,1):
        z=side*31
        F.cylinder(s,'SternEngineSeat'+str(side),pos((-177,-3,z)),pos((-158,-3,z)),
            10.3,9.0,material='paint2',segments=20,cap=False,bevel=.23,uv_scale=.35)
        F.cylinder(s,'SternDeadCore'+str(side),pos((-160,-3,z)),pos((-158.5,-3,z)),
            8.7,material='dark',segments=20,bevel=.06,uv_scale=.35)
        F.cylinder(s,'SternMountRing'+str(side),pos((-178,-3,z)),pos((-176,-3,z)),
            10.7,material='bare',segments=20,cap=False,bevel=.12,uv_scale=.35)
        beams(s,'EngineSaddle'+str(side),[((-158,-14,z-18),(-162,-8,z-11)),
            ((-158,-14,z+18),(-162,-8,z+11))],3.5,'gunmetal')
    box(s,'AftThrustTransom',(-151,-4,0),(8,16,104),'paint2',.6)
    box(s,'TransomTopFlange',(-151,4.5,0),(11,1.5,104),'bare',.25)
    # Distinct bow jaw and gutted aft machinery, all within the 360-WU length.
    for side in (-1,1):
        beams(s,'BowJaw'+str(side),[((174,-12,side*46),(178.8,0,side*32)),
            ((178.8,0,side*32),(168,15,side*49))],2.0,'bare')
    for x in (-179.5,179.5):
        for side in (-1,1):box(s,f'TerminalCutRim{x}_{side}',(x,-2,side*60),(1,18,8),'bare',.12)
    # Four surviving angled armour shoulders give the stripped freighter a
    # genuine curved hull section. These stop on bay frames, never across cuts.
    for bi,(a,b) in enumerate(bays):
        for side in (-1,1):
            if bi==1 and side==1:continue  # open keel receiving notch
            for j in range(2):
                xx=a+12+j*(b-a-24)
                F.box(s,f'RolledShoulder{bi}_{side}_{j}',pos((xx,8,side*58)),
                      size((16,4,19)),'paint',bevel=.65,
                      rot=(side*math.radians(29),0,0),uv_scale=.35)
    # Bridge remains as a broken offset tower on the central bay, not a roof
    # over either route. No unnecessary living windows on a retired hull.
    box(s,'BridgeFoot',(19,2,-38),(18,19,24),'paint2',1.2)
    box(s,'BridgeCrown',(19,15,-39),(24,8,27),'paint',1.4)
    box(s,'EmptyBridgeGlass',(22,17,-53),(16,3,1),'dark',.1)
    beams(s,'TruncatedAerial',[((11,19,-38),(11,28,-38)),((11,27,-38),(20,27,-38))],1.5,'gunmetal')
    # Upper bridle roots at passage edges. The physical throat stays clear;
    # support sockets are interface markers for separately articulated clamps.
    for tag,x in (('A',-118),('B',118)):
        box(s,'BridleRoot'+tag,(x,8,-55),(6,16,12),'hazard',.7)
        beams(s,'BridleFork'+tag,[((x,18,-61),(x,25,-61)),((x,18,-49),(x,25,-49))],2,'bare')
    box(s,'KeelSupportCleat',(40.5,5,95),(8,8,8),'hazard',.6)
    for n,p in SUPPORTS.items():socket(s,n,p)
    for key,(_,_,center,_) in PARTS.items():
        if key!='shell':socket(s,'SOCKET_Section_'+''.join(w.title() for w in key.split('_')),center)
    for i,p in enumerate(((-118,18,-55),(118,18,-55),(40.5,10,95))):
        F.light(s,'WorkIndicator'+str(i),pos(p),finish='glow_amber',size=.28)
    s.contract['supportSocketsWU']={k:list(v) for k,v in SUPPORTS.items()}
    s.contract['collision']['flightBandYWU']=[-6,6]
    s.contract['contactNote']='Fixed collars occupy island sides only. Four shear tabs travel with each plate/beam; their local X±34 cut faces touch fixed faces. Keel seats between X±35 shoulders in the starboard notch.'
    return s


def fracture_cap(s,name,z,width,height,part):
    # Cut ends expose the actual manufactured section, never a generic solid
    # rectangle pasted across its web channels.
    if part=='long_plate':
        for i in range(5):
            x=-7.2+i*3.6
            box(s,name+'Skin'+str(i),(x,.1,z-(.1 if i%2 else 0)*(1 if z>0 else -1)),(3.45,1.6,.3 if i%2 else .5),'bare',.035)
        for x in (-7.8,7.8):
            box(s,name+'Fold'+str(x),(x,2.3,z),(2.3,4.6,.5),'bare',.04)
            box(s,name+'Return'+str(x),(x*.89,4.6,z),(3.2,.8,.5),'bare',.04)
    else:
        box(s,name+'BottomFlange',(0,-5.15,z),(18,1.7,.5),'bare',.04)
        for x in (-7,7):
            box(s,name+'Cap'+str(x),(x,4.8,z),(4,1.9,.5),'bare',.04)
            box(s,name+'Web'+str(x),(x,0,z),(1.2,8.2,.5),'bare',.04)
    s.contract.setdefault('fractureFaces',[]).append({'name':name,'axis':'Z','positionWU':z,
        'widthWU':width,'heightWU':height,'profile':'exposed folded plate section' if part=='long_plate' else 'exposed girder flanges and vertical webs'})


def section(part,reset=True):
    assert part in PARTS and part!='shell'
    s=new_ship(part,reset);dx,dy,dz=PARTS[part][3]
    if part=='long_plate':
        # A folded hull plate: continuous skin closes the projected collision
        # footprint, while turned-up hems and three hat ribs explain stiffness.
        box(s,'LongSkin',(0,.1,0),(18,1.6,109),'paint',.3)
        for x in (-7.8,7.8):
            box(s,'PlateFoldedHem'+str(x),(x,2.3,0),(2.3,4.6,109),'paint2',.28)
            box(s,'PlateHemReturn'+str(x),(x*.89,4.6,0),(3.2,.8,108.7),'bare',.14)
        for z in (-36,0,36):
            # A shallow trapezoid hat section, flanged into the hull skin.
            outline=[(-8.8,z-3.8),(8.8,z-3.8),(8.8,z+3.8),(-8.8,z+3.8)]
            F.plate(s,'HatRibFlange'+str(z),[(x/2,-zz/2) for x,zz in reversed(outline)],.95/2,.7/2,'paint2',bevel=.09,uv_scale=.35)
            for zz in (z-1.8,z+1.8):
                box(s,'HatRibWeb'+str(z)+str(zz),(0,2.65,zz),(14.2,2.6,.9),'gunmetal',.18)
            box(s,'HatRibCrown'+str(z),(0,4.15,z),(14.2,.85,4.5),'stripe' if z==0 else 'paint2',.22)
        for x in (-5.8,5.8):
            box(s,'UnderSkinStringer'+str(x),(x,-2.65,0),(1.4,4.7,109),'gunmetal',.16)
    elif part=='crossbeam':
        # Exposed-web girder. The broad lower flange remains continuous and
        # truthfully covers the legacy solid plan projection; this is not a lane.
        box(s,'BeamBottomFlange',(0,-5.15,0),(18,1.7,109),'paint2',.24)
        for x in (-7,7):
            box(s,'BeamTopCap'+str(x),(x,4.8,0),(4,1.9,109),'paint',.26)
            box(s,'BeamVerticalWeb'+str(x),(x,0,0),(1.2,8.2,109),'gunmetal',.12)
        # In-plane diagonal webs are supported by visible node diaphragms.
        for z in (-44,-22,0,22,44):
            box(s,'GirderDiaphragm'+str(z),(0,0,z),(15,9,1.4),'paint2',.12)
            box(s,'GirderNodeCap'+str(z),(0,5,z),(17,2,3.0),'stripe' if z==0 else 'bare',.2)
        beams(s,'ExposedDiagonalWeb',[((-6.3 if i%2==0 else 6.3,3.3,z),
            (6.3 if i%2==0 else -6.3,3.3,z+22)) for i,z in enumerate((-44,-22,0,22))],1.7,'bare')
        box(s,'GirderLowerCenterRib',(0,-2.3,0),(2.4,4,108),'gunmetal',.14)
    else:
        # Deep closed box keel with a raised central load spine, two side
        # channels and transverse welded diaphragms, unlike a hull plate.
        box(s,'KeelSolePlate',(0,-5.4,0),(69,1.2,20),'paint2',.18)
        for z in (-8.5,8.5):
            box(s,'KeelSideWall'+str(z),(0,0,z),(69,10.8,3),'paint2',.32)
            box(s,'KeelShoulderFlange'+str(z),(0,4.8,z*.83),(69,1.8,5.8),'paint',.3)
        box(s,'KeelCentralBox',(0,-.2,0),(68,8.3,7),'gunmetal',.28)
        for x in (-26,0,26):
            box(s,'KeelBulkhead'+str(x),(x,.1,0),(2,9,18),'paint2',.2)
            box(s,'KeelSpliceCollar'+str(x),(x,5.1,0),(7,1.8,19.6),'stripe' if x==0 else 'bare',.24)
        for z in (-3.5,3.5):
            beams(s,'KeelBoxWeld'+str(z),[((-33,4,z),(33,4,z))],.5,'bare')
    if part in ('long_plate','crossbeam'):
        for sign in (-1,1):fracture_cap(s,'CutFace'+str(sign),sign*(dz/2-.25),dx,dy,part)
    else:
        for sign in (-1,1):box(s,'KeelCutFace'+str(sign),(sign*34.75,0,0),(.5,12,20),'bare',.06)
        s.contract['fractureFaces']=[{'axis':'X','positionWU':v,'widthWU':20,'heightWU':12} for v in (-35,35)]
    proxy(s,part+'-web',(0,0,0),(dx,dy,dz))
    if part in ('long_plate','crossbeam'):
        for sx in (-1,1):
            for sz in (-1,1):
                center=(sx*21.5,0,sz*48)
                box(s,f'ShearTab{sx}_{sz}',center,(25,6,8),'paint2',.25)
                box(s,f'ShearTabCut{sx}_{sz}',(sx*33.84,0,sz*48),(.32,6,8),'bare',.04)
                F.band(s,f'ShearTab{sx}_{sz}',pos((sx*27,0,sz*48)),(1,0,0),2,'stripe',facing=(0,0,1))
                proxy(s,f'shear-tab-{sx}-{sz}',center,(25,6,8))
        s.contract['centralWebDimensionsWU']=[dx,dy,dz]
        s.contract['dimensionsWU']=[68,dy,dz]
        s.contract['shearPlanesLocalXWU']=[-34,34]
        s.contract['shearTabCentersZWU']=[-48,48]

    socket(s,'SOCKET_Tow',(0,dy/2,0));socket(s,'SOCKET_Recovery',(0,0,0))
    if part in ('long_plate','crossbeam'):
        socket(s,'SOCKET_Cut_A',(0,0,-55));socket(s,'SOCKET_Cut_B',(0,0,55))
    else:
        socket(s,'SOCKET_Cut_A',(-35,0,0));socket(s,'SOCKET_Cut_B',(35,0,0))
    return s


def save_source(s,out,part):
    # Editable original parts, semantic finishes and marker empties, not joined
    # export duplicates. The root origin stays at the authored section center.
    keep=set(s.objects)
    for o in list(bpy.context.scene.objects):
        if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
    for n,(p,f) in s.sockets.items():
        o=bpy.data.objects.new(n,None);bpy.context.scene.collection.objects.link(o);o.location=p
    for o in s.objects:
        for m in o.data.materials:
            bsdf=m.node_tree.nodes.get('Principled BSDF')
            if bsdf:m.diffuse_color=bsdf.inputs['Base Color'].default_value
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(PARTS[part][1]+'.blend')))


def render_family(out):
    """CPU geometry review; runtime Look acceptance remains the actual game."""
    s=shell().finish()
    pieces={}
    for part in ('long_plate','crossbeam','keel'):
        pieces[part]=section(part,reset=False).finish()
        shift=Vector(pos(PARTS[part][2]))
        for o in pieces[part].objects:o.location+=shift
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU'
    scene.cycles.samples=24;scene.cycles.use_denoising=False
    scene.render.resolution_x=1440;scene.render.resolution_y=960;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('SecondMeasureReviewWorld');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.08,.12,.19,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
    for name,rot,energy,color in [('Key',(.35,-.4,-.4),3.2,(1,.87,.72)),('Fill',(-.6,.9,2.2),1.5,(.55,.72,1))]:
        d=bpy.data.lights.new(name,'SUN');d.energy=energy;d.angle=.15;d.color=color
        o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.rotation_euler=rot
    camera=bpy.data.objects.new('ReviewCamera',bpy.data.cameras.new('ReviewCamera'));scene.collection.objects.link(camera)
    scene.camera=camera;camera.data.type='ORTHO';camera.data.lens=40
    for state in ('assembled','released'):
        if state=='released':
            for part,ship in pieces.items():
                delta=Vector(pos((0,0,-140 if part!='keel' else 70)))
                for o in ship.objects:o.location+=delta
        combined=F.Ship('second_measure_review_'+state,COLORS)
        combined.objects=s.objects+[o for ship in pieces.values() for o in ship.objects]
        combined.socket_names=['SOCKET_Camera_Focus'];combined.socket('SOCKET_Camera_Focus',(0,0,0))
        previous=E.PREVIEW_DIR
        try:
            E.PREVIEW_DIR=str(out)
            E.export_ship(combined,{'layout':'place','file':'SecondMeasureReview'+state.title(),
                'part_id':'review_only_'+state,'asset_id':'REVIEW_ONLY_'+state.upper(),
                'new_place':True,'no_collision':True},preview=True)
        finally:E.PREVIEW_DIR=previous
        originals=set(combined.objects)
        for obj in list(scene.objects):
            if obj.type=='MESH' and obj not in originals:bpy.data.objects.remove(obj,do_unlink=True)
        for view,p,scale,target in [('top',(.001,-2,260),235,(0,-2,0)),('chase',(120,-180,260),245,(0,-2,0)),
                ('close',(-68,65,84),96,(-40,0,0))]:
            if state=='released' and view!='close':scale*=1.32;target=(0,8,0)
            camera.location=p;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
            camera.data.ortho_scale=scale
            scene.render.filepath=str(out/(state+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(out/('SecondMeasure-'+state+'.blend')))

def main(part=None):
    p=argparse.ArgumentParser();p.add_argument('--part',choices=list(PARTS));p.add_argument('--live',action='store_true');p.add_argument('--render',action='store_true')
    p.add_argument('--out',type=Path,default=ROOT/'.devshots/ceres-second-measure')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    args.out.mkdir(parents=True,exist_ok=True)
    for key in ([part or args.part] if part or args.part else PARTS):
        s=(shell() if key=='shell' else section(key)).finish()
        s.contract['sourceSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        lo,hi=E.ship_bounds(s);s.contract['boundsBlender']=[list(lo),list(hi)]
        previous=E.PREVIEW_DIR
        try:E.PREVIEW_DIR=str(args.out);written=E.export_ship(s,spec(key,live=args.live),preview=not args.live)
        finally:E.PREVIEW_DIR=previous
        for path,tris in written:
            def stamp(doc):
                doc['asset'].setdefault('extras',{})['ceresSecondMeasure']=s.contract
                for n in doc['nodes']:
                    if n.get('name') in s.sockets:n['extras']['spaceface']['forward']=E._gltf_dir(s.sockets[n['name']][1])
            doc=E.patch_glb_json(path,stamp)
            lods={str(i):sum(doc['accessors'][p['indices']]['count']//3 for n in doc['nodes']
                if n.get('name','').startswith('LOD'+str(i)+'_') and 'mesh' in n
                for p in doc['meshes'][n['mesh']]['primitives']) for i in range(3)}
            report={'spec':spec(key,live=args.live),'contract':s.contract,'trianglesByLod':lods,
                'materialCount':len(doc.get('materials',[])),'fileBytes':Path(path).stat().st_size}
            (args.out/(key+'-source-report.json')).write_text(json.dumps(report,indent=2)+'\n')
        if not args.live:save_source(s,args.out,key)
    if args.render:render_family(args.out)
if __name__=='__main__':main()
