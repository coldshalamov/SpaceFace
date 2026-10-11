"""Forge re-surfacing/export entry for the original Last Argument geometry.

The ZIP supplies the actual source GLB, its portable generation recipe and animations.
This optional DCC pass imports that source, applies the repository's Forge finishes,
preserves all three named LOD hierarchies and rigid-animation channels, and exports.
Run through publish.mjs last_argument, or directly with --live. Requires Blender + Forge.
The portable build is executed in the delivery environment; this DCC pass is not.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import forge as F
import bpy
ROOT=Path(__file__).resolve().parents[4]
SOURCE=ROOT/'assets/ships/parts/wholeships/last_argument.glb'
COLORS={'paint':'#35434e','paint2':'#151d26','stripe':'#572d31','hazard':'#d79849',
        'bare':'#8b939a','glow_drive':'#81d3ff','glow_warm':'#ffdb9c','glow_amber':'#ffa14e'}
FINISH={'Material_Hull':'paint','Material_Accent':'stripe','Material_Armor':'paint2',
        'Material_Mechanical':'bare','Material_Thruster':'glow_drive',
        'Material_LA_windows':'glow_warm','Material_LA_charge':'glow_amber',
        'Material_LA_black':'dark','Material_LA_hazard':'hazard','Material_LA_ceramic':'paint'}
def main():
    if not SOURCE.is_file():raise FileNotFoundError('Install bundled source GLB before running the Forge re-surface pass.')
    F.reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    imported=list(bpy.context.scene.objects)
    ship=F.Ship('last_argument',COLORS)
    for obj in imported:
        if obj.type!='MESH':continue
        for slot in obj.material_slots:
            name=slot.material.name if slot.material else ''
            # Imported Blender suffixes do not alter source material identity.
            finish=FINISH.get(name) or FINISH.get(name.rsplit('.',1)[0])
            if finish:slot.material=ship.mat(finish)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in imported:obj.select_set(True)
    live='--live' in sys.argv
    out=SOURCE if live else ROOT/'assets/ships/forge/preview/last_argument.glb'
    out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
        export_animations=True,export_extras=True,export_yup=True)
    blend=ROOT/'assets/ships/forge/preview/last_argument.blend'
    blend.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    print('Last Argument: retained geometry, LODs, hooks and animations; Forge surfaces exported to',out)
if __name__=='__main__':main()
