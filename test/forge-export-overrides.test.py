# Run with Blender: blender --background --python test/forge-export-overrides.test.py
# Exercises native input ownership and the fail-closed exporter contracts.
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/blender/forge'))
import bpy
import forge as F
import forge_export as E

F.reset_scene(); ship=F.Ship('override_api_test',{'paint':'#666666'})
F.box(ship,'body',(0,0,0),(2,2,2),material='paint',bevel=0.0)
ship.finish(); original=ship.objects[0]; original_vertices=[tuple(v.co) for v in original.data.vertices]
original['spaceface']={'drive':'core','nested':{'role':'signal','levels':[0,1,2]}}
mesh=original.data.copy(); supplied=bpy.data.objects.new('supplied',mesh)
ship.set_collision_mesh(supplied)
root=E._root_empty('test_root',{})
collider=E._collision_hull(ship,root)
assert collider is not supplied and collider.data is not supplied.data
assert collider.name=='COLLISION_HULL' and collider['collision'] and collider['nonRender'] and collider.hide_render
assert [tuple(v.co) for v in collider.data.vertices]==original_vertices
E._rename_materials(ship)
ship.set_lod_mesh_override(0,'LOD0_Hull',supplied)
result=E._lod_meshes(ship,0,'LOD0')
assert len(result)==1 and result[0].name=='LOD0_Hull' and result[0] is not supplied
assert [tuple(v.co) for v in result[0].data.vertices]==original_vertices
assert [tuple(v.co) for v in supplied.data.vertices]==original_vertices
assert supplied.parent is None and supplied.name=='supplied'
assert result[0]['spaceface'].to_dict()=={'drive':'core','nested':{'role':'signal','levels':[0,1,2]}}
E._clear_export_objects(result+[collider,root])
checks=['collider copy and nonrender contract','exact named visual replacement','source object remains unchanged','nested target metadata survives old-object deletion']
def rejects(label,fn):
 try: fn()
 except ValueError: checks.append(label)
 else: raise AssertionError(label+' did not reject')
rejects('reject nonmesh',lambda:ship.set_collision_mesh(None))
rejects('reject ship.objects source',lambda:ship.set_collision_mesh(original))
rejects('reject duplicate target',lambda:ship.set_lod_mesh_override(0,'LOD0_Hull',supplied))
rejects('reject bad tier',lambda:ship.set_lod_mesh_override(4,'LOD0_Hull',supplied))
supplied.scale.x=-1
rejects('reject negative scale',lambda:ship.set_collision_mesh(supplied))
supplied.scale.x=1
ship.lod_mesh_overrides={(0,'LOD0_Missing'):supplied}
rejects('reject missing target',lambda:E._lod_meshes(ship,0,'LOD0'))
# Remove generated test objects, preserving authoring input.
for obj in list(bpy.data.objects):
 if obj not in (original,supplied): bpy.data.objects.remove(obj,do_unlink=True)
supplied.data.materials.clear(); supplied.data.materials.append(ship.mat('glow_amber'))
ship.lod_mesh_overrides={(0,'LOD0_Hull'):supplied}
rejects('reject material semantic change',lambda:E._lod_meshes(ship,0,'LOD0'))
print('[forge-api] PASS',checks)


