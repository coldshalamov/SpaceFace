// The authored wave-20 event rides the room and the existing attachment authority.
// This owner chooses endpoints and reads their measured poses. It never writes a
// pose, force, kill, reward or wave-clear verdict.
import { isAuthoredCourse } from '../data/survivalCourse.js';
import { ARENA_TOY_MAX } from '../data/arenaModuleLibrary.js';
import { foundryPlateShape } from '../data/foundryPlate.js';
import { occupantGenerationOf } from '../core/entity.js';

export const PLATE_THEFT = Object.freeze({
  wave: 20, enemyId: 'pd_screen_escort', attachmentDefId: 'attachment_snarl',
  reach: 240, warningS: 2, reelPerSecond: 18, displacement: 100,
  mass: 96, maxActors: 2,
});

/** Admit the actual resource with the room, before any combat bodies arrive. */
export function preparePlateTheftRoom(install, { run, plan, anchor, bearing }) {
  // The Pit's own thirty-round course counts as authored for records, but this event is
  // the Foundry arc's authored furniture — swarm plans never carry systemEvent, and the
  // explicit ruleset guard keeps a fabricated plan from arming it anyway.
  if (!install || !isAuthoredCourse({}, run) || run.ruleset === 'swarm'
    || run.wave !== PLATE_THEFT.wave
    || plan?.systemEvent?.id !== 'foundry_plate_theft') return null;
  const toys = install.toys || (install.toys = []);
  const plates = toys.filter(toy => toy.kind === 'plate' && toy.solid === true);
  // The bank facing the screen's arrival is the contested resource. Other arenas
  // admit one bank for this event without changing their own law or furniture.
  const along = toy => (toy.pos.x - anchor.x) * bearing.x + (toy.pos.z - anchor.z) * bearing.z;
  let plate = plates.sort((a, b) => along(b) - along(a) || String(a.id).localeCompare(String(b.id)))[0];
  if (!plate) {
    if (toys.length >= ARENA_TOY_MAX) return null;
    plate = {
      id: 'foundry_plate_theft', kind: 'plate', verb: 'bank', material: 'plate',
      hazardType: 'debris', solid: true,
      pos: { x: anchor.x + bearing.x * 250, z: anchor.z + bearing.z * 250 },
      normal: { x: -bearing.x, z: -bearing.z }, halfWidth: 48, referenceRadius: 26,
      radius: foundryPlateShape({ halfWidth: 48, referenceRadius: 26 }).radius,
    };
    toys.push(plate);
  }
  // A released bank is a movable slab, not an immovable station with a decorative rope.
  plate.dynamic = true;
  plate.mass = PLATE_THEFT.mass;
  plate.propRole = 'contested_bank';
  return plate.id;
}

function thiefCandidate(entity) {
  if (!entity?.alive || entity.data?.runCohort !== 'survival'
    || entity.data.runWave !== PLATE_THEFT.wave) return false;
  return (entity.data.lootTableId || entity.data.enemyTypeId) === PLATE_THEFT.enemyId;
}

export function createPlateTheft({ state, bus, registry }) {
  let event = null;
  const authority = () => registry?.get('actions')?.kernel?.attachments
    || registry?.get('combat')?.kernel?.attachments;
  const live = (entity, generation) => entity?.alive !== false
    && state.entities?.get(entity?.id) === entity
    && occupantGenerationOf(entity) === generation;
  const emit = (record, status) => {
    if (!record || record.status === status) return;
    record.status = status;
    bus?.emit('survivalArena:plateTheft', {
      wave: PLATE_THEFT.wave, runToken: record.runToken, status, plateId: record.plate.id,
      plateGeneration: record.generation,
      pos: record.plate.pos ? { x: record.plate.pos.x, z: record.plate.pos.z } : null,
      actorIds: record.actors.map(actor => actor.entity.id),
    });
  };
  const cut = (record, reason) => {
    const service = authority();
    for (const actor of record?.actors || []) {
      const id = actor.link;
      const attachment = actor.attachment;
      actor.link = null;
      actor.attachment = null;
      if (id != null && attachment && service?.get(id) === attachment) service.cut(id, actor.entity.id, reason);
    }
  };
  const current = record => event === record && state.run?.retireToken === record.runToken
    && state.run?.seed === record.seed && state.run?.arenaId === record.arenaId
    && state.run?.wave === PLATE_THEFT.wave && state.run?.phase === 'active'
    && isAuthoredCourse({}, state.run);
  // The towing cohort is collected at admission, not re-derived every tick: candidates
  // arrive through the real spawn seam (plus one sweep at arm for a fixture that
  // pre-fields the escorts), so update() only ever inspects this handful of entities.
  const noteSpawned = (entity) => {
    const record = event;
    if (!record || !thiefCandidate(entity)) return;
    for (let i = 0; i < record.candidates.length; i++) if (record.candidates[i] === entity) return;
    record.candidates.push(entity);
  };
  if (bus && typeof bus.on === 'function') {
    bus.on('entity:spawned', (p) => noteSpawned(p?.entity ?? state.entities?.get?.(p?.id)));
  }
  return {
    arm(plate) {
      this.clear('rearm');
      // A teardown callback may already have admitted a successor. Do not replace it.
      if (event) return;
      if (!plate?.pos || plate.alive === false) return;
      event = { plate, generation: occupantGenerationOf(plate),
        runToken: state.run?.retireToken, seed: state.run?.seed, arenaId: state.run?.arenaId,
        home: { x: plate.pos.x, z: plate.pos.z }, actors: [], candidates: [], status: null };
      for (const entity of state.entityList || []) noteSpawned(entity);
      emit(event, 'contested');
    },
    update(dt) {
      const record = event;
      if (!record || !current(record) || ['secured', 'stolen', 'lost'].includes(record.status)) return;
      if (!live(record.plate, record.generation)) {
        cut(record, 'plate_lost'); if (current(record)) emit(record, 'lost'); return;
      }
      const service = authority();
      if (!service) return;
      const now = Number.isFinite(state.simTime) ? state.simTime : (state.tick || 0) / 60;
      // Admit the nearest retained candidates first — the same order the old per-tick
      // scan produced, without touching the full entity list or allocating.
      while (record.actors.length < PLATE_THEFT.maxActors) {
        let best = null, bestDistance = Infinity, bestId = '';
        for (let i = 0; i < record.candidates.length; i++) {
          const entity = record.candidates[i];
          if (!entity?.alive) continue;
          let taken = false;
          for (let j = 0; j < record.actors.length; j++) {
            if (record.actors[j].entity === entity) { taken = true; break; }
          }
          if (taken) continue;
          const distance = Math.hypot(entity.pos.x - record.plate.pos.x, entity.pos.z - record.plate.pos.z);
          const id = distance === bestDistance ? String(entity.id) : '';
          if (distance <= PLATE_THEFT.reach
            && (distance < bestDistance || (distance === bestDistance && (bestId === '' || id < bestId)))) {
            best = entity; bestDistance = distance; bestId = String(entity.id);
          }
        }
        if (!best) break;
        record.actors.push({ entity: best, generation: occupantGenerationOf(best),
          readyAt: now + PLATE_THEFT.warningS, attempted: false, link: null, attachment: null });
        emit(record, 'targeted');
        if (!current(record)) return;
      }
      for (const actor of record.actors) {
        if (!live(actor.entity, actor.generation)) {
          const id = actor.link;
          const attachment = actor.attachment;
          actor.link = null;
          actor.attachment = null;
          actor.attempted = true;
          if (id != null && attachment && service.get(id) === attachment) service.cut(id, actor.entity.id, 'thief_lost');
          if (!current(record)) return;
          continue;
        }
        if (!actor.attempted && now >= actor.readyAt) {
          const distance = Math.hypot(actor.entity.pos.x - record.plate.pos.x, actor.entity.pos.z - record.plate.pos.z);
          if (distance > PLATE_THEFT.reach) continue;
          const result = service.create({ defId: PLATE_THEFT.attachmentDefId,
            ownerId: actor.entity.id, targetId: record.plate.id, controllerId: actor.entity.id,
            controlMode: 'foundry_recovery', sourceWorld: actor.entity.pos, targetWorld: record.plate.pos });
          if (!current(record)) {
            // A synchronous session transition can recycle the attachment counter.
            // Retired work may release only its own object, never a successor's line.
            if (result?.ok && result.attachment && service.get(result.attachment.id) === result.attachment) {
              service.cut(result.attachment.id, actor.entity.id, 'plate_interrupted');
            }
            return;
          }
          // Admission can be busy (a socket already in use); retry only until the
          // first real line. A cut or a snapped line is a successful intervention.
          if (result?.ok && result.attachment) {
            actor.link = result.attachment.id;
            actor.attachment = result.attachment;
            actor.attempted = true;
            emit(record, 'hauling');
            if (!current(record)) return;
          } else actor.readyAt = now + 0.5;
        }
        if (actor.link == null) continue;
        const link = service.get(actor.link);
        if (!link || link !== actor.attachment || link.state !== 'active' || link.ownerId !== actor.entity.id
          || link.targetId !== record.plate.id) { actor.link = null; actor.attachment = null; continue; }
        const minimum = (actor.entity.radius || 0) + (record.plate.radius || 0) + 8;
        service.reel(actor.link, -PLATE_THEFT.reelPerSecond * Math.min(Math.max(dt || 0, 0), 0.1), minimum);
        if (!current(record)) return;
        const displacement = Math.hypot(record.plate.pos.x - record.home.x, record.plate.pos.z - record.home.z);
        const separation = Math.hypot(record.plate.pos.x - actor.entity.pos.x, record.plate.pos.z - actor.entity.pos.z);
        if (displacement >= PLATE_THEFT.displacement && separation <= minimum + 18) {
          // The bank is physically at its captor, not deleted or converted to loot.
          // Release it there: the changed geometry remains usable for the rest of the fight.
          cut(record, 'plate_retrieved'); if (current(record)) emit(record, 'stolen'); return;
        }
      }
    },
    clear(reason) {
      if (!event) return;
      const record = event;
      event = null;
      cut(record, `plate_${reason}`);
      if (!['secured', 'stolen', 'lost'].includes(record.status)
        && state.run?.retireToken === record.runToken && !event) {
        emit(record, reason === 'wave_cleared' && live(record.plate, record.generation) ? 'secured' : 'interrupted');
      }
    },
    diagnostics() {
      return event ? { status: event.status, plateId: event.plate.id,
        plateGeneration: event.generation, actorIds: event.actors.map(actor => actor.entity.id),
        links: event.actors.filter(actor => actor.link != null).length } : null;
    },
  };
}
