import sys,json,hashlib,bpy
from pathlib import Path
R=Path(__file__).resolve().parents[1];F=R/'tools/blender/forge';sys.path.insert(0,str(F))
from bake_brood_growth_trim import bake_growth_trim
from author_recovery_color_trim import write_atlas
out=F/'textures';materials={role:bpy.data.materials.new('Bake_'+role) for role in ['shell','soft','bone']}
for material in materials.values():material.use_nodes=True
bake_growth_trim(materials,[],out);write_atlas(out)
p=F/'brood_anatomy_trim.py';s=p.read_text();start=s.index('HASHES=');end=s.index('\nZONES=',start)
files=['brood-shared-anatomy-normal.png','brood-shared-anatomy-roughness.png','brood-anatomical-albedo.png'];hashes={f:hashlib.sha256((out/f).read_bytes()).hexdigest() for f in files};s=s[:start]+'HASHES='+repr(hashes)+s[end:];p.write_text(s)
print('NEW_N1_ATLAS',json.dumps(hashes),flush=True)
