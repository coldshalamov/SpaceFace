# Bake per-material ambient occlusion for hull GLBs whose shipped AO is constant.
#
# Why
# ---
# Six of the ten kit hulls carry a real AO bake in the R channel of their packed ORM. Four —
# frigate, capital, multirole, gunship — carry a constant, and so do their authored
# `textures/hull_*/Material_*_ao_1k.png` source maps. The bake did not merely fail to reach the
# GLB for those four; it produced flat images at source. There is no geometry-derived surface
# information anywhere in the chain for them.
#
# This script re-bakes it from the actual mesh, writing the same filenames the existing pipeline
# already expects, so `repack_orm_roughness.mjs` can consume it exactly as it consumes the six
# good ones.
#
# Read-mostly: imports a GLB into a scratch scene and writes PNGs. It never modifies or re-exports
# the GLB, so geometry, sockets, scale, collision and material names cannot be touched — all of
# which are frozen for the hull kit.
#
# Run as:
#   blender --background --python tools/blender/bake_hull_ao.py -- <glb> <outdir> [samples]
import bpy
import os
import sys


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # use_empty gives a scene with NO World datablock. A Cycles AO bake traces rays outward and
    # asks what they hit; with no world there is no background to escape to, every ray reads as
    # blocked, and the bake comes out almost entirely black (measured mean 0.12, effectively
    # saturated and useless as a cavity signal). A plain white environment is what "unoccluded"
    # has to mean for this bake to carry information.
    world = bpy.data.worlds.new("AO_ENV")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (1.0, 1.0, 1.0, 1.0)
        bg.inputs[1].default_value = 1.0
    bpy.context.scene.world = world


def argv_after_dashdash():
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def bake_ao(glb_path, out_dir, samples=64, size=1024, margin=16):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=glb_path)

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    # CPU is deliberate: this runs in CI-ish headless contexts where no GPU device may be
    # configured, and a missing device silently falls back in ways that change the result.
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.render.bake.margin = margin
    # Do NOT clear. A cleared bake target is black, and black in an AO map means "fully occluded".
    # UV islands cover only part of the sheet, so clearing leaves every unmapped texel reading as a
    # deep cavity — which is how the first attempt came out at mean 0.124, roughly the UV coverage
    # fraction rather than anything about the geometry. The images are pre-filled white below so
    # unmapped texels read as "unoccluded" and contribute nothing to the derived roughness.
    scene.render.bake.use_clear = False
    # These gate the AO pass itself, not just lighting: with both False the bake returned a fully
    # black map (100% of Material_Mechanical texels in the darkest decile), which reads as "every
    # surface is a deep cavity" and is worse than the constant it was meant to replace. type='AO'
    # already excludes scene lighting, so leaving them on is correct here.
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True

    # THE defect that made the original bakes useless.
    #
    # These GLBs carry LOD0, LOD1 and LOD2 as separate meshes at IDENTICAL coordinates — hull_gunship
    # bounds every one of them to [-5.8,-1.3,-2.8]..[5.9,2.4,2.8]. They are coincident shells. Bake
    # with all three present and every LOD0 surface is occluded by an LOD1/LOD2 face lying directly
    # on it, so the AO comes out black everywhere: measured 100% of Material_Mechanical texels and
    # 90% of Material_Hull texels in the darkest decile.
    #
    # Deleting rather than deselecting is deliberate. Cycles traces against everything in the scene,
    # not just the selection, so an unselected coincident shell occludes exactly as much.
    lod_extra = [o for o in scene.objects if o.type == 'MESH' and (o.name.startswith('LOD1') or o.name.startswith('LOD2'))]
    if lod_extra:
        print("[bake] removing %d coincident LOD1/LOD2 shell(s) before bake: %s"
              % (len(lod_extra), ", ".join(o.name for o in lod_extra)))
        for obj in lod_extra:
            bpy.data.objects.remove(obj, do_unlink=True)

    meshes = [o for o in scene.objects if o.type == 'MESH']
    if not meshes:
        print("[bake] no meshes in %s" % glb_path)
        return []

    # One image per MATERIAL, matching how the ORM is packed (per material, not per object).
    images = {}
    for obj in meshes:
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in images:
                continue
            if not mat.use_nodes:
                mat.use_nodes = True
            img = bpy.data.images.new("%s_ao" % mat.name, width=size, height=size)
            img.colorspace_settings.name = 'Non-Color'
            # Pre-fill white = unoccluded. See the use_clear note above.
            img.pixels.foreach_set([1.0] * (size * size * 4))
            img.update()
            node = mat.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = img
            node.select = True
            mat.node_tree.nodes.active = node   # bake target
            images[mat.name] = img

    if not images:
        print("[bake] no materials in %s" % glb_path)
        return []

    # Deselect first: the glTF importer leaves its root Empty selected, and bake() rejects the
    # whole selection with "Object ... is not a mesh" if any non-mesh is in it.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]

    print("[bake] %s: %d material(s), %d samples" % (os.path.basename(glb_path), len(images), samples))
    bpy.ops.object.bake(type='AO')

    os.makedirs(out_dir, exist_ok=True)
    written = []
    for mat_name, img in images.items():
        # Filename contract is the existing one the manifest note already describes.
        path = os.path.join(out_dir, "%s_ao_1k.png" % mat_name)
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
        written.append(path)
        print("[bake]   wrote %s" % path)
    return written


def main():
    args = argv_after_dashdash()
    if len(args) < 2:
        print("usage: blender --background --python bake_hull_ao.py -- <glb> <outdir> [samples]")
        sys.exit(2)
    glb, out_dir = args[0], args[1]
    samples = int(args[2]) if len(args) > 2 else 64
    bake_ao(glb, out_dir, samples=samples)


main()
