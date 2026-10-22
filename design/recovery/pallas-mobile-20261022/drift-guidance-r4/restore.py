#!/usr/bin/env python3
"""Verify and restore reviewed r4 on a separately restored exact r3 baseline."""
from pathlib import Path
import hashlib,json,subprocess,sys
here=Path(__file__).resolve().parent
root=Path(sys.argv[1]).resolve()
assert root!=here and (root/'src').is_dir(), 'Provide a separate exact r3 source checkout'
sha=lambda b:hashlib.sha256(b).hexdigest()
meta=json.loads((here/'verification.json').read_text())
patch=(here/'candidate.patch').read_bytes()
assert sha(patch)==meta['patchSha256'], 'Patch integrity mismatch'
assert sha((here/'source-manifest.json').read_bytes())==meta['sourceManifestSha256']
files=json.loads((here/'outputs.json').read_text())
for f in files:
 p=root/f['path']
 assert not p.is_symlink(), f['path']+' must not be a symlink'
 assert p.resolve().is_relative_to(root), f['path']+' escapes checkout'
 if f['baseSha256'] is None: assert not p.exists(), f['path']+' already exists'
 else: assert sha(p.read_bytes())==f['baseSha256'], f['path']+' r3 baseline mismatch'
subprocess.run(['git','-C',str(root),'apply','--check','-'],input=patch,check=True)
subprocess.run(['git','-C',str(root),'apply','-'],input=patch,check=True)
for f in files: assert sha((root/f['path']).read_bytes())==f['sha256'], f['path']+' restored output mismatch'
print('Verified exact r4 recovery outputs:',len(files),'files. No tests or dependency installation run.')
