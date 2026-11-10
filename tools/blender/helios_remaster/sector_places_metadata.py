"""Restore canonical metadata after Blender export without touching mesh/image bytes."""
from __future__ import annotations
import copy, hashlib, json, struct, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / '.devshots/helios-remaster/sector-places'


def document(data):
    return json.loads(data[20:20+struct.unpack_from('<I', data, 12)[0]])


def repair_document(candidate, original, name):
    extras = copy.deepcopy(original.get('asset', {}).get('extras', {}))
    old_scenes = original.get('scenes', [])
    canonical = copy.deepcopy(extras.get('spacefaceAsset', {}))
    if not canonical and old_scenes:
        canonical = copy.deepcopy(old_scenes[original.get('scene', 0)].get('extras', {}).get('spacefaceAsset', {}))
    if not canonical:
        # The six incubator wreck sources have no identity contract at all.
        # Retain the exporter's full transport contract and generated asset ID.
        canonical = {'contractVersion': 1, 'assetId': 'SF_PART_'+name.upper(),
            'forward': '+X', 'up': '+Y', 'starboard': '+Z', 'unit': 'metre',
            'normalConvention': 'OpenGL', 'ormChannels': 'R=AO,G=Roughness,B=Metallic',
            'textureCompression': 'PNG-source'}
    category = 'weapons' if name.startswith('weapon_') else 'pods' if name.startswith('pod_') else 'places'
    slot = {'weapons': 'weapon', 'pods': 'pod', 'places': 'place'}[category]
    # Asset-level original data is the identity source. Never take identity from
    # Blender's generated scene, which can contain a previous imported asset.
    canonical['assetId'] = canonical.get('assetId') or extras.get('assetId') or 'SF_'+name.upper()
    canonical['partId'] = name
    canonical['slot'] = slot
    canonical['category'] = category
    if 'liveId' in canonical: canonical['liveId'] = name
    extras['spacefaceAsset'] = copy.deepcopy(canonical)
    candidate['asset']['extras'] = extras
    for i, scene in enumerate(candidate.get('scenes', [])):
        old = old_scenes[min(i, len(old_scenes)-1)] if old_scenes else {}
        scene_extras = copy.deepcopy(old.get('extras', {}))
        # Preserve non-identity original scene annotations, never stale batch keys.
        for key in ('assetId', 'partId', 'slot', 'category'):
            if key in scene_extras: scene_extras[key] = canonical[key]
        if 'spacefaceAssetJson' in scene_extras:
            scene_extras['spacefaceAssetJson'] = json.dumps(canonical, separators=(',', ':'))
        scene_extras['spacefaceAsset'] = copy.deepcopy(canonical)
        scene['extras'] = scene_extras
    return candidate


def encode(original_bytes, candidate):
    length = struct.unpack_from('<I', original_bytes, 12)[0]
    tail = original_bytes[20+length:]
    data = json.dumps(candidate, separators=(',', ':')).encode()
    data += b' '*(-len(data)%4)
    return struct.pack('<III', 0x46546c67, 2, 20+len(data)+len(tail))+struct.pack('<II', len(data), 0x4e4f534a)+data+tail


def repair_candidates():
    contract_path = ROOT/'tools/blender/helios_remaster/sector_places.contract.json'
    contract = json.loads(contract_path.read_text())
    rows = []
    for asset in contract['assets']:
        name = asset['id']; source_path = asset['source'].replace('\\', '/')
        source = subprocess.check_output(['git', 'show', 'HEAD:'+source_path], cwd=ROOT)
        # This is the original tracked source, not the currently promoted working
        # tree. Refuse to label a different checkpoint as the baseline silently.
        if hashlib.sha256(source).hexdigest() != asset['sourceSha256']:
            source = subprocess.check_output(['git', 'show', contract['sourceRevision']+':'+source_path], cwd=ROOT)
            if hashlib.sha256(source).hexdigest() != asset['sourceSha256']:
                raise RuntimeError('Canonical source checkpoint mismatch: '+name)
        path = ROOT/asset['candidate']; before = path.read_bytes(); old = document(before)
        fixed = repair_document(copy.deepcopy(old), document(source), name)
        after = encode(before, fixed)
        # Only asset/scenes extras may change. Vertex/index/image bytes, bindings,
        # nodes and material factors are exactly preserved.
        for key in set(old)|set(fixed):
            if key not in ('asset', 'scenes') and old.get(key) != fixed.get(key):
                raise RuntimeError('Non-metadata JSON change: '+name+' '+key)
        old_tail = before[20+struct.unpack_from('<I', before, 12)[0]:]
        new_tail = after[20+struct.unpack_from('<I', after, 12)[0]:]
        if old_tail != new_tail: raise RuntimeError('Geometry/image buffer changed: '+name)
        path.write_bytes(after)
        before_hash = hashlib.sha256(before).hexdigest(); after_hash = hashlib.sha256(after).hexdigest()
        asset['candidateSha256'] = after_hash; asset['bytes'] = len(after)
        report_path = OUT/(name+'.report.json')
        report = json.loads(report_path.read_text()); report['candidateSha256'] = after_hash
        report['metadataRepair'] = 'Original canonical asset and scene identity restored; geometry and image bytes unchanged'
        report_path.write_text(json.dumps(report, indent=2)+'\n')
        rows.append({'id': name, 'source': source_path, 'candidate': asset['candidate'],
            'sourceSha256': asset['sourceSha256'], 'previousCandidateSha256': before_hash,
            'candidateSha256': after_hash, 'assetId': fixed['asset']['extras']['spacefaceAsset']['assetId'],
            'partId': name, 'slot': fixed['asset']['extras']['spacefaceAsset']['slot'],
            'category': fixed['asset']['extras']['spacefaceAsset']['category'],
            'geometryAndImageBufferSha256': hashlib.sha256(old_tail).hexdigest(), 'geometryAndImagesUnchanged': True})
    contract_path.write_text(json.dumps(contract, indent=2)+'\n')
    receipt = {'scope': 'Metadata-only correction to previously approved 33 nonship candidates',
        'affectedCount': len(rows), 'assets': rows,
        'inheritedUnresolved': ['Signal lens material in claim_mark, tally_post and whistle has no normal texture in original HEAD or candidate.',
            'Furniture mount declaration and lane_pin/cold_locker textureSize=0 are inherited manifest metadata.'],
        'manifestTintSuggestions': {
            'weapon_gatling': {'hull': 'Material_Hull_VitreousCeramic', 'accent': 'Material_Hull_ServiceOchre'},
            'weapon_railgun': {'hull': 'Material_Hull_VitreousCeramic', 'accent': 'Material_Accent'},
            'weapon_turret_dual': {'hull': 'Material_Hull'}},
        'tintNote': 'Dual turret accent surface was intentionally replaced by non-tinted metal; remove obsolete accent declaration.'}
    (ROOT/'tools/blender/helios_remaster/sector_places.metadata-repair.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print('NONSHIP_METADATA_REPAIRED', len(rows), 'geometry/image bytes unchanged', flush=True)


if __name__ == '__main__': repair_candidates()
