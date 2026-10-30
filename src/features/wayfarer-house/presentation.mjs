import { PODS, CIVILIANS, DESTINATIONS } from './data.mjs';
import { objective } from './core.mjs';

export function readout(record) {
  if (!record) return null;
  return { title: 'WAYFARER HOUSE', subtitle: 'One engine. Three rooms. A place to arrive.',
    objective: objective(record), phase: record.phase, revision: record.revision,
    civilians: PODS.map(p => ({ id:p.civilian, name:CIVILIANS[p.civilian].name,
      text:`${CIVILIANS[p.civilian].job} · ${p.name} · ${record.civilians[p.civilian]}` })),
    pods: PODS.map(p => ({ id:p.id,name:p.name,
      text:`${record.pods[p.id].disposition}; ${record.pods[p.id].supplied ? 'supplied' : CIVILIANS[p.civilian].need}` })),
    destinations: Object.entries(DESTINATIONS).map(([id,d])=>({id,name:d.name,
      available:record.available?.[id] === true, text:d.consequence})),
    recovery: record.phase === 'recovery' ? `${record.captureTime.toFixed(1)} / 8 s stable capture` : null,
    outcome: record.consequence ? `${record.consequence.services.join(', ') || 'No surviving supplied services'}; ${record.consequence.rewardCr} cr escort payment.` : null,
    error: record.lastError || null };
}

/** Mount in the existing station/contact panel, not a second global HUD. Root owns input routing.
 * onAction receives revision-stamped requests; every action is revalidated by adapter.act().
 * No event timers, HTML interpolation, motion or color-only status. Refresh on root's UI cadence.
 */
export function mountReadout(container, onAction) {
  const doc = container.ownerDocument;
  const section = doc.createElement('section'); section.setAttribute('aria-label','Wayfarer House');
  container.append(section);
  const announcement=doc.createElement('p');announcement.setAttribute('role','status');
  container.append(announcement);
  let disposed = false, last = '';
  const text = (tag,value) => {const e=doc.createElement(tag);e.textContent=value;section.append(e);return e;};
  function refresh(record) {
    if (disposed) return;
    const r=readout(record), key=JSON.stringify(r);
    if(key===last)return;last=key;
    const focused=doc.activeElement?.dataset?.wayfarerAction;
    section.replaceChildren();if(!r)return;
    text('h3',r.title);text('p',r.subtitle);
    text('p',r.objective);
    if(announcement.textContent!==r.objective)announcement.textContent=r.objective;
    for(const c of r.civilians)text('p',`${c.name}: ${c.text}`);
    const action=(label,request,disabled=false)=>{
      const button=text('button',label);button.type='button';button.disabled=disabled;
      button.dataset.wayfarerAction=JSON.stringify(request);
      button.addEventListener('click',()=>onAction({revision:r.revision,...request}));
    };
    for(const p of r.pods){text('p',`${p.name}: ${p.text}`);
      action(`Supply ${p.name}`,{kind:'supply',pod:p.id},record.pods[p.id].supplied
        || record.pods[p.id].disposition!=='aboard' || ['lost','retired','settled'].includes(r.phase));}
    if(r.phase==='preparing')action('Begin relocation',{kind:'depart'});
    if(r.recovery){text('p',r.recovery);action('Leave Last Orchard behind',{kind:'abandon'});}
    if(r.phase==='choosing')for(const d of r.destinations){
      text('p',`${d.name}: ${d.available?'Available':'Unavailable'}. ${d.text}`);
      action(`Choose ${d.name}`,{kind:'choose',destination:d.id},!d.available);
    }
    if(!['settled','lost','retired'].includes(r.phase))action('Withdraw from relocation',{kind:'retire'});
    if(r.outcome)text('p',r.outcome);if(r.error)text('p',r.error.replaceAll('_',' '));
    if(focused)for(const e of section.querySelectorAll('button'))if(e.dataset.wayfarerAction===focused&&!e.disabled)e.focus();
  }
  return {refresh,dispose(){disposed=true;section.remove();announcement.remove();}};
}

// Deliberate industrial pod silhouettes for the candidate. Final authored asset admission is root's.
// Caller attaches these SKINS to canonical entities using its normal render owner; no pose writer.
export function createPodSkin(THREE, role) {
  if(!PODS.some(p=>p.id===role))throw new TypeError('Unknown Wayfarer pod');
  const root=new THREE.Group();root.name=`Wayfarer ${role}`;
  const resources=[];
  const material=(color,emissive=0)=>{const m=new THREE.MeshStandardMaterial({color,emissive,
    roughness:0.82,metalness:0.55});resources.push(m);return m;};
  const steel=material(0x66615a), orange=material(0xd58338), ivory=material(0xc0b7a0);
  const glow=material(role==='clinic'?0x497eae:role==='garden'?0x629655:0xc3a05c,
    role==='clinic'?0x173858:role==='garden'?0x173016:0x4f3010);
  const add=(geometry,mat,x=0,y=0,z=0)=>{resources.push(geometry);const mesh=new THREE.Mesh(geometry,mat);
    mesh.position.set(x,y,z);root.add(mesh);return mesh;};
  const box=(w,h,d,m,x=0,y=0,z=0)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  if(role==='hearth'){
    // Two unequal living drums around a broad communal spine.
    box(27,7,9,steel);for(const z of [-10,10]){
      const drum=add(new THREE.CylinderGeometry(6,6,24,12),ivory,0,0,z);drum.rotation.z=Math.PI/2;
      for(const x of [-8,0,8])box(2,2,4,glow,x,6,z);
    }box(5,3,26,orange,8,5,0);
  }else if(role==='clinic'){
    // Asymmetric stretcher bay and a broad cross readable from the gameplay camera.
    box(25,8,19,ivory);box(12,5,8,steel,-4,0,13);
    box(14,1,4,glow,2,5,0);box(4,1,13,glow,2,5,0);
  }else{
    // Open growing racks: four separated hoops, not another recolored container.
    box(33,4,12,steel);for(const x of [-12,-4,4,12]){
      const hoop=add(new THREE.TorusGeometry(10,1.3,5,16),orange,x,0,0);hoop.rotation.y=Math.PI/2;
    }for(const z of [-5,0,5])box(28,3,3,glow,0,3,z);
  }
  // Tow eyes are visual only. Physical attachment sockets remain combat owner's definition.
  for(const x of [-19,19]){const eye=add(new THREE.TorusGeometry(3,1.1,5,12),steel,x,0,0);eye.rotation.x=Math.PI/2;}
  return {object:root,dispose(){for(const r of resources)r.dispose();root.removeFromParent();}};
}
