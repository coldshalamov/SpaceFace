#!/usr/bin/env python3
"""Verify and restore ONE snapshot into a separate clean checkout of its exact base."""
import base64, hashlib, json, lzma, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parent
name, target = sys.argv[1:]
snapshot = json.loads((root / 'manifest.json').read_text())['snapshots'][name]
repo = pathlib.Path(target).resolve()
def git(*args, data=None):
    return subprocess.check_output(['git', '-C', str(repo), *args], input=data)
def digest(data):
    return hashlib.sha256(data).hexdigest()
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
assert git('rev-parse', 'HEAD').decode().strip() == snapshot['base_commit'], 'Wrong base commit'
assert not git('status', '--porcelain'), 'Checkout must be clean'
parts = []
for item in snapshot['chunks']:
    data = (root / item['path']).read_bytes()
    assert len(data) == item['bytes'] and digest(data) == item['sha256'] and blob(data) == item['blob']
    parts.append(data)
compressed = base64.b64decode(b''.join(parts))
assert digest(compressed) == snapshot['compressed_sha256']
patch = lzma.decompress(compressed)
assert len(patch) == snapshot['patch_bytes'] and digest(patch) == snapshot['patch_sha256']
for item in snapshot['files']:
    path = repo / item['path']
    if item['baseline_blob']:
        assert blob(path.read_bytes()) == item['baseline_blob'], item['path']
    else:
        assert not path.exists(), item['path']
git('apply', '--check', '-', data=patch)
git('apply', '-', data=patch)
for item in snapshot['files']:
    data = (repo / item['path']).read_bytes()
    assert digest(data) == item['sha256'] and blob(data) == item['blob'], item['path']
print(f"Verified {name}: {len(snapshot['files'])} reconstructed files match SHA-256 and Git blob identities.")
print('Recovery only. Review and rebase separately; runtime integration and acceptance remain open.')
