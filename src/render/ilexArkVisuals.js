import { isIlexArkEntity } from '../data/ilexArkBody.js';
import { ilexArkPresentation } from '../systems/ilexArk.js';

export const ILEX_VAULT_NODES=Object.freeze(Array.from({length:6},(_,i)=>`MOTION_ILEX_VAULT_${i+1}`));
const inside=(node,parent)=>{for(let n=node;n;n=n.parent){if(n.visible===false)return false;if(n===parent)return true;}return false;};

// A vault is hidden only after the native parent has consumed that exact selected
// compound. The release owner waits on the same transition before admitting its
// loose body, so rendering cannot invent a severance or duplicate the conservatory.
export function createIlexArkVisualDriver(root,entity){
  if(!isIlexArkEntity(entity)||root?.userData?.ilexArkAuthoredSource?.assetId!=='SF_SHIP_ILEX_ARK')return null;
  const nodes=new Map();root.traverse(node=>{if(ILEX_VAULT_NODES.includes(node.name))nodes.set(node.name,node);});
  if(nodes.size!==6)throw new Error('Ilex source lacks its six rigid vault roots');
  const id=entity.id,life=entity.occupantGeneration;
  let disposed=false;
  return {
    update(live,_now,_a11y,state){
      if(disposed)return;
      const current=live===entity&&live.id===id&&live.occupantGeneration===life&&live.alive!==false
        &&state?.entities?.get(id)===live&&inside(root,live.mesh)&&inside(root,state.render?.scene);
      if(!current){for(const node of nodes.values())node.visible=false;return;}
      const frame=ilexArkPresentation(state,live);
      if(frame?.nativeBodyReady!==true)return;
      const attached=new Set(frame.attachedVaultIds);
      ILEX_VAULT_NODES.forEach((name,i)=>{nodes.get(name).visible=attached.has(`vault_${i+1}`);});
    },
    dispose(){disposed=true;},
  };
}
