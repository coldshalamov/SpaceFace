#!/usr/bin/env python3
"""Recover exact upstream-reconciled residency derivative, separately from mobile."""
import base64, hashlib, json, lzma, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parent
repo = pathlib.Path(sys.argv[1]).resolve()
subprocess.run([sys.executable, str(root.parent / 'restore.py'), 'pallas', str(repo)], check=True)
def git(*args, data=None):
    return subprocess.check_output(['git', '-C', str(repo), *args], input=data)
def digest(data):
    return hashlib.sha256(data).hexdigest()
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
for name in ['upstream-overlay', 'residency']:
    manifest = json.loads((root / (name + '-manifest.json')).read_text())
    chunks = []
    for item in manifest['chunks']:
        data = (root / item['path']).read_bytes()
        assert len(data) == item['bytes'] and digest(data) == item['sha256'] and blob(data) == item['blob']
        chunks.append(data)
    compressed = base64.b64decode(b''.join(chunks))
    assert digest(compressed) == manifest['compressed_sha256']
    patch = lzma.decompress(compressed)
    assert len(patch) == manifest['patch_bytes'] and digest(patch) == manifest['patch_sha256']
    for item in manifest['files']:
        file = repo / item['path']
        if item['baseline_blob']:
            assert blob(file.read_bytes()) == item['baseline_blob'], item['path']
        else:
            assert not file.exists(), item['path']
    git('apply', '--check', '-', data=patch)
    git('apply', '-', data=patch)
    for item in manifest['files']:
        data = (repo / item['path']).read_bytes()
        assert digest(data) == item['sha256'] and blob(data) == item['blob'], item['path']
    print(f"Verified {name}: {len(manifest['files'])} files.")
print('Recovered exact residency derivative. No mobile combination, current-master integration, or gameplay acceptance is implied.')
