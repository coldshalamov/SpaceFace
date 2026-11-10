"""glTF scene receipts without Blender imports; costs count mesh occurrences."""
def scene_cost(doc):
    scenes = doc.get('scenes', [])
    scene_id = doc.get('scene', 0 if len(scenes) == 1 else None)
    def item(items, index, label):
        if type(index) is not int or not 0 <= index < len(items):
            raise ValueError('Invalid ' + label + ' index')
        return items[index]
    scene = item(scenes, scene_id, 'active scene')
    nodes = doc.get('nodes', [])
    meshes = doc.get('meshes', [])
    accessors = doc.get('accessors', [])
    stack = list(scene.get('nodes', []))
    seen = set()
    triangles = draws = 0
    while stack:
        node_id = stack.pop()
        node = item(nodes, node_id, 'node')
        if node_id in seen:
            raise ValueError('Repeated or cyclic active scene node')
        seen.add(node_id)
        stack.extend(node.get('children', []))
        if 'mesh' not in node:
            continue
        mesh = item(meshes, node['mesh'], 'mesh')
        for primitive in mesh.get('primitives', []):
            if primitive.get('mode', 4) != 4:
                raise ValueError('Only triangle primitives supported')
            position_id = primitive.get('attributes', {}).get('POSITION')
            position = item(accessors, position_id, 'POSITION')
            if position.get('type') != 'VEC3':
                raise ValueError('POSITION must be VEC3')
            accessor = item(accessors, primitive['indices'], 'index accessor') if 'indices' in primitive else position
            count = accessor.get('count')
            if type(count) is not int or count <= 0 or count % 3:
                raise ValueError('Empty or incomplete triangle geometry')
            triangles += count // 3
            draws += 1
    if triangles == 0:
        raise ValueError('No reachable triangle geometry')
    return {'triangles': triangles, 'draws': draws}
