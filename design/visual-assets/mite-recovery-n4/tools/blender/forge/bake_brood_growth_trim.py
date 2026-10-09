"""Reversible shared anatomy-trim study. Normals are baked from actual relief geometry.
This is not a final high-to-low bake of the creature or a finished production UV unwrap.
"""
import bpy,math,json
from pathlib import Path

def bake_growth_trim(materials,meshes,out):
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    zones={'shell':(.015,.585),'soft':(.620,.795),'bone':(.830,.985)}
    def zone_at(v):
        for role,(lo,hi) in zones.items():
            if lo<=v<=hi:return role,(v-lo)/(hi-lo)
        return None,0
    def height(u,v):
        role,t=zone_at(v)
        if role is None:return 0
        envelope=math.sin(math.pi*t)**.6*(.38+.62*math.sin(math.pi*u)**2)
        if role=='shell':
            # Original meshed relief: irregularly spaced arcing growth courses,
            # tapered into the plate rather than uniform stripe rings.
            value=0
            centres=[.025+(i+.12*math.sin(i*1.91))*.0304 for i in range(32)]
            for i,c in enumerate(centres):
                q=t+(.027+.006*math.sin(i*1.7))*math.sin(math.pi*u)+.006*math.sin(2*math.pi*u+i*.73)
                width=.0029+.00065*(i%3)
                amplitude=.00042+.00011*math.sin(i*2.1)
                termination=.15+.85*math.sin(math.pi*u+i*.29)**4
                value+=amplitude*termination*math.exp(-((q-c)/width)**2)
            return envelope*value
        if role=='soft':return envelope*.0019*math.sin(2*math.pi*(7*t+.6*math.sin(math.pi*u)))
        return envelope*.000008*math.sin(2*math.pi*(24*t+.20*u*u))
    collection=bpy.data.collections.new('00_AUTHORING_ONLY_growth_trim_bake');bpy.context.scene.collection.children.link(collection)
    def patch(name,vs,fs):
        me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);collection.objects.link(ob);ob.location.z=-20;ob['authoring_only']=True;return ob
    nx=256;ny=1024;vs=[];fs=[]
    for j in range(ny+1):
        v=j/ny
        for i in range(nx+1):
            u=i/nx;vs.append((2*u-1,v-.5,height(u,v)))
    for j in range(ny):
        for i in range(nx):a=j*(nx+1)+i;fs.append((a,a+1,a+nx+2,a+nx+1))
    high=patch('HIGH_original_bowed_growth_relief',vs,fs)
    for p in high.data.polygons:p.use_smooth=True
    high['purpose']='Original editable meshed relief donor for a shared shell/tissue/keratin trim atlas; not creature geometry'
    low=patch('LOW_shared_anatomy_trim_receiver',[(-1,-.5,0),(1,-.5,0),(1,.5,0),(-1,.5,0)],[(0,1,2,3)])
    uv=low.data.uv_layers.new(name='TrimBakeUV')
    for loop in low.data.loops:
        co=low.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((co.x+1)/2,co.y+.5)
    target=bpy.data.images.new('Brood_shared_anatomy_normal',width=1024,height=512,alpha=False);target.colorspace_settings.name='Non-Color'
    mat=bpy.data.materials.new('AUTHORING_ONLY_bake_receiver');mat.use_nodes=True;low.data.materials.append(mat)
    node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=target;mat.node_tree.nodes.active=node;node.select=True
    for ob in bpy.context.scene.objects:ob.select_set(False)
    high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.render.bake.use_selected_to_active=True;scene.render.bake.use_cage=False;scene.render.bake.cage_extrusion=.01;scene.render.bake.max_ray_distance=.02;scene.render.bake.margin=8;scene.render.bake.normal_space='TANGENT'
    bpy.ops.object.bake(type='NORMAL')
    target.filepath_raw=str(out/'brood-shared-anatomy-normal.png');target.file_format='PNG';target.save();target.pack()
    pixels=[]
    for j in range(512):
        v=j/511;role,t=zone_at(v)
        for i in range(1024):
            u=i/1023
            if role=='shell':r=.420+.040*(math.exp(-(t/.11)**2)+math.exp(-((1-t)/.11)**2))+.017*math.sin(math.pi*(u+.24*t))**2
            elif role=='soft':r=.645+.030*math.sin(math.pi*u)**2
            elif role=='bone':r=.375+.025*math.sin(math.pi*u)**2
            else:r=.5
            pixels.extend((r,r,r,1))
    rough=bpy.data.images.new('Brood_shared_anatomy_roughness',width=1024,height=512,alpha=False);rough.colorspace_settings.name='Non-Color';rough.pixels.foreach_set(pixels);rough.filepath_raw=str(out/'brood-shared-anatomy-roughness.png');rough.file_format='PNG';rough.save();rough.pack()
    for ob in meshes:
        uv=ob.data.uv_layers.active
        if uv is None:
            uv=ob.data.uv_layers.new(name='AnatomyUV')
            coords=[v.co for v in ob.data.vertices];xmin=min(v.x for v in coords);xmax=max(v.x for v in coords);ymin=min(abs(v.y) for v in coords);ymax=max(abs(v.y) for v in coords)
            for loop in ob.data.loops:
                c=ob.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((xmax-c.x)/max(.0001,xmax-xmin),(abs(c.y)-ymin)/max(.0001,ymax-ymin))
        for face in ob.data.polygons:
            mat=ob.data.materials[face.material_index];role='bone' if mat==materials['bone'] else 'soft' if mat==materials['soft'] else 'shell';lo,hi=zones[role]
            for li in face.loop_indices:
                u,v=uv.data[li].uv;uv.data[li].uv=(.008+.984*min(1,max(0,u)),lo+(hi-lo)*min(1,max(0,v)))
        uv.name='BroodSharedAnatomyTrimUV';ob['uv_study']='Shared anatomy-directed trim atlas; shell, soft tissue and cutting keratin have separate padded regions'
    for role in ['shell','soft','bone']:
        mat=materials[role];nt=mat.node_tree;p=nt.nodes.get('Principled BSDF')
        tex=nt.nodes.new('ShaderNodeTexImage');tex.image=target;tex.interpolation='Linear'
        nm=nt.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value={'shell':.28,'soft':.20,'bone':.35}[role];nt.links.new(tex.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs['Normal'],p.inputs['Normal'])
        texr=nt.nodes.new('ShaderNodeTexImage');texr.image=rough;nt.links.new(texr.outputs['Color'],p.inputs['Roughness'])
        mat['surface_study']='One shared anatomy trim: geometry-baked normal and continuous role-directed roughness; no albedo noise'
    for ob in [high,low]:ob.hide_render=True;ob.hide_set(True);ob.select_set(False)
    collection.hide_render=True;collection.hide_viewport=True
    record={'status':'reversible shared trim bake study, not final creature UV/bake','normalSource':'Actual original editable high relief patch baked selected-to-active onto a low UV patch','highReliefQuads':nx*ny,'atlasSize':[1024,512],'regions':zones,'images':['brood-shared-anatomy-normal.png','brood-shared-anatomy-roughness.png'],'roughnessSource':'Continuous anatomy-zone authoring, not a texture bake','albedoNoise':False,'missingAnatomyPaintedIn':False}
    (out/'atlas-bake-receipt.json').write_text(json.dumps(record,indent=2));return record
