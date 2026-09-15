// Only remap references backed by the save owner's actual old-to-new body map.
const IDS=new Set(['id','actorId','sourceId','targetId','senderId','receiverId','speakerId','entityId','ownerId']);
const LISTS=new Set(['threatIds','boundaryIds','secondaryIds','witnessIds','knownWitnesses']);
function mappedIdentity(value,remap) {
  if(typeof value!=='string'||!value.startsWith('entity:'))return value;
  const id=value.slice(7);return remap.has(id)?`entity:${remap.get(id)}`:value;
}
export function remapStuntReferences(value,remap) {
  if(!value||typeof value!=='object'||!remap?.size)return value;
  const stack=[value];let visited=0;
  while(stack.length&&visited++<20000) {
    const row=stack.pop();
    for(const key of Object.keys(row)) {
      let v=row[key];
      if(IDS.has(key)&&v!=null&&remap.has(String(v)))row[key]=remap.get(String(v));
      else if(LISTS.has(key)&&Array.isArray(v))row[key]=v.map(id=>remap.has(String(id))?remap.get(String(id)):mappedIdentity(id,remap));
      else if(typeof v==='string'&&(key==='identity'||key==='speakerIdentity'))row[key]=mappedIdentity(v,remap);
      else if(v&&typeof v==='object')stack.push(v);
      const newKey=mappedIdentity(key,remap);
      if(newKey!==key){row[newKey]=row[key];delete row[key];}
    }
  }
  return value;
}
