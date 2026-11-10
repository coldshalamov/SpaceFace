import { captureCharonVfxIsolation } from './charonVfxIsolation.mjs';
import { remainingDiagnosticBudget } from './probeCommandBudget.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export const CHARON_CAMERA_MAX_BUDGET_MS = 90000;
// Existing capture needs a 10s image reserve plus 500ms persistence; do not stage
// a late optional arrival when even that observation window cannot fit.
export const CHARON_CAMERA_MIN_BUDGET_MS = 12000;
export const CHARON_VFX_WINDOW_MS = 12000;
export const CHARON_VFX_REPORT_ALLOWANCE_MS = 500;
export const CHARON_CAMERA_LABEL = 'Programmatically staged Charon game-camera diagnostic; real runtime entities; not an ordinary flown arrival or visual/gameplay acceptance.';
export function charonCameraEnabled(argv = process.argv) { return argv.includes('--charon-camera-diagnostic'); }

// Serialized into the existing main-lane page. Only world/camera owners mutate setup.
export function charonCameraPageOperation(action) {
  const sf = window.SF, s = sf?.state, world = sf?.registry?.get('world');
  if (!s || !world) throw new Error('Charon diagnostic requires live SF world');
  const sectorId = 'sector_charon_expanse';
  const render = s.render || {}, owner = sf.registry?.get('render');
  const finite = value => Number.isFinite(value) ? value : null;
  const bool = value => typeof value === 'boolean' ? value : null;
  const member = (collection, id) => typeof collection?.has === 'function'
    ? collection.has(id) : Array.isArray(collection) ? collection.includes(id) : null;
  const activity = render.activityFrame;
  const short = value => typeof value === 'string' ? value.slice(0, 240) : null;
  const payloadMetadata = mesh => {
    if(!mesh?.userData)return null;
    const u=mesh.userData, contract=u.renderContract;
    const text=value=>typeof value==='string'?value.slice(0,160):null;
    const parts=Array.isArray(u.authoredParts)?u.authoredParts:contract?.authoredParts;
    const slots=u.authoredSlots && typeof u.authoredSlots==='object'?u.authoredSlots:contract?.authoredSlots;
    const keys=slots && !Array.isArray(slots)?Object.keys(slots):[];
    const vector=value=>Array.isArray(value)&&value.length===3?value.map(finite):null;
    return {
      authoredParts:Array.isArray(parts)?parts.slice(0,16).map(text):null,
      authoredPartCount:Array.isArray(parts)?parts.length:null,
      authoredPartsTruncated:Array.isArray(parts)&&parts.length>16,
      partsSource:Array.isArray(u.authoredParts)?'userData.authoredParts':Array.isArray(parts)?'userData.renderContract.authoredParts':null,
      authoredSlots:keys.slice(0,8).map(key=>({slot:text(key),values:Array.isArray(slots[key])?slots[key].slice(0,4).map(text):null,
        count:Array.isArray(slots[key])?slots[key].length:null,truncated:Array.isArray(slots[key])&&slots[key].length>4})),
      authoredSlotCount:keys.length,authoredSlotsTruncated:keys.length>8,
      wholeShip:bool(contract?.wholeShip),
      visualBounds:u.visualBounds?{center:vector(u.visualBounds.center),size:vector(u.visualBounds.size)}:null,
    };
  };
  const phaseTimings = value => value ? Object.fromEntries(
    ['decodeMs','composeMs','pipelineMs','commitMs','policiesMs','compileMs','residencyMs']
      .map(key => [key, finite(value[key])])) : null;
  // Existing owner diagnostics only. Scan at most its bounded 128-row tail, retain
  // at most 16 records (running first), and never copy URLs or arbitrary nested data.
  const queueSource = owner?.scene?.userData?.authoredUpgradeDiagnostics;
  const boundedRows = rows => {
    const tail = Array.isArray(rows) ? rows.slice(-128) : [];
    return [...tail.filter(row => row && row.endedAtMs == null),
      ...tail.filter(row => row && row.endedAtMs != null).reverse()].slice(0,16);
  };
  const authoredQueue = queueSource ? {
    evidenceScope:'Existing owner diagnostic sample; not complete queue membership or eligibility.',
    sampledAtMs:finite(globalThis.performance?.now?.()),
    activeJobs:finite(queueSource.activeJobs),activeAdmissionSlots:finite(queueSource.activeAdmissionSlots),
    maxConcurrentDecode:finite(queueSource.maxConcurrentDecode),
    jobRecordCount:Array.isArray(queueSource.jobs)?queueSource.jobs.length:null,
    partLoadRecordCount:Array.isArray(queueSource.partLoads)?queueSource.partLoads.length:null,
    jobs:boundedRows(queueSource.jobs).map(row=>({sequence:finite(row.sequence),key:short(row.key),
      entityId:typeof row.entityId==='number'?finite(row.entityId):short(row.entityId),
      entityType:short(row.entityType),status:short(row.status),priority:finite(row.priority),
      startedAtMs:finite(row.startedAtMs),endedAtMs:finite(row.endedAtMs),durationMs:finite(row.durationMs),
      phases:phaseTimings(row.phases)})),
    partLoads:boundedRows(queueSource.partLoads).map(row=>({slot:short(row.slot),
      cacheStatus:short(row.cacheStatus),startedAtMs:finite(row.startedAtMs),
      endedAtMs:finite(row.endedAtMs),durationMs:finite(row.durationMs)})),
  } : null;
  const boundary = id => {
    const record = owner?._sectorBoundaryPreparations?.get?.(id);
    if (!record) return null;
    return {state:record.state??null,active:bool(record.active),generation:finite(record.generation),
      preparePhase:short(record.boundary?.userData?.authoredPreparePhase),
      phaseTimings:phaseTimings(record.boundary?.userData?.__admissionPhaseTimings),
      rootPresent:!!record.boundary,assetState:record.boundary?.userData?.authoredAssetState??null,
      visible:bool(record.boundary?.visible),error:record.error?String(record.error.message||record.error).slice(0,1000):null,
      abortReason:record.abortReason??null,cleanupBlocked:record.cleanupBlocked===true};
  };
  let admissionLane=null,admissionLaneError=null;
  try {
    const lane=render.sampleOpeningCookLane?.();
    if(lane) admissionLane={...Object.fromEntries(
      ['queued','flushed','settled','upgradeJobs','upgradeInFlight','upgradeCompiling','meshBuilds']
        .map(key=>[key,finite(lane[key])])),...Object.fromEntries(
      ['upgradeOpeningHeld','upgradeFirstFlightHeld','upgradeFrameScheduled','upgradeRunning']
        .map(key=>[key,bool(lane[key])]))};
  } catch(error) {admissionLaneError=short(error?.message||String(error));}
  const transition = {
    pending: render.sectorShellAdmission === true || render.liveSectorGpuAdmission === true,
    sectorShellAdmission: render.sectorShellAdmission === true,
    liveSectorGpuAdmission: render.liveSectorGpuAdmission === true,
    enterSerial: finite(s.world?.enterSerial), shellSerial: finite(render.sectorShellAdmissionSerial),
    cookGeneration: finite(owner?._liveSectorCookGeneration),
    firstFlightCount: finite(render.liveSectorFirstFlightIds?.size),
    residencyHoldUntil: finite(render.firstFlightResidencyHoldUntil), simTime: finite(s.simTime),
    meshBuildPending: Array.isArray(owner?._meshBuildQueue)
      ? Math.max(0, owner._meshBuildQueue.length - (owner._meshBuildQueueHead || 0)) : null,
    reconcileDirty: bool(owner?._meshReconcileDirty), reconcileActive:!!owner?._reconcileIter,
    reconcileEpoch:finite(owner?._reconcileEpoch), residencyPollActive:!!owner?._residencyPollIter,
    holdExemptCollectActive:!!owner?._holdExemptCollectIter,
    holdExemptEnqueueActive:!!owner?._holdExemptEnqueueIter,
    holdExemptKickActive:!!owner?._holdExemptKickIter,
    holdExemptRemaining:finite(owner?._holdExemptRemaining),
    protectedFirstFlightDrainActive:!!owner?._protectedFirstFlightDrainIter,
    noncriticalStreamingDeferred:bool(owner?._deferNoncriticalMeshStreaming),
    firstFlightDeferredHold:bool(owner?._firstFlightDeferredHold),
    deferredHoldUntil:finite(render.firstFlightDeferredHoldUntil),
    postOpeningPipelineReleased:bool(owner?._postOpeningPipelineAdmissionReleased),
    firstPlayableFrameAt:finite(render.firstPlayableFrameAt),
    activityFrameComplete:bool(activity?.complete),
    authoredSectorPrewarmPendingId:owner?._authoredSectorPrewarmPendingId??null,
    lastPresentDtMs:finite(render.lastPresentDtMs),
    evidenceScope:'Raw owner state only; membership and holds do not alone prove owed-mesh eligibility.',
  };
  if (action === 'post') {
    let post=null,error=null;
    try { post=window.__THREE_GAME_DIAGNOSTICS__?.getReport?.()?.post??null; }
    catch (e) { error=String(e?.message||e).slice(0,1000); }
    let boundaryFailures=null,boundaryFailureError=null;
    try {boundaryFailures=render.sectorBoundaryPrewarm?.failures?.()??null;}
    catch(e){boundaryFailureError=String(e?.message||e).slice(0,1000);}
    const finite=v=>Number.isFinite(v)?v:null;
    return {boundaryFailures,boundaryFailureError,available:!!post,error,post:post?{
      activePath:post.activePath??null,effectiveSceneScale:finite(post.effectiveSceneScale),
      drawingBufferWidth:finite(post.drawingBufferWidth),drawingBufferHeight:finite(post.drawingBufferHeight),
      contentWidth:finite(post.bloom?.contentWidth),contentHeight:finite(post.bloom?.contentHeight),
      contentScale:finite(post.bloom?.contentScale),
    }:null};
  }
  if (action === 'enter') {
    if (s.mode !== 'flight') throw new Error(`Cannot stage from mode ${s.mode}`);
    world.enterSector(sectorId, { fromJump: true, via: 'charon-camera-diagnostic' });
    return { sectorId: s.world?.currentSectorId };
  }
  const live = e => e?.alive === true && s.entities.get(e.id) === e;
  const entities = s.entityList.filter(live), book = s.traffic?.charonSalvageSupply;
  const unique = predicate => { const rows = entities.filter(predicate); return rows.length === 1 ? rows[0] : null; };
  const validBook=book && !book.blocked && book.original===6
    && typeof book.haulerId==='string' && book.haulerId.length>0
    && typeof book.salvorId==='string' && book.salvorId.length>0 && book.haulerId!==book.salvorId;
  const sourceRows=Array.isArray(book?.pods)?book.pods.filter(p=>p.id==='charon_colony_air_pod'):[];
  const source=sourceRows.length===1?sourceRows[0]:null;
  const originalActor=(slot,id)=>validBook && entities.filter(e=>e.data?.worldRecordId===id).length===1
    ? unique(e=>e.data?.activityActorSlotId===slot && e.data?.worldRecordId===id):null;
  const targets = [
    unique(e => e.data?.poiId === 'poi_colony' && e.data?.sectorId === sectorId),
    originalActor('charon_colony_hauler',book?.haulerId),
    originalActor('charon_colony_salvor',book?.salvorId),
    validBook && source?.original===6 && Number.isFinite(source.loose) && source.loose>0 && source.loose<=6
      ? unique(e => e.data?.charonSupplyPod?.id === 'charon_colony_air_pod'
        && e.data?.activityObjectSlotId === 'charon_colony_air_pod'
        && e.data?.commodityId === 'cmdty_consumer_goods' && e.data?.amount===source.loose):null,
  ];
  const names = ['colony', 'original-hauler', 'original-cutter', 'original-pod'];
  const traffic = sf.registry?.get('traffic');
  const countSlot = slot => entities.filter(e => e.data?.activityActorSlotId === slot).length;
  const pendingCount = method => { try { return finite(sf.bus?.[method]?.()); } catch (_) { return null; } };
  const originalDiscovery = {
    state: !book ? 'awaiting-ledger' : !validBook || !source || source.original !== 6
      || !Number.isFinite(source.loose) || source.loose < 0 || source.loose > 6
      ? 'invalid-ledger' : source.loose === 0 ? 'source-exhausted'
      : targets.some(e => !e) ? 'awaiting-originals' : 'observed',
    ledgerPresent: !!book, ledgerValid: !!validBook,
    haulerSlotMetadataCount: countSlot('charon_colony_hauler'),
    cutterSlotMetadataCount: countSlot('charon_colony_salvor'),
    sourceSlotMetadataCount: entities.filter(e => e.data?.activityObjectSlotId === 'charon_colony_air_pod').length,
    trafficEmittedEpoch: finite(traffic?._emittedEpoch), trafficCookedEpoch: finite(traffic?._cookedEnterEpoch),
    pendingEmitCount: pendingCount('pendingEmitSliceCount'),
    pendingPresentationCount: pendingCount('pendingPresentationCount'),
    evidenceScope: 'Slot metadata counts are not original identity proof; global bus counts do not identify a pending traffic listener.',
  };

  const radius = e => {
    const root = e.mesh, bounds = root?.userData?.visualBounds;
    const size = bounds?.size;
    const measured = Array.isArray(size) && size.length === 3
      ? Math.hypot(...size.map((v, i) => Number(v) * Math.abs(Number(root.scale?.[['x','y','z'][i]]) || 1))) / 2
        + (Array.isArray(bounds.center) ? Math.hypot(...bounds.center.map((v,i)=>Number(v)*Math.abs(Number(root.scale?.[['x','y','z'][i]])||1))) : 0) : 0;
    const r=Math.max(1, Number(e.radius) || 0, Number(e.data?.placeRadius) || 0, measured);
    if (!Number.isFinite(r)) throw new Error('Nonfinite subject/collision bounds');
    return r;
  };
  if (action === 'frame') {
    // Hardware hard-enter can start a position-sensitive asynchronous sector cook. Relocating while
    // its first-flight census is in progress changes the subject of that admission.
    // Software skips that cook; this guard is defensive, not evidence of the missing-root cause.
    // Observe it, never force it to complete or mutate its readiness latches.
    if (transition.pending) throw new Error('Sector admission pending; camera relocation withheld');
    if (s.world?.currentSectorId !== sectorId || targets.some(e => !e)) throw new Error('Original Charon subjects missing or ambiguous; no substitute spawned');
    const player = s.entities.get(s.playerId);
    if (!live(player)) throw new Error('Player unavailable');
    const blockers=entities.filter(e=>targets.includes(e)||e.collides===true);
    if ([...blockers,player].some(e=>!Number.isFinite(e.pos?.x)||!Number.isFinite(e.pos?.z))) throw new Error('Nonfinite framing position');
    const bounds = targets.reduce((b,e) => {
      const r = radius(e); b.minX=Math.min(b.minX,e.pos.x-r); b.maxX=Math.max(b.maxX,e.pos.x+r);
      b.minZ=Math.min(b.minZ,e.pos.z-r); b.maxZ=Math.max(b.maxZ,e.pos.z+r); return b;
    }, {minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
    const cx=(bounds.minX+bounds.maxX)/2, cz=(bounds.minZ+bounds.maxZ)/2;
    const clearance=radius(player)+12;
    const edgeOffset=clearance+1;
    // Prefer the nearest collision-proxy-clear camera anchor, never inside a subject.
    const candidates=[{x:cx,z:cz}, {x:cx,z:bounds.minZ-edgeOffset}, {x:bounds.minX-edgeOffset,z:cz},
      {x:bounds.maxX+edgeOffset,z:cz}, {x:cx,z:bounds.maxZ+edgeOffset}];
    const clear = p => blockers.every(e => e === player || Math.hypot(p.x-e.pos.x,p.z-e.pos.z)>radius(e)+clearance);
    const pose=candidates.find(clear);
    if (!pose) throw new Error('No collision-proxy-clear framing pose; not relocating');
    const extent=Math.max(...targets.map(e=>Math.hypot(e.pos.x-pose.x,e.pos.z-pose.z)+radius(e)));
    const camera=s.render?.cameraCtrl?.obj;
    const fov=Number(camera?.fov)||50, aspect=Number(camera?.aspect)||16/9;
    if (!(fov>0&&fov<180&&aspect>0&&Number.isFinite(aspect))) throw new Error('Invalid camera projection');
    const halfAngle=Math.min(fov*Math.PI/360,Math.atan(Math.tan(fov*Math.PI/360)*aspect));
    const requested=extent/Math.sin(halfAngle)*1.1;
    const zoom=Math.max(45,Math.min(330,requested));
    if (!world.relocatePlayerInSector({...pose,heading:0},{reason:'charon-camera-diagnostic'})) throw new Error('World relocation rejected');
    sf.bus.emit('camera:zoom',{level:zoom});
    if (!s.render?.cameraCtrl?.snapToPlayer?.()) throw new Error('Camera snap unavailable');
    return {pose,bounds,extent,zoom,requestedZoom:requested,fitClamped:requested>330,
      framingBasis:'Live subject collision/place radii and available authored visual bounds; clearance is a conservative proxy, not collision/visibility proof.'};
  }
  const player=s.entities.get(s.playerId);
  const subjects=targets.map((e,i)=>e?{subject:names[i],id:e.id,generation:e.occupantGeneration,
    worldRecordId:e.data?.worldRecordId??null,defId:e.data?.defId??null,placeId:e.data?.placeId??null,
    pos:{x:e.pos.x,z:e.pos.z},radius:radius(e),entityRadius:finite(e.radius),
    trafficRole:typeof e.data?.trafficRole==='string'?e.data.trafficRole.slice(0,160):null,
    selectedPayload:payloadMetadata(e.mesh),
    meshScale:e.mesh?.scale?{x:finite(e.mesh.scale.x),y:finite(e.mesh.scale.y),z:finite(e.mesh.scale.z)}:null,
    radiusBasis:'radius is a conservative framing envelope; entityRadius is the raw gameplay radius.',assetState:e.mesh?.userData?.authoredAssetState??'missing',
    assetId:e.mesh?.userData?.assetId??null,visible:e.mesh?.visible??false,
    amount:e.data?.amount??null,commodityId:e.data?.commodityId??null,
    meshPresent:!!e.mesh, meshName:e.mesh?.name??null,
    buildQueued:owner?._meshBuildQueuedIds?.has?.(e.id)??null,
    buildFailures:finite(e._meshBuildFailures), buildError:e._meshBuildLastError??null,
    noMesh:e._noMesh===true,noMeshByRenderer:e._noMeshByRenderer===true,
    buildRetryAtSim:finite(e._meshBuildRetryAtSim),buildRetryAtWallMs:finite(e._meshBuildRetryAtWallMs),
    presentationTier:e.activity?.presentationTier??null,presentationAdmission:e.presentationAdmission??null,
    inActivityGlass:member(activity?.renderGlassIds,e.id),inActivityRunway:member(activity?.renderRunwayIds,e.id),
    boundaryPreparation:boundary(e.id),
    inFirstFlight:render.liveSectorFirstFlightIds?.has?.(e.id)??null}: {subject:names[i],missing:true});
  return {sectorId:s.world?.currentSectorId,mode:s.mode,transition,authoredQueue,admissionLane,admissionLaneError,tick:s.tick,presentCount:s.render?.presentCount??null,
    gpu:s.render?.gpu?{...s.render.gpu}:null,softwareRenderer:s.render?.softwareRenderer??null,dynResScale:Number.isFinite(s.render?.dynResScale)?s.render.dynResScale:null,
    player:player?{id:player.id,pos:{x:player.pos.x,z:player.pos.z},hull:player.hull,assetState:player.mesh?.userData?.authoredAssetState??'missing'}:null,
    originalDiscovery,subjects,ready:!transition.pending&&subjects.every(e=>!e.missing&&e.assetState==='authored')&&player?.mesh?.userData?.authoredAssetState==='authored',
    ledger:book?{phase:book.phase,original:book.original,blocked:!!book.blocked,haulerId:book.haulerId,salvorId:book.salvorId,
      pods:book.pods?.slice(0,8).map(p=>({id:p.id,original:p.original,loose:p.loose,aboard:p.aboard,delivered:p.delivered,consumed:p.consumed,player:p.player,other:p.other,lost:p.lost}))}:null,
    visibilityAssessment:'unverified; inspect actual screenshots; authored state is not pixel visibility'};
}

export async function captureCharonCameraDiagnostic(page, {
  budgetMs = CHARON_CAMERA_MAX_BUDGET_MS, now = () => Date.now(), sleep = ms => new Promise(r=>setTimeout(r,ms)),
  mkdirFn = mkdir, writeFileFn = writeFile, outputDir = resolve('scratch/check-ci-report/station-handoff'),
} = {}) {
  // Actual SwiftShader evidence: the 15.197s diagnostic ended with boundaries
  // still preparing; its two capture samples advanced only 0.3 sim seconds. Observe once for at most 90s;
  // never accelerate sim time or bypass authored admission to manufacture readiness.
  const started=now(), totalBudget=Math.min(CHARON_CAMERA_MAX_BUDGET_MS,
    Number.isFinite(budgetMs)?Math.max(1,budgetMs):CHARON_CAMERA_MAX_BUDGET_MS);
  const deadline=started+Math.max(1,totalBudget-500);
  let closed=false;
  const report={schema:'spaceface.charonCamera.v1',label:CHARON_CAMERA_LABEL,visualAcceptance:false,
    status:'unavailable',budgetMs:totalBudget,observationStop:null,initialSample:null,setup:null,transitionSamples:[],samples:[],postSamples:[],screenshots:[],errors:[]};
  const check=()=>{if(closed||now()>=deadline)throw new Error('Charon diagnostic deadline exceeded');};
  const bounded=async fn=>{check();let timer;try{return await Promise.race([
    Promise.resolve().then(()=>{check();return fn();}),new Promise((_,reject)=>{timer=setTimeout(()=>{closed=true;reject(new Error('Charon diagnostic deadline exceeded'));},Math.max(1,deadline-now()));})]);}finally{clearTimeout(timer);}};
  const fixedIdentities=new Map();
  let fixedLedger=null,fixedSector=null,fixedEnter=null;
  const read=async()=>{
    const snapshot=await bounded(()=>page.evaluate(charonCameraPageOperation,'read'));
    let identityLost=false;
    if(fixedSector!==null&&snapshot.sectorId!==fixedSector)identityLost=true;
    if(fixedEnter!==null&&snapshot.transition?.enterSerial!==fixedEnter)identityLost=true;
    if(fixedSector===null&&typeof snapshot.sectorId==='string')fixedSector=snapshot.sectorId;
    if(fixedEnter===null&&Number.isFinite(snapshot.transition?.enterSerial))fixedEnter=snapshot.transition.enterSerial;
    const book=snapshot.ledger;
    const ledgerIdentity=snapshot.originalDiscovery?.ledgerValid===true
      ? JSON.stringify([book?.haulerId,book?.salvorId,book?.original,
        book?.pods?.find(p=>p.id==='charon_colony_air_pod')?.id]) : null;
    if(fixedLedger!==null&&ledgerIdentity!==fixedLedger)identityLost=true;
    if(fixedLedger===null&&ledgerIdentity!==null)fixedLedger=ledgerIdentity;
    const seen=new Set();
    snapshot.subjects=snapshot.subjects.map((e,i)=>{
      const key=e.subject??i;seen.add(key);
      const identity=JSON.stringify([e.id,e.generation,e.worldRecordId]);
      if(fixedIdentities.has(key)&&(e.missing||fixedIdentities.get(key)!==identity)){
        identityLost=true;return {...e,missing:true,identityChanged:true};
      }
      if(!e.missing&&!fixedIdentities.has(key))fixedIdentities.set(key,identity);
      return e;
    });
    if([...fixedIdentities.keys()].some(key=>!seen.has(key)))identityLost=true;
    if(identityLost){snapshot.originalIdentityLost=true;snapshot.ready=false;
      snapshot.subjects=snapshot.subjects.map(e=>({...e,missing:true}));}
    return snapshot;
  };
  const capture=async index=>{
    await bounded(()=>mkdirFn(outputDir,{recursive:true})); check();
    const file=resolve(outputDir,`${started}-charon-programmatic-${index}.png`);
    // Expensive diagnostics run at most twice, only immediately before screenshots, never in polls.
    const post=await bounded(()=>page.evaluate(charonCameraPageOperation,'post'));
    report.postSamples.push({capture:index,...post});
    await bounded(()=>{check();return page.screenshot({path:file,type:'png',timeout:Math.min(4000,Math.max(1,deadline-now()))});});
    report.screenshots.push(file);
  };
  try {
    await bounded(()=>page.evaluate(charonCameraPageOperation,'enter'));
    // Enter listeners can drain over several presented frames. Do not fabricate missing cast.
    let snapshot=await read();
    report.initialSample=snapshot;
    const subjectsDeadline=deadline-10000;
    const initialCanProgress=sample=>!sample.originalIdentityLost&&(!sample.originalDiscovery
      || ['awaiting-ledger','awaiting-originals'].includes(sample.originalDiscovery.state));
    while(snapshot.subjects.some(e=>e.missing)&&initialCanProgress(snapshot)&&now()<subjectsDeadline){await bounded(()=>sleep(200));snapshot=await read();}
    if(snapshot.subjects.some(e=>e.missing)) {
      report.samples.push(snapshot); report.status='subjects-unavailable';report.observationStop=snapshot.originalIdentityLost
        ? 'original-subject-unavailable' : initialCanProgress(snapshot)
        ? 'initial-original-cohort-not-observed' : 'original-ledger-terminal';
    } else {
      report.transitionSamples.push(snapshot.transition??null);
      // Keep the capped total deadline and capture reserve. If the genuine arrival
      // is still cooking, preserve two arrival views instead of relocating mid-cook.
      while(snapshot.transition?.pending&&!snapshot.subjects.some(e=>e.missing)&&now()<deadline-10000){await bounded(()=>sleep(250));snapshot=await read();}
      report.transitionSamples.push(snapshot.transition??null);
      if(!snapshot.transition?.pending&&!snapshot.subjects.some(e=>e.missing)){
        report.setup=await bounded(()=>page.evaluate(charonCameraPageOperation,'frame'));
        snapshot=await read();
      }
      // Reserve time for two bounded captures. Readiness failure is evidence, not a forced upgrade.
      while(!snapshot.ready&&!snapshot.subjects.some(e=>e.missing)&&now()<deadline-10000){await bounded(()=>sleep(250));snapshot=await read();}
      report.observationStop=snapshot.subjects.some(e=>e.missing)?'original-subject-unavailable'
        :snapshot.ready?'original-subjects-authored':'readiness-window-exhausted';
      report.samples.push(snapshot);
      await capture(1);
      const firstCount=snapshot.presentCount, firstTime=now();
      do {await bounded(()=>sleep(200));snapshot=await read();}
      while(now()-firstTime<500 || !(Number.isFinite(firstCount)&&snapshot.presentCount>firstCount));
      report.samples.push(snapshot);
      await capture(2);
      report.status=report.samples.some(s=>s.subjects.some(e=>e.missing))?'original-subject-unavailable-captured':!report.setup?'sector-admission-pending-unframed-captured':report.samples.every(s=>s.ready)?'authored-subjects-captured-not-visual-acceptance':'unresolved-assets-captured';
    }
  } catch(error) {report.status=/deadline/.test(String(error?.message))?'diagnostic-timeout':'diagnostic-failed';report.errors.push(String(error?.message||error).slice(0,1000));}
  closed=true;report.elapsedMs=now()-started;
  // In-flight page requests cannot be cancelled here; existing checker finally closes the browser.
  // Its pre-existing cleanup is outside this diagnostic budget and stays unchanged.
  // Filesystem-only persistence may finish later; no diagnostic page dispatch follows closure.
  let path=null;
  let saveTimer;
  try {
    path=await Promise.race([(async()=>{await mkdirFn(outputDir,{recursive:true});
      const file=resolve(outputDir,`${started}-charon-programmatic.json`);
      await writeFileFn(file,JSON.stringify(report,null,2)+'\n');return file;})(),
      new Promise((_,reject)=>{saveTimer=setTimeout(()=>reject(new Error('report persistence timeout')),Math.max(1,started+totalBudget-now()));})]);
  } catch(error){report.errors.push(`Report save failed: ${String(error?.message||error).slice(0,500)}`);path=null;}
  finally {clearTimeout(saveTimer);}
  return {path,report};
}

export async function runOptionalCharonCameraDiagnostic(page, {
  argv=process.argv, capture=captureCharonCameraDiagnostic, log=console.log, warn=console.warn,
  commandDeadline=null, now=()=>Date.now(), isolate=captureCharonVfxIsolation, persistIsolation=writeFile,
}={}) {
  if(!charonCameraEnabled(argv))return null;
  const started=now();
  const budgetMs=remainingDiagnosticBudget(commandDeadline,started,CHARON_CAMERA_MAX_BUDGET_MS);
  if(budgetMs<CHARON_CAMERA_MIN_BUDGET_MS){warn('Charon camera diagnostic skipped: command deadline leaves less than the 12s minimum useful observation budget after cleanup reserve.');return null;}
  // Allocate both stages before capture, inside one capped optional deadline.
  // Preserve a useful baseline first; never start attribution on incidental slack.
  const end=started+budgetMs;
  const attributionReserve=CHARON_VFX_WINDOW_MS+CHARON_VFX_REPORT_ALLOWANCE_MS;
  const attributionAllocated=budgetMs>=CHARON_CAMERA_MIN_BUDGET_MS+attributionReserve;
  const baselineBudgetMs=attributionAllocated?budgetMs-attributionReserve:budgetMs;
  let result;
  try {
    result=await capture(page,{budgetMs:baselineBudgetMs});
    log(`Charon programmatic game-camera diagnostic: ${result.path??'report unavailable'} (${result.report.status})`);
  } catch(error){warn(`Charon camera diagnostic unavailable: ${error?.message||error}`);return null;}
  // Attribution only after the actual baseline pair exists. Never replace its
  // files, status or readiness verdict with temporarily isolated views.
  if(!result.path || result.report.screenshots?.length<2 || !Array.isArray(result.report.screenshots))return result;
  if(!attributionAllocated || end-now()<attributionReserve){
    warn('Charon VFX attribution skipped: full 12s isolation window plus report allowance unavailable within the original optional budget; baseline preserved.');
    return result;
  }
  try {
    const report=await isolate(page,{deadline:end-CHARON_VFX_REPORT_ALLOWANCE_MS,maxBudgetMs:CHARON_VFX_WINDOW_MS,outputDir:dirname(result.path),now});
    const path=result.path.replace(/\.json$/i,'')+'.vfx-isolation.json';
    const serialized=JSON.stringify(report,null,2)+'\n';
    if(Buffer.byteLength(serialized,'utf8')>65536)throw new Error('VFX isolation report exceeds bounded 64KiB persistence size');
    const remaining=end-now();
    if(!(remaining>0))throw new Error('VFX isolation report persistence deadline exhausted');
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(()=>{if(now()>=end)throw new Error('VFX persistence deadline exhausted');return persistIsolation(path,serialized);}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('VFX isolation report persistence timeout')),Math.min(CHARON_VFX_REPORT_ALLOWANCE_MS,remaining));}),
      ]);
    } finally {clearTimeout(timer);}
    log(`Charon VFX ownership attribution diagnostic: ${path} (${report.status}; never visual acceptance)`);
    return {...result,vfxIsolation:{path,report}};
  } catch(error){warn(`Charon VFX attribution unavailable: ${error?.message||error}`);return result;}
}
