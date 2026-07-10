from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'tools' / 'art' / 'blender' / 'export_texture_role_mode.py'
SPEC = importlib.util.spec_from_file_location('export_texture_role_mode_under_test', MODULE_PATH)
assert SPEC and SPEC.loader
mode = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mode)

owner, required_maps = mode.resolve_texture_role_mode(None)
assert owner == 'blender-baked'
assert required_maps == ['ao', 'roughness'], 'default exports must keep the baked AO/roughness refusal'

owner, required_maps = mode.resolve_texture_role_mode('finalizer-v1')
assert owner == 'finalizer-v1'
assert required_maps == [], 'only explicit finalizer-v1 ownership delegates baked role creation'

try:
    mode.resolve_texture_role_mode('skip-textures')
except RuntimeError as error:
    assert 'unsupported SF_TEXTURE_ROLE_OWNER' in str(error)
else:
    raise AssertionError('unknown texture-role owner must fail closed')

print('PASS generic Blender texture-role mode: strict default, explicit delegation, unknown rejection')
