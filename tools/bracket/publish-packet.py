#!/usr/bin/env python3
"""One-shot, branch-only publication of the locally tested source packet."""
import base64
import gzip
import hashlib
import json
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
packet = json.loads((root / 'tools/bracket/packet.json').read_text())
source = gzip.decompress(base64.b64decode(packet['gzip_base64'], validate=True))
if len(source) > 200000 or hashlib.sha256(source).hexdigest() != EXPECTED:
    raise SystemExit('Source packet checksum mismatch; nothing written')
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
print('Verified and expanded all nine authored source files:', EXPECTED)
