"""Concord customs cutter: Hornet arrow with a broad pale boarding nose.

The plate is cut into the existing fuselage and uses its existing accent and dark
finishes. It changes no hull envelope, sockets, textures, or independent mesh group.
"""
import os
import sys

import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F
import forge_export as E
import variant

SHIP_ID = 'hornet_scn_customs_cutter'
COLORS = {
    'paint': '#22407a', 'paint2': '#1a1f2b', 'stripe': '#b9c6dc',
    'hazard': '#b9c6dc', 'glow_cyan.jacket': '#5aa8ff',
}


def pale_wing_root(ship, name):
    """Paint the inboard wing without covering its existing blue running light."""
    obj = bpy.data.objects[name]
    mesh = obj.data
    stripe, lamp = ship.mat('stripe'), ship.mat('glow_cyan.jacket')
    if stripe.name not in [m.name for m in mesh.materials if m]:
        mesh.materials.append(stripe)
    stripe_slot = list(mesh.materials).index(stripe)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    # Bisect the existing skin only; this introduces no raised hard geometry.
    for point, normal in (((-2.2, 0, 0), (1, 0, 0)),
                          ((1.55, 0, 0), (1, 0, 0)),
                          ((0, -1.75, 0), (0, 1, 0)),
                          ((0, 1.75, 0), (0, 1, 0))):
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                               plane_co=Vector(point), plane_no=Vector(normal), dist=1e-5)
    bm.normal_update()
    for face in bm.faces:
        c = face.calc_center_median()
        current = mesh.materials[face.material_index] if face.material_index < len(mesh.materials) else None
        if -2.2 < c.x < 1.55 and abs(c.y) < 1.75 and face.normal.z > 0.35 and current != lamp:
            face.material_index = stripe_slot
    bm.to_mesh(mesh)
    bm.free()


def boarding_plate(ship):
    # Preserve original finished source parts solely for the non-render helper.
    originals = {}
    for name in ('Fuselage', 'Wing', 'Wing_M'):
        obj = bpy.data.objects[name]
        copy = obj.copy()
        copy.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(copy)
        F.finish_object(copy)
        originals[name] = copy
    ship._customs_collision_originals = originals
    # Broad light forebody and inboard shoulders frame the dark canopy. Existing
    # shared finishes and the original supported surfaces carry the entire cue.
    F.band(ship, 'Fuselage', (1.6, 0, 0), (1, 0, 0), 4.0, 'stripe',
           facing=(0, 0, 1), min_facing=0.15,
           region=(('y', -0.85, 0.85),))
    pale_wing_root(ship, 'Wing')
    pale_wing_root(ship, 'Wing_M')
    # Wide dark transverse joint, just ahead of the canopy.
    F.band(ship, 'Fuselage', (3.34, 0, 0), (1, 0, 0), 0.32, 'dark',
           facing=(0, 0, 1), min_facing=0.35,
           region=(('y', -0.45, 0.45),))


if __name__ == '__main__':
    original_collision_hull = E._collision_hull
    def preserved_collision_hull(ship, parent, sources=None):
        originals = sources if sources is not None else ship.objects
        originals = [ship._customs_collision_originals.get(obj.name, obj) for obj in originals]
        return original_collision_hull(ship, parent, originals)
    E._collision_hull = preserved_collision_hull
    # During an isolated candidate build the caller provides an ignored output
    # directory; the normal Forge route uses the fleet registry and publisher.
    candidate_dir = os.environ.get('SF_CUTTER_CANDIDATE_DIR')
    if candidate_dir:
        ship = variant.build_variant('hornet', SHIP_ID, COLORS, boarding_plate).finish()
        E.export_ship(ship, E.fleet_spec(SHIP_ID), out_dir=candidate_dir)
    else:
        variant.main('hornet', SHIP_ID, COLORS, boarding_plate)
