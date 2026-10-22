#!/usr/bin/env python3
"""Apply this recovery delta only to a separate exact-baseline checkout."""
from pathlib import Path
import hashlib,json,subprocess,sys
here=Path(__file__).resolve().parent
root=Path(sys.argv[1]).resolve()
assert root!=here and (root/'src').is_dir(), 'Provide a separate baseline checkout'
def sha(b): return hashlib.sha256(b).hexdigest()
meta=json.loads((here/'verification.json').read_text())
patch=(here/'candidate.patch').read_bytes()
assert sha(patch)==meta['patchSha256'], 'Patch integrity mismatch'
files=json.loads((here/'outputs.json').read_text())
for f in files:
 p=root/f['path']
 assert not p.is_symlink(), f['path']
 if f['baseSha256'] is None: assert not p.exists(), f['path']+' already exists'
 else: assert sha(p.read_bytes())==f['baseSha256'], f['path']+' baseline mismatch'
chunks=sorted(here.glob('source-tree-sha256.txt.*'))
source=[]
if chunks:
 data=b''.join(p.read_bytes() for p in chunks)
 assert sha(data)==meta['sourceManifestSha256']
 source=[line.split('  ',1) for line in data.decode().splitlines()]
 changed={f['path'] for f in files}
 for h,p in source:
  if p not in changed: assert sha((root/p).read_bytes())==h, p+' baseline mismatch'
subprocess.run(['git','-C',str(root),'apply','--check','-'],input=patch,check=True)
subprocess.run(['git','-C',str(root),'apply','-'],input=patch,check=True)
for f in files: assert sha((root/f['path']).read_bytes())==f['sha256'], f['path']
for h,p in source: assert sha((root/p).read_bytes())==h,p
print('Verified exact recovery outputs:',len(files),'changed files;',len(source),'source entries')
