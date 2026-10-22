#!/usr/bin/env python3
import base64,hashlib,json,zipfile
from pathlib import Path
D=Path(__file__).resolve().parent;m=json.loads((D/'chunks.json').read_text());out=D/m['archive'];assert Path(m['archive']).name==m['archive'];assert not out.exists(),'Archive already exists; verify it instead of overwriting'
h=hashlib.sha256();total=0
with out.open('xb') as f:
 for r in m['chunks']:
  assert Path(r['path']).name==r['path'];b=(D/r['path']).read_bytes();assert len(b)==r['bytes'] and hashlib.sha256(b).hexdigest()==r['sha256'];raw=base64.b64decode(b.strip(),validate=True);assert len(raw)==r['decoded_bytes'] and hashlib.sha256(raw).hexdigest()==r['decoded_sha256'];f.write(raw);h.update(raw);total+=len(raw)
assert total==m['archive_bytes'] and h.hexdigest()==m['archive_sha256']
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 target=D/'restore.py';assert not target.exists();target.write_bytes(z.read('restore.py'))
print('Archive verified. Run: python restore.py '+m['archive'])
