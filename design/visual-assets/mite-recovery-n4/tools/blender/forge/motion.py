"""Forge motion groups (ANI-00): authored rigid-part pivots that survive into the contract GLB.

A motion group is a named pivot Empty (`MOTION_<ID>`) plus the parts that ride it. The parts keep
their authored world transforms; at export time each LOD's welded copies are re-parented under the
pivot, so the glTF hierarchy gains a rigid node the runtime animates — the GLB itself carries no
gltf.animations (compileBlueprint forbids them). The real animation is authored on the pivot as a
Blender action (tools/blender/forge/animations/ANI-<nn>.py) and baked to a 60fps motion bank that
binds back onto these nodes at runtime (src/contracts/motionBank.js).

Groups nest through `parent`: ANI-01's telescoping-stem lift pivots inside the yaw pivot, so the
lift translate stays vertical while the dish sweeps. Membership is per source object — parts keep
their `forge_hook` damage binding, so a shed or LOD-hidden group parks at rest in the runtime.
"""
import bpy
from mathutils import Euler, Matrix, Vector


def _as_vector(value, label):
    if isinstance(value, Vector):
        return value.copy()
    if isinstance(value, (tuple, list)) and len(value) == 3:
        return Vector(value)
    raise ValueError(f'motion group pivot {label} must be a 3-vector (got {value!r})')


def _as_euler(value):
    if value is None:
        return Euler()
    if isinstance(value, Euler):
        return value.copy()
    if isinstance(value, (tuple, list)) and len(value) == 3:
        return Euler(value)
    raise ValueError(f'motion group rotation must be an euler triple (got {value!r})')


def register_motion_group(ship, rig_id, pivot, objects=(), parent=None, rotation=None):
    """Ship.motion_group: declare a rigid motion group on the hull.

    rig_id    lowercase stable id ('kestrel_dish'); exports as node MOTION_KESTREL_DISH
    pivot     Blender world-space position of the pivot
    objects   source meshes riding the pivot (stamped forge_motion; keep any forge_hook)
    parent    rig_id of the owning motion group for nested pivots, else None (mounts on the root)
    rotation  optional rest euler for a pivot whose local axes differ from identity
    """
    groups = getattr(ship, 'motion_groups', None)
    if groups is None:
        raise ValueError(f'{ship.id}: motion groups are not supported by this Ship build')
    if not isinstance(rig_id, str) or not rig_id or not rig_id.replace('_', '').isalnum() \
            or rig_id.lower() != rig_id:
        raise ValueError(f'motion group id must be a lowercase identifier (got {rig_id!r})')
    if rig_id in ship.motion_pivots:
        raise ValueError(f'{ship.id}: motion group {rig_id} is already registered')
    if parent is not None and parent not in ship.motion_pivots:
        raise ValueError(
            f'{ship.id}: motion group {rig_id} registers before its parent {parent}; '
            'register parents first'
        )

    pivot_world = Matrix.Translation(_as_vector(pivot, 'position')) \
        @ _as_euler(rotation).to_matrix().to_4x4()
    empty = bpy.data.objects.new(f'MOTION_{rig_id.upper()}', None)
    bpy.context.scene.collection.objects.link(empty)
    empty['spaceface'] = {'motionGroup': rig_id}
    empty['forge_motion_pivot'] = rig_id
    if parent is not None:
        empty.parent = ship.motion_pivots[parent]
    empty.matrix_world = pivot_world
    # The authored mount basis is the bank's rest. Keyframing later mutates matrix_basis, so the
    # rest is captured now — before any ANI script writes its first key.
    empty['forge_motion_rest'] = [list(row) for row in empty.matrix_basis]

    ship.motion_groups.append({
        'id': rig_id,
        'pivot': tuple(pivot_world.translation),
        'parent': parent,
        'objects': list(objects),
    })
    ship.motion_pivots[rig_id] = empty
    for obj in objects:
        obj['forge_motion'] = rig_id
    return empty


def motion_group_object_for(ship, rig_id):
    return ship.motion_pivots.get(rig_id)
