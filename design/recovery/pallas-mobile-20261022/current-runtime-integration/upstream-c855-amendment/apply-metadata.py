#!/usr/bin/env python3
"""Emit updated portable recovery manifest, leaving the original archive and all output bytes untouched."""
import argparse,hashlib,json,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('output',type=Path);a=p.parse_args();D=Path(__file__).resolve().parent;x=json.loads((D/'amendment.json').read_text());assert not a.output.exists()
b=a.archive.read_bytes();assert hashlib.sha256(b).hexdigest()=='40274b742e78621a0a5034348ea193e1c04bcfdde26451cb6bad6b67491224fb','Unexpected original recovery archive'
with zipfile.ZipFile(a.archive) as z:
 m=json.loads(z.read('manifest.json'));assert m['base_commit']==x['previous_base'] and m['proposed_tree']==x['previous_proposed_tree'];assert len(m['outputs'])==69
 for r in m['outputs']:
  b=z.read(r['payload']);assert len(b)==r['bytes'] and hashlib.sha256(b).hexdigest()==r['sha256'];assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==r['blob']
m.update(base_commit=x['base_commit'],base_tree=x['base_tree'],proposed_tree=x['proposed_tree'],public_parents=x['public_parents']);m['upstream_additions_preserved']=x['upstream_additions']
with a.output.open('x') as f:f.write(json.dumps(m,indent=2)+'\n')
print('Amended metadata only; 69 payloads unchanged. Apply the original guarded restore onto clean public c855b6a6, which already contains both upstream stubs. No Git or remote mutation.')
