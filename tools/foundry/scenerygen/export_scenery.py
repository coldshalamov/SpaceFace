"""export_scenery.py — headless exporter for LANE H scenery props.

Runs as:
    blender -b --factory-startup -P tools/foundry/scenerygen/export_scenery.py
"""

import sys
import os
import json
import math
import hashlib
import importlib
from pathlib import Path

# Add kitgen and scenerygen directories to path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "kitgen"))
sys.path.insert(0, str(HERE))

import bpy
import bmesh
from mathutils import Vector

import scenerygen

# --------------------------------------------------------------------------- #
# Paths & Settings
# --------------------------------------------------------------------------- #

WORKTREE = HERE.parents[2]
SCENERY_DIR = WORKTREE / "assets" / "ships" / "foundry" / "fleet_breadth_20260720" / "scenery"
MANIFEST_PATH = SCENERY_DIR / "scenery_manifest.json"

DEFAULT_SEED = 12648430

def get_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def get_variant_metadata(objs: list[bpy.types.Object]) -> tuple[int, list[float], list[str]]:
    """Calculates total tris, combined dimensions (m), and unique materials used."""
    total_tris = 0
    unique_materials = set()
    
    # Calculate bounding box across all mesh objects
    min_coords = [float('inf')] * 3
    max_coords = [float('-inf')] * 3
    has_meshes = False
    
    for obj in objs:
        if obj.type == 'MESH':
            has_meshes = True
            mesh = obj.data
            # Sum up tris
            for poly in mesh.polygons:
                # Polygons with N vertices have N-2 tris
                total_tris += len(poly.vertices) - 2
                
            # Materials
            for slot in obj.data.materials:
                if slot:
                    unique_materials.add(slot.name)
            
            # Vertices for bounding box (transforms are applied, so local coordinates are world coordinates)
            for v in mesh.vertices:
                co = v.co
                for i in range(3):
                    min_coords[i] = min(min_coords[i], co[i])
                    max_coords[i] = max(max_coords[i], co[i])
                    
    if not has_meshes:
        return 0, [0.0, 0.0, 0.0], []
        
    dims = [
        round(max_coords[0] - min_coords[0], 5),
        round(max_coords[1] - min_coords[1], 5),
        round(max_coords[2] - min_coords[2], 5)
    ]
    return total_tris, dims, sorted(list(unique_materials))

def main():
    SCENERY_DIR.mkdir(parents=True, exist_ok=True)
    
    # Clear scene and ensure materials exist
    scenerygen.clear_scene()
    scenerygen.ensure_materials()
    
    families = scenerygen.list_families()
    props_meta = []
    
    affected = {("gate_ring", 2), ("claim_hopper", 1), ("container_stack", 2), ("container_stack", 3)}
    
    for family in families:
        variants_count = scenerygen.variant_count(family)
        for var in range(1, variants_count + 1):
            filename = f"scenery_{family}_v{var:02d}.glb"
            filepath = SCENERY_DIR / filename
            
            # 1. Clear and build
            scenerygen.clear_scene()
            scenerygen.ensure_materials()
            objs = scenerygen.build(family, var, DEFAULT_SEED)
            
            # 3. Calculate metadata (requires evaluated meshes)
            tris, dims, mats = get_variant_metadata(objs)
            
            # 4. Export to GLB only if affected or if it does not exist
            if (family, var) in affected or not filepath.exists():
                print(f"Exporting {family} v{var:02d}...")
                # Select all objects to export
                for o in bpy.context.scene.objects:
                    o.select_set(False)
                for o in objs:
                    o.select_set(True)
                    
                bpy.ops.export_scene.gltf(
                    filepath=str(filepath),
                    export_format='GLB',
                    export_yup=True,
                    export_apply=True,
                    use_selection=True
                )
            else:
                print(f"Skipping GLB export for {family} v{var:02d} (using existing)...")
            
            # Calculate SHA256 of GLB file
            sha = get_sha256(filepath)
            
            props_meta.append({
                "family": family,
                "variant": var,
                "seed": DEFAULT_SEED,
                "tris": tris,
                "dims_m": dims,
                "materials": mats,
                "glb": filename,
                "sha256": sha
            })
            
            print(f"  Saved {filename} (tris={tris}, dims={dims}, sha256={sha[:12]}...)")
            
    # Write manifest
    manifest = {
        "tool": "export_scenery.py",
        "schema_version": 1,
        "seed": DEFAULT_SEED,
        "prop_count": len(props_meta),
        "props": props_meta
    }
    
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nManifest successfully written to {MANIFEST_PATH}")
    print("SCENERY_EXPORT_FINISHED")

if __name__ == "__main__":
    main()
