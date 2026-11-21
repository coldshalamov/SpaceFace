// A short throwaway fight run inside the sim worker before the real game exists, so the engine
// has compiled and optimised the combat paths (weapon volleys, projectiles and impacts, enemy AI
// and counterplay, line checks, powers, deaths and wrecks) before the player's first fight.
// Without it each of those paths is compiled the first time it runs in play, inside a step,
// which is where the worst steps of a session came from.
//
// The rehearsal is its own host with its own state, bus, rng and entities; nothing it does
// reaches the real game. Storage it writes lands in the realm's staged snapshot, which the
// caller clears before the real init stages the player's keys.
import { createSimCommandRing, pushLaneCommand } from './simCommandChannel.mjs';
import { createBus } from '../../src/core/eventBus.js';
import { SWARM_RULESET } from '../../src/data/swarmMode.js';
import { crucibleSetupFor, requestCrucibleRun } from '../../src/ui/crucibleLaunch.js';

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function swarmOptions() {
  const bus = createBus();
  let opts = null;
  bus.on('game:new', (payload) => { opts = structuredClone(payload); });
  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', arenaId: 'helios_core', ruleset: SWARM_RULESET, seed: 73311, startWave: 3 });
  if (!setup || !setup.ok || !requestCrucibleRun(bus, setup, SWARM_RULESET)) return null;
  return opts;
}

/**
 * Run the rehearsal. Bounded by budgetMs of wall time; never throws.
 * @returns {{ ok: boolean, ms: number, steps: number, peakEntities: number, reason?: string }}
 */
export async function rehearseSimWorkload(createSimHost, { scenarioContract = null, steps = 360, budgetMs = 6000 } = {}) {
  const t0 = now();
  let lane = null;
  let stepped = 0;
  let peak = 0;
  let bootMs = 0; let activeAt = -1; let shots = 0; let deaths = 0;
  try {
    const opts = swarmOptions();
    if (!opts) return { ok: false, ms: now() - t0, steps: 0, peakEntities: 0, reason: 'no-setup' };
    lane = createSimHost();
    const ready = await lane.init({ profile: 'production', seed: 73311, scenarioContract });
    const ring = createSimCommandRing();
    let ackEnd = ready && ready.initRebuild ? ready.initRebuild.end : 0;
    let tick = 0;
    const send = async (n, ...commands) => {
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps: n, ackEnd, commands: ring.drain() });
      ackEnd = (reply && reply.journal && reply.journal.end) ?? (reply && reply.rebuild && reply.rebuild.end) ?? ackEnd;
      stepped += n;
      return reply;
    };
    const boot = await send(0, { kind: 'mode', mode: 'loading' },
      { kind: 'rpc', id: 'rehearsal-boot', op: 'newGameBoot', args: { opts } });
    const ack = boot && boot.rpcAcks && boot.rpcAcks.find((row) => row.id === 'rehearsal-boot');
    if (!ack || !ack.result || ack.result.ok !== true) return { ok: false, ms: now() - t0, steps: stepped, peakEntities: 0, reason: 'boot' };
    const state = lane.host.state;
    bootMs = now() - t0;
    lane.host.bus.on('entity:destroyed', () => { deaths++; });
    lane.host.bus.on('entity:spawned', (p) => { if (p && (p.type === 'projectile' || (p.entity && p.entity.type === 'projectile'))) shots++; });
    await send(0, { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
    await send(1, { kind: 'mode', mode: 'flight' });
    for (let i = 0; i < 60 && state.run && state.run.phase !== 'active' && now() - t0 < budgetMs; i++) await send(4);
    // Fly a busy hand: thrust, turn both ways, the trigger held, powers tapped and held, aimed
    // at the nearest enemy so volleys connect and bodies die.
    const key = (type, code) => ({ kind: 'domEvent', d: { type, code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), repeat: false } });
    const aim = () => {
      const player = state.entities.get(state.playerId);
      let best = null; let bestD = Infinity;
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.type !== 'ship' || e.id === state.playerId || !e.pos || !player || !player.pos) continue;
        const d = (e.pos.x - player.pos.x) ** 2 + (e.pos.z - player.pos.z) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      const p = best ? best.pos : (player && player.pos) || { x: 0, z: 0 };
      return { kind: 'domEvent', d: { type: 'cursorProjection', x: p.x, z: p.z } };
    };
    activeAt = state.run && state.run.phase === 'active' ? stepped : -1;
    await send(0, key('keydown', 'KeyW'), { kind: 'domEvent', d: { type: 'mousedown', button: 0 } });
    const powers = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
    let beat = 0;
    while (stepped < steps && now() - t0 < budgetMs) {
      const turn = beat % 4 === 0 ? 'KeyA' : beat % 4 === 2 ? 'KeyD' : null;
      const power = powers[beat % powers.length];
      const commands = [aim()];
      if (turn) commands.push(key('keydown', turn));
      if (beat % 3 === 0) commands.push(key('keydown', power));
      await send(6, ...commands);
      const release = [aim()];
      if (turn) release.push(key('keyup', turn));
      if (beat % 3 === 0) release.push(key('keyup', power));
      await send(6, ...release);
      beat++;
      const live = state.entityList ? state.entityList.length : 0;
      if (live > peak) peak = live;
    }
    await send(0, key('keyup', 'KeyW'), { kind: 'domEvent', d: { type: 'mouseup', button: 0 } });
    return { ok: true, ms: now() - t0, bootMs, activeAt, steps: stepped, peakEntities: peak, shots, deaths };
  } catch (err) {
    return { ok: false, ms: now() - t0, steps: stepped, peakEntities: peak, reason: String(err && err.message || err).slice(0, 160) };
  } finally {
    try { if (lane) lane.shutdown(); } catch (_) { /* a rehearsal never fails the boot */ }
  }
}
