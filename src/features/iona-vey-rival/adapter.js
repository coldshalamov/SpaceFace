import { OWNER, TUG, TUG_KEY, APPEARANCES, LIMITS } from './catalog.js';
import { freshIona, currentAppearance, beginAppearance, chooseTerms, stepIona, pauseIona,
  observeBody, capturePose, recordTheft, recordDamage, loseBody, quantity,
  poolBelow, restoreIona, serializeIona } from './model.js';

/** Owner adapter. shipSpec and lineBetween are production bindings supplied by index.js;
 * tests can supply narrow owner doubles without importing the renderer/combat graph. */
export function createIonaAdapter(ctx, { shipSpec, lineBetween }) {
  const { state, bus, helpers } = ctx;
  if (typeof shipSpec !== 'function' || typeof lineBetween !== 'function') throw new TypeError('Iona requires owner bindings');
  let data = freshIona(), disposed = false, restoring = false, mutating = false;
  const bindings = new Map(), retiring = new WeakSet(), off = [];
  const now = () => Number.isFinite(state.simTime) ? state.simTime : 0;
  const protection = e => (Number(e?.hull) || 0) + (Number(e?.shield) || 0) + (Number(e?.armorHp) || 0);
  const jobs = () => helpers.npcJobs;
  const on = (event, fn) => {
    const remove = bus.on(event, fn);
    off.push(typeof remove === 'function' ? remove : () => bus.off?.(event, fn));
  };
  const owned = e => e?.data?.persistenceOwner === OWNER && e.data.worldRecordId === e.data.identityKey;
  const same = row => row && state.entities?.get(row.entity.id) === row.entity
    && row.entity.occupantGeneration === row.generation && owned(row.entity);
  const live = row => same(row) && row.entity.alive !== false && row.entity.hull > 0;
  function records() {
    return [data.tug, ...data.appearances.flatMap(a => a.bodies)]; // at most six
  }
  function record(key) { return records().find(row => row.key === key); }
  function note(e) {
    if (!owned(e) || !record(e.data.worldRecordId) || e.alive === false) return;
    const key = e.data.worldRecordId, old = bindings.get(key);
    // An ambiguous stable identity is unavailable, never first-one-wins.
    if (old && same(old) && old.entity !== e) { old.ambiguous = true; return; }
    bindings.set(key, { entity: e, generation: e.occupantGeneration, ambiguous: false,
      protection: protection(e) });
  }
  function entity(key) {
    const row = bindings.get(key);
    return row && !row.ambiguous && live(row) ? row.entity : null;
  }
  function rebuild() {
    bindings.clear();
    // Once per restore/admission boundary; never a global scan in update().
    for (const e of state.entityList || []) note(e);
  }
  function stamp(key, sectorId) {
    return { persistenceOwner: OWNER, worldRecordId: key, identityKey: key,
      sectorId, homeSectorId: sectorId, transientSector: true, scannable: true,
      lifetimeS: Infinity, ionaVeyKey: key };
  }
  function sourcePose(row, fallback) {
    return row.pose ? { ...row.pose, pos: { ...row.pose.pos }, vel: { ...row.pose.vel } }
      : { pos: fallback, vel: { x: 0, z: 0 }, rot: 0, angVel: 0 };
  }
  function ensureTug(a) {
    const existing = entity(TUG_KEY);
    if (existing) return existing;
    if (restoring || data.retired || data.tug.status === 'destroyed' || bindings.has(TUG_KEY)) return null;
    const budget = helpers.spawnBudget;
    if (!budget || budget.request(1, TUG_KEY) !== 1) return null;
    const spec = shipSpec(TUG.shipDefId, { team: 2, factionId: TUG.factionId,
      pos: sourcePose(data.tug, { x: a.anchor.x - 100, z: a.anchor.z - 80 }).pos,
      ai: { passive: true, holdFire: true } });
    const pose = sourcePose(data.tug, spec.pos);
    Object.assign(spec, pose);
    for (const [field, max] of [['hull', 'hullMax'], ['shield', 'shieldMax'], ['armorHp', 'armorMax'], ['cap', 'capMax']])
      if (Number.isFinite(spec[field]) && Number.isFinite(spec[max])) spec[field] = Math.min(spec[max], spec[field]);
    spec.flags = { ...spec.flags, persistent: true };
    spec.data = { ...spec.data, ...stamp(TUG_KEY, a.sectorId),
      name: TUG.name, callsign: 'FAIR MEASURE', role: 'tug', trafficRole: 'tug',
      weapons: [], fittings: [], miningBeam: null };
    const run = data;
    const e = helpers.spawnEntity?.(spec);
    if (!e) { budget.release(TUG_KEY); return null; }
    if (data !== run || disposed || restoring) {
      if (state.entities?.get(e.id) === e) { retiring.add(e); helpers.removeEntity?.(e.id); }
      budget.release(TUG_KEY); return null;
    }
    if (!budget.bindEntity(e.id, TUG_KEY)) {
      retiring.add(e); helpers.removeEntity?.(e.id); budget.release(TUG_KEY); return null;
    }
    data.tug.status = 'live'; note(e); return e;
  }
  function ensureBody(a, row, def) {
    const existing = entity(row.key);
    if (existing) return existing;
    if (restoring || data.retired || ['destroyed', 'recovered', 'lost'].includes(row.status)
      || !quantity(row.pool) || bindings.has(row.key)) return null;
    const spec = { type: 'wreck', team: 2, factionId: TUG.factionId,
      ...sourcePose(row, { x: a.anchor.x + def.offset.x, z: a.anchor.z + def.offset.z }),
      radius: def.radius, mass: def.mass, hull: row.pose?.hull ?? def.hull, hullMax: def.hull,
      physicsBody: { schemaVersion: 1, dynamic: true, shape: 'capsule', radius: def.radius,
        mass: def.mass, inertiaY: def.mass * def.radius ** 2 / 2 },
      flags: { persistent: true },
      data: { ...stamp(row.key, a.sectorId), name: def.label, scanLabel: def.label,
        parentType: 'ship', salvagePool: { ...row.pool }, authoredSalvagePool: { ...row.pool },
        salvageTimeLeft: 8, debrisCache: 'empty', salvorClaimedBy: row.claim === 'iona' ? TUG_KEY : null } };
    const run = data;
    const e = helpers.spawnEntity?.(spec);
    if (data !== run || disposed || restoring) {
      if (e && state.entities?.get(e.id) === e) { retiring.add(e); helpers.removeEntity?.(e.id); }
      return null;
    }
    if (e) { row.status = row.status === 'pending' ? 'live' : row.status; note(e); }
    return e || null;
  }
  function capture() {
    const tug = entity(TUG_KEY);
    if (tug) { data.tug.pose = capturePose(tug); bindings.get(TUG_KEY).protection = protection(tug); }
    for (const a of data.appearances) for (const row of a.bodies) {
      const e = entity(row.key);
      if (e) {
        row.pose = capturePose(e); row.pool = poolBelow(e.data.salvagePool, row.pool);
        bindings.get(row.key).protection = protection(e);
      }
    }
  }
  function releaseJob() {
    const job = jobs()?.get?.(`job:${TUG_KEY}`);
    if (job?.worldRecordId === TUG_KEY) jobs().release(`job:${TUG_KEY}`);
  }
  function shelve() {
    capture(); pauseIona(data); releaseJob();
    // The source owner captures/removes its finite originals. World must exclude this
    // persistenceOwner from generic replay (see INTEGRATION). No killed/death event.
    for (const row of bindings.values()) if (same(row)) {
      retiring.add(row.entity); helpers.removeEntity?.(row.entity.id);
    }
    bindings.clear();
  }
  function rowForEntity(id) {
    for (const [key, row] of bindings) if (row.entity.id === id && same(row) && !row.ambiguous) return { key, ...row };
    return null;
  }
  function gone(payload) {
    const e = payload?.entity, key = e?.data?.worldRecordId, row = e && bindings.get(key);
    // Core queues destruction AFTER removing the map entry. Compare the retained original,
    // not whichever occupant has this numeric id when the queue eventually flushes.
    if (!row || row.entity !== e || row.generation !== e.occupantGeneration
      || row.ambiguous || retiring.has(e) || restoring) return;
    if (key === TUG_KEY) {
      data.tug.status = 'destroyed'; data.retired = true; releaseJob();
    } else {
      const source = record(key);
      if (source) {
        source.pool = poolBelow(e.data?.salvagePool, source.pool);
        source.status = e.data?._salvaged === true || quantity(source.pool) === 0 ? 'recovered' : 'destroyed';
        source.dwell = 0; data.revision++;
      }
    }
    // Keep the tombstone binding until the explicit sector/restore boundary.
  }
  function damage(p) {
    if (!(p?.applied > 0)) return;
    const row = rowForEntity(p.targetId), binding = row && bindings.get(row.key);
    if (!row) return;
    const after = protection(row.entity);
    if (!(after < binding.protection)) return; // duplicate/stale scalar callback lacks a new physical hit
    binding.protection = after;
    const byPlayer = p.attackerId === state.playerId;
    recordDamage(data, row.key, byPlayer);
    if (row.key === TUG_KEY) {
      // Existing NPC owner owns flee/resume and all travel; standby only writes leased brake.
      const id = `job:${TUG_KEY}`, entry = jobs()?.get?.(id);
      if (entry?.control?.holder === OWNER) jobs()?.releaseControl?.(id, entry.control.claimId);
      jobs()?.interrupt?.(id, { entityId: p.attackerId });
    }
  }
  function park(a, tug) {
    const id = `job:${TUG_KEY}`, claimId = `${OWNER}:idle`;
    let entry = jobs()?.get?.(id);
    if (entry && entry.worldRecordId !== TUG_KEY) return;
    if (entry?.job?.kind !== 'tender') { releaseJob(); entry = null; }
    if (!entry) {
      jobs()?.assign?.(tug, { kind: 'tender', sectorId: a.sectorId, speed: TUG.speed,
        workS: 1e6, route: [{ id: `${a.id}_standby`, pos: { ...tug.pos } },
          { id: `${a.id}_standclear`, pos: { ...tug.pos } }] });
      entry = jobs()?.get?.(id);
    }
    if (!entry || entry.entityId !== tug.id) return;
    // npcJobsRuntime explicitly yields its intent writer under this live control lease.
    // Braking is the only feature-written intent; all actual travel/towing uses its salvor job.
    const result = jobs()?.claimControl?.(id, { claimId, holder: OWNER });
    if (result?.granted && entity(TUG_KEY) === tug) tug.data.intent = {
      moveX: 0, moveZ: 0, boost: false, brake: true, aimAngle: tug.rot || 0,
      fire: false, fireGroup: null,
    };
  }
  function drive(a, tug) {
    const frame = a.bodies[0], target = entity(frame.key);
    const playerRecovering = data.active === 0 && a.agreement === 'cooperate';
    if (jobs()?.get?.(`job:${TUG_KEY}`)?.job?.phase === 'flee') return;
    if (data.retired) { releaseJob(); return; }
    if (a.closed || frame.status !== 'live' || !target || playerRecovering || a.remainingGrace > 0) { park(a, tug); return; }
    const id = `job:${TUG_KEY}`;
    let entry = jobs()?.get?.(id);
    if (entry && (entry.entityId !== tug.id || entry.worldRecordId !== TUG_KEY)) return;
    if (entry && (entry.job?.kind !== 'salvor' || entry.job?.phase === 'complete')) { releaseJob(); entry = null; }
    tug.data.towTargetId = target.id; // consumed by npcJobsRuntime._findTugTowTarget
    if (!entry) {
      // A salvor's physical tractor accepts an explicit staked source without a phantom
      // freight manifest. A hauler would require a manifest AND could consume a miner lot.
      jobs()?.assign?.(tug, { kind: 'salvor', sectorId: a.sectorId, speed: TUG.speed,
        workS: 2, loadS: 2, unloadS: 2, payload: { role: 'tug', targetId: target.id },
        route: [{ id: `${a.id}_receiver`, pos: { ...a.receiver } },
          { id: `${a.id}_load`, pos: { ...target.pos } }] });
      entry = jobs()?.get?.(id);
    }
    if (!entry) return;
  }
  function inReach() {
    const a = currentAppearance(data), tug = entity(TUG_KEY), player = state.entities?.get(state.playerId);
    return !!a && !restoring && state.mode === 'flight' && !state.ui?.docked
      && state.world?.currentSectorId === a.sectorId && tug && player?.alive !== false && player?.pos
      && Math.hypot(tug.pos.x - player.pos.x, tug.pos.z - player.pos.z) <= LIMITS.hailRange;
  }
  function say(text) { bus.emit('comms:log', { from: 'IONA VEY', text, kind: 'salvage' }); }
  on('entity:spawned', p => note(p?.entity));
  on('entity:killed', gone); on('entity:destroyed', gone);
  on('combat:damage', damage);
  on('salvage:claimJumped', p => {
    const row = rowForEntity(p?.wreckId);
    const d = row?.entity.data;
    if (row && p.claimantId === TUG_KEY && p.offenderId === state.playerId
      && p.visits === d.claimJumpVisits && p.t === d.claimJumpProtestAt
      && Number.isFinite(p.t) && quantity(d.salvagePool) < quantity(record(row.key)?.pool)) recordTheft(data, row.key);
  });
  on('salvage:completed', p => {
    const row = rowForEntity(p?.wreckId);
    if (row && quantity(row.entity.data.salvagePool) === 0) {
      const r = record(row.key); if (r) r.pool = {};
      loseBody(data, row.key, true);
    }
  });
  on('sector:exit', p => {
    if (p?.continuous === true || p?.continuousHandoff === true) return;
    shelve();
  });
  on('save:restoring', () => { restoring = true; bindings.clear(); pauseIona(data); });
  on('save:loaded', () => { restoring = false; rebuild(); });
  const api = {
    begin(placement) {
      if (disposed || restoring || mutating) return { ok: false, reason: 'unavailable' };
      const result = beginAppearance(data, placement, now());
      if (result.ok && !result.duplicate) rebuild();
      return result;
    },
    update() {
      if (disposed || restoring || mutating) return;
      const a = currentAppearance(data);
      if (!a || data.retired || state.world?.currentSectorId !== a.sectorId || state.mode !== 'flight') {
        pauseIona(data); return;
      }
      mutating = true;
      const run = data;
      try {
        // Numeric id reuse or removal without a callback is a loss, never permission
        // to spawn another original when the sector is entered again.
        for (const [key, binding] of bindings) {
          if (retiring.has(binding.entity) || binding.ambiguous || live(binding)) continue;
          if (key === TUG_KEY) { data.tug.status = 'destroyed'; data.retired = true; }
          else {
            const r = record(key);
            if (r && !['destroyed', 'recovered', 'lost'].includes(r.status)) {
              r.pool = poolBelow(binding.entity.data?.salvagePool, r.pool);
              r.status = quantity(r.pool) ? 'lost' : 'recovered'; data.revision++;
            }
          }
        }
        if (data.retired) { releaseJob(); return; }
        const tug = ensureTug(a);
        if (data !== run || disposed || restoring) return;
        // Restore all finite earlier staged loads too; never reprint depleted cargo.
        for (let i = 0; i < data.appearances.length; i++) {
          const past = data.appearances[i];
          for (let j = 0; j < past.bodies.length; j++) ensureBody(past, past.bodies[j], APPEARANCES[i].bodies[j]);
          if (data !== run || disposed || restoring) return;
        }
        if (!tug) { pauseIona(data); return; }
        const allPresent = a.bodies.every(b => ['destroyed', 'recovered', 'lost'].includes(b.status) || entity(b.key));
        if (!allPresent) { pauseIona(data); return; }
        if (!a.announced && inReach()) {
          a.announced = true;
          const past = data.appearances.slice(0, data.active);
          const memory = past.some(p => p.theft) ? 'I remember the staked cargo you stripped. These terms are public; no revenge flight. '
            : past.some(p => p.damagedByPlayer) ? 'I remember your weapons on the last lift. Keep this one civil. '
              : past.length && past.every(p => p.cooperation) ? 'You brought the last recovery home intact. I would work with you again. '
                : past.some(p => p.intervention) ? 'The last lift drew outside fire. That was not your debt. '
                  : past.length ? 'We have worked the same field before. Clean claims, clean competition. ' : '';
          say(memory + APPEARANCES[data.active].opening);
          if (data !== run || disposed || restoring) return;
        }
        for (const b of a.bodies) {
          const e = entity(b.key);
          if (!e) continue;
          e.data.salvorClaimedBy = b.claim === 'iona' ? TUG_KEY : null;
          const player = state.entities?.get(state.playerId);
          observeBody(data, b.key, { ...e, pool: e.data.salvagePool,
            playerLine: !!player && !!lineBetween(player, e), rivalLine: !!lineBetween(tug, e) }, now());
        }
        capture();
        const closed = stepIona(data, now(), true);
        drive(a, tug);
        if (data !== run || disposed || restoring) return;
        if (closed) say(data.active === 2 ? data.outcome === 'alliance'
          ? 'Three lifts, intact loads, kept terms. Fair Measure calls you a partner. Both final loads are joint salvage, as agreed. My tug time is my stake.'
          : 'The record makes us rivals. Lawful claims, public terms. You can take the open rack; I keep my frame. No ambushes.'
          : a.cooperation ? 'Recovery accounted for. You did the work. I remember that.'
          : a.theft ? 'That was a staked load. The record stays; I will compete through claims, not ambushes.'
            : 'Recovery is closed. What arrived counts. Next time, we race again.');
      } finally { mutating = false; }
    },
    action({ appearanceId, revision, verb } = {}) {
      const a = currentAppearance(data);
      if (disposed || mutating || !inReach() || !a || a.id !== appearanceId || revision !== data.revision)
        return { ok: false, reason: 'stale_or_out_of_reach' };
      if (jobs()?.get?.(`job:${TUG_KEY}`)?.job?.phase === 'flee') return { ok: false, reason: 'under_threat' };
      mutating = true;
      try {
        if (!chooseTerms(data, verb)) return { ok: false, reason: 'terms_closed' };
        if (data.active === 0 && verb === 'cooperate') {
          releaseJob(); const frame = entity(a.bodies[0].key);
          if (frame) frame.data.salvorClaimedBy = null;
        }
        say(verb === 'cooperate' ? data.active === 2 && a.bodies[0].claim === 'joint'
          ? 'You earned this: I supply the tug time and release my exclusive stake. Both final loads are joint salvage. I tow the frame; you tow the rack. Settle them intact before stripping either.'
          : data.active === 0
          ? 'Joint claim recorded. Tow the marked frame intact into the receiver ring; keep it below eight metres per second. I will stand clear.'
          : 'Agreed. I carry the staked frame; you carry the open rack. Settle both in the receiver ring before stripping either.'
          : verb === 'yield' ? 'Understood. My stake stops at the marked frame. Everything outside it remains open.'
            : 'Clean competition. The open rack is fair game; my marked frame remains staked.');
        return { ok: true };
      } finally { mutating = false; }
    },
    // Mission owner may associate its already-created physical recovery contract. This
    // never completes a mission, inserts a target, pays a reward, or changes mission state.
    bindMission(missionId) {
      const a = currentAppearance(data), m = state.missions?.active?.find(m => m.id === missionId);
      if (!a || a.closed || a.missionId || m?.status !== 'active' || m.type !== 'tow_recovery') return false;
      const ids = a.bodies.map(b => entity(b.key)?.id).filter(id => id != null);
      if (!ids.some(id => m.targetEntityIds?.includes(id))) return false;
      a.missionId = missionId; return true;
    },
    read() {
      const a = currentAppearance(data);
      if (!a) return { visible: false, outcome: data.outcome, retired: data.retired };
      const mission = a.missionId && state.missions?.active?.find(m => m.id === a.missionId);
      return { visible: !!inReach(), appearanceId: a.id, title: APPEARANCES[data.active].title,
        revision: data.revision, retired: data.retired, outcome: data.outcome,
        agreement: a.agreement, closed: a.closed, graceS: Math.ceil(a.remainingGrace),
        receiver: { ...a.receiver }, claimRadius: LIMITS.claimRadius,
        terms: 'Only the marked frame is staked. No compulsory combat. Cargo stays physical; sell recovered salvage at ordinary buyers.',
        mission: mission ? { id: mission.id, status: mission.status } : null,
        faction: { id: TUG.factionId, rep: state.factions?.[TUG.factionId]?.rep ?? 0 },
        bodies: a.bodies.map(b => ({ key: b.key, label: APPEARANCES[data.active].bodies.find(d => d.id === b.id).label,
          status: b.status, claim: b.claim, remaining: quantity(b.pool), pos: entity(b.key)?.pos
            ? { x: entity(b.key).pos.x, z: entity(b.key).pos.z } : b.pose?.pos ? { ...b.pose.pos } : null })),
        choices: a.closed || data.retired || a.agreement !== 'none' ? [] : ['cooperate', 'compete', 'yield'] };
    },
    serialize() { capture(); return serializeIona(data); },
    deserialize(raw) {
      if (!restoring) throw new Error('Iona restore requires save:restoring boundary');
      const restored = raw == null ? freshIona() : restoreIona(raw);
      data = restored; bindings.clear();
    },
    newGame() { shelve(); data = freshIona(); restoring = false; },
    retire() { if (mutating) return false; shelve(); data.retired = true; data.revision++; return true; },
    destroy() { if (disposed) return; shelve(); disposed = true; off.splice(0).forEach(fn => fn()); },
  };
  return api;
}
