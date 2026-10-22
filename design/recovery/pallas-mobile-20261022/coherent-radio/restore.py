#!/usr/bin/env python3
"""Recover the pinned coherent world/HUD/radio snapshot into a clean exact-base clone."""
import base64, hashlib, io, json, lzma, pathlib, subprocess, sys, tarfile
root = pathlib.Path(__file__).resolve().parent
repo = pathlib.Path(sys.argv[1]).resolve()
m = json.loads((root / 'recovery-manifest.json').read_text())
def git(*args, data=None):
    return subprocess.check_output(['git', '-C', str(repo), *args], input=data)
def sha(data):
    return hashlib.sha256(data).hexdigest()
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
assert git('rev-parse', 'HEAD').decode().strip() == m['baseCommit'], 'Wrong base commit'
assert git('rev-parse', 'HEAD^{tree}').decode().strip() == m['baseTree'], 'Wrong base tree'
assert not git('status', '--porcelain'), 'Use a clean new clone'
chunks = []
for item in m['chunks']:
    data = (root / item['path']).read_bytes()
    assert len(data) == item['bytes'] and sha(data) == item['sha256'] and blob(data) == item['blob']
    chunks.append(data)
compressed = base64.b64decode(b''.join(chunks))
assert sha(compressed) == m['compressedSha256']
archive = lzma.decompress(compressed)
assert sha(archive) == m['archiveSha256']
files = {}
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    assert set(tar.getnames()) == {x['path'] for x in m['archiveFiles']}
    for item in m['archiveFiles']:
        data = tar.extractfile(item['path']).read()
        assert len(data) == item['bytes'] and sha(data) == item['sha256']
        files[item['path']] = data
outputs = json.loads(files['outputs.json'])
for item in outputs:
    file = repo / item['path']
    if item['baseline_blob']:
        assert blob(file.read_bytes()) == item['baseline_blob'], item['path']
    else:
        assert not file.exists(), item['path']
patch = files['current-master.patch']
assert sha(patch) == m['patchSha256']
git('apply', '--check', '-', data=patch)
git('apply', '-', data=patch)
entries = {}
for row in git('ls-tree', '-rz', 'HEAD').split(b'\0'):
    if row:
        meta, path = row.split(b'\t')
        mode, kind, oid = meta.decode().split()
        entries[path.decode()] = {'mode': mode, 'oid': oid}
for item in outputs:
    data = (repo / item['path']).read_bytes()
    assert blob(data) == item['blob'] and sha(data) == item['sha256'], item['path']
    entries[item['path']] = {'mode': item['mode'], 'oid': item['blob']}
def tree(items):
    files, directories = {}, {}
    for path, value in items.items():
        first, sep, rest = path.partition('/')
        if sep:
            directories.setdefault(first, {})[rest] = value
        else:
            files[first] = (value['mode'].lstrip('0'), value['oid'])
    for name, values in directories.items():
        files[name] = ('40000', tree(values))
    data = b''.join(mode.encode() + b' ' + name.encode() + b'\0' + bytes.fromhex(oid)
                    for name, (mode, oid) in sorted(files.items(), key=lambda x: x[0] + ('/' if x[1][0] == '40000' else '')))
    return hashlib.sha1(b'tree ' + str(len(data)).encode() + b'\0' + data).hexdigest()
assert tree(entries) == m['candidateTree'], 'Reconstructed tree mismatch'
print(f"Verified {len(outputs)} recovered paths and full candidate tree {m['candidateTree']}.")
print('Recovery only. No tests were run; PR delivery and gameplay acceptance remain open.')
