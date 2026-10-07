from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[1]
files={}
for p in sorted(R.rglob('*')):
 if not p.is_file()or p.name=='FINAL_HANDOFF_MANIFEST.json' or '__pycache__'in p.parts:continue
 files[p.relative_to(R).as_posix()]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
manifest={'schema':'spaceface.chargerUnfinishedHandoff.v1','status':'frozen unfinished art; user rejected quality; ready for PR preservation','date':'2026-10-03','userArtAcceptance':False,'runtimeAdmission':False,'rootOwnsPublication':True,'currentSource':'candidate-c6/charger-animated-source.blend','currentGLB':'candidate-c6/brood_charger_v01.glb','currentContract':'contracts/proposed-charger-contract.json','tests':'tests/charger-candidate.log','files':files,'totalBytes':sum(v['bytes']for v in files.values())}
(R/'FINAL_HANDOFF_MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n');print(len(files),manifest['totalBytes'])
