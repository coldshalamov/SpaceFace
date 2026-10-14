"""36 reusable Forge structural/fluid/habitat components. Metres, deterministic.
blender -b --python tools/blender/forge/asset_bank_structure.py [-- --only ID,ID --render]
Supporting authoring candidates, not live-runtime promotion.
"""
import argparse,json,math,os,sys
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
from forge import Ship,reset_scene,box,cylinder,ring as _ring,truss as _truss,beams,plate,plate_v,band
from asset_bank_export import export_asset,render_preview,socket_rotation
ROOT=os.path.abspath(os.path.join(HERE,'../../..'));OUT=os.path.join(ROOT,'assets/models/asset-bank/structure')
COLORS={'paint':'#737d83','paint2':'#394b57','stripe':'#ad652c','hazard':'#c69328'}
STRUCT=['truss_short','truss_long','truss_corner_90','truss_tee','truss_cross','truss_elbow_45','truss_rise_adapter','truss_octagonal_hub','flange_coupler','bulkhead_mount','terminal_cap','telescoping_sleeve']
FLUID=['pressure_pipe_straight','pressure_pipe_elbow_90','pressure_pipe_elbow_45','pressure_pipe_tee','pressure_pipe_cross','pressure_pipe_reducer','pressure_pipe_valve','twin_manifold','pressure_pipe_capped_end','pump_skid','heat_exchanger_cassette','expansion_bellows']
HAB=['pressure_corridor_straight','pressure_corridor_elbow','pressure_corridor_tee','pressure_corridor_cross','blank_endcap','windowed_observation_end','docking_collar','airlock_vestibule','berth_jaw','loading_bridge','escape_capsule_cradle','service_umbilical']

def beam_proxy(s,a,b,width,height=None):
    a,b=Vector(a),Vector(b);q=socket_rotation(b-a)
    s.bank_boxes.append({'center':list((a+b)*.5),'size':[(b-a).length,width,height or width],'rotation_gltf':[q.x,q.z,-q.y,q.w]})

def ring(s,name,center,radius,tube,**kwargs):
    level=s.bank_lod_level
    if level:
        kwargs['segments']=max(8,int(kwargs.get('segments',32)/(1.5 if level==1 else 2)))
        kwargs['sides']=max(4,int(kwargs.get('sides',10)/(1.25 if level==1 else 1.5)))
    return _ring(s,name,center,radius,tube,**kwargs)

def truss(s,name,a,b,w,bays,material='gunmetal',chord=None,web=None,**kwargs):
    level=s.bank_lod_level
    if level:bays=max(1,round(bays*(.67 if level==1 else .33)))
    obj=_truss(s,name,a,b,w,bays,material,chord,web,**kwargs)
    a,b=Vector(a),Vector(b);t=(b-a).normalized();up=Vector((0,0,1)) if abs(t.z)<.9 else Vector((0,1,0))
    side=t.cross(up).normalized();nrm=side.cross(t).normalized()
    corners=[side*x*w/2+nrm*z*w/2 for x,z in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    for c in corners:beam_proxy(s,a+c,b+c,chord or w*.42)
    for i in range(bays):
        p0=a+(b-a)*i/bays;p1=a+(b-a)*(i+1)/bays
        for j in range(4):
            c0,c1=corners[j],corners[(j+1)%4]
            beam_proxy(s,p0+(c0 if i%2==0 else c1),p1+(c1 if i%2==0 else c0),web or w*.24)
    return obj

def solid(s,name,center,size,mat='paint',collision=True):
    obj=box(s,name,center,size,mat,bevel=.035)
    if collision:s.bank_boxes.append({'center':list(center),'size':list(size)})
    return obj

def port(s,name,pos,direction,radius=.72,family='structure'):
    s.socket('SOCKET_'+name,pos,direction)
    ring(s,name+'_flange',pos,radius,.095,axis=direction,material='paint2' if s.id=='flange_coupler' else 'bare',segments=16,sides=6)
    if family=='fluid':ring(s,name+'_seal',Vector(pos)-Vector(direction)*.11,radius-.04,.045,axis=direction,material='stripe',segments=24,sides=6)
    # Captive fasteners sit on the coupling rim, never free-floating decoration.
    q=socket_rotation(direction);c=Vector(pos);axis=Vector(direction).normalized()
    detail=s.detail;s.detail=1
    count=8 if s.bank_lod_level==0 else 4
    if s.bank_lod_level<2:
        for i in range(count):
            a=i*2*math.pi/count;p=c+q@Vector((0,radius*math.cos(a),radius*math.sin(a)))
            cylinder(s,name+'_bolt_'+str(i),p-axis*.04,p+axis*.075,.045 if family=='fluid' else .055,material='bare',segments=6,bevel=0)
    s.detail=detail

def structure(s,kind):
    segments=[]
    if kind in ('truss_short','truss_long','telescoping_sleeve'):
        length=8 if kind=='truss_long' else 4;segments=[((-length/2,0,0),(length/2,0,0))]
    elif kind in ('truss_corner_90','truss_elbow_45','truss_rise_adapter'):
        end={'truss_corner_90':(0,4,0),'truss_elbow_45':(3,3,0),'truss_rise_adapter':(3,0,2)}[kind]
        segments=[((-4,0,0),(0,0,0)),((0,0,0),end)]
        cylinder(s,'angled_joint_drum',(0,0,-.7),(0,0,.7),.88,material='paint2',segments=8,bevel=.035)
        s.bank_boxes.append({'center':[0,0,0],'size':[1.76,1.76,1.4]})
    elif kind in ('truss_tee','truss_cross'):
        ends=[(-4,0,0),(4,0,0),(0,4,0)]+([(0,-4,0)] if kind=='truss_cross' else [])
        segments=[((0,0,0),e) for e in ends];solid(s,'joint_spine',(0,0,0),(1.35,1.35,1.35),'paint2')
    elif kind=='truss_octagonal_hub':
        pts=[(2.8*math.cos(i*math.pi/4),2.8*math.sin(i*math.pi/4),0) for i in range(8)]
        segments=[(pts[i],pts[(i+1)%8]) for i in range(8)]
        for i,p in enumerate(pts):
            cylinder(s,'joint_node_'+str(i),(p[0],p[1],-.7),(p[0],p[1],.7),.75,material='paint2',segments=8,bevel=.04)
            port(s,f'RADIAL_{i}',Vector(p)+Vector(p).normalized()*.65,Vector(p).normalized())
    elif kind=='flange_coupler':
        for x in (-.35,.35):port(s,'A' if x<0 else 'B',(x,0,0),(-1 if x<0 else 1,0,0))
        for y,z in [(-.5,-.5),(-.5,.5),(.5,-.5),(.5,.5)]:solid(s,'tie',(0,y,z),(.7,.16,.16),'gunmetal')
    elif kind=='bulkhead_mount':
        plate_v(s,'wall_plate',[(-1,-.78),(-.78,-1),(.78,-1),(1,-.78),(1,.78),(.78,1),(-.78,1),(-1,.78)],-.57,.24,plane='yz',material='paint2',chamfer=.05)
        s.bank_boxes.append({'center':[-.45,0,0],'size':[.24,2,2]})
        truss(s,'support',(-.3,0,0),(1.3,0,0),1.1,2,'paint2',chord=.13,web=.075)
        for side in (-.6,.48):
            plate_v(s,'load_gusset',[(-.3,-.58),(1.03,-.58),(-.3,.38)],side,.12,material='paint',chamfer=.03)
            s.bank_boxes.append({'center':[.365,side+.06,-.1],'size':[1.33,.12,.96]})
        port(s,'FRAME',(1.3,0,0),(1,0,0));s.socket('SOCKET_WALL',(-.57,0,0),(-1,0,0))
    elif kind=='terminal_cap':
        plate_v(s,'cap',[(-.8,-.57),(-.57,-.8),(.57,-.8),(.8,-.57),(.8,.57),(.57,.8),(-.57,.8),(-.8,.57)],-.2,.4,plane='yz',material='paint',side_material='paint2',chamfer=.055)
        s.bank_boxes.append({'center':[0,0,0],'size':[.4,1.6,1.6]})
        port(s,'FRAME',(-.25,0,0),(-1,0,0))
        solid(s,'gasket_well',(.215,0,0),(.045,1.18,1.12),'dark',False)
        solid(s,'service_cover',(.25,0,0),(.07,1.01,.95),'paint2',False)
        solid(s,'warning',(.294,0,-.29),(.035,.78,.12),'hazard',False)
        beams(s,'release_handle',[((.3,-.23,.1),(.43,-.23,.1)),((.43,-.23,.1),(.43,.23,.1)),((.43,.23,.1),(.3,.23,.1))],.065,'bare')
        if s.bank_lod_level<2:
            for y in (-.56,.56):
                for z in (-.56,.56):cylinder(s,'captive_lock',(.2,y,z),(.29,y,z),.07,material='bare',segments=6,bevel=0)
    for i,(a,b) in enumerate(segments):
        truss(s,'lattice_'+str(i),a,b,1.15,max(2,round((Vector(b)-Vector(a)).length)),material='paint2',chord=.13,web=.075)
        if kind!='truss_octagonal_hub':
            for j,(p,d) in enumerate([(a,Vector(a)-Vector(b)),(b,Vector(b)-Vector(a))]):
                if Vector(p).length>.01:port(s,f'LEG_{i}_{j}',p,d.normalized())
    if kind=='telescoping_sleeve':
        for y,z in [(-.7,0),(.7,0),(0,-.7),(0,.7)]:solid(s,'sleeve_shell',(0,y,z),(2.3,.22 if y else 1.2,1.2 if y else .22))
        for x in (-1.05,1.05):ring(s,'sleeve_band',(x,0,0),.8,.08,material='stripe',segments=16,sides=6)

def pipe(s,name,a,b,r=.37,r1=None,mat='paint2'):
    cylinder(s,name,a,b,r,r1=r1,material=mat,segments=16,cap=True,bevel=.025);beam_proxy(s,a,b,2*max(r,r1 or r))

def fluid(s,kind):
    paths=[];ports=[]
    if kind in ('pressure_pipe_straight','pressure_pipe_reducer','pressure_pipe_valve','pressure_pipe_capped_end','expansion_bellows'):
        paths=[((-2,0,0),(2,0,0))];ports=[((-2,0,0),(-1,0,0)),((2,0,0),(1,0,0))]
    elif kind in ('pressure_pipe_elbow_90','pressure_pipe_elbow_45'):
        angle=math.pi/2 if kind.endswith('90') else math.pi/4
        pts=[(-1.5+1.5*math.sin(angle*i/8),1.5-1.5*math.cos(angle*i/8),0) for i in range(9)]
        paths=list(zip(pts[:-1],pts[1:]));ports=[(pts[0],(-1,0,0)),(pts[-1],(math.cos(angle),math.sin(angle),0))]
    elif kind in ('pressure_pipe_tee','pressure_pipe_cross','twin_manifold'):
        paths=[((-2,0,0),(2,0,0)),((0,0,0),(0,2,0))];ports=[((-2,0,0),(-1,0,0)),((2,0,0),(1,0,0)),((0,2,0),(0,1,0))]
        if kind.endswith('cross'):paths += [((0,0,0),(0,-2,0))];ports += [((0,-2,0),(0,-1,0))]
        if kind=='twin_manifold':
            paths += [((-2,1.7,0),(2,1.7,0)),((-1,0,0),(-1,1.7,0)),((1,0,0),(1,1.7,0))];ports += [((-2,1.7,0),(-1,0,0)),((2,1.7,0),(1,0,0))]
    elif kind=='pump_skid':
        solid(s,'skid',(0,0,-.65),(4,2.3,.3),'gunmetal');pipe(s,'motor',(-1.4,0,0),(.3,0,0),.65,mat='paint');pipe(s,'impeller',(.3,0,0),(1.1,0,0),.85)
        paths=[((1,0,0),(2,0,0)),((.7,0,0),(.7,1.5,0))];ports=[((2,0,0),(1,0,0)),((.7,1.5,0),(0,1,0))]
        for x in (-1.1,-.8,-.5,-.2):ring(s,'cooling_fin',(x,0,0),.65,.045,material='bare',segments=16,sides=4)
    elif kind=='heat_exchanger_cassette':
        solid(s,'frame',(0,0,-.65),(4.2,2.7,.25))
        for y in (-1,1):paths += [((-2,y,0),(2,y,0))];ports += [((-2,y,0),(-1,0,0)),((2,y,0),(1,0,0))]
        for i in range(11):
            x=-1.6+i*.32;pipe(s,'exchange_tube',(x,-1,0),(x,1,0),.09,mat='bare')
        for x in (-2,2):solid(s,'end_brace',(x,0,0),(.2,2.7,1.1),'paint2')
    for i,(a,b) in enumerate(paths):pipe(s,'pipe_'+str(i),a,b,r1=.2 if kind=='pressure_pipe_reducer' else None)
    for i,(p,d) in enumerate(ports):
        if kind=='pressure_pipe_capped_end' and i==1:pipe(s,'blind_cap',(1.9,0,0),(2.15,0,0),.5,mat='hazard')
        else:port(s,'FLOW_'+str(i),p,d,.46 if kind!='pressure_pipe_reducer' or i==0 else .3,'fluid')
    if kind=='pressure_pipe_valve':
        pipe(s,'split_valve_housing',(0,0,-.5),(0,0,.5),.61,mat='paint')
        ring(s,'housing_seam',(0,0,.08),.63,.065,axis=(0,0,1),material='gunmetal',segments=16,sides=6);pipe(s,'bonnet',(0,0,.48),(0,0,.62),.42)
        for x,y in [(-.43,-.43),(-.43,.43),(.43,-.43),(.43,.43)]:pipe(s,'housing_fastener',(x,y,-.12),(x,y,.23),.075,mat='bare')
        pipe(s,'stem',(0,0,.4),(0,0,1.1),.1,mat='bare');ring(s,'handwheel',(0,0,1.1),.55,.075,axis=(0,0,1),material='hazard',segments=20,sides=6)
        beams(s,'spokes',[((0,0,1.1),(.5,0,1.1)),((0,0,1.1),(-.5,0,1.1)),((0,0,1.1),(0,.5,1.1)),((0,0,1.1),(0,-.5,1.1))],.08,'hazard')
    if kind=='expansion_bellows':
        for i in range(13):ring(s,'bellows',(-1.2+i*.2,0,0),.42,.09,material='bare',segments=16,sides=6)
        for y in (-.66,.66):pipe(s,'restraint',(-1.5,y,0),(1.5,y,0),.06,mat='bare')

def habitat(s,kind):
    if kind in ('berth_jaw','escape_capsule_cradle','loading_bridge'):
        length=6 if kind=='loading_bridge' else 4;solid(s,'deck',(0,0,-1),(length,3,.25),'paint2')
        for y in (-1.4,1.4):
            truss(s,'rail',(-length/2,y,-.4),(length/2,y,-.4),.45,4,'gunmetal')
            if kind!='loading_bridge':
                for x in (-1.5,1.5):solid(s,'jaw',(x,y,.2),(.5,.5,2),'hazard')
        s.socket('SOCKET_MOUNT',(-length/2,0,-1),(-1,0,0));s.socket('SOCKET_PAYLOAD',(0,0,-.85),(0,0,1))
        if kind=='escape_capsule_cradle':
            for x in (-1.5,1.5):ring(s,'saddle',(x,0,.35),1.25,.14,material='paint',segments=16,sides=6)
        return
    if kind=='service_umbilical':
        solid(s,'wall_unit',(-2,0,0),(.5,1.4,1.8));truss(s,'arm',(-1.8,0,0),(1.5,0,0),.65,4,'gunmetal')
        for y in (-.28,0,.28):pipe(s,'hose',(-1.8,y,-.4),(2,y,-.4),.09,mat='stripe')
        solid(s,'connector',(2,0,0),(.4,1.1,1.2),'paint2');s.socket('SOCKET_WALL',(-2.25,0,0),(-1,0,0));s.socket('SOCKET_CONNECTOR',(2.2,0,0),(1,0,0));return
    openings={(-1,0),(1,0)}
    if kind=='pressure_corridor_elbow':openings={(-1,0),(0,1)}
    if kind=='pressure_corridor_tee':openings={(-1,0),(1,0),(0,1)}
    if kind=='pressure_corridor_cross':openings={(-1,0),(1,0),(0,-1),(0,1)}
    if kind in ('blank_endcap','windowed_observation_end'):openings={(-1,0)}
    length=2 if kind in ('blank_endcap','windowed_observation_end','docking_collar') else 4;w=4;h=3.6;thick=.18
    solid(s,'floor',(0,0,-h/2),(length,w,thick),'paint2');solid(s,'roof',(0,0,h/2),(length,w,thick))
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]:
        pos=(dx*length/2,dy*w/2,0)
        if (dx,dy) not in openings:
            if kind=='windowed_observation_end' and dx==1:solid(s,'observation_glass',pos,(thick,w-.4,h-.4),'glass',True)
            else:solid(s,'pressure_wall',pos,(thick,w,h) if dx else (length,thick,h))
        else:s.socket('SOCKET_PASSAGE_'+str(dx)+'_'+str(dy),pos,(dx,dy,0))
        if dx:
            for y in (-w/2,w/2):solid(s,'jamb',(pos[0],y,0),(.28,.28,h),'gunmetal')
            for z in (-h/2,h/2):solid(s,'lintel',(pos[0],0,z),(.28,w,.28),'stripe')
        else:
            for x in (-length/2,length/2):solid(s,'jamb',(x,pos[1],0),(.28,.28,h),'gunmetal')
            for z in (-h/2,h/2):solid(s,'lintel',(0,pos[1],z),(length,.28,.28),'stripe')
    for y in (-1.6,1.6):solid(s,'guide_lamp',(0,y,1.68),(length*.65,.045,.04),'glow_cyan',False)
    if kind=='airlock_vestibule':
        solid(s,'control_panel',(-.5,2.13,.15),(.8,.25,1.1),'dark');solid(s,'status',(-.5,2.27,.3),(.45,.035,.1),'glow_amber',False)
        for y in (-2.2,2.2):solid(s,'stowed_door',(1,y,0),(.7,.16,2.7),'paint2')
    if kind=='docking_collar':
        for x in (-.8,.8):
            for y in (-2.25,2.25):solid(s,'latch',(x,y,0),(.55,.4,.6),'hazard')


def quality_pass(s,kind):
    """Manufactured meso-scale layers: occupation, service access and load interfaces."""
    if kind in STRUCT:
        # Sleeve shoes load the four square chords into each end coupling.
        for name,(pos,direction) in list(s.sockets.items()):
            if 'LEG_' not in name:continue
            axis=Vector(direction).normalized();q=socket_rotation(axis)
            for y,z in [(-.575,-.575),(-.575,.575),(.575,-.575),(.575,.575)]:
                p=Vector(pos)+q@Vector((0,y,z))
                cylinder(s,'chord_shoe',p-axis*.28,p-axis*.04,.17,material='paint',segments=8,bevel=.015)
        if kind in ('truss_short','truss_long','telescoping_sleeve'):
            length=8 if kind=='truss_long' else 4
            # Protected service spine seated along the lower starboard chord.
            cylinder(s,'service_conduit',(-length/2+.35,-.61,-.48),(length/2-.35,-.61,-.48),.065,material='dark',segments=10)
            solid(s,'junction_frame',(-.65,-.67,.1),(1.05,.22,.75),'gunmetal')
            solid(s,'junction_lid',(-.65,-.81,.1),(.85,.075,.57),'paint')
            solid(s,'junction_signal',(-.65,-.855,.27),(.45,.025,.05),'glow_amber',False)
        if kind=='flange_coupler':
            for x in (-.4,.4):
                for y,z in [(-.5,-.5),(-.5,.5),(.5,-.5),(.5,.5)]:
                    cylinder(s,'tie_nut',(x-.04,y,z),(x+.04,y,z),.105,material='hazard',segments=6,bevel=.005)
        if kind=='bulkhead_mount':
            for y in (-.78,.78):
                for z in (-.78,.78):cylinder(s,'wall_anchor',(-.61,y,z),(-.28,y,z),.105,material='bare',segments=6,bevel=.01)
    if kind in FLUID:
        if kind=='pressure_pipe_valve':
            # Visible pressure gauge and bonnet lock make the assembly serviceable.
            pipe(s,'gauge_stem',(0,-.45,.12),(0,-.72,.12),.085,mat='bare')
            cylinder(s,'gauge_case',(0,-.72,.12),(0,-.85,.12),.23,material='paint',segments=24)
            cylinder(s,'gauge_face',(0,-.86,.12),(0,-.875,.12),.18,material='dark',segments=24,bevel=0)
            beams(s,'gauge_needle',[((0,-.884,.12),(.11,-.884,.22))],.027,'hazard')
            ring(s,'bonnet_retainer',(0,0,.64),.36,.045,axis=(0,0,1),material='bare',segments=20,sides=6)
        if kind=='pump_skid':
            for x in (-1.15,.55):
                for y in (-.72,.72):
                    solid(s,'pump_foot',(x,y,-.38),(.48,.45,.3),'paint2')
                    cylinder(s,'foot_anchor',(x,y,-.45),(x,y,-.15),.085,material='bare',segments=6)
            solid(s,'controller_base',(-.8,-.98,-.08),(1.15,.48,.9),'gunmetal')
            solid(s,'controller_lid',(-.8,-1.24,-.08),(.99,.075,.74),'paint')
            solid(s,'controller_status',(-.8,-1.285,.12),(.55,.025,.08),'glow_cyan',False)
            for z in (-.25,-.08):solid(s,'controller_recess',(-.8,-1.286,z),(.58,.028,.045),'dark',False)
            ring(s,'motor_retention',(-1.35,0,0),.66,.075,material='stripe',segments=24,sides=6)
        if kind=='heat_exchanger_cassette':
            for x in (-2,2):
                beams(s,'release_handle',[((x,-.6,.58),(x,-.6,.88)),((x,-.6,.88),(x,.6,.88)),((x,.6,.88),(x,.6,.58))],.105,'hazard')
    if kind in HAB and kind not in ('berth_jaw','loading_bridge','escape_capsule_cradle','service_umbilical'):
        length=2 if kind in ('blank_endcap','windowed_observation_end','docking_collar') else 4
        # Helios-like folded shell panels and a dark gasket frame distinguish occupied spaces.
        for x in (-length*.24,length*.24):
            plate(s,'roof_cover',[(x-length*.18,-1.5),(x+length*.18,-1.5),(x+length*.2,-1.28),(x+length*.2,1.28),(x+length*.18,1.5),(x-length*.18,1.5),(x-length*.2,1.28),(x-length*.2,-1.28)],1.91,.12,'paint',chamfer=.055,side_material='paint2')
        for y in (-1.72,1.72):
            solid(s,'roof_gasket',(0,y,1.925),(length*.79,.09,.05),'dark',False)
            solid(s,'roof_trim',(0,y,1.96),(length*.62,.035,.025),'glow_cyan',False)
        # A roof service coaming, with contrasting recessed well and real cover hardware.
        solid(s,'service_well',(-length*.22,0,2.04),(length*.28,1.04,.055),'dark',False)
        solid(s,'service_cover',(-length*.22,0,2.085),(length*.23,.9,.06),'paint2',False)
        for y in (-.34,.34):solid(s,'cover_latch',(-length*.22,y,2.13),(.23,.09,.055),'bare',False)
        if kind=='docking_collar':
            # External draw latches and guides, all kept outside the clear passage.
            for y in (-2.17,2.17):
                solid(s,'latch_rail',(0,y,.6),(1.6,.24,.16),'gunmetal')
                for x in (-.65,.65):
                    cylinder(s,'latch_pivot',(x,y-.13,.6),(x,y+.13,.6),.18,material='bare',segments=16)
                    solid(s,'latch_arm',(x,y,.18),(.22,.2,.65),'hazard')
            for x in (-.8,.8):
                solid(s,'threshold',(x,0,-1.65),(.2,3.2,.055),'hazard')
        if kind=='windowed_observation_end':
            # A protected panoramic pane with mullions and a service sill.
            for y in (-1.25,0,1.25):solid(s,'window_mullion',(1.13,y,0),(.12,.12,3.18),'paint2')
            solid(s,'window_sill',(1.13,0,-1.55),(.27,3.75,.18),'paint2')
            solid(s,'window_header',(1.13,0,1.55),(.27,3.75,.18),'paint2')
    # Small close-only fastening families, never full-surface noise.
    s.detail=0


def build(asset_id,lod=0,reset=True):
    if reset:reset_scene()
    colors=dict(COLORS)
    if asset_id in HAB and asset_id not in ('berth_jaw','loading_bridge','escape_capsule_cradle','service_umbilical'):
        colors.update(paint='#bfb6a3',paint2='#24656d',stripe='#167e8b',hazard='#cf9725')
    elif asset_id in FLUID:colors.update(paint='#97552f',paint2='#286b70',stripe='#c48628')
    else:colors.update(paint='#8a9290',paint2='#335d70',stripe='#b8732c')
    s=Ship(asset_id,colors);s.bank_lod_level=lod;s.bank_boxes=[];s.bank_source='tools/blender/forge/asset_bank_structure.py'
    if asset_id in STRUCT:structure(s,asset_id);category='structure'
    elif asset_id in FLUID:fluid(s,asset_id);category='fluid'
    else:habitat(s,asset_id);category='habitat-dock'
    quality_pass(s,asset_id)
    if asset_id in STRUCT+['berth_jaw','loading_bridge','escape_capsule_cradle','service_umbilical'] and lod==0:s.bank_lod_factory=lambda level:build(asset_id,level,False)[0]
    return s,category

def main():
    p=argparse.ArgumentParser();p.add_argument('--only');p.add_argument('--out',help='Candidate output directory; no live files changed');p.add_argument('--render',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    ids=a.only.split(',') if a.only else STRUCT+FLUID+HAB;rows=[];out_dir=os.path.abspath(a.out) if a.out else OUT
    for asset_id in ids:
        s,category=build(asset_id);row=export_asset(s,out_dir,asset_id,category,asset_id.replace('_',' '),s.bank_boxes,['modular','reusable','Forge','attachment-metadata','library-only']);rows.append(row)
        if a.render:
            preview=os.path.join(ROOT,'.devshots/asset-bank/structure');os.makedirs(preview,exist_ok=True);render_preview(s,os.path.join(preview,asset_id+'_source-preview.png'))
        print('BANK_ASSET '+asset_id+' '+str(row['lods'][0]),flush=True)
    if not a.only and not a.out:
        manifest={'schemaVersion':1,'family':'structure','intendedConsumer':'Forge station, habitat, industrial and ship assembly recipes; explicit socket connections, not random surface clutter','tier':'supporting modular asset candidates','materialBill':{'structure':'Painted steel lattice, bare machined flanges, captive fasteners and octagonal connector drums; sleeved load-bearing interfaces and protected service conduits','fluid':'Copper lacquer pressure housings and teal coated tubes, bare seals/collars, bolted bonnet, seated gauge, anchored pump feet and service controller; capped visual tube ends are not fluid simulation geometry','habitat':'Helios ivory and teal lacquer folded pressure panels, dark structural frame and gaskets, captive roof service covers, mechanical docking latches, restrained lamps and mullioned glazing'},'fictionStatus':'Manufacturing interpretation is art extrapolation; no new manufacturer or canon history','styleReferences':['docs/visual-assets/LOOK.md','tools/blender/forge/ships/helios_lark.py','tools/blender/forge/ships/repair_tender.py'],'reviewStatus':'All 36 refined LOD0 exports reimported and viewed in Blender CPU. Topology-preserving lattice LODs authored; game-renderer and representative assembly performance review pending. Not live accepted.','assets':rows,'regenerate':'blender -b --python tools/blender/forge/asset_bank_structure.py','runtimeStatus':'authoring library, not registered live places','previewDisclaimer':'Blender CPU source/export review, not game renderer','collisionNote':'Individual oriented boxes approximate lattice chords/webs, tubes and panels; small flange details omitted. No global convex hull. Assembly clearances require testing.'}
        path=os.path.join(ROOT,'design/asset-bank/structure.json');os.makedirs(os.path.dirname(path),exist_ok=True)
        with open(path,'w') as f:json.dump(manifest,f,indent=2);f.write('\n')
if __name__=='__main__':main()
