"""Exact source-derived candidate body map. Unfinished art; never self-admitted."""
from pathlib import Path
import json,copy,math
R=Path(__file__).resolve().parents[1];O=R/'candidate-c6';old=json.loads((R/'contracts/frozen-charger-contract.json').read_text());assembly=json.loads((O/'assembly.json').read_text());proxy=json.loads((R/'contracts/convex-proxy-proposal.json').read_text());new=copy.deepcopy(old)
new['idea']='Unfinished candidate: forward-loaded horseshoe ram crown'
new['reviewStatus']='USER-REJECTED ART DIRECTION; editable handoff only. No runtime admission.'
new['visualBounds']={'min':[-9.7,-1.28,-8.133987],'max':[11,3.381401,8.133987]}
new['collision']['primitives']=[{k:p[k]for k in ['id','kind','vertices']}for p in proxy['pieces']]
for name in ['SOCKET_BROOD_TETHER_DORSAL','SOCKET_BROOD_SIGNAL']:
 new['sockets'][name]['position']=assembly['socketPositions'][name]
def near(point):
 x,z=point;return min(proxy['pieces'],key=lambda p:sum((sum(v[a]for v in p['vertices'])/len(p['vertices'])-point[a])**2 for a in range(2)))['id']
for rig in new['motion']['rigs']:
 rig['support']=near([rig['pivot'][0],rig['pivot'][2]]);rig['collisionAuthority']='fixed-bounded-projection-all-138-action-fractions'
new['motion']['description']='Existing .42-radian inner paddle folds and .8 WU abdominal translation over fixed support; exact existing timings/poses. No contact-tip motion.'
new['runtimeDependency']={'kind':'convex','maxCompoundPieces':32,'maxVerticesPerPiece':12,'minimumSupportWidthWU':.01,'singleCanonicalConsumers':['native contact','projectile sweep','LOS','tether/overlap/ray queries','model truth metrics'],'notAdmittedHere':True}
(R/'contracts/proposed-charger-contract.json').write_text(json.dumps(new,indent=2)+'\n');(R/'contracts/contract-diff.json').write_text(json.dumps({k:{'old':old.get(k),'proposed':v}for k,v in new.items()if old.get(k)!=v},indent=2)+'\n')
