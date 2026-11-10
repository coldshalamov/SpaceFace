// Old Hob's borrowed winches. Commands go to the existing attachment service;
// all movement, collision, tension and release momentum remain native physics.
import { CERES_WORKFLEET_CONTRACT as C } from '../data/ceresWorkfleet.js';
import { CERES_WINCH_ANCHORS as ANCHORS, CERES_WINCH_MODE as MODE, CERES_WINCH_SPAN,
  ceresWinchAnchorSpec, ceresWinchIdentity, isCeresWinchAnchor } from '../data/ceresAnchorWinching.js';
import { physicsBodyNativeReady, shouldSyncPhysicsBodyEntity, substanceFor } from '../core/physicsAuthority.js';
import { hullEnvelopeWu, proxyOuterRadiusWu, COLLISION_PROXY_MANIFESTS } from '../data/collisionProxyManifests.js';
import { modelTruthProxyManifest } from '../data/modelTruth.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { isMasslineObstructed } from '../world/asteroidField.js';
import { hasPendingCeresWorkfleetAttachments } from '../combat/persistence.js';

const runs = new WeakMap();
const clone = v => JSON.parse(JSON.stringify(v));
const distance = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const wrap = n => Math.atan2(Math.sin(n), Math.cos(n));
const lives = (s, e) => e?.alive !== false && e?.hull > 0 && s.entities?.get(e.id) === e
  && Number.isSafeInteger(e.occupantGeneration) && e.occupantGeneration > 0;
const serviceOf = o => o.registry?.get('combat')?.kernel?.attachments;
const rows = (s, e) => Object.values(s.combat?.attachments?.byId || {}).filter(a => a.state === 'active'
  && (a.ownerId === e?.id || a.targetId === e?.id));
const isLine = (a, source, target) => a?.state === 'active' && a.ownerId === source?.id && a.targetId === target?.id
  && a.ownerGeneration === source?.occupantGeneration && a.targetGeneration === target?.occupantGeneration;

function mastSiteClear(s, spec) {
  const radius = Math.max(spec.radius, proxyOuterRadiusWu(spec.physicsBody.collisionProxyManifest, spec));
  for (const e of s.entityList) {
    if (e.alive === false || !shouldSyncPhysicsBodyEntity(e)
      || PHYSICS_MATERIALS[substanceFor(e).material]?.ghost === true) continue;
    if (!Number.isFinite(e.pos?.x) || !Number.isFinite(e.pos?.z)) return false;
    let other = Math.max(0, Number(e.radius) || 0, Number(e.physicsBody?.radius) || 0, hullEnvelopeWu(e));
    for (const proxy of [e.physicsBody?.collisionProxyManifest,
      COLLISION_PROXY_MANIFESTS[e.data?.collisionProxy], modelTruthProxyManifest(e)])
      if (proxy) other = Math.max(other, proxyOuterRadiusWu(proxy, e));
    if (!Number.isFinite(other) || Math.hypot(e.pos.x - spec.pos.x, e.pos.z - spec.pos.z) < radius + other + 12) return false;
  }
  return true;
}

export function restoreCeresAnchorSwing(raw) {
  if (!raw || raw.schemaVersion !== 1) return null;
  return { schemaVersion: 1, spawnedMask: (raw.spawnedMask | 0) & 7, lostMask: (raw.lostMask | 0) & 7,
    status: ['swinging', 'released'].includes(raw.status) ? raw.status : 'idle',
    anchorIndex: Number.isInteger(raw.anchorIndex) && raw.anchorIndex >= 0 && raw.anchorIndex < 3 ? raw.anchorIndex : null,
    lineId: typeof raw.lineId === 'string' && /^att_\d+$/.test(raw.lineId) ? raw.lineId : null,
    usedMask: (raw.usedMask | 0) & 7,
    sweeps: [0, 1, 2].map(i => Number.isFinite(raw.sweeps?.[i]) ? Math.max(0, Math.min(Math.PI * 4, raw.sweeps[i])) : 0),
    // Continue holds the real rope, never resumes an unattended powered command.
    command: 'hold', chalk: ['three-anchor', 'long-swing', 'swing'].includes(raw.chalk) ? raw.chalk : null };
}

export function serializeCeresAnchorSwing(owner) {
  const r = owner.state.npcJobs?.ceresAnchorSwing;
  if (!r) return null;
  const copy = clone(r);
  delete copy.bearing;
  if (copy.status === 'swinging' && !copy.lineId) {
    const candidates = Object.values(owner.state.combat?.attachments?.byId || {}).filter(a => a.state === 'active'
      && a.controlMode === MODE && isCeresWinchAnchor(owner.state.entities.get(a.ownerId), copy.anchorIndex));
    if (candidates.length === 1) copy.lineId = candidates[0].id;
  }
  return restoreCeresAnchorSwing(copy);
}

function context(owner) {
  const s = owner.state, rt = runs.get(owner);
  const player = s.entities.get(s.playerId);
  const loads = s.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === C.identities.payload);
  const load = loads.length === 1 ? loads[0] : null;
  const anchors = ANCHORS.map(d => {
    const found = s.entityList.filter(e => e.alive !== false && e.data?.ceresWinchIdentity === ceresWinchIdentity(d.index));
    const e = found.length === 1 && found[0];
    const prior = rt?.bodies[d.index];
    if (prior && (prior.entity !== e || prior.life !== e.occupantGeneration)) return null;
    if (!isCeresWinchAnchor(e, d.index)) return null;
    if (rt && !prior) rt.bodies[d.index] = { entity: e, life: e.occupantGeneration };
    return e;
  });
  const record = s.sites?.worldById?.[C.siteId];
  const usable = lives(s, load) && load.mass === C.existing.section.mass && load.type === 'wreck'
    && load.data.worldSiteId === C.siteId && load.data.worldSitePayloadId === C.existing.section.payloadId
    && load.physicsBody?.dynamic === true && !record?.payloads?.long_plate?.destroyed
    && !load.playerOwned && !load.data.playerOwned && !load.data.disabled && !load.data.controlLease;
  const nearby = s.mode === 'flight' && s.world?.currentSectorId === C.sectorId && !s.save?.restoring
    && lives(s, player) && !s.ui?.docked && !player.flags?.docked
    && anchors.some(e => e && distance(e, player) <= 650);
  return { s, player, load, anchors, usable, nearby, r: s.npcJobs?.ceresAnchorSwing, service: serviceOf(owner) };
}

function currentLine(c) {
  const a = c.r?.lineId && c.service?.get(c.r.lineId), anchor = c.anchors[c.r?.anchorIndex];
  return a?.defId === 'attachment_transport_clamp' && a.controlMode === MODE && a.controllerId == null
    && a.sourceSocketId === 'socket_lantern_clamp' && a.targetSocketId === 'socket_tether_anchor'
    && isLine(a, anchor, c.load) ? a : null;
}

function available(owner, c, index) {
  const anchor = c.anchors[index];
  if (!c.usable || !anchor || !c.service || !physicsBodyNativeReady(anchor) || !physicsBodyNativeReady(c.load)) return 'Winch or load unavailable';
  if (distance(anchor, c.load) > CERES_WINCH_SPAN) return 'Load beyond 480 m';
  if (distance(anchor, c.load) < 90) return 'Load too close to the mast';
  const existing = currentLine(c);
  if (rows(c.s, anchor).some(a => a !== existing)) return 'Winch occupied';
  if (rows(c.s, c.load).some(a => a !== existing && !(a.defId === 'tether_standard' && a.controlMode !== 'ceres_workfleet'
      && a.controllerId == null && isLine(a, c.player, c.load)))) return 'Load held by another line';
  try {
    const check = owner.helpers?.isMasslineObstructed || isMasslineObstructed;
    if (check({ state: c.s, player: anchor, target: c.load, sourceWorld: anchor.pos, targetWorld: c.load.pos })) return 'Clear the rope path';
  } catch { return 'Rope path unavailable'; }
  return null;
}

function speak(owner, text) { owner.bus.emit('comms:message', { sender: 'OLD HOB · WINCHES', channel: 'machine', text }); }
function publish(owner, force = false) {
  const c = context(owner), rt = runs.get(owner);
  if (!rt) return;
  if (!c.nearby || !c.usable) {
    c.s.ceresWinchingOffer = null; rt.offer = null; rt.signature = ''; return;
  }
  const line = currentLine(c), work = c.s.npcJobs?.ceresWorkfleet;
  const claimed = work?.phase === 'player-retained';
  const playerLine = rows(c.s, c.load).find(a => a.defId === 'tether_standard' && isLine(a, c.player, c.load));
  const choices = [], blocked = [];
  if (line) {
    for (const [id, label] of [['in', 'Reel in'], ['hold', 'Hold length'], ['out', 'Pay out']])
      choices.push({ id, label, disabled: c.r.command === id });
    choices.push({ id: 'anchors', label: 'Change anchor' }, { id: 'release', label: 'Cast off winch' }, { id: 'close', label: 'Fly the load' });
  } else {
    for (const a of ANCHORS) {
      const reason = available(owner, c, a.index);
      const disabled = !claimed || !playerLine || !!reason;
      choices.push({ id: `anchor:${a.index}`, label: a.label, disabled });
      if (claimed && playerLine && reason) blocked.push(`${a.label}: ${reason}`);
    }
    choices.push({ id: 'close', label: 'Keep flying' });
  }
  if (line && rt.page === 'anchors') {
    choices.length = 0;
    for (const a of ANCHORS) {
      const reason = a.index === c.r.anchorIndex ? 'Already holding' : available(owner, c, a.index);
      choices.push({ id: `anchor:${a.index}`, label: a.label, disabled: !!reason });
      if (reason) blocked.push(`${a.label}: ${reason}`);
    }
    choices.push({ id: 'controls', label: 'Back to winch' }, { id: 'close', label: 'Fly the load' });
  }
  const detail = line ? `${ANCHORS[c.r.anchorIndex].label} holds the original plate. ${c.r.command === 'in' ? 'Reeling in' : c.r.command === 'out' ? 'Paying out' : 'Holding length'}. Keep your own Line on the plate and fly across the anchor to build a swing. Cast off leaves its momentum.`
    : c.r.chalk ? `ANCHOR BOARD · ${c.r.chalk === 'three-anchor' ? 'Three anchors, one load' : c.r.chalk === 'long-swing' ? 'One long swing' : 'Plate swung home'}. The original plate reached its cradle. You can borrow the winches again after taking it back on your Line.`
      : claimed ? 'Easy, girl. Keep your Line on the Long Plate, then choose a clear fixed winch. Reel out of the cut before swinging across the apron. The anchor takes the load; your ship supplies the sideways pull.'
        : 'Watch the crew lift the original plate. To borrow a winch, select the Long Plate and latch your own Line first. The crew yields it. No fee, no replacement load.';
  if (rt.page === 'compact') { choices.length = 0; choices.push({ id: 'controls', label: 'Winch controls' }); }
  const plain = { headline: line ? 'SWING THE LONG PLATE' : 'BORROW A WINCH', detail: rt.page === 'compact' ? (line ? `${ANCHORS[c.r.anchorIndex].label} · ${c.r.command === 'in' ? 'REELING' : c.r.command === 'out' ? 'PAYING OUT' : 'HOLDING'}. Open controls to stop or cast off.` : 'Old Hob is attending the fixed winches.') : [detail, ...blocked].join('\n'), choices };
  const signature = JSON.stringify([plain, c.player.id, c.player.occupantGeneration, c.load.id, c.load.occupantGeneration]);
  if (!force && signature === rt.signature) return;
  rt.signature = signature;
  const offer = { ...plain, id: `ceres-winch:${++rt.sequence}`, playerId: c.player.id,
    playerLife: c.player.occupantGeneration, loadId: c.load.id, loadLife: c.load.occupantGeneration };
  rt.offer = offer;
  if (!rt.closed || force) c.s.ceresWinchingOffer = offer;
}

export function installCeresAnchorWinching(owner) {
  runs.get(owner)?.dispose();
  const rt = { bodies: [], sequence: 0, offer: null, signature: '', closed: false, page: 'controls', inside: false, lastTick: null, stall: 0, accumulator: 0 };
  runs.set(owner, rt);
  const off = owner.bus.on('ceresWinching:action', payload => {
    const c = context(owner), offer = rt.offer;
    if (rt.busy || !c.nearby || !c.usable || !offer || payload?.offerId !== offer.id || payload.playerLife !== offer.playerLife
      || c.player.id !== offer.playerId || c.player.occupantGeneration !== offer.playerLife
      || c.load.id !== offer.loadId || c.load.occupantGeneration !== offer.loadLife) return;
    const choice = offer.choices.find(a => a.id === payload.action && !a.disabled);
    if (!choice) return;
    rt.busy = true;
    try {
      const r = c.r, line = currentLine(c), action = choice.id;
      if (action === 'close') { rt.page = 'compact'; publish(owner, true); return; }
      rt.closed = false;
      if (action === 'anchors' || action === 'controls') { rt.page = action; publish(owner, true); return; }
      if (action.startsWith('anchor:')) {
        const index = Number(action.split(':')[1]);
        const reason = available(owner, c, index);
        const playerLine = rows(c.s, c.load).find(a => a.defId === 'tether_standard' && isLine(a, c.player, c.load));
        if (reason || !line && (c.s.npcJobs?.ceresWorkfleet?.phase !== 'player-retained' || !playerLine)) {
          speak(owner, reason || 'Take the original plate on your Line first.'); publish(owner, true); return;
        }
        const prior = clone(r), anchor = c.anchors[index];
        r.status = 'swinging'; r.anchorIndex = index; r.command = 'hold';
        const spec = { defId: 'attachment_transport_clamp', ownerId: anchor.id, targetId: c.load.id,
          controlMode: MODE, controllerId: null, sourceSocketId: 'socket_lantern_clamp', targetSocketId: 'socket_tether_anchor',
          sourceWorld: anchor.pos, targetWorld: c.load.pos };
        const result = line ? c.service.rebind(line.id, line.ownerId, spec) : c.service.create(spec);
        if (c.s.npcJobs?.ceresAnchorSwing !== r) return;
        if (!result?.ok) { Object.assign(r, prior); speak(owner, 'Winch did not take the load. Your existing line is unchanged.'); }
        else {
          r.lineId = result.attachment.id; r.usedMask |= 1 << index;
          r.bearing = Math.atan2(c.load.pos.z - anchor.pos.z, c.load.pos.x - anchor.pos.x);
          rt.page = 'controls'; rt.stall = 0;
          speak(owner, `${ANCHORS[index].label} has her. The anchor holds; pull sideways with your own Line. Hold, reel or pay out. Cast off when you want the load free.`);
        }
      } else if (line && ['in', 'out', 'hold'].includes(action)) { r.command = action; rt.stall = 0; }
      else if (line && action === 'release') {
        r.command = 'hold';
        const result = c.service.cut(line.id, line.ownerId, 'ceres_winch_release');
        if (result?.ok) { r.lineId = null; r.status = 'released'; delete r.bearing; speak(owner, 'Winch cast off. She keeps her swing. Bring her level and nearly still to the open cradle for the receiver.'); }
      }
      publish(owner, true);
    } finally { rt.busy = false; }
  });
  const clear = () => { rt.bodies = []; rt.offer = null; rt.signature = ''; rt.inside = false; rt.closed = false; rt.operator = null; rt.admissionAt = 0; owner.state.ceresWinchingOffer = null; };
  const offs = ['save:restoring', 'game:new', 'game:newGame'].map(name => owner.bus.on(name, clear));
  for (const name of ['dock:docked', 'sector:exit', 'game:exitToMenu']) offs.push(owner.bus.on(name, () => {
    const row = owner.state.npcJobs?.ceresAnchorSwing; if (row) row.command = 'hold'; clear();
  }));
  rt.dispose = () => { off?.(); offs.forEach(f => f?.()); clear(); runs.delete(owner); };
  return rt.dispose;
}

/** Driven once per real NPC-owner tick; no phase is a pose or a substitute for delivery. */
export function stepCeresAnchorWinching(owner, dt) {
  const s = owner.state, rt = runs.get(owner);
  if (!rt || rt.lastTick === s.tick || !(dt > 0)) return;
  rt.lastTick = s.tick;
  const old = s.npcJobs?.ceresAnchorSwing;
  if (s.save?.restoring || hasPendingCeresWorkfleetAttachments(s)) return;
  if (s.mode !== 'flight' || s.world?.currentSectorId !== C.sectorId) {
    if (old) old.command = 'hold'; s.ceresWinchingOffer = null; rt.inside = false; return;
  }
  const p = s.entities.get(s.playerId);
  if (!old && (!lives(s, p) || Math.hypot(p.pos.x - C.sitePlacement.pos.x, p.pos.z - C.sitePlacement.pos.z) > 1300)) return;
  const r = s.npcJobs.ceresAnchorSwing ||= restoreCeresAnchorSwing({ schemaVersion: 1 });
  if (s.simTime >= (rt.admissionAt || 0)) {
    rt.admissionAt = s.simTime + .5;
    for (const def of ANCHORS) if (!(r.spawnedMask & (1 << def.index))) {
      const spec = ceresWinchAnchorSpec(def.index);
      // Old saves may put a pilot or moving load here. Wait; never materialize a
      // fixed collision body through an existing occupant, or move it aside.
      if (!mastSiteClear(s, spec)) continue;
      // Mark before spawn's synchronous receipts. No repeat minting after loss.
      r.spawnedMask |= 1 << def.index;
      const entity = owner.helpers.spawnEntity(spec);
      if (entity) rt.bodies[def.index] = { entity, life: entity.occupantGeneration };
      else r.lostMask |= 1 << def.index;
    }
  }
  const c = context(owner), line = currentLine(c);
  if (rt.operator && (rt.operator.id !== c.player?.id || rt.operator.life !== c.player?.occupantGeneration)) {
    r.command = 'hold'; rt.signature = '';
  }
  rt.operator = c.player ? { id: c.player.id, life: c.player.occupantGeneration } : null;
  if (line) rt.lastLine = line;
  if (!line && rt.lastLine?.state === 'active' && c.service?.get(rt.lastLine.id) === rt.lastLine
    && rt.lastLine.controlMode === MODE) c.service.cut(rt.lastLine.id, rt.lastLine.ownerId, 'ceres_winch_unavailable');
  if (!c.nearby) { r.command = 'hold'; rt.closed = false; }
  if (!c.usable || r.status === 'swinging' && !line) {
    r.command = 'hold'; r.status = 'released'; r.lineId = null; delete r.bearing;
  }
  if (line && rows(s, c.load).some(a => a !== line && !(a.defId === 'tether_standard'
    && a.controlMode !== 'ceres_workfleet' && a.controllerId == null && isLine(a, c.player, c.load)))) {
    c.service.cut(line.id, line.ownerId, 'ceres_winch_custody_changed');
    r.command = 'hold'; r.status = 'released'; r.lineId = null; delete r.bearing;
    speak(owner, 'Another line has the load. My winch is off; clear that claim before borrowing again.');
    publish(owner, true); return;
  }
  if (line) {
    const anchor = c.anchors[r.anchorIndex];
    const angle = Math.atan2(c.load.pos.z - anchor.pos.z, c.load.pos.x - anchor.pos.x);
    if (Number.isFinite(r.bearing)) {
      const change = Math.abs(wrap(angle - r.bearing));
      // Observe a continuous actual sweep, not a teleported/restored bearing jump.
      if (change < .08 && distance(anchor, c.load) >= line.restLength - 2)
        r.sweeps[r.anchorIndex] = Math.min(Math.PI * 4, r.sweeps[r.anchorIndex] + change);
    }
    r.bearing = angle;
    if (c.nearby && ['in', 'out'].includes(r.command)) {
      const delta = (r.command === 'in' ? -1 : 1) * 6 * Math.min(dt, 1 / 30);
      c.service.reel(line.id, Math.min(delta, CERES_WINCH_SPAN - line.restLength), 90);
      const stalled = r.command === 'in' && Math.hypot(c.load.vel.x, c.load.vel.z) < .04;
      rt.stall = stalled ? rt.stall + dt : 0;
      if (rt.stall > 5 || r.command === 'out' && line.restLength >= CERES_WINCH_SPAN - .01) {
        r.command = 'hold';
        speak(owner, rt.stall > 5 ? 'She is not moving. Holding the drum. Pay out and change the angle; do not keep hauling into the rock.' : 'Full drum paid out. Holding.');
        publish(owner, true);
      }
    }
  }
  if (!r.chalk && s.npcJobs.ceresWorkfleet?.phase === 'secured' && r.sweeps.some(v => v >= .7)) {
    r.chalk = r.usedMask === 7 && r.sweeps.every(v => v >= .2) ? 'three-anchor'
      : r.usedMask && !(r.usedMask & (r.usedMask - 1)) && r.sweeps.some(v => v >= 1.2) ? 'long-swing' : 'swing';
    speak(owner, 'Easy, girl. Original plate home. Your swing goes on my anchor board. A narrow mouth needs the same patient hands.');
    rt.closed = false; publish(owner, true);
  }
  if (c.nearby && !rt.inside) { rt.closed = false; rt.signature = ''; }
  rt.inside = c.nearby;
  rt.accumulator += dt;
  if (rt.accumulator >= .25) { rt.accumulator %= .25; publish(owner); }
}
