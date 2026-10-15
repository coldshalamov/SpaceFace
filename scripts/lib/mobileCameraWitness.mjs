// Passed directly to page.evaluate: self-contained, read-only, bounded, no Three updates.
// Existing matrices/bounds may be stale or absent; this records evidence, not visibility proof.
export function collectMobileCameraWitness() {
  const state = globalThis.SF?.state;
  if (!state) return { available: false, reason: 'public-state-unavailable' };
  const scalarId = value => typeof value === 'string' ? value.slice(0,128) : Number.isFinite(value) ? value : null;
  const text = value => typeof value === 'string' ? value.slice(0,128) : null;
  const finite = n => Number.isFinite(n) ? n : null;
  const vec = v => v ? { x: finite(v.x), y: finite(v.y), z: finite(v.z) } : null;
  const matrix = m => m?.elements?.length === 16 && [...m.elements].every(Number.isFinite) ? [...m.elements] : null;
  const mul = (m, p) => {
    if (!m || !p || ![p.x,p.y,p.z].every(Number.isFinite)) return null;
    const w = m[3]*p.x+m[7]*p.y+m[11]*p.z+m[15];
    if (!Number.isFinite(w) || Math.abs(w)<1e-12) return null;
    return { x:(m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12])/w,
      y:(m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13])/w,
      z:(m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14])/w };
  };
  const render = state.render, camera = render?.camera;
  const world = matrix(camera?.matrixWorld), view = matrix(camera?.matrixWorldInverse), projection = matrix(camera?.projectionMatrix);
  const eye = world ? {x:world[12],y:world[13],z:world[14]} : null;
  const project = p => mul(projection,mul(view,p));
  const scalarKeys = (o, keys) => Object.fromEntries(keys.map(k=>[k,finite(o?.[k])]));
  const player = state.entities?.get?.(state.playerId);
  let diagnostic = null;
  try { diagnostic = render?.cameraCtrl?.zoomDiagnostics?.() || null; } catch {}
  const geometry = root => {
    if (!root) return null;
    const stack=[root], min={x:Infinity,y:Infinity,z:Infinity}, max={x:-Infinity,y:-Infinity,z:-Infinity};
    let visited=0,bounded=0,missing=0,droppedChildren=0;
    while(stack.length && visited<512) {
      const node=stack.pop();visited++;
      if (!node) continue;
      if (node.visible===false) continue;
      const box=node.geometry?.boundingBox, m=matrix(node.matrixWorld);
      if (node.geometry && (!box || !m)) missing++;
      if (box?.min && box?.max && m && [box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z].every(Number.isFinite)) {
        bounded++;
        for (const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
          const p=mul(m,{x,y,z});if(!p)continue;
          for(const key of ['x','y','z']) {min[key]=Math.min(min[key],p[key]);max[key]=Math.max(max[key],p[key]);}
        }
      }
      const children=Array.isArray(node.children)?node.children:[];
      const accepted=Math.min(children.length,512-stack.length);
      for(let i=0;i<accepted;i++)stack.push(children[i]);
      droppedChildren+=children.length-accepted;
    }
    const valid=bounded>0 && Object.values(min).every(Number.isFinite);
    const bounds=valid?{min,max}:null;
    const ndc=[];
    if(bounds)for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]) {const p=project({x,y,z});if(p)ndc.push(p);}
    return { rootPosition: vec(root.position), rootMatrixWorld:matrix(root.matrixWorld), visible:root.visible!==false,
      existingWorldBounds:bounds, projectedCornersNdc:ndc, visited,bounded,missingBounds:missing,
      truncated:stack.length>0 || droppedChildren>0, droppedChildren, note:'Existing geometry AABBs only; instanced/proxy/shader bounds may be incomplete. NDC corners are not a visibility test.' };
  };
  const row = entity => ({id:scalarId(entity.id),type:text(entity.type),
    generation:finite(entity.occupantGeneration),radius:finite(entity.radius),pos:vec(entity.pos),
    distanceToPlayer: entity.pos && player?.pos ? finite(Math.hypot(entity.pos.x-player.pos.x,entity.pos.z-player.pos.z)):null});
  const nearest=[],large=[];let inspected=0,truncated=false;
  if(state.entities?.values)for(const entity of state.entities.values()) {
    if(inspected>=4096){truncated=true;break;} inspected++;
    if(!entity || entity.alive===false || entity.id===state.playerId)continue;
    const value=row(entity);
    if(value.distanceToPlayer!==null){nearest.push(value);nearest.sort((a,b)=>a.distanceToPlayer-b.distanceToPlayer);nearest.length=Math.min(8,nearest.length);}
    if(value.radius!==null){large.push(value);large.sort((a,b)=>b.radius-a.radius);large.length=Math.min(8,large.length);}
  }
  const selected=[...new Map([...nearest,...large].map(v=>[v.id,v])).values()];
  for(const value of selected)value.render=geometry(render?.meshes?.get?.(value.id));
  // Non-entity scenery (including planets) may cover the picture too. Bound this
  // independent scene sample; never infer an entity ID from a decorative node.
  const sceneRows=[],sceneStack=render?.scene?[render.scene]:[];let sceneVisited=0,sceneDropped=0;
  while(sceneStack.length && sceneVisited<512) {
    const node=sceneStack.pop();sceneVisited++;if(!node || node.visible===false)continue;
    if(node.geometry) {
      const bounds=geometry({visible:node.visible,position:node.position,matrixWorld:node.matrixWorld,geometry:node.geometry,children:[]});
      const box=bounds?.existingWorldBounds;
      const span=box?Math.max(box.max.x-box.min.x,box.max.y-box.min.y,box.max.z-box.min.z):null;
      sceneRows.push({name:typeof node.name==='string'?node.name.slice(0,80):null,id:finite(node.id),
        type:text(node.type),isInstancedMesh:node.isInstancedMesh===true,span,render:bounds});
      sceneRows.sort((a,b)=>(b.span??-1)-(a.span??-1));sceneRows.length=Math.min(8,sceneRows.length);
    }
    const children=Array.isArray(node.children)?node.children:[],accepted=Math.min(children.length,512-sceneStack.length);
    for(let i=0;i<accepted;i++)sceneStack.push(children[i]);sceneDropped+=children.length-accepted;
  }
  const camState=state.camera;
  return { available:!!camera, tick:finite(state.tick),simTime:finite(state.simTime),mode:text(state.mode),
    sectorId:text(state.world?.currentSectorId),seed:finite(state.meta?.seed),playerId:scalarId(state.playerId),
    frameOrigin:vec(state.world?.frameOrigin),frameOriginSeq:finite(state.world?.frameOriginSeq),
    camera:{position:vec(camera?.position),worldPosition:eye,rotation:vec(camera?.rotation),
      quaternion:camera?.quaternion?{...scalarKeys(camera.quaternion,['x','y','z','w'])}:null,
      ...scalarKeys(camera,['zoom','fov','aspect','near','far','left','right','top','bottom']),world,view,projection},
    requested:{focus:vec(camState?.focus),target:vec(camState?.target),...scalarKeys(camState,['zoom','liveZoom','tilt','clearanceScale','composedZoom','fov','aspect'])},
    zoomDiagnostics:diagnostic?scalarKeys(diagnostic,['requestedZoom','baseZoom','dynamicZoom','composedZoom','speedZoomFactor','speedEmaWu','contextZoomBias','contextMinZoom','contextZoomCap','boostZoomFactor','pushZoom','holdS']):null,
    player:player?{...row(player),shipDefId:text(player.data?.defId),
      hull:finite(player.hull),hullMax:finite(player.hullMax),render:geometry(render?.meshes?.get?.(player.id))}:null,
    cameraOccluderCount:finite(render?.cameraOccluders),actualOccluderIds:null,
    sceneGeometry:{rows:sceneRows,visited:sceneVisited,truncated:sceneStack.length>0||sceneDropped>0,droppedChildren:sceneDropped},
    nearestIds:nearest.map(v=>v.id),largestRadiusIds:large.map(v=>v.id),entities:selected,
    limits:{entityLimit:4096,meshNodeLimitPerEntity:512,nearestLimit:8,largeLimit:8,inspected,truncated},
    visibilityAssessment:'unverified',note:'One-shot public render witness; entity radius/nearby ordering is a proxy, not actual occluder identification. No matrix/bounds updates or raycasts performed.' };
}
