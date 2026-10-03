#!/usr/bin/env python3
"""One-shot, branch-only publication of the locally tested source packet."""
import base64
import gzip
import hashlib
import json
import subprocess
from pathlib import Path

EXPECTED = '467ff3879239c86a3ec9750c5a8cc1e1d98c97d5a0831bf477938b056bedcc98'
ALLOWED = {
    'src/data/bracket.js', 'src/characters/bracketRules.js',
    'src/systems/bracket.js', 'src/render/characters/bracketModel.js',
    'test/bracket.test.mjs', 'test/bracket-model.test.mjs',
    'tools/bracket/index.html', 'tools/bracket/bench.js',
    'design/characters/BRACKET.md',
}
root = Path.cwd().resolve()
folder = root / 'tools/bracket'
packet = json.loads((folder / 'packet.json').read_text())
names = [f'packet-{i:02d}.b64' for i in range(1, 6)]
if packet['chunks'] != names or len(packet['chunk_sha256']) != 5:
    raise SystemExit('Unexpected transport manifest; nothing written')
parts = []
for name, checksum in zip(names, packet['chunk_sha256']):
    raw = (folder / name).read_bytes()
    # The first connector upload accidentally duplicated exactly two ASCII characters.
    # Repair that identified transport typo, then demand the original immutable hash.
    if name == 'packet-01.b64' and len(raw) == 8002 and raw.count(b'MXWRhrhrMIL2') == 1:
        raw = raw.replace(b'MXWRhrhrMIL2', b'MXWRhrMIL2', 1)
    if hashlib.sha256(raw).hexdigest() != checksum:
        raise SystemExit('Transport checksum mismatch: ' + name)
    parts.append(raw)
source = gzip.decompress(base64.b64decode(b''.join(parts), validate=True))
if len(source) > 200000 or hashlib.sha256(source).hexdigest() != EXPECTED:
    raise SystemExit('Source packet checksum mismatch; nothing written')
patch = gzip.decompress(base64.b64decode(packet['patch_gzip_base64'], validate=True))
if hashlib.sha256(patch).hexdigest() != 'bddf8fcb0ec6d9d4dcf086af2289a1a09f64deff3d28f566e4e26c679ae64ed1':
    raise SystemExit('Integration patch checksum mismatch; nothing written')
files = json.loads(source)
if set(files) != ALLOWED:
    raise SystemExit('Unexpected source path; nothing written')
for name, content in files.items():
    target = (root / name).resolve()
    if root not in target.parents or not isinstance(content, str):
        raise SystemExit('Invalid source entry; nothing written')
    if target.exists() and target.read_text() != content:
        raise SystemExit('Refusing to overwrite existing character work: ' + name)
for name, content in files.items():
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
(folder / 'integration.patch').write_bytes(patch)
subprocess.run(['git', 'rm', '--', *['tools/bracket/' + name for name in names]], check=True)
print('Verified and expanded all nine authored source files:', EXPECTED)
