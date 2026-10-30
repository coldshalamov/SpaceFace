import { defineEncounter, bodySpec, COPY } from './definition.mjs';
import { createPuzzle, observe, readPulse, reverseJumper, choicePlan, suspend, resume, retire, serialize, restore } from './core.mjs';
import { finitePose, distance } from './signal.mjs';

const copy = x => x == null ? null : JSON.parse(JSON.stringify(x));
const poseOf = e => e?.alive !== false && e?.pos && Number.isFinite(e.rot)
  ? { x: e.pos.x, z: e.pos.z, rot: e.rot, vx: e.vel?.x || 0, vz: e.vel?.z || 0, angVel: e.angVel || 0 } : null;

export function surveySpec(receipt) {
  return { kind: 'surveyor', route: [
    { id: 'array_entry', label: 'Chart validation entry', pos: copy(receipt.corridor.from) },
    { id: 'array_fix', label: 'Recovered navigation fix', pos: copy(receipt.corridor.to) },
  ], speed: receipt.corridor.speedLimit, workS: 6, payload: { receiptId: receipt.id } };
}

/** One instance per placement. No registration side effects; imports are node-safe.
 * All foreign writes use existing core/economy/npcJobs interfaces. No physics/input writes.
 */
export function createTuningForkArray(ctx, placement, saved = null) {
  const { state, bus, helpers, registry } = ctx;
  if (!state || !bus?.on || !helpers?.spawnEntity || !helpers?.removeEntity) throw new TypeError('core owner unavailable');
  let p = saved ? restore(saved) : createPuzzle(defineEncounter(state, placement), state.simTime);
  if (saved && (p.definition.id !== (placement.id || 'tuning_fork_array') || p.definition.sectorId !== placement.sectorId)) throw new TypeError('saved placement mismatch');
  let bindings = [null, null, null, null], disposed = false, busy = false, restoring = !!saved;
  let lastSignal = null;
  const unsubscribers = [];
  const on = (event, fn) => { bus.on(event, fn); unsubscribers.push(() => bus.off(event, fn)); };
  const sectorActive = () => state.world?.currentSectorId === p.definition.sectorId;
  const player = () => state.entities.get(state.playerId);
  const live = slot => {
    const b = bindings[slot], e = b && state.entities.get(b.id), tag = e?.data?.tuningForkArray;
    return e && e.alive !== false && e.occupantGeneration === b.life && tag?.encounterId === p.definition.id
      && tag.slot === slot && tag.serial === p.serials[slot] ? e : null;
  };
  const poses = () => bindings.map((_, slot) => poseOf(live(slot)));
  const snapshot = () => { lastSignal = observe(p, poses(), state.simTime); return lastSignal; };
  const say = text => bus.emit('toast', { text, kind: 'info', ttl: 6 });
  const bind = (slot, entity) => {
    const tag = entity?.data?.tuningForkArray;
    if (!Number.isInteger(slot) || slot < 0 || slot > 3 || !entity?.alive
      || state.entities.get(entity.id) !== entity || !Number.isSafeInteger(entity.occupantGeneration)
      || tag?.encounterId !== p.definition.id || tag.slot !== slot || tag.serial !== p.serials[slot]) return false;
    if (live(slot) && live(slot) !== entity) return false;
    bindings[slot] = { id: entity.id, life: entity.occupantGeneration };
    return true;
  };
  const materialize = () => {
    if (disposed || restoring || !sectorActive() || p.stage === 'retired') return false;
    // Only call for a fresh placement, or after restore with a complete authoritative body list.
    // Missing bodies stay missing: no free replenishment in a tick or on sector jitter.
    for (let i = 0; i < 4; i++) if (!bindings[i] && !p.missing[i]) {
      const e = helpers.spawnEntity(bodySpec(p.definition, i, p.poses[i], p.serials[i]));
      if (!bind(i, e)) throw new Error('core did not stamp buoy identity');
    }
    return true;
  };
  on('scan:pulse', pulse => {
    if (disposed || restoring || busy || !sectorActive() || !p.active) return;
    const ship = player();
    if (!ship || !ship.alive || pulse?.scannerId !== ship.id || pulse.simTime !== state.simTime
      || !finitePose({ ...pulse.pos, rot: 0 }) || distance(pulse.pos, ship.pos) > .01) return;
    const before = p.stage;
    readPulse(p, pulse, ship.pos, poses(), state.simTime, ship.occupantGeneration);
    snapshot();
    if (before !== p.stage) {
      if (p.stage === 'tuning') say(COPY.clue);
      if (p.stage === 'fixed') { say(COPY.fixed); api.trackFix(); }
      if (p.stage === 'record') say(COPY.recovered);
    }
  });
  on('sector:exit', () => { if (!disposed && p.active) { snapshot(); suspend(p); } });
  on('sector:enter', () => {
    if (disposed || restoring) return;
    if (sectorActive()) { resume(p); materialize(); snapshot(); } else if (p.active) suspend(p);
  });
  on('save:restoring', () => { restoring = true; bindings = [null, null, null, null]; lastSignal = null; });
  // The central save owner calls restoreState after all canonical bodies have been restored.
  // This deliberately does not guess by scanning the world on save:loaded.
  const api = {
    name: 'tuningForkArray',
    materialize,
    bindBody: bind,
    update() {
      if (disposed || restoring || !p.active || !sectorActive()) return;
      snapshot();
      api.advanceSurvey();
    },
    readout() {
      return { state: serialize(p), signal: copy(lastSignal), bodyIds: bindings.map((_, i) => live(i)?.id ?? null),
        objective: api.objective(), settlementBlocked: p.settlement?.status === 'uncertain' };
    },
    objective() {
      if (!p.active || p.stage === 'retired' || p.stage === 'complete') return null;
      const labels = { unread: 'Scan the damaged relay forks', tuning: 'Tow and aim the three forks',
        fixed: 'Approach and scan the wreck recorder', record: 'Choose the navigation record’s future' };
      return { id: p.definition.id, title: COPY.title, action: labels[p.stage], sectorId: p.definition.sectorId,
        pos: p.stage === 'fixed' || p.stage === 'record' ? copy(p.poses[3]) : copy(p.definition.anchor),
        targetEntityId: p.stage === 'fixed' || p.stage === 'record' ? live(3)?.id ?? null : null };
    },
    trackFix() {
      if (disposed || !p.active || !['fixed', 'record', 'complete'].includes(p.stage)) return false;
      const e = live(3); if (!e) return false;
      bus.emit('ui:setCourse', { pos: { x: e.pos.x, z: e.pos.z }, targetEntityId: e.id,
        sectorId: p.definition.sectorId, label: 'Tuning Fork wreck recorder' });
      return true;
    },
    reverse(slot) {
      const ship = player(); if (disposed || restoring || !sectorActive() || !ship?.alive) return false;
      const ok = reverseJumper(p, slot, ship.pos, poses());
      if (ok) { snapshot(); say(p.polarities[slot] < 0 ? COPY.inverted : 'Service jumper restored. The fork is in phase again.'); }
      return ok;
    },
    replace(slot) {
      const ship = player();
      if (disposed || restoring || busy || !p.active || !sectorActive() || p.stage !== 'tuning'
        || !Number.isInteger(slot) || slot < 0 || slot > 2 || p.replacements[slot] >= 1
        || !ship?.alive || distance(ship.pos, p.definition.anchor) > 65) return false;
      const e = live(slot);
      if (e && distance(e.pos, p.definition.anchor) <= p.definition.maxReach) return false;
      // Spend the finite replacement and retire the old serial before publishing another body.
      p.replacements[slot]++; p.serials[slot]++;
      if (e) helpers.removeEntity(e.id);
      bindings[slot] = null; p.missing[slot] = false;
      p.poses[slot] = { ...p.definition.anchor, rot: 0, vx: 0, vz: 0, angVel: 0 };
      p.polarities[slot] = 1;
      materialize(); snapshot();
      return true;
    },
    choose(choice) {
      const ship = player(), wreck = live(3), economy = registry?.get?.('economy');
      if (disposed || restoring || busy || !sectorActive() || !ship?.alive || !wreck
        || distance(ship.pos, wreck.pos) > p.definition.recoveryRange || p.settlement
        || typeof economy?.grantCredits !== 'function') return null;
      snapshot();
      const plan = choicePlan(p, choice, state.simTime); if (!plan) return null;
      // The canonical grant method is synchronous. Latch BEFORE its credits:changed callback:
      // reentrant UI, saves and duplicate callbacks cannot pay again. An exceptional/unknown
      // owner result is quarantined, never guessed successful and never automatically retried.
      busy = true;
      const reason = plan.id, before = state.player.credits;
      if (!Number.isSafeInteger(before) || before < 0) { busy = false; return null; }
      p.settlement = { status: 'uncertain', amount: plan.credits, reason };
      try {
        const total = economy.grantCredits(plan.credits, reason);
        if (state.player.credits - before !== plan.credits || total !== state.player.credits) return null;
        p.settlement.status = 'paid';
        p.receipt = plan; p.stage = 'complete';
        p.consequence = { status: 'awaiting_actor', jobId: null, actorRecordId: null, passes: 0, publicOpen: false };
        say(choice === 'publish' ? COPY.published : COPY.sold);
        return copy(plan);
      } finally { busy = false; }
    },
    /** Existing traffic owner supplies ONE idle, durable survey hull. The NPC job owner flies it.
     * No fabricated bus event or private traffic-state mutation; assign() is the real producer API.
     */
    commissionSurvey(entity) {
      const c = p.consequence, r = p.receipt, jobs = helpers.npcJobs;
      if (disposed || restoring || busy || !p.active || !sectorActive() || !r || !c || c.status !== 'awaiting_actor'
        || state.simTime < r.followupAfter || !entity?.alive || state.entities.get(entity.id) !== entity
        || entity.type !== 'ship' || !entity.data?.worldRecordId || entity.data.jobId
        || typeof jobs?.assign !== 'function' || typeof jobs?.get !== 'function' || typeof jobs?.release !== 'function'
        || !api.corridorClear(entity.id)) return null;
      busy = true;
      try {
        const id = jobs.assign(entity, surveySpec(r));
        const job = id && jobs.get(id)?.job;
        if (!job || job.kind !== 'surveyor' || job.payload?.receiptId !== r.id) return null;
        c.status = 'surveying'; c.jobId = id; c.actorRecordId = entity.data.worldRecordId;
        return id;
      } finally { busy = false; }
    },
    advanceSurvey() {
      const c = p.consequence, r = p.receipt, jobs = helpers.npcJobs;
      if (!r || !c || c.status !== 'surveying' || !jobs?.get || !jobs?.release) return false;
      const entry = jobs.get(c.jobId), job = entry?.job;
      if (!job || job.kind !== 'surveyor' || job.payload?.receiptId !== r.id || entry.worldRecordId !== c.actorRecordId) {
        c.status = 'survey_lost'; return false;
      }
      c.passes = Math.min(r.corridor.validationPasses, Math.max(c.passes, Math.floor(job.loopCount || 0)));
      if (c.passes < r.corridor.validationPasses) return false;
      if (!api.corridorClear(entry.entityId)) return false;
      // The job has physically completed its programmed circuits (or the canonical offline
      // equivalent). Release its flight claim once, then publish the durable route query.
      if (jobs.release(c.jobId) !== true) return false;
      c.status = 'validated'; c.publicOpen = r.corridor.public;
      return true;
    },
    trafficConsequence() { return p.receipt ? { receipt: copy(p.receipt), progress: copy(p.consequence) } : null; },
    corridorClear(surveyId = null) {
      const corridor = p.receipt?.corridor;
      if (!corridor || typeof helpers.queryRadius !== 'function') return false;
      const a = corridor.from, b = corridor.to, dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
      const rows = helpers.queryRadius({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, Math.sqrt(length2) / 2 + corridor.halfWidth);
      if (!Array.isArray(rows) || rows.length > 256) return false;
      for (const e of rows) {
        if (!e?.alive || !e.collides || !e.pos || e.id === surveyId || e.id === state.playerId
          || (p.consequence?.actorRecordId && e.data?.worldRecordId === p.consequence.actorRecordId)
          || bindings.some((_, i) => live(i) === e)) continue;
        const t = length2 > 0 ? Math.max(0, Math.min(1, ((e.pos.x - a.x) * dx + (e.pos.z - a.z) * dz) / length2)) : 0;
        if (Math.hypot(e.pos.x - a.x - t * dx, e.pos.z - a.z - t * dz) < corridor.halfWidth + (e.radius || 0)) return false;
      }
      return true;
    },
    publicCorridor() { return p.consequence?.publicOpen && api.corridorClear() ? copy(p.receipt.corridor) : null; },
    serialize() { if (busy) throw new Error('tuning fork transaction in progress'); snapshot(); return serialize(p); },
    restoreState(data, restoredBodies = []) {
      if (busy || disposed) throw new Error('restore during transaction or after disposal');
      const next = restore(data);
      if (next.definition.id !== p.definition.id || next.definition.sectorId !== p.definition.sectorId
        || !Array.isArray(restoredBodies) || restoredBodies.length > 4) throw new TypeError('restore placement mismatch');
      bindings = [null, null, null, null]; p = next; lastSignal = null;
      restoring = true;
      for (const entity of restoredBodies) {
        if (!bind(entity?.data?.tuningForkArray?.slot, entity)) throw new TypeError('invalid restored body identity');
      }
      // All four slots have been accounted for by the save owner. Missing slots retain their
      // absence, instead of spawning duplicates while core is still restoring.
      for (let i = 0; i < 4; i++) if (!bindings[i]) p.missing[i] = true;
      restoring = false;
      if (sectorActive()) resume(p); else suspend(p);
      snapshot();
    },
    retire() {
      if (disposed || busy) return;
      snapshot(); retire(p);
      const c = p.consequence;
      if (c?.status === 'surveying') { helpers.npcJobs?.release?.(c.jobId); c.status = 'retired'; }
      for (let i = 0; i < 4; i++) { const e = live(i); if (e) helpers.removeEntity(e.id); }
      bindings = [null, null, null, null];
    },
    destroy() { if (disposed) return; disposed = true; for (const off of unsubscribers) off(); },
  };
  if (!saved) { if (sectorActive()) materialize(); else suspend(p); }
  return api;
}
