"""Shared anatomy UV trim loader for the lamellar Brood body.
The normal atlas was baked from the original relief mesh in bake_brood_growth_trim.
The exact pixels are pinned; changes must update this recipe deliberately.
"""
import bpy,hashlib
from pathlib import Path
import author_recovery_color_trim  # Newly authored deterministic palette is part of the source seal.
import bake_brood_growth_trim  # Included in the existing Forge source seal.
HERE=Path(__file__).resolve().parent
HASHES={'brood-shared-anatomy-normal.png': '6b02b679654f9036043d46376384a06f7aa90d0edbb1262523620b6521cb0417', 'brood-shared-anatomy-roughness.png': '4f2174f2863bdf63ca99543870f8ea3b62292aeca76d1166516b71b070e2afe2', 'brood-anatomical-albedo.png': '05d78a5b4ad92a4f2b319d24bb5659baf322e0cb3d6b6d6cb0e8a274acd8855e'}
ZONES={'shell':(.015,.585),'soft':(.620,.795),'bone':(.830,.985)}

def apply_anatomy_trim(materials,meshes):
    images={}
    for filename,expected in HASHES.items():
        path=HERE/'textures'/filename
        if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ValueError('Unreviewed shared anatomy atlas change: '+filename)
        role='albedo' if 'albedo' in filename else 'normal' if 'normal' in filename else 'roughness'
        im=bpy.data.images.load(str(path),check_existing=True);im.name='BroodShared_'+role.title();im.colorspace_settings.name='sRGB' if role=='albedo' else 'Non-Color';im.pack();images[role]=im
    for ob in meshes:
        uv=ob.data.uv_layers.active
        if uv is None:
            uv=ob.data.uv_layers.new(name='AnatomyUV');coords=[v.co for v in ob.data.vertices];xmin=min(v.x for v in coords);xmax=max(v.x for v in coords);ymin=min(abs(v.y) for v in coords);ymax=max(abs(v.y) for v in coords)
            for loop in ob.data.loops:
                c=ob.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((xmax-c.x)/max(.0001,xmax-xmin),(abs(c.y)-ymin)/max(.0001,ymax-ymin))
        for face in ob.data.polygons:
            mat=ob.data.materials[face.material_index];role='bone' if mat==materials['bone'] else 'soft' if mat==materials['soft'] else 'shell';lo,hi=ZONES[role]
            for li in face.loop_indices:
                u,v=uv.data[li].uv
                low,high=(.592,.612) if role=='shell' and ob.name.startswith('Tergite_') and face.normal.z<-.25 else (lo,hi)
                uv.data[li].uv=(.008+.984*min(1,max(0,u)),low+(high-low)*min(1,max(0,v)))
        uv.name='BroodSharedAnatomyTrimUV'
    for role in ['shell','soft','bone']:
        mat=materials[role];nt=mat.node_tree;p=nt.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(1,1,1,1)
        albedo=nt.nodes.new('ShaderNodeTexImage');albedo.image=images['albedo'];nt.links.new(albedo.outputs['Color'],p.inputs['Base Color'])
        tex=nt.nodes.new('ShaderNodeTexImage');tex.image=images['normal'];tex.interpolation='Linear'
        nm=nt.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value={'shell':.44,'soft':.30,'bone':.35}[role];nt.links.new(tex.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs['Normal'],p.inputs['Normal'])
        rough=nt.nodes.new('ShaderNodeTexImage');rough.image=images['roughness'];nt.links.new(rough.outputs['Color'],p.inputs['Roughness'])
    return {'schema':'brood-anatomy-trim-v1','sharedImages':['brood-shared-anatomy-normal','brood-shared-anatomy-roughness','brood-anatomical-albedo'],'atlasSize':[1024,512],'uvRegions':ZONES,'imageSha256':HASHES,'normalSource':'selected-to-active bake from original editable relief patch','albedoTexture':True,'candidate':'N4 NEW chitin courses','finalCreatureHighToLowBake':False}
