import json,copy,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1];old=json.loads((R/'contracts/frozen-mite-contract.json').read_text());p=json.loads((R/'contracts/convex-proxy-proposal.json').read_text());new=copy.deepcopy(old)
new['idea']='Compact spring-mite, rooted split chelicerae'
new['reviewStatus']='art candidate; canonical convex-subpart runtime extension and gameplay acceptance required'
# Keep the frozen bounds: older physical owners derive yaw inertia from this envelope.
new['visualBounds']={'min':[-5.32,-.625,-4.22],'max':[6.002,1.98,4.22]}
ps=[];counts={}
for part in p['pieces']:
 pts=part['points'];cx=sum(x for x,z in pts)/len(pts);cz=sum(z for x,z in pts)/len(pts)
 if part['id']=='abdomen':label='abdominal_shell'
 elif part['id']=='thorax':label='thoracic_saddle'
 elif abs(cz)<.15:label='pelvic_girdle' if 'fin' in part['id'] else 'gnathal_girdle'
 else:label=('port_' if cz<0 else 'starboard_')+('locomotor' if 'fin' in part['id'] else 'foreleg' if 'foreleg' in part['id'] and 'jaw' not in part['id'] else 'chelicera')
 counts[label]=counts.get(label,0)+1;id=label+'_'+str(counts[label]).zfill(2)
 ps.append({'id':id,'kind':'convex','vertices':pts,'proposalDerivation':part['id']})
new['collision']['primitives']=ps
new['sockets']['SOCKET_BROOD_TETHER_DORSAL']['position']=[-2.55,1.741,0]
new['sockets']['SOCKET_BROOD_SIGNAL']['position']=[1.4,.336979,0]
for r in new['motion']['rigs']:
 side=-1 if r['id'].endswith('_port') else 1;r['pivot']=[-1.53,-.10,side*1.74]
 r['support']='port_locomotor_01' if side==-1 else 'starboard_locomotor_01'
 r['collisionAuthority']='fixed-bounded-projection-all-poses'
new['motion']['description']='Paired cartilage-supported locomotor fins rotate about real hip collars. Fixed .65-fold representative XZ proxies stay within .12 WU of source anatomy across sampled actions; no moving native collider or contact-fang motion.'
new['budget']['trianglesByLod']=[3500,1600,1000]
new['budget']['drawsByLod']=[9,9,9]
new['budget']['materialCount']=3
new['fragments']['groups']=['abdominal_shell','port_chelicera','starboard_chelicera']
new['runtimeDependency']={'kind':'convex','maxCompoundPieces':32,'maxVerticesPerPiece':12,'singleCanonicalConsumers':['native contacts','projectile sweep','LOS','tether/overlap/ray queries','model truth and source metrics'],'notImplementedHere':True}
(R/'contracts/proposed-mite-contract.json').write_text(json.dumps(new,indent=2))
changes={k:{'old':old.get(k),'proposed':new[k]} for k in new if k not in old or new[k]!=old[k]}
(R/'contracts/contract-diff.json').write_text(json.dumps(changes,indent=2))
