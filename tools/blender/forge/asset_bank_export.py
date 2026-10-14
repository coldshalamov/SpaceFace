"""Asset-bank adapter over canonical Forge. Units metres; glTF Y-up metadata.
No global collision hull is inferred. Factories may author topology-preserving LODs.
"""
import hashlib,json,os,struct
import bpy
from mathutils import Vector,Matrix
import forge_export as fe
from asset_bank_bounds import finalize_asset_bounds
from asset_bank_cost import scene_cost
from asset_bank_contract import validate_asset_id

def gltf(v):return [float(v[0]),float(v[2]),-float(v[1])]

def socket_rotation(forward):
    x=Vector(forward).normalized()
    preferred=Vector((0,0,1)) if abs(x.z)<.999 else Vector((0,1,0))
    z=(preferred-x*preferred.dot(x)).normalized();y=z.cross(x).normalized()
    return Matrix((x,y,z)).transposed().to_quaternion()

def canonicalize_triangle_order(path):
    """Stabilize Blender's nondeterministic face ordering without changing winding/topology."""
    data=bytearray(open(path,'rb').read());jlen=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+jlen]);binary=28+jlen;done=set()
    for mesh in doc.get('meshes',[]):
        for primitive in mesh['primitives']:
            index=primitive.get('indices')
            if index is None or index in done or primitive.get('mode',4)!=4:continue
            done.add(index);a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
            if v.get('byteStride'):raise ValueError('Unexpected interleaved index buffer')
            fmt={5121:'B',5123:'H',5125:'I'}[a['componentType']];count=a['count']
            if count%3:raise ValueError('Triangle index count is not divisible by three')
            offset=binary+v.get('byteOffset',0)+a.get('byteOffset',0)
            indices=struct.unpack_from('<'+fmt*count,data,offset)
            triangles=[]
            for i in range(0,count,3):
                tri=indices[i:i+3]
                triangles.append(min(tri,tri[1:]+tri[:1],tri[2:]+tri[:2]))
            triangles.sort();flat=[n for tri in triangles for n in tri]
            struct.pack_into('<'+fmt*count,data,offset,*flat)
    with open(path,'wb') as f:f.write(data)


def export_asset(ship,out_dir,asset_id,category,description,collision_boxes=None,tags=None,motion_contracts=None):
    validate_asset_id(asset_id)
    os.makedirs(out_dir,exist_ok=True);ship.finish();fe._rename_materials(ship)
    lo,hi=fe.ship_bounds(ship)
    sockets=[]
    for name,(pos,fwd) in ship.sockets.items():
        q=socket_rotation(fwd)
        socket={'name':name,'position':gltf(pos),'forward':gltf(Vector(fwd).normalized()),'up':gltf(q@Vector((0,0,1))),'role':'attachment','metadataFrame':'asset bind pose; use node world transform for motion'}
        group=getattr(ship,'bank_socket_groups',{}).get(name)
        if group:
            if group not in ship.motion_pivots:raise ValueError('Unknown socket motion group: '+group)
            socket['motionGroup']=group
        sockets.append(socket)
    solids=[{'type':'box','center':gltf(b['center']),'size':[b['size'][0],b['size'][2],b['size'][1]],'rotation':b.get('rotation_gltf',[0,0,0,1])} for b in collision_boxes or []]
    collision={'type':'compound-boxes' if solids else 'none','solids':solids,'status':'authored approximate solids' if solids else 'not authored; do not infer a global hull','clearanceValidation':'not certified; inspect listed solids for intended assembly'}
    base={'assetId':asset_id,'category':category,'description':description,'unit':'metre','coordinateSystem':'glTF +X forward +Y up +Z starboard','source':getattr(ship,'bank_source','tools/blender/forge'),'runtimeStatus':'authoring-library candidate; not registered or accepted for live runtime','surfaceGeometryRemaster':'forge-v1','sockets':sockets,'collision':collision,'motionGroups':[{'id':g['id'],'pivot':gltf(g['pivot']),'parent':g['parent'],'objects':[o.name for o in g['objects']],'animationStatus':'rigid pivot only; no animation clip'} for g in getattr(ship,'motion_groups',[])],'tags':tags or [],'bounds':{'min':[lo.x,lo.z,-hi.y],'max':[hi.x,hi.z,-lo.y]},'costPolicy':'measured per LOD; assembly-specific performance validation pending','lods':[]}
    if motion_contracts is not None:
        base['motionContracts']=[{**contract,'pivot':gltf(contract['pivotBlender']),'axis':gltf(contract['axisBlender']),
            'coordinateSystem':'glTF +X forward +Y up +Z starboard'} for contract in motion_contracts]
    # Preserve exact socket node names even when a source mesh was named identically.
    for obj in ship.objects:
        if obj.name in ship.sockets:obj.name='part_'+obj.name
    for level in range(3):
        authored=level>0 and callable(getattr(ship,'bank_lod_factory',None));source=ship
        if authored:
            source=ship.bank_lod_factory(level);source.finish();fe._rename_materials(source)
        root=fe._root_empty(asset_id.upper()+f'_LOD{level}_ROOT',{})
        meshes=fe._lod_meshes(source,0 if authored else level,f'LOD{level}')
        pivots=fe._mount_motion_pivots(ship,root)
        for m in meshes:
            if m.parent not in pivots:
                world=m.matrix_world.copy();m.parent=root;m.matrix_world=world
        empties=[]
        for socket in sockets:
            e=fe._root_empty(socket['name'],{'socket':True,'spaceface':socket})
            pos,fwd=ship.sockets[socket['name']];e.location=pos;e.rotation_mode='QUATERNION';e.rotation_quaternion=socket_rotation(fwd)
            bpy.context.view_layer.update();world=e.matrix_world.copy()
            e.parent=ship.motion_pivots.get(socket.get('motionGroup'),root);e.matrix_world=world;empties.append(e)
        path=os.path.join(out_dir,f'{asset_id}_lod{level}.glb');fe._export([root]+meshes+empties+pivots,path)
        def stamp(doc):
            meta={k:v for k,v in base.items() if k!='lods'};meta['lod']=level
            doc['asset']['generator']='SpaceFace Forge asset bank v1'
            doc['asset'].setdefault('extras',{})['spacefaceAsset']=meta
            doc['scenes'][doc.get('scene',0)].setdefault('extras',{})['spacefaceAsset']=meta
        canonicalize_triangle_order(path)
        doc=fe.patch_glb_json(path,stamp)
        # Count reachable mesh occurrences, including non-indexed primitives.
        costs=scene_cost(doc)
        with open(path,'rb') as exported: digest=hashlib.sha256(exported.read()).hexdigest()
        base['lods'].append({'level':level,'file':os.path.basename(path),**costs,'bytes':os.path.getsize(path),'method':'authored-topology' if authored else ('source' if level==0 else 'Forge-decimation'),'sha256':digest})
        for pivot in pivots:
            if pivot.parent==root:
                world=pivot.matrix_world.copy();pivot.parent=None;pivot.matrix_world=world
        fe._clear_export_objects([root]+meshes+empties)
        if authored:fe._clear_export_objects(source.objects)
    finalize_asset_bounds(base,out_dir)
    with open(os.path.join(out_dir,asset_id+'.json'),'w') as f:json.dump(base,f,indent=2);f.write('\n')
    return base

def render_preview(ship,path,title=None,width=900,height=700,samples=64):
    """CPU source review, not the game's renderer."""
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=samples;scene.cycles.use_denoising=False
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    lo,hi=fe.ship_bounds(ship);center=(lo+hi)*.5;span=max(hi-lo)
    scene.world=bpy.data.worlds.new('AssetReviewWorld');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.045,.06,.085,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
    for name,offset,energy,color in [('Key',(1,-2,3),1500,(1,.87,.69)),('Fill',(-2,-1,2),1800,(.65,.8,1))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy*max(span,1)**2/8;data.shape='DISK';data.size=span*2;data.color=color
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=center+Vector(offset)*span;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('ReviewCamera');obj=bpy.data.objects.new('ReviewCamera',data);scene.collection.objects.link(obj)
    obj.location=center+Vector((1.8,-2.4,1.8))*span;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO'
    basis=obj.rotation_euler.to_matrix().transposed();points=[basis@(Vector((x,y,z))-center) for x in (lo.x,hi.x) for y in (lo.y,hi.y) for z in (lo.z,hi.z)]
    dx=max(p.x for p in points)-min(p.x for p in points);dy=max(p.y for p in points)-min(p.y for p in points)
    data.ortho_scale=max(dx,dy*width/height)*1.15;scene.camera=obj;scene.render.filepath=path;bpy.ops.render.render(write_still=True)

def render_glb_preview(glb_path,image_path,**render_options):
    """Clear scene and render freshly reimported GLB, not game-pipeline evidence."""
    from types import SimpleNamespace
    from forge import reset_scene
    reset_scene();bpy.ops.import_scene.gltf(filepath=os.path.abspath(glb_path))
    render_preview(SimpleNamespace(objects=[o for o in bpy.context.scene.objects if o.type=='MESH']),image_path,**render_options)
