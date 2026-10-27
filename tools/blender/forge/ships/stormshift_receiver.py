"""Stormshift receiver: open jaws, sidecar workshop.

One distinct Forge hull, not a Span reskin. Fixed segmented receiving rails, fixed
asymmetric service boom and separate storage saddle. Only the recessed status
shutter moves, wholly inside its housing. Sockets are authored metadata, NOT a
claim that the existing radial service point has moved onto the decorative arm.
Candidate export: blender -b -t 2 --python this.py -- --out <packet>
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector, Euler
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import forge as F
import forge_export as E
sys.path.insert(0, str(HERE.parent / 'animations'))
import motion_bank

SHIP_ID = 'stormshift_receiver'
SPEC = {'layout': 'npc', 'file': 'ship_stormshift_receiver_v01',
        'asset_id': 'SF_STORMSHIFT_RECEIVER_V01', 'part_id': 'wholeship_ship_stormshift_receiver_v01',
        'npc_root': 'STORMSHIFT_RECEIVER_ROOT'}
COLORS = {'paint': '#668480', 'paint2': '#353f47', 'stripe': '#b65e2f',
          'hazard': '#b88738', 'ceramic': '#252b30'}
# Exact authored box solids, in Blender metres. Kept as a small shared source
# contract so the JS compound is checked against the exported geometry, not a
# second hand-drawn envelope. Rotations are Blender Z / negated runtime yaw.
SOLIDS = [
    ('workshop', (-7.5, 0, 0), (9, 11.8, 3.2), 0),
    ('drive_port', (-12.1, 3.4, -.2), (3.0, 2.4, 2.3), 0),
    ('drive_starboard', (-12.1, -3.4, -.2), (3.0, 2.4, 2.3), 0),
    ('port_spine', (4.7, 5.0, -.4), (15.4, 1.1, 1.7), 0),
    ('starboard_spine', (4.7, -5.0, -.4), (15.4, 1.1, 1.7), 0),
    ('saddle_root', (-6.4, -7.0, -.2), (2.4, 3, 1.4), 0),
    ('saddle_inner', (-2.3, -7.8, -.35), (10.6, .7, .7), 0),
    ('saddle_outer', (-2.3, -10.5, -.35), (10.6, .7, .7), 0),
    ('saddle_aft', (-7.3, -9.15, -.35), (.7, 3.4, .7), 0),
    ('saddle_front', (2.7, -9.15, -.35), (.7, 3.4, .7), 0),
    ('arm_root', (-4.2, 6.7, .2), (3, 2.5, 1.5), 0),
    ('arm_upper', (-.6, 8.2, .7), (6.8, 1.0, 1.0), .20),
    ('arm_fore', (5.0, 7.7, .8), (5.4, .85, .9), -.43),
    ('service_head', (7.5, 6.6, .8), (1.8, 1.6, 1.5), 0),
    ('port_bumper', (13.6, 4.8, .1), (.5, 1.7, 2.7), 0),
    ('starboard_bumper', (13.6, -4.8, .1), (.5, 1.7, 2.7), 0),
]
for sign, label in ((1, 'port'), (-1, 'starboard')):
    for i, x in enumerate((-.6, 3.5, 7.6, 11.7)):
        SOLIDS.append((f'{label}_segment_{i}', (x, sign * 4.8, .15), (3.5, 1.5, 2.8), 0))


# Keep the reviewed render meshes unchanged. Collision envelopes include their
# attached wear strips, drive bells, bearing caps and workshop trim explicitly.
VISUAL_SOLIDS = tuple(SOLIDS)
_ENVELOPES = {
    'workshop': ((-7.31, 0, 0), (9.38, 12.0, 3.2)),
    'drive_port': ((-12.26, 3.4, -.2), (3.32, 2.5, 2.4)),
    'drive_starboard': ((-12.26, -3.4, -.2), (3.32, 2.5, 2.4)),
    'saddle_inner': ((-2.3, -7.8, -.35), (10.6, .85, .7)),
    'saddle_outer': ((-2.3, -10.5, -.35), (10.6, .85, .7)),
    'port_bumper': ((13.625, 4.8, .1), (.55, 1.7, 2.7)),
    'starboard_bumper': ((13.625, -4.8, .1), (.55, 1.7, 2.7)),
}
SOLIDS = [(name, *_ENVELOPES[name], angle) if name in _ENVELOPES else
          (name, pos, (size[0], 1.8, size[2]), angle) if '_segment_' in name else
          (name, pos, size, angle) for name, pos, size, angle in VISUAL_SOLIDS]
SOLIDS.extend([
    ('coupling', (-2.4, 0, .15), (.56, 1.7, 1.7), 0),
    ('elbow_bearing', (2.7, 8.8, 1.025), (1.32, 1.32, 1.65), 0),
    ('wrist_bearing', (7.1, 6.7, 1.025), (1.32, 1.32, 1.65), 0),
])


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    for name, pos, size, angle in VISUAL_SOLIDS:
        mat = 'paint2' if any(k in name for k in ('spine', 'saddle', 'drive')) else 'paint'
        if 'arm_' in name or name == 'service_head': mat = 'paint2'
        if 'bumper' in name: mat = 'dark'
        F.box(s, name, pos, size, mat, bevel=.10, rot_z=angle)
    # Open jaws are eight discrete cast housings over continuous dark rails.
    # No floor, central crossbeam or collision hull spans the receiving void.
    for sign, label in ((1, 'port'), (-1, 'starboard')):
        for i, x in enumerate((-.6, 3.5, 7.6, 11.7)):
            F.box(s, f'{label}Crown{i}', (x, sign*4.8, 1.64), (2.9, 1.36, .22), 'paint2', bevel=.07)
            F.box(s, f'{label}RailWear{i}', (x, sign*3.99, .18), (2.6, .16, 1.6), 'bare', bevel=.025)
            F.box(s, f'{label}Latch{i}', (x+.7, sign*4.8, 1.83), (.45, .85, .2), 'hazard', bevel=.03)
            F.box(s, f'{label}Guide{i}', (x, sign*3.94, 1.0), (1.45, .08, .09), 'glow_cyan', bevel=.01)
            F.cylinder(s, f'{label}Pin{i}', (x-1.0, sign*4.8, 1.7), (x-1.0, sign*4.8, 1.95), .22, material='bare', segments=12)
        F.box(s, f'{label}HazardNose', (13.86, sign*4.8, .9), (.08, 1.3, .42), 'hazard', bevel=.02)
    # Rear workshop is a stepped cabin and service machinery, not six freight boxes.
    F.box(s, 'WorkshopRoof', (-8, 0, 1.72), (6.6, 9.8, .28), 'paint2', bevel=.15)
    F.box(s, 'OffsetCab', (-5.1, 2.2, 2.25), (3.0, 3.1, 1.35), 'paint', bevel=.24)
    F.box(s, 'CabFrontGlass', (-3.54, 2.2, 2.42), (.12, 2.4, .65), 'glass', bevel=.06)
    F.box(s, 'CabWindowLamp', (-3.46, 2.2, 2.34), (.06, 1.7, .12), 'glow_warm', bevel=.015)
    F.box(s, 'ReceiverBackplate', (-2.9, 0, .1), (.24, 7.5, 2.4), 'dark', bevel=.08)
    for y in (-2.8, 2.8):
        F.box(s, 'BackplateRunner'+str(y), (-2.72, y, .1), (.2, .3, 2.0), 'hazard', bevel=.03)
    F.cylinder(s, 'CouplingDrum', (-2.7, 0, .15), (-2.2, 0, .15), .85, material='gunmetal', segments=24)
    F.cylinder(s, 'CouplingFace', (-2.21, 0, .15), (-2.12, 0, .15), .57, material='bare', segments=24)
    for x in (-9.8, -7.5):
        F.vent(s, 'CoolantVent'+str(x), (x, -1.9, 1.92), (1.6, 3.6, .14), slats=7)
    # Workshop iteration: exposed replacement cylinders and a recessed tool tray
    # break up the broad roof while staying inside the existing fixed body.
    F.box(s, 'ToolTray', (-9.2,2.2,1.96), (3.4,3.0,.18), 'dark', bevel=.05)
    for i, y in enumerate((1.35,2.2,3.05)):
        F.cylinder(s, f'ReplacementCylinder{i}', (-10.3,y,2.3), (-8.15,y,2.3), .28, material='paint2', segments=16)
        F.cylinder(s, f'CylinderCap{i}', (-8.16,y,2.3), (-8.02,y,2.3), .22, material='hazard', segments=16)
    for x in (-10.1,-8.35):
        F.box(s, 'TrayTie'+str(x), (x,2.2,2.5), (.16,2.6,.12), 'bare', bevel=.02)
    F.windows(s, 'WorkshopWindows', -10.0, -4.5, 5.94, .7, 4, size=(.65,.24), finish='glow_warm', mirror=True)
    # Main drives retain actual engine and Massline ownership sockets.
    for sign in (-1, 1):
        F.nozzle(s, 'Drive'+str(sign), (-13.9, sign*3.4, -.2), .8, 1.0, material='gunmetal', bell=1.12)
        F.box(s, 'DriveCollar'+str(sign), (-12.9, sign*3.4, -.2), (.3, 2.5, 2.4), 'stripe', bevel=.04)
    s.hook('HOOK_DRIVE_CORE', (-13.9, 0, -.2))
    s.socket('SOCKET_Engine_Main', (-13.9, 0, -.2), (-1, 0, 0))
    s.socket('SOCKET_Trail_Main', (-14.1, 0, -.2), (-1, 0, 0))
    s.socket('SOCKET_Tether_Massline', (-9.5, 0, 2.1), (-1, 0, 0))
    F.box(s, 'TowFoot', (-9.5, 0, 2.0), (1.4, 1.0, .35), 'gunmetal', bevel=.08)
    F.ring(s, 'TowEye', (-9.5, 0, 2.25), .4, .10, material='bare')
    # Fixed elbowed arm, with visible bearings, piston and tool collar. Articulation
    # remains unaccepted until a physics owner can move these load-bearing solids.
    for name, x, y, z in [('Shoulder', -3.6, 7.2, 1.0), ('Elbow', 2.7, 8.8, 1.1), ('Wrist', 7.1, 6.7, 1.1)]:
        F.cylinder(s, name, (x,y,z-.7), (x,y,z+.55), .66, material='gunmetal', segments=20)
        F.cylinder(s, name+'Cap', (x,y,z+.55), (x,y,z+.7), .48, material='hazard', segments=20)
    F.cylinder(s, 'HydraulicBarrel', (-2.4,8.1,1.45), (.8,8.7,1.45), .22, material='dark', segments=14)
    F.cylinder(s, 'HydraulicRam', (.5,8.65,1.45), (2.1,8.9,1.45), .12, material='bare', segments=12)
    F.box(s, 'ServiceToolCollar', (7.5, 6.6, 1.65), (1.2, 1.0, .25), 'hazard', bevel=.08)
    F.work_lamp(s, 'ToolWorkLamp', (7.5,6.4,1.9), aim=(.4,-.5,.1), size=.22, lens='glow_warm')
    # Separate saddle remains genuinely empty, preserving its negative space.
    for i, x in enumerate((-5.6,-2.3,1.0)):
        for y in (-7.8,-10.5):
            F.box(s, f'SaddleStop{i}_{y}', (x,y,.3), (.65,.85,.6), 'hazard', bevel=.08)
            F.box(s, f'SaddleShoe{i}_{y}', (x,y,.66), (.85,.65,.16), 'bare', bevel=.03)
    F.beams(s, 'SaddleBraces', [((-7,-6,0),(-7,-10.5,-.35)),((-4,-5.5,0),(-4,-7.8,-.35))], .22, 'gunmetal')
    # Recessed mechanical telltale, never a capacity display or repair animation.
    F.box(s, 'StatusHousing', (-5.2,-3.2,2.05), (2.0,1.7,.45), 'dark', bevel=.08)
    start=len(s.objects)
    F.box(s, 'StatusShutter', (-5.2,-3.2,2.31), (1.0,.45,.08), 'hazard', bevel=.035)
    s.motion_group('stormshift_receiver_status', (-5.2,-3.2,2.31), s.objects[start:])
    s.detail=1
    F.ladder(s, 'WorkshopLadder', (-9.8,-5.95,-1.0), (-9.8,-5.95,1.6), .6, 7, 'bare')
    F.antenna(s, 'Mast', (-10.3,3.8,1.9), 1.5, tip='glow_red')
    F.rcs(s, 'RcsPort', (-10.8,5.8,.2), size=.35)
    F.rcs(s, 'RcsStarboard', (-10.8,-5.8,.2), size=.35)
    s.detail=0
    F.light(s, 'NavPort', (12.5,5.6,1.1), 'glow_red', size=.15)
    F.light(s, 'NavStarboard', (12.5,-5.6,1.1), 'glow_green', size=.15)
    F.beacon(s, 'WorkshopBeacon', (-5.2,2.2,3.0), finish='glow_amber', size=.20)
    s.socket('SOCKET_Receive', (-2.05,0,.15), (1,0,0))
    s.socket('SOCKET_Service', (7.5,5.75,.8), (0,-1,0))
    s.socket('SOCKET_Storage', (-2.3,-9.15,.2), (0,0,1))
    s.receiver_contract={'schemaVersion':1,'sourceSolids':[{'id':n,'center':list(c),'size':list(sz),'angle':a} for n,c,sz,a in SOLIDS],
        'receivingVoid':{'x':[-2,13.5],'port':[-3.8,3.8]},
        'motion':{'node':'MOTION_STORMSHIFT_RECEIVER_STATUS','maxAngle':.35,'role':'recessed status shutter only'},
        'capacityAuthority':'existing anvilWork owner, 48 finite units; no authored cargo generated',
        'interaction':'sockets are metadata only; existing radial service point unchanged',
        'collisionPolicy':'source-derived compound; fixed load-bearing rails, arm and saddle; no convex mouth closure'}
    return s


def compound_mesh(ship, parent, sources=None):
    """Exporter-local disconnected box mesh; never take the convex hull of a U."""
    verts=[];faces=[]
    for _, (x,y,z), (sx,sy,sz), a in SOLIDS:
        base=len(verts)
        for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            u=dx*sx/2;v=dy*sy/2
            verts.append((x+u*math.cos(a)-v*math.sin(a),y+u*math.sin(a)+v*math.cos(a),z+dz*sz/2))
        faces.extend([tuple(base+i for i in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]])
    mesh=bpy.data.meshes.new('COLLISION_HULL');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('COLLISION_HULL',mesh);bpy.context.scene.collection.objects.link(obj)
    obj.parent=parent;obj['collision']=True;obj['nonRender']=True;obj.hide_render=True
    obj['spacefaceCollision']='disconnected-source-compound; use stormshiftReceiverCollision runtime manifest'
    return obj


def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path);p.add_argument('--live',action='store_true')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.live and args.out is not None:p.error('--live cannot be combined with --out')
    args.out=Path(E.WHOLESHIP_DIR) if args.live else (args.out or HERE.parents[3]/'.devshots/stormshift-receiver-candidate')
    if args.live:
        registered=E.fleet_spec(SHIP_ID)
        assert all(registered.get(k)==v for k,v in SPEC.items()), 'Fleet registration must match source SPEC'
    args.out.mkdir(parents=True,exist_ok=True)
    ship=build().finish();lo,hi=E.ship_bounds(ship)
    contract=ship.receiver_contract
    contract.update({'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'boundsBlender':[list(lo),list(hi)],'dimensions':list(hi-lo),'spec':SPEC})
    original=E._collision_hull
    try:
        E._collision_hull=compound_mesh
        written=E.export_ship(ship,SPEC,out_dir=str(args.out),preview=True)
    finally:E._collision_hull=original
    def stamp(doc):
        doc['asset'].setdefault('extras',{})['stormshiftReceiver']=contract
        scale=1.72/(hi.x-lo.x)*18
        doc['asset']['extras']['authoredCompound']={'schema':'spaceface.authoredCompound.v1',
            'assetId':SPEC['asset_id'],'sourceSha256':contract['sourceSha256'],
            'collision':{'boxes':[{'name':n,'centerWU':[c[0]*scale,c[2]*scale,-c[1]*scale],
                'sizeWU':[size[0]*scale,size[2]*scale,size[1]*scale],'angleY':-a} for n,c,size,a in SOLIDS]},
            'strictClearVolumes':{'fixed-service':[{'x':[-2*scale,13.5*scale],'z':[-3.8*scale,3.8*scale]}]}}

        for node in doc['nodes']:
            name=node.get('name')
            if name in ship.sockets:node['extras']['spaceface']['forward']=E._gltf_dir(ship.sockets[name][1])
    for path,tris in written:E.patch_glb_json(path,stamp)
    bank=motion_bank.MotionBank(ship, 'stormshift_receiver', SPEC['asset_id'])
    for name, a0, a1 in [('receiver_ready',0,.35),('receiver_closed',.35,0)]:
        clip=bank.clip(name,.3,loop=False,end_mode='hold')
        clip.key('stormshift_receiver_status',0,rot=Euler((0,0,a0)))
        clip.key('stormshift_receiver_status',.3,rot=Euler((0,0,a1)))
    bank_path=HERE.parents[3]/'assets/ships/motions/stormshift-receiver.motion.json' if args.live else args.out/'stormshift-receiver.motion.json'
    bank.bake([path for path,_ in written],out_path=str(bank_path))
    if args.live:return
    contract['lod0Triangles']=written[0][1]
    (args.out/'source-report.json').write_text(json.dumps(contract,indent=2)+'\n')
    # Editable source scene is recovery material, not evidence of gameplay integration.
    bpy.ops.wm.save_as_mainfile(filepath=str(args.out/'stormshift-receiver-source.blend'))

if __name__=='__main__':main()
