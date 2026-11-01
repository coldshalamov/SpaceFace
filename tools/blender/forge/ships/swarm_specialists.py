"""Authored Swarm specialist hulls and persistent rigid mechanisms.

Forge owns geometry, shared surfaces, LODs and sockets. Simulation phases drive the runtime
mechanisms; the inert motion bank records their authoritative rest bindings for packaging.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F
import forge_export as E
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import motion_bank


def build_warden():
    F.reset_scene()
    s = F.Ship('swarm_warden', {
        'paint': '#697d91', 'paint2': '#bfb6a3', 'stripe': '#263849', 'hazard': '#9eb6bf',
        'gunmetal': '#333e48', 'dark': '#151e27', 'glow_cyan': '#5eddd8',
        'glow_amber': '#ffb75d', 'glow_drive': '#72c9d8', 'glow_warm': '#c8e5dc',
    })
    F.loft(s, 'WardenSpine', [
        dict(x=-8.0,w=1.3,ht=.55,hb=.42,zc=.18,n=2.6), dict(x=-5.5,w=2.1,ht=.8,hb=.58,zc=.18,n=2.7),
        dict(x=-1.0,w=2.7,ht=1.05,hb=.72,zc=.2,n=2.8), dict(x=3.3,w=2.2,ht=.86,hb=.6,zc=.18,n=2.6),
        dict(x=6.8,w=.62,ht=.36,hb=.28,zc=.06,n=2.2), dict(x=8.0,w=.08,ht=.08,hb=.08,zc=0,n=2),
    ], material='paint2', belly='dark', back_material='gunmetal', count=48)
    F.plate(s, 'Bridge', [(-5.0,-1.35),(2.2,-1.7),(4.8,-.75),(5.8,0),(4.8,.75),(2.2,1.7),(-5.0,1.35)],
            z0=.68, thickness=.55, material='paint2', chamfer=.5, side_material='gunmetal', top_material='paint')
    F.band(s, 'Bridge', (-2.6,0,0), (0,1,0), .28, 'stripe', facing=(0,0,1))
    for side, label in ((1,'Port'),(-1,'Starboard')):
        outline=[(-4.8,1.65),(-2.6,1.55),(1.7,3.0),(4.1,5.7),(2.4,6.3),(-.6,4.9),(-3.8,3.3)]
        if side<0: outline=[(x,-y) for x,y in reversed(outline)]
        start=len(s.objects)
        wing=F.plate(s, 'ShieldWing'+label, outline, z0=.05, thickness=.5, material='paint',
                     chamfer=.42, chamfer_bottom=.2, side_material='paint2')
        F.band(s, 'ShieldWing'+label, (0,side*4.0,0), (1,side*-.72,0), .16, 'glow_cyan', facing=(0,0,1))
        F.panel(s, 'ShieldWing'+label, (-1.0,side*3.35), (2.3,1.0), 'paint2', inset=.035, depth=.04)
        F.light(s, 'WingNav'+label, (3.1,side*5.35,.55), 'glow_red' if side>0 else 'glow_green', size=.1)
        s.motion_group('warden_shield_'+label.lower(), (-3.1,side*1.9,0), s.objects[start:])
        # Projector base is mounted on the fixed shoulder; its socket stays on the real emitter.
        F.box(s, 'Projector'+label, (-2.1,side*1.75,1.0), (.9,.6,.45), 'gunmetal', bevel=.12)
        F.light(s, 'ProjectorEye'+label, (-1.65,side*1.75,1.17), 'glow_cyan', size=.23)
    F.nozzle(s, 'WardenDrive', (-7.9,0,.1), .95, 1.25, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-7.8,0,.1))
    s.socket('SOCKET_Link_Emitter', (-1.65,-1.75,1.17), forward=(1,0,0))
    F.light(s, 'Beacon', (-2,0,1.35), 'glow_amber', size=.11)
    return s


def build_jackal():
    F.reset_scene()
    s=F.Ship('swarm_jackal', {
        'paint':'#9b681c','paint2':'#d59a2e','stripe':'#24282b','hazard':'#e6b43d',
        'gunmetal':'#394047','dark':'#171d22','bare':'#777d80','glow_cyan':'#ffc044',
        'glow_amber':'#ffb44e','glow_drive':'#ff9943','glow_warm':'#e7d19a',
    })
    F.loft(s,'JackalKeel',[
        dict(x=-7.6,w=1.15,ht=.58,hb=.44,zc=.05,n=2.5),dict(x=-5.5,w=1.65,ht=.28,hb=.5,zc=-.15,n=2.7),
        dict(x=-.5,w=1.9,ht=.22,hb=.48,zc=-.15,n=2.5),dict(x=3.5,w=1.65,ht=.24,hb=.4,zc=-.12,n=2.4),
        dict(x=4.5,w=1.45,ht=.64,hb=.47,zc=.05,n=2.4),
        dict(x=7.3,w=.12,ht=.12,hb=.1,zc=0,n=2),
    ],material='paint2',belly='dark',count=48)
    for side,label in ((1,'Port'),(-1,'Starboard')):
        outline=[(-6.6,2.15),(4.8,2.15),(6.1,3.2),(4.9,4.45),(-4.5,4.25),(-6.6,3.5)]
        if side<0:outline=[(x,-y) for x,y in reversed(outline)]
        F.plate(s,'RackRail'+label,outline,z0=-.05,thickness=.95,material='paint2',chamfer=.28,
                side_material='gunmetal',top_material='paint')
        for y in (2.65,3.05,3.45,3.85):
            F.band(s,'RackRail'+label,(-2.8,y*side,0),(1,0,0),.2,'hazard',facing=(0,0,1))
        gate=F.plate(s,'EjectorGate'+label,[(-4.8,0),(-4.8,2.15*side),(-3.9,2.15*side),(-3.5,0)],
                     z0=.46,thickness=.2,material='paint',chamfer=.08,side_material='stripe')
        s.motion_group('jackal_gate_'+label.lower(),(-4.1,0,.46),[gate])
        F.nozzle(s,'Drive'+label,(-7.6,side*2.8,.1),.62,1.05,material='gunmetal')
        F.light(s,'Nav'+label,(5.4,side*4,.5),'glow_red' if side>0 else 'glow_green')
    F.plate(s,'BayFloor',[(-5,-1.75),(4.8,-1.75),(5.6,0),(4.8,1.75),(-5,1.75)],
            z0=.34,thickness=.22,material='dark',chamfer=.12,side_material='gunmetal')
    for x in (-3.7,-1,1.7):
        F.box(s,f'CradleBar{x}',(x,0,.62),(.55,2.4,.22),'gunmetal',bevel=.08)
        for y in (-.88,.88):
            F.cylinder(s,f'MineSocket{x}_{y}',(x,y,.75),(x,y,1),.27,material='dark',segments=16)
            F.light(s,f'SocketLamp{x}_{y}',(x,y,1.05),'glow_amber',size=.08)
    F.band(s,'JackalKeel',(-1,0,0),(0,1,0),.26,'hazard',facing=(0,0,1))
    s.hook('HOOK_DRIVE_CORE',(-7.5,0,.1))
    s.socket('SOCKET_Mine_Ejector',(-6.2,0,.35),forward=(-1,0,0))
    F.light(s,'AmberBeacon',(-1.8,0,1.1),'glow_amber',size=.13)
    return s


def build_anchor():
    F.reset_scene()
    s=F.Ship('swarm_anchor',{
        'paint':'#536a68','paint2':'#aab9a8','stripe':'#253c3b','hazard':'#d49a50',
        'gunmetal':'#364548','dark':'#151f21','bare':'#8c9a95','glow_cyan':'#76e0bd',
        'glow_amber':'#ffa14d','glow_drive':'#75cdb7','glow_warm':'#e2d4ad',
    })
    F.loft(s,'AnchorSpine',[
        dict(x=-8,w=1.45,ht=.7,hb=.52,zc=.08,n=2.5),dict(x=-5.2,w=2.2,ht=1,hb=.7,zc=.1,n=2.6),
        dict(x=-1.2,w=2.4,ht=1,hb=.7,zc=.1,n=2.6),dict(x=3.2,w=1.85,ht=.8,hb=.58,zc=.08,n=2.5),
        dict(x=6.5,w=.5,ht=.3,hb=.23,zc=0,n=2.2),dict(x=7.6,w=.08,ht=.08,hb=.08,zc=0,n=2),
    ],material='paint2',belly='dark',count=48)
    F.annulus(s,'GravitySpool',(-.4,0),1.8,3.05,.55,.42,'gunmetal',side_material='dark')
    F.annulus(s,'SpoolInnerBand',(-.4,0),2.2,2.42,1.03,.12,'glow_cyan',side_material='gunmetal')
    F.cylinder(s,'CoreSleeve',(-.4,0,.25),(-.4,0,1.65),1.35,material='dark',segments=36,cap_material='glow_amber')
    fore=F.plate(s,'VaneFore',[(1.5,-1),(5.6,-1.8),(7,-.9),(6.7,0),(7,.9),(5.6,1.8),(1.5,1)],
                 z0=.18,thickness=.6,material='paint',chamfer=.32,side_material='paint2')
    F.band(s,'VaneFore',(5.6,0,0),(1,0,0),.15,'glow_cyan',facing=(0,0,1))
    s.motion_group('anchor_vane_fore',(1.6,0,.18),[fore])
    for side,label in ((1,'Port'),(-1,'Starboard')):
        outline=[(-2.2,1.5),(-5.8,4),(-6.8,3.6),(-6.3,2.6),(-5.5,1.8),(-3,.7)]
        if side<0:outline=[(x,-y) for x,y in reversed(outline)]
        start=len(s.objects)
        F.plate(s,'Vane'+label,outline,z0=.12,thickness=.55,material='paint',chamfer=.3,side_material='paint2')
        F.band(s,'Vane'+label,(-5.6,side*3.0,0),(1,side*-.4,0),.15,'glow_cyan',facing=(0,0,1))
        F.light(s,'VaneNav'+label,(-6.2,side*3.5,.65),'glow_red' if side>0 else 'glow_green',size=.1)
        s.motion_group('anchor_vane_'+label.lower(),(-2.5,side*1.1,.12),s.objects[start:])
    for x in (-3.1,2.3):
        F.box(s,f'CoreBrace{x}',(x,0,.4),(.5,5.5,.35),'gunmetal',bevel=.1)
    F.nozzle(s,'AnchorDrive',(-8,0,.1),.9,1.15,material='gunmetal')
    s.hook('HOOK_DRIVE_CORE',(-7.9,0,.1))
    s.socket('SOCKET_Field_Core',(-.4,0,1.65),forward=(0,0,1))
    F.light(s,'Beacon',(-5.2,0,1.1),'glow_amber',size=.11)
    return s


def export(kind):
    ship=globals()['build_'+kind]().finish()
    # The whole-hull census also reads this legacy-compatible, truthful texture declaration.
    for material in ship._mats.values():
        if material.use_nodes and any(n.type=='TEX_IMAGE' and n.image for n in material.node_tree.nodes):
            material['textureRoleMode']='forge-shared'
    spec=E.fleet_spec('swarm_'+kind)
    written=E.export_ship(ship,spec,preview='--live' not in sys.argv)
    if '--live' in sys.argv:
        bank=motion_bank.MotionBank(ship,'swarm_'+kind,spec['asset_id'])
        clip=bank.clip('specialist_rest_contract',1/60)
        for group in ship.motion_groups:
            clip.key(group['id'],0,rot=(0,0,0)).key(group['id'],1/60,rot=(0,0,0))
        bank.bake([path for path,_tris in written],out_path=os.path.join(motion_bank.MOTIONS_DIR,f'swarm-{kind}.motion.json'))
