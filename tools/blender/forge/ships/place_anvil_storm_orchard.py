"""Anvil Storm Orchard: three storm-bent harvest crescents.

New reconstruction, not recovered bytes or inherited acceptance. Source units are
metres, 1 m = 1 WU; +X is the open approach, +Y port, +Z up. Each socket has a
real 4 m pod cavity and two rigid collar jaws. Collision is extracted from the
finished named source groups, never from the union silhouette of the installation.
The game's normal owner supplies the planet-relative world transform and motion.

Preview/build: blender -b --python tools/blender/forge/ships/place_anvil_storm_orchard.py
Optional -- --render-dir .devshots/orchard-source/cycle01 renders source previews.
These previews are source inspection, not live game-camera visual acceptance.
"""
import argparse
import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parent.parent))
import forge as F
import forge_export as E

ROOT = HERE.parents[4]
SHIP_ID = 'place_anvil_storm_orchard'
POD_ID = 'place_anvil_condensate_pod'
REVISION = 'orchard-reconstruction-2026-10-11-v7'
BEARING_CONTRACT = 'orchard-internal-bearing-domain-v1'
RADIUS = 70.0
POD_RADIUS = 2.2
COLORS = {
    'paint': '#456981', 'paint2': '#697780', 'gunmetal': '#242e36',
    'stripe': '#2c8193', 'hazard': '#aa762b', 'glow_amber': '#ffad38',
}
# Source-author coordinates. The middle station sits 6 m forward on the arc.
SLOTS = [(0.0, 40.0), (6.0, 0.0), (0.0, -40.0)]
POD_CENTER_X = 7.5
JAW_PIVOT_X, JAW_PIVOT_Y = 5.0, 4.5
JAW_TIP_X, JAW_TIP_Y = 12.5, 0.65
JAW_WIDTH = 0.7
# The abutment stands behind a real lowered stem, fixed pin and hollow sleeve.
# Native planar convex proxies conservatively fill the non-navigable sleeve bore.
# Only each named same-parent pair has a certified internal bearing domain;
# external bodies always encounter the complete, unchanged proxy geometry.
BEARING_ABUTMENT_X = JAW_PIVOT_X - (0.54 + 0.47 + 0.20)
SHOULDER_TIP_X = BEARING_ABUTMENT_X + 0.51
BEARING_DOMAIN_HALF = 0.70


def bearing_domains(rigs):
    return [{'id':r['id']+'_bearing', 'fixedPartId':f"s{r['socket']}-shoulder-{r['side']}",
             'movingPartId':r['partId'], 'pivot':r['pivot'],
             'planarBox':{'minX':r['pivot']['x']-BEARING_DOMAIN_HALF,
                          'maxX':r['pivot']['x']+BEARING_DOMAIN_HALF,
                          'minZ':r['pivot']['z']-BEARING_DOMAIN_HALF,
                          'maxZ':r['pivot']['z']+BEARING_DOMAIN_HALF},
             'nativeY':'full-owner-planar-prism-extrusion'} for r in rigs]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def gltf(v):
    return [round(float(v[0]), 6), round(float(v[2]), 6), round(-float(v[1]), 6)]


def hull(points):
    points = sorted(set((round(p[0], 6), round(p[1], 6)) for p in points))
    def side(rows):
        out = []
        for p in rows:
            while len(out) > 1:
                a, b = out[-2], out[-1]
                if (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]) > 1e-7:
                    break
                out.pop()
            out.append(p)
        return out
    return side(points)[:-1] + side(points[::-1])[:-1]


def add_group(groups, key, ship, start, moving=False):
    objects = ship.objects[start:]
    for o in objects:
        o['orchardCollisionPart'] = key
    groups.append({'id': key, 'objects': objects, 'moving': moving})


def solid_panel(ship, name, vertices, material='paint', thickness=0.9):
    """A closed, low-curvature crescent panel finished by the shared Forge kit."""
    bm = bmesh.new()
    bottom = [bm.verts.new(p) for p in vertices]
    top = [bm.verts.new((p[0], p[1], p[2]+thickness)) for p in vertices]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    for i in range(len(bottom)):
        j = (i + 1) % len(bottom)
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ship.add(F._new_object(name, bm, ship.slots([material]), bevel=0.12, smooth_angle=30.0, uv_scale=0.35))


def rail(ship, name, a, b, width, depth, material='gunmetal', bevel=0.05):
    delta = Vector(b)-Vector(a)
    obj = F.box(ship, name, (Vector(a)+Vector(b))/2,
                (delta.length, width, depth), material=material,
                bevel=bevel, rot_z=math.atan2(delta.y, delta.x), uv_scale=0.5)
    return obj


def build_frame():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    groups, rigs = [], []
    for slot, (bx, by) in enumerate(SLOTS):
        prefix = f'S{slot}'
        # Three convex low-curvature leaves retain the concave trailing opening.
        # The flat crest and swept tips read as a crescent rather than an arrowhead.
        ys = [-15, -5, 5, 15]
        back = [-7, -25, -25, -7]
        front = [-5, -13, -13, -5]
        heights = [18, 23, 23, 18]
        for k in range(3):
            start = len(s.objects)
            v = [(bx+back[k], by+ys[k], heights[k]),
                 (bx+front[k], by+ys[k], heights[k]+1.2),
                 (bx+front[k+1], by+ys[k+1], heights[k+1]+1.2),
                 (bx+back[k+1], by+ys[k+1], heights[k+1])]
            panel = solid_panel(s, f'{prefix}_Crescent{k}', v)
            # Ribs and seams are attached to the panel, not independent floating trim.
            F.beams(s, f'{prefix}_LeadingRib{k}', [(v[0], v[3])], .65, material='paint2')
            F.beams(s, f'{prefix}_TrailingLip{k}', [(v[1], v[2])], .3, material='stripe')
            s.detail = 1
            for t in (.25, .5, .75):
                a = Vector(v[0]).lerp(Vector(v[3]), t)
                b = Vector(v[1]).lerp(Vector(v[2]), t)
                a.z += .96; b.z += .96
                F.beams(s, f'{prefix}_PanelSeam{k}_{t}', [(a, b)], .085, material='gunmetal')
            s.detail = 0
            add_group(groups, f's{slot}-fin-{k}', s, start)
        start = len(s.objects)
        F.box(s, prefix+'_RootHousing', (bx-17.5, by, 3.5), (7.5, 5.6, 9), 'gunmetal', bevel=.3)
        F.truss(s, prefix+'_Mast', (bx-17.5, by, 7.5), (bx-19.5, by, 23.5), 3.4, 5,
                material='gunmetal', chord=.42, web=.22)
        F.cylinder(s, prefix+'_FinBearing', (bx-19.5, by-2.65, 23.5), (bx-19.5, by+2.65, 23.5),
                   .9, material='paint2', segments=16)
        F.box(s, prefix+'_PumpCasing', (bx-15.0, by, 6), (2.1, 4.8, 3.8), 'paint2', bevel=.18)
        F.band(s, prefix+'_PumpCasing', (bx-15,by,6), (0,0,1), .55, 'stripe')
        s.detail = 1
        F.ladder(s, prefix+'_ServiceLadder', (bx-13.7,by,1), (bx-13.7,by,9), 1.4, 13, material='paint2')
        F.box(s, prefix+'_ReadinessLamp', (bx-13.81, by, 7.5), (.16,1.4,.22), 'glow_amber', bevel=.02)
        s.detail = 0
        add_group(groups, f's{slot}-mast', s, start)
        for sign, side in ((1, 'port'), (-1, 'starboard')):
            start = len(s.objects)
            # The stationary shoulder stops behind the rotating sleeve. Its lower
            # stem supports a real pin through the empty bore; axial caps retain
            # the sleeve without intersecting its material at any yaw.
            outline = [(bx-16.4, by+sign*1.5), (bx+SHOULDER_TIP_X, by+sign*3.95),
                       (bx+SHOULDER_TIP_X, by+sign*5.0), (bx-16.4, by+sign*3.1)]
            if sign < 0: outline.reverse()
            F.plate(s, f'{prefix}_{side}_Shoulder', outline, -1.05, 2.1,
                    material='gunmetal', bevel=.09)
            rail(s, f'{prefix}_{side}_PressureLine', (bx-14,by+sign*2.35,1.12),
                 (bx+BEARING_ABUTMENT_X,by+sign*4.5,1.12), .28,.26,'paint2')
            F.cylinder(s, f'{prefix}_{side}_BearingAbutment', (bx+BEARING_ABUTMENT_X,by+sign*4.5,-1.4),
                       (bx+BEARING_ABUTMENT_X,by+sign*4.5,1.4), .54, material='gunmetal', segments=16)
            pin=(bx+JAW_PIVOT_X, by+sign*JAW_PIVOT_Y)
            rail(s, f'{prefix}_{side}_BearingLowerStem',
                 (bx+BEARING_ABUTMENT_X,pin[1],-1.10), (pin[0],pin[1],-1.10),
                 .46,.34,'gunmetal',.025)
            F.cylinder(s, f'{prefix}_{side}_BearingPin',
                       (*pin,-1.25),(*pin,1.05),.23,material='paint2',segments=16)
            for cap_z in (-1.05,.95):
                F.cylinder(s, f'{prefix}_{side}_BearingCap_{cap_z}',
                           (*pin,cap_z),(*pin,cap_z+.20),.36,material='paint2',segments=16)
            add_group(groups, f's{slot}-shoulder-{side}', s, start)
            start = len(s.objects)
            pivot = (bx+JAW_PIVOT_X, by+sign*JAW_PIVOT_Y, 0)
            tip = (bx+JAW_TIP_X, by+sign*JAW_TIP_Y, 0)
            # The rail starts outside the bore, welded into the sleeve's outer
            # wall. A rail starting at the pivot would silently plug that bore.
            rail_start=Vector(pivot)+(Vector(tip)-Vector(pivot)).normalized()*.40
            rail(s, f'{prefix}_{side}_CollarJaw', rail_start, tip, JAW_WIDTH, 1.45, 'hazard', .09)
            F.annulus(s, f'{prefix}_{side}_JawBearingSleeve', pivot[:2], .30,.47,-.65,1.30,
                      material='hazard',segments=16,bevel=.015)
            part_id = f's{slot}-jaw-{side}'
            add_group(groups, part_id, s, start, moving=True)
            rig_id = f'orchard_s{slot}_{side}'
            s.motion_group(rig_id, pivot, s.objects[start:])
            rigs.append({'id':rig_id, 'node':f'MOTION_{rig_id.upper()}', 'slot':slot,'socket':slot,
                         'pivot':dict(zip(('x','y','z'),gltf(pivot))),'yawSign':sign,
                         'side':side, 'partId':part_id, 'movingParts':[part_id],
                         'pivotGltf':gltf(pivot), 'signedOpenRadians':sign*math.pi/2,
                         'nativeSteps':30, 'nativeAxis':[0,1,0], 'bearingDomainId':rig_id+'_bearing'})
        start=len(s.objects)
        # A real narrow feed stem terminates at the pod's aft coupler. Its own convex
        # proxy leaves the broad space between shoulders open, with a 0.2 m face gap.
        F.cylinder(s, prefix+'_FeedStem', (bx-13.8,by,0), (bx+4.9,by,0),
                   .30, material='gunmetal', segments=12)
        F.cylinder(s, prefix+'_ReceiverHead', (bx+4.5,by,0), (bx+5.18,by,0),
                   .48, material='paint2', segments=16)
        add_group(groups, f's{slot}-receiver-stem', s, start)
        s.socket(f'SOCKET_Orchard_Pod_{slot}', (bx+POD_CENTER_X,by,0))
    # Only two narrow beams join the arc. There is no solid convex curtain between posts.
    for k in range(2):
        start=len(s.objects)
        a=(SLOTS[k][0]-17.5,SLOTS[k][1],1)
        b=(SLOTS[k+1][0]-17.5,SLOTS[k+1][1],1)
        F.truss(s, f'Spine_{k}', a,b,2.6,10,material='gunmetal',chord=.30,web=.18)
        add_group(groups,f'spine-{k}',s,start)
    # Attached service deck occupies the inter-socket gap, leaving all three +X approaches clear.
    start=len(s.objects)
    rail(s,'ServiceDeckBridge',(-14.5,-20,0),(19,-20,0),1.6,1.4,'gunmetal',.07)
    add_group(groups,'service-bridge',s,start)
    start=len(s.objects)
    F.box(s,'SafeServiceDeck',(29,-20,-.8),(20,14,1.6),'paint2',bevel=.3)
    for yy in (-26.6,-13.4):
        F.box(s,f'DeckEdge{yy}',(29,yy,.2),(19,.4,.45),'hazard',bevel=.05)
    for xx in (25,33):
        F.box(s,f'DeckHoldingMark{xx}',(xx,-20,.025),(.18,7,.08),'hazard',bevel=.015)
    F.box(s,'DeckEquipment',(20.4,-20,.5),(2.1,7,2),'gunmetal',bevel=.2)
    for xx in (22,36):
        for yy in (-26.2,-13.8):
            F.box(s,f'DeckLamp{xx}_{yy}',(xx,yy,.5),(.6,.24,.18),'glow_amber',bevel=.02)
    add_group(groups,'safe-platform',s,start)
    s.socket('SOCKET_Structure_Core',(-11.5,0,1))
    s.socket('SOCKET_Camera_Focus',(-3,0,7))
    s.socket('SOCKET_Safe_Holding',(30,-20,3))
    s.socket_names=set(s.sockets)
    # Fixed-first is a stable serialized/native collider order, never an incidental export order.
    groups=sorted(groups,key=lambda g:g['moving'])
    return s,groups,rigs


def build_pod():
    F.reset_scene()
    s=F.Ship(POD_ID,COLORS)
    # Capsule with a 4 m longitudinal skin. Protected amber strips indicate this finite lot.
    F.loft(s,'CondensateCapsule',[dict(zip(('x','w','ht','hb','zc','n'),v)) for v in [
        (-2,.05,.05,.05,0,2),(-1.75,.75,.75,.75,0,2),
        (-1.2,1.25,1.25,1.25,0,2),(1.2,1.25,1.25,1.25,0,2),
        (1.75,.75,.75,.75,0,2),(2,.05,.05,.05,0,2)]],
        material='hazard',count=20)
    for x in (-1.05,1.05):
        F.cylinder(s,f'PressureBand{x}',(x-.12,0,0),(x+.12,0,0),1.31,
                   material='gunmetal',segments=20)
    for y in (-.88,.88):
        F.box(s,f'AmberReadout{y}',(0,y,.96),(1.35,.2,.12),'glow_amber',bevel=.025)
    F.cylinder(s,'Coupler',(-2.12,0,0),(-1.76,0,0),.37,material='paint2',segments=12)
    s.socket('SOCKET_Tether_Massline',(2.0,0,0))
    s.socket('SOCKET_Orchard_Coupler',(-2.12,0,0))
    s.socket('SOCKET_Camera_Focus',(0,0,0))
    s.socket_names=set(s.sockets)
    return s,[{'id':'pod-pressure-vessel','objects':s.objects[:],'moving':False}]


def extract(groups):
    out=[]
    for group in groups:
        points=[gltf(o.matrix_world@v.co) for o in group['objects'] for v in o.data.vertices]
        planar=hull([(p[0],p[2]) for p in points])
        if group['id'].endswith('-receiver-stem'):
            # Rapier's 3D quickhull can drop a tiny lower-face bevel vertex on
            # this long, thin prism. Enclose each of the two real cylinders by
            # its own source-derived support rectangle, then hull those six
            # outer corners. This preserves the receiver face and pod gap,
            # without a broad socket-filling AABB or a tolerance exception.
            support=[]
            for obj in group['objects']:
                vertices=[gltf(obj.matrix_world@v.co) for v in obj.data.vertices]
                xmin,xmax=min(p[0] for p in vertices),max(p[0] for p in vertices)
                zmin,zmax=min(p[2] for p in vertices),max(p[2] for p in vertices)
                support.extend([(xmin,zmin),(xmax,zmin),(xmax,zmax),(xmin,zmax)])
            planar=hull(support)
        out.append({'id':group['id'],'moving':group['moving'],
                    'points':[[x,z] for x,z in planar],
                    'minY':min(p[1] for p in points),'maxY':max(p[1] for p in points),
                    'sourceObjects':[o.name for o in group['objects']]})
    return out


def bounds(parts):
    lo=[min(x for p in parts for x,z in p['points']), min(p['minY'] for p in parts),
        min(z for p in parts for x,z in p['points'])]
    hi=[max(x for p in parts for x,z in p['points']), max(p['maxY'] for p in parts),
        max(z for p in parts for x,z in p['points'])]
    return {'min':lo,'max':hi,'center':[(a+b)/2 for a,b in zip(lo,hi)],
            'size':[b-a for a,b in zip(lo,hi)]}


def collision_mesh(part):
    bm=bmesh.new()
    bottom=[bm.verts.new((x,-z,part['minY'])) for x,z in part['points']]
    top=[bm.verts.new((x,-z,part['maxY'])) for x,z in part['points']]
    bm.faces.new(bottom);bm.faces.new(list(reversed(top)))
    for i in range(len(bottom)):
        j=(i+1)%len(bottom)
        bm.faces.new((bottom[i],bottom[j],top[j],top[i]))
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    obj=F._new_object('COLLISION_'+part['id'],bm,[],bevel=0)
    obj['collision']=True;obj['nonRender']=True;obj['orchardPartId']=part['id']
    obj.hide_render=True
    return obj


def export(ship,parts,rigs,file,asset_id,out):
    out.mkdir(parents=True,exist_ok=True)
    E._rename_materials(ship)
    root=E._root_empty('SF_'+file.upper()+'_ROOT',{})
    meshes=[]
    for level in (0,1,2):
        level_meshes=E._lod_meshes(ship,level,f'LOD{level}')
        for m in level_meshes:
            if m.parent is None:m.parent=root
        meshes.extend(level_meshes)
    E._mount_motion_pivots(ship,root)
    E._add_sockets(ship,root)
    for part in parts:
        obj=collision_mesh(part)
        # Root-space at rest: the independent native body applies the identical pivot map.
        obj.parent=root
    path=out/(file+'.glb')
    E._export([root]+list(root.children_recursive),str(path))
    E._stamp(str(path),{'assetId':asset_id,'partId':file,'liveId':file,'slot':'place',
              'category':'places','forge':{'version':1,'ship':ship.id},
              'geometryRevision':REVISION,'authoringSourceSha256':sha(HERE),
              'status':'new-reconstruction-unpromoted','collisionContract':'bounded-source-convex-parts',
              'internalBearings':{'revision':BEARING_CONTRACT,'domains':bearing_domains(rigs)}},'lod0')
    stats={}
    for level in (0,1,2):
        objects=[o for o in meshes if o.name.startswith(f'LOD{level}_')]
        stats[f'lod{level}']={'meshes':len(objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)}
    print('[forge]',path,stats)
    # Keep source render free of duplicate exported LODs and proxy volumes.
    for obj in [root]+list(root.children_recursive):
        obj.hide_render=True
    for obj in ship.objects:obj.hide_render=False
    return path,stats


def render_source(ship,rigs,pod_geometry,out):
    """Authored surface review only. Never substitutes for the live material/camera path."""
    out.mkdir(parents=True,exist_ok=True)
    # Add the separate pod source GLB for source-context inspection. It is not welded to the frame.
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(pod_geometry))
    imported=[o for o in bpy.data.objects if o not in before]
    for o in imported:
        if o.type=='MESH' and (not o.name.startswith('LOD0_') or 'COLLISION' in o.name):o.hide_render=True
    pod_roots=[o for o in imported if o.parent is None]
    # Each source GLB has a single canonical root. Duplicates retain independent object ancestry.
    for slot,(bx,by) in enumerate(SLOTS):
        for root in pod_roots:
            r=root if slot==0 else root.copy()
            if slot:
                bpy.context.scene.collection.objects.link(r)
                def clone_children(old,new):
                    for child in old.children:
                        c=child.copy();bpy.context.scene.collection.objects.link(c);c.parent=new
                        clone_children(child,c)
                clone_children(root,r)
            r.location=(bx+POD_CENTER_X,by,0)
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
    scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('OrchardSourceWorld')
    scene.world.color=(.025,.025,.025)
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.072,.10,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    scene.view_settings.view_transform='AgX'
    for name,loc,energy,size,color in [
        ('Key',(10,-40,100),160000,70,(.78,.87,1)),
        ('Fill',(-45,35,50),110000,60,(.35,.60,1)),
        ('WarmRim',(40,45,20),75000,45,(1,.64,.30))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(Vector((-3,0,8))-obj.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.objects.new('SourcePreviewCamera',bpy.data.cameras.new('SourcePreviewCamera'))
    scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO'
    def shot(name,loc,target,scale,opened=False):
        for rig in rigs:
            # Source objects have world-space mesh vertices, so use the same root-local transform
            # the export's pivot children inherit rather than rotating around each mesh origin.
            p=ship.motion_pivots[rig['id']]
            angle=rig['signedOpenRadians'] if opened else 0
            for o in next(g['objects'] for g in FRAME_GROUPS if g['id']==rig['partId']):
                from mathutils import Matrix
                pivot=Vector((rig['pivotGltf'][0],-rig['pivotGltf'][2],rig['pivotGltf'][1]))
                o.matrix_world=Matrix.Translation(pivot)@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-pivot)
        camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.ortho_scale=scale;scene.render.filepath=str(out/(name+'.png'))
        bpy.ops.render.render(write_still=True)
    shot('source-top-closed',(0,0,160),(-1,0,5),128)
    shot('source-inspect-closed',(100,-115,140),(-1,0,8),150)
    shot('source-socket-closed',(41,-23,43),(13.5,0,1),28)
    shot('source-socket-open',(41,-23,43),(13.5,0,1),28,True)


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--out-dir')
    p.add_argument('--live',action='store_true',help='Export the paired canonical source GLBs; publishing remains a separate command')
    p.add_argument('--render-dir')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out_dir) if args.out_dir else ROOT/('assets/ships/parts/places' if args.live else 'assets/ships/forge/preview')
    pod,pod_groups=build_pod();pod.finish();pod_parts=extract(pod_groups)
    pod_path,pod_stats=export(pod,pod_parts,[],POD_ID,'SF_PLACE_ANVIL_CONDENSATE_POD',out)
    frame,FRAME_GROUPS,rigs=build_frame();frame.finish();parts=extract(FRAME_GROUPS)
    frame_path,frame_stats=export(frame,parts,rigs,SHIP_ID,'SF_PLACE_ANVIL_STORM_ORCHARD',out)
    assert len(parts)<=32 and sum(p['moving'] for p in parts)==6
    data={'schemaVersion':1,'status':'new-reconstruction-unpromoted','geometryRevision':REVISION,
          'assetId':'SF_PLACE_ANVIL_STORM_ORCHARD','worldRecordId':'anvil_storm_orchard:frame',
          'sourcePath':str(HERE.relative_to(ROOT)),'sourceSha256':sha(HERE),
          'sourceSha':sha(HERE),'sourceRevision':REVISION,
          'sourceInputs':[{'path':str(p.relative_to(ROOT)),'sha256':sha(p)} for p in
              [HERE,HERE.with_name('place_anvil_condensate_pod.py'),HERE.parent.parent/'forge.py',HERE.parent.parent/'forge_export.py',HERE.parent.parent/'motion.py']
              + sorted((HERE.parent.parent/'textures').glob('forge_*.png'))],
          'sourceGlbPath':str(frame_path.relative_to(ROOT)),'sourceGlbSha256':sha(frame_path),
          'units':'metres','worldUnitsPerMetre':1,'sourceAxes':'+X nose,+Y port,+Z up',
          'gltfMapping':'x,z,-y','radius':RADIUS,'bounds':bounds(parts),
          'renderBasis':{'preserveAuthoredRoot':True,'scale':1,'translation':[0,0,0]},
          'parts':parts,'rigs':rigs,'bearingContractRevision':BEARING_CONTRACT,
          'bearingDomains':bearing_domains(rigs),
          'sockets':[{'slot':i,'node':f'SOCKET_Orchard_Pod_{i}',
                      'position':gltf((bx+POD_CENTER_X,by,0)),'rotationY':0,
                      'approachDirection':[1,0,0]} for i,(bx,by) in enumerate(SLOTS)],
          'pods':[{'socket':i,'pos':dict(zip(('x','y','z'),gltf((bx+POD_CENTER_X,by,0)))),'yaw':0} for i,(bx,by) in enumerate(SLOTS)],
          'pod':{'assetId':'SF_PLACE_ANVIL_CONDENSATE_POD','radius':POD_RADIUS,'mass':10,
                 'sourceGlbPath':str(pod_path.relative_to(ROOT)),'sourceGlbSha256':sha(pod_path),
                 'parts':pod_parts,'bounds':bounds(pod_parts),'lods':pod_stats},'lods':frame_stats}
    target=ROOT/'src/data/anvilOrchardGeometry.json'
    target.write_text(json.dumps(data,indent=2)+'\n')
    print('[forge] source-derived geometry',target,'parts',len(parts),'fixed',sum(not p['moving'] for p in parts))
    if args.render_dir:render_source(frame,rigs,pod_path,Path(args.render_dir))
