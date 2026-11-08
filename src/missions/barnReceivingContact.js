import { FRONTIER_FRAME, FRONTIER_MODULES, FRONTIER_BARN_RAISING } from '../data/factions/free.js';
const point = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const tag = 'barnReceivingGuide';
export function tickBarnReceivingContact(owner) {
  const s = owner.state;
  if (!s) return;
  const a = s.frontier?.barnAttempt;
  const m = s.missions?.active?.find(m => m.id === a?.missionId);
  const frame = s.entities?.get(a?.frameId);
  const valid = s.mode === 'flight' && s.run?.kind !== 'survival' && !s.physicsVenue?.active
    && a?.status === 'active' && owner._isBarnMission(m)
    && s.world?.currentSectorId === a.sectorId && frame?.alive !== false && point(frame?.pos)
    && frame.data?.homesteadFrame === true && frame.data.barnDone !== true
    && frame.occupantGeneration === a.frameGen && frame.data.frontierMissionId === m.id
    && frame.data.frontierSite === a.siteId;
  let ring;
  for (const e of s.entityList || []) {
    if (!e?.alive || e.data?.[tag] !== true) continue;
    if (valid && !ring && e.data.frameId === frame.id && e.data.frameGen === a.frameGen
        && e.data.missionId === m.id && e.pos.x === frame.pos.x && e.pos.z === frame.pos.z
        && e.physicsBody === false) ring = e;
    else owner.helpers.removeEntity(e.id);
  }
  if (!valid) return;
  const snapped = FRONTIER_MODULES.filter(mod => {
    const e = s.entities.get(a.moduleIds?.[mod.id]);
    return e?.alive && e.occupantGeneration === a.moduleGens?.[mod.id]
      && e.data?.frontierMissionId === m.id && e.data.frontierSite === a.siteId
      && e.data.homesteadModule === mod.id && e.data.snapped === true
      && e.data.snappedFrameId === frame.id && e.data.snappedFrameGen === a.frameGen
      && frame.data.slots?.[mod.id] === e.id;
  });
  const remaining = FRONTIER_MODULES.filter(mod => !snapped.includes(mod)).map(mod => mod.label.replace(' Module',''));
  if (!ring) ring = owner.helpers.spawnEntity({type:'beacon',pos:{...frame.pos},radius:1,mass:0,hull:1,hullMax:1,
    collides:false,physicsBody:false,homeSectorId:a.sectorId,
    data:{[tag]:true,frameId:frame.id,frameGen:a.frameGen,missionId:m.id,parentType:'story_prop',
      circuitMark:true,ringRadius:FRONTIER_FRAME.snapRange,visualRadius:FRONTIER_FRAME.snapRange,
      tetherable:false,masslineTetherable:false,scannerSignalKind:'salvage'}});
  if (ring) ring.data.scanLabel = `E-21 RECEIVING · ${snapped.length}/6 · ${remaining.length ? remaining.join(', ') : 'hold for welders'}`;
  const p = s.entities.get(s.playerId);
  if (!p?.alive || !point(p.pos) || s.ui?.docked || s.player?.flags?.docked
      || Math.hypot(p.pos.x-frame.pos.x,p.pos.z-frame.pos.z)>650) return;
  if (!a.receivingContact || typeof a.receivingContact !== 'object' || Array.isArray(a.receivingContact)) a.receivingContact = {};
  const mem = a.receivingContact;
  const say = (id,text) => owner.bus.emit('comms:popup',{id:`barn_receiving:${m.id}:${id}`,sender:'E-21 WELD CREW',category:'story',ttl:12,persist:false,text});
  if (!mem.arrived) {
    mem.arrived = true;
    say('arrival',`We have a frame, not a home yet. Bring each marked module's center inside the receiving ring; we seat each kind once. ${Number.isFinite(frame.data.raiseDeadline) ? `${snapped.length} of six are seated; ${Math.max(0,Math.ceil(frame.data.raiseDeadline-s.simTime))} seconds remain on the current window. Read the ring for what is missing.` : `The first snap starts our ${FRONTIER_BARN_RAISING.windowS}-second welding window. Stage your next move before you bring one in.`} Keep clear of the frame itself. That line marks receiving range, not empty space.`);
    return;
  }
  if (snapped.length && !mem.firstSeat) {
    mem.firstSeat = true;
    const seconds = Math.max(0,Math.ceil((Number(frame.data.raiseDeadline)||s.simTime)-s.simTime));
    say('seated',`${snapped.length} of six seated. ${seconds} seconds remain on this E-21 window. ${remaining.length ? `Still needed: ${remaining.join(', ')}. A missing piece can be restocked; watch its marker.` : 'Keep the full set here while we finish the weld.'} The gate audit has its own clock.`);
  }
}
