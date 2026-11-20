"""Fail-closed input binding for Kestrel's reviewed render geometry."""
import hashlib
from pathlib import Path

INPUTS = (
    'tools/blender/forge/ships/kestrel.py',
    'tools/blender/forge/forge.py', 'tools/blender/forge/forge_export.py',
    'tools/blender/forge/forge_textures.py', 'tools/blender/forge/skin.py',
    'tools/blender/forge/stencil.py', 'tools/blender/forge/motion.py',
    'tools/blender/forge/fleet.json', 'tools/blender/forge/animations/motion_bank.py',
    *('tools/blender/forge/animations/ANI_' + number + '.py'
      for number in ('01', '02', '05', '06', '07', '16', '17', '18')),
    'tools/blender/forge/source_assets/kestrel/review_guard.py',
    'tools/blender/forge/source_assets/kestrel/pin_reviewed.py',
    *('tools/blender/forge/source_assets/kestrel/drive-lod2/' + name
      for name in ('contract.blend', 'contract-source.json', 'bake-contract.py')),
)


def capture(repo):
    return {name: hashlib.sha256((Path(repo) / name).read_bytes()).hexdigest() for name in INPUTS}


def validate(repo, provenance):
    expected = provenance.get('reviewedInputs')
    if not expected or set(expected) != set(INPUTS):
        raise RuntimeError('Kestrel reviewed input binding is missing or incomplete; explicit re-review required')
    actual = capture(repo)
    changed = [name for name in INPUTS if actual[name] != expected[name]]
    if changed:
        raise RuntimeError('Kestrel reviewed inputs changed; refusing stale geometry pins: ' + ', '.join(changed))
    source = Path(repo) / 'tools/blender/forge/source_assets/kestrel'
    pins = [('collision.glb', provenance['collisionSha256'])]
    pins += [(row['path'], row['sha256']) for row in provenance['reviewedGeometrySources']]
    if {name for name, _ in pins} != {'collision.glb', 'reviewed_lod0.glb', 'reviewed_lod1.glb', 'reviewed_lod2.glb'}:
        raise RuntimeError('Kestrel reviewed geometry binding is incomplete')
    for name, expected_hash in pins:
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected_hash:
            raise RuntimeError('Kestrel reviewed source changed: ' + name)


def require_scratch(repo, out_dir, preview):
    scratch = (Path(repo) / '.devshots').resolve()
    target = Path(out_dir).resolve() if out_dir else None
    if not preview or target is None or scratch not in target.parents:
        raise RuntimeError('Unpinned Kestrel review export requires preview=True and an explicit directory below .devshots')
