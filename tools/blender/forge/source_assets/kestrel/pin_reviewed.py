"""Pin three explicitly reviewed scratch GLBs; never run as part of ordinary export."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import review_guard

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
parser.add_argument('--stem', default='kestrel_final')
args = parser.parse_args()
base = Path(__file__).resolve().parent
repo = base.parents[4]
review_guard.require_scratch(repo, args.directory, True)
provenance = json.loads((base / 'provenance.json').read_text(encoding='utf-8'))
records = []
for level, suffix in enumerate(('', '_lod1', '_lod2')):
    source = args.directory / f'{args.stem}{suffix}.glb'
    raw = source.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    original = json.loads(raw[20:20 + size])
    binary = raw[28 + size:]
    meshes = [mesh for mesh in original['meshes'] if mesh['name'].startswith(f'LOD{level}_')]
    if not meshes:
        raise ValueError(f'No reviewed tier {level} render meshes in {source}')
    document = {'asset': {'version': '2.0', 'generator': 'Reviewed Kestrel render geometry source pin'},
                'meshes': meshes, 'nodes': [{'mesh': i} for i in range(len(meshes))],
                'scenes': [{'nodes': list(range(len(meshes)))}], 'scene': 0,
                'accessors': [], 'bufferViews': []}
    data = bytearray()
    mapped = {}

    def copy_accessor(index):
        if index in mapped:
            return mapped[index]
        accessor = dict(original['accessors'][index])
        view = dict(original['bufferViews'][accessor['bufferView']])
        start = view.get('byteOffset', 0)
        data.extend(b'\0' * (-len(data) % 4))
        view['byteOffset'] = len(data)
        data.extend(binary[start:start + view['byteLength']])
        view['buffer'] = 0
        accessor['bufferView'] = len(document['bufferViews'])
        document['bufferViews'].append(view)
        mapped[index] = len(document['accessors'])
        document['accessors'].append(accessor)
        return mapped[index]

    for mesh in meshes:
        for primitive in mesh['primitives']:
            primitive.pop('material', None)
            primitive['attributes'] = {key: copy_accessor(index) for key, index in primitive['attributes'].items()}
            primitive['indices'] = copy_accessor(primitive['indices'])
    document['buffers'] = [{'byteLength': len(data)}]
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    data += b'\0' * (-len(data) % 4)
    target = base / f'reviewed_lod{level}.glb'
    target.write_bytes(struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(data))
                       + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
                       + struct.pack('<II', len(data), 0x004e4942) + data)
    records.append({'path': target.name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                    'bytes': target.stat().st_size, 'reviewedSource': source.as_posix(),
                    'reviewedSourceSha256': hashlib.sha256(raw).hexdigest()})
provenance['reviewedGeometrySources'] = records
provenance['reviewedInputs'] = review_guard.capture(repo)
(base / 'provenance.json').write_bytes((json.dumps(provenance, indent=2) + '\n').encode())
