// On-demand production observer: internal state in, bounded plain facts out; no Three updates.
// Existing matrices/bounds may be stale or absent; this records evidence, not visibility proof.
import {
  detachedGeometryUploadPending,
  isPackageGeometryDetached,
  isPackageTextureDetached,
  orientationDetachedHoldActive,
  presentedDetachRehydrateInFlight,
} from './packageCpuDetach.js';

// Consult only existing CPU bookkeeping. In particular, a program handle being present is
// not evidence that it is live: this observer must never ask GL or compile/upload anything.
function collectRenderOwner(render, playerId) {
  const renderer = render?.renderer, scene = render?.scene;
  if (!renderer || !scene) return { available: false };
  const number = value => Number.isFinite(value) ? value : null;
  const text = value => typeof value === 'string' ? value.slice(0, 180) : null;
  const color = value => value ? { r: number(value.r), g: number(value.g), b: number(value.b) } : null;
  const vector = value => value ? { x: number(value.x), y: number(value.y), z: number(value.z) } : null;
  const node = value => value ? {
    id: number(value.id), name: text(value.name), type: text(value.type),
    visible: value.visible !== false, layers: number(value.layers?.mask),
    parentId: number(value.parent?.id), renderOrder: number(value.renderOrder),
    frustumCulled: value.frustumCulled === true, scale: vector(value.scale),
  } : null;
  const texture = value => value?.isTexture === true ? {
    uuid: text(value.uuid), version: number(value.version), sourceVersion: number(value.source?.version),
    type: number(value.type), colorSpace: text(value.colorSpace), detached: isPackageTextureDetached(value),
    mipCount: number(value.mipmaps?.length),
    imageWidth: number(value.source?.data?.width), imageHeight: number(value.source?.data?.height),
  } : null;
  const root = render.meshes?.get?.(playerId), ancestors = [], ancestorSet = new Set();
  const programs = Array.isArray(renderer.info?.programs) ? renderer.info.programs : null;
  const programSet = programs ? new Set(programs.slice(0, 512)) : null;
  for (let value = root; value && ancestors.length < 16 && !ancestorSet.has(value); value = value.parent) {
    ancestorSet.add(value); ancestors.push(node(value));
  }
  const nodes = [], materials = [], geometries = [], materialSet = new Set(), geometrySet = new Set();
  const stack = root ? [root] : [], seen = new Set();
  let dropped = 0;
  while (stack.length && seen.size < 128) {
    const value = stack.pop();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    if (value.isMesh || value.isPoints) nodes.push(node(value));
    const geometry = value.geometry;
    if (geometry && geometries.length < 16 && !geometrySet.has(geometry)) {
      geometrySet.add(geometry);
      const position = geometry.attributes?.position, index = geometry.index;
      geometries.push({ uuid: text(geometry.uuid), resident: geometry.userData?.spacefaceGpuResident === true,
        detached: isPackageGeometryDetached(geometry), uploadPending: detachedGeometryUploadPending(geometry, renderer),
        positionCount: number(position?.count), positionArrayLength: number((position?.array || position?.data?.array)?.length),
        indexCount: number(index?.count), indexArrayLength: number(index?.array?.length) });
    }
    const list = Array.isArray(value.material) ? value.material : [value.material];
    for (let i = 0; i < Math.min(16, list.length) && materials.length < 16; i++) {
      const material = list[i];
      if (!material || materialSet.has(material)) continue;
      materialSet.add(material);
      // WebGLProperties.get creates a record when absent; has must precede it.
      const properties = renderer.properties?.has?.(material) ? renderer.properties.get(material) : null;
      const program = properties?.currentProgram;
      materials.push({ uuid: text(material.uuid), name: text(material.name), type: text(material.type),
        visible: material.visible !== false, version: number(material.version), opacity: number(material.opacity),
        transparent: material.transparent === true, color: color(material.color), emissive: color(material.emissive),
        emissiveIntensity: number(material.emissiveIntensity), metalness: number(material.metalness),
        roughness: number(material.roughness), transmission: number(material.transmission),
        toneMapped: material.toneMapped === true, side: number(material.side),
        depthTest: material.depthTest !== false, depthWrite: material.depthWrite !== false,
        map: texture(material.map), emissiveMap: texture(material.emissiveMap), envMap: texture(material.envMap),
        pipelineAdmission: material.userData?.__sfPipelineAdmission === true,
        program: program ? { id: number(program.id), usedTimes: number(program.usedTimes), handlePresent: !!program.program,
          inRendererPrograms: programSet ? (programSet.has(program) ? true : programs.length <= 512 ? false : null) : null } : null,
        properties: properties ? { version: number(properties.__version), toneMapping: number(properties.toneMapping),
          outputColorSpace: text(properties.outputColorSpace), instancing: properties.instancing === true,
          skinning: properties.skinning === true, programCount: number(properties.programs?.size) } : null });
    }
    const children = Array.isArray(value.children) ? value.children : [];
    const accepted = Math.min(children.length, 128 - stack.length);
    // Match Object3D.traverse's authored order so the bounded sample reaches the main
    // hull before later cosmetic attachments, as did the existing Chrome owner reader.
    for (let i = accepted - 1; i >= 0; i--) stack.push(children[i]);
    dropped += children.length - accepted;
  }
  const children = Array.isArray(scene.children) ? scene.children : [];
  const sceneRows = children.slice(0, 64).map(value => ({ ...node(value),
    light: value?.isLight ? { intensity: number(value.intensity), color: color(value.color), distance: number(value.distance) } : null }));
  const backdrop = [], backdropSeen = new Set(), backdropStack = children.slice(0, 64)
    .filter(value => value?.isLight || value?.isPoints || /star|nebula|back|sky/i.test(value?.name || ''));
  while (backdropStack.length && backdrop.length < 32) {
    const value = backdropStack.pop();
    if (!value || backdropSeen.has(value)) continue;
    backdropSeen.add(value);
    backdrop.push({ ...node(value), light: value.isLight
      ? { intensity: number(value.intensity), color: color(value.color), distance: number(value.distance) } : null });
    const nested = Array.isArray(value.children) ? value.children : [];
    for (let i = 0; i < Math.min(nested.length, 64 - backdropStack.length); i++) backdropStack.push(nested[i]);
  }
  const pending = [], subjects = renderer.userData?.spacefacePendingPipelineSubjects;
  if (subjects?.[Symbol.iterator]) for (const subject of subjects) { if (pending.length >= 12) break; pending.push(node(subject)); }
  // These existing getters read JS closure values; neither enters a draw nor consults GL.
  const target = renderer.getRenderTarget?.();
  const post = render.bloom?.diagnostics?.();
  return { available: true, playerRoot: node(root), ancestors, playerNodes: nodes, materials, geometries,
    limits: { playerVisited: seen.size, playerNodeLimit: 128, playerTruncated: stack.length > 0 || dropped > 0,
      materialLimit: 16, geometryLimit: 16, sceneChildLimit: 64, sceneChildrenTruncated: children.length > 64,
      backdropLimit: 32, backdropTruncated: backdropStack.length > 0 },
    scene: { ...node(scene), background: texture(scene.background), backgroundColor: color(scene.background),
      environment: texture(scene.environment), backgroundIntensity: number(scene.backgroundIntensity),
      environmentIntensity: number(scene.environmentIntensity), children: sceneRows, backdrop,
      fog: scene.fog ? { color: color(scene.fog.color), density: number(scene.fog.density),
        near: number(scene.fog.near), far: number(scene.fog.far) } : null },
    renderer: { cameraLayers: number(render.camera?.layers?.mask), toneMapping: number(renderer.toneMapping),
      exposure: number(renderer.toneMappingExposure), outputColorSpace: text(renderer.outputColorSpace),
      target: target ? { width: number(target.width), height: number(target.height), texture: texture(target.texture) } : null,
      programCount: number(programs?.length), programMembershipLimit: 512,
      lastCompletedPass: 'unavailable',
      guard: { detachPending: renderer.__sfDrawGuardDetachPending === true,
        detachSerial: number(renderer.__sfDrawGuardDetachSerial), scanSerial: number(renderer.__sfDrawGuardDetachScanSerial),
        depth: number(renderer.__sfUnreadyDrawGuardDepth) } },
    residency: { orientationHold: orientationDetachedHoldActive(renderer),
      refillInFlight: !!presentedDetachRehydrateInFlight(), pendingSubjects: pending },
    post: post ? { enabled: post.enabled === true, sceneTargetWidth: number(post.sceneTargetWidth),
      sceneTargetHeight: number(post.sceneTargetHeight), contentScale: number(post.contentScale),
      packedHdrMode: text(post.packedHdrMode), bloomPasses: number(post.bloomPasses) } : null,
    note: 'On-demand cached CPU facts only. Program presence, bounds and counters do not prove visible pixels.' };
}

export function collectCameraWitness(state) {
  if (!state) return { available: false, reason: 'presentation-state-unavailable' };
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
    renderOwner:collectRenderOwner(render,state.playerId),
    nearestIds:nearest.map(v=>v.id),largestRadiusIds:large.map(v=>v.id),entities:selected,
    limits:{entityLimit:4096,meshNodeLimitPerEntity:512,nearestLimit:8,largeLimit:8,inspected,truncated},
    visibilityAssessment:'unverified',note:'One-shot public render witness; entity radius/nearby ordering is a proxy, not actual occluder identification. No matrix/bounds updates or raycasts performed.' };
}
