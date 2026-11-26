// FIRST PLAY (demo bug, 2026-11-23): the first Swarm run after the game loaded opened with the
// pilot at (0,0), 2.9 km from the Foundry, in empty space with a "Foundry gate" arrow; Again was
// fine. Cause: a Swarm pilot is spawned at the origin, the reset prepare builds its native body
// there, and only then does the arena seat it at the Foundry (a same-sector relocation that
// moved the entity alone). The body was left for the owner's next sync to correct, and when the
// first flight steps stepped the body before that sync (a timing race in the browser worker) the
// solver's origin pose was written back over the seat. A relocation now moves the body with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { createBus } from '../src/core/eventBus.js';
import { requestSwarmQuickStart } from '../src/ui/crucibleLaunch.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));

test('the Swarm door seats the pilot and its physics body together at the Foundry spawn', async () => {
  const bus = createBus();
  let opts = null;
  bus.on('game:new', (payload) => { opts = structuredClone(payload); });
  assert.equal(requestSwarmQuickStart(bus), true, 'the title Swarm door produced a launch');
  const lane = createSimHost();
  try {
    const ready = await lane.init({ profile: 'production', seed: 4242, scenarioContract });
    const ring = createSimCommandRing();
    let ackEnd = ready && ready.initRebuild ? ready.initRebuild.end : 0;
    let tick = 0;
    const send = async (steps, ...commands) => {
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps, ackEnd, commands: ring.drain() });
      ackEnd = (reply && reply.journal && reply.journal.end) ?? (reply && reply.rebuild && reply.rebuild.end) ?? ackEnd;
      return reply;
    };
    const boot = await send(0, { kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'swarm-boot', op: 'newGameBoot', args: { opts } });
    const ack = boot.rpcAcks && boot.rpcAcks.find((row) => row.id === 'swarm-boot');
    assert.equal(ack && ack.result && ack.result.ok, true, `newGameBoot: ${JSON.stringify(ack && ack.result)}`);

    const state = lane.host.state;
    const physics = lane.host.registry.get('physics');
    const pilot = state.entities.get(state.playerId);
    const body = () => {
      const rec = physics && physics._sg02 && physics._sg02.records.get(pilot.id);
      assert.ok(rec && rec.body, 'the pilot has a native body once loading has prepared physics');
      return rec.body.translation();
    };
    const seat = { x: pilot.pos.x, z: pilot.pos.z };
    assert.ok(Math.hypot(seat.x, seat.z) > 500, `the arena seated the pilot away from the origin (${seat.x}, ${seat.z})`);
    // The cause, read while the run is still loading: the body must already stand on the seat.
    const b = body();
    assert.ok(Math.hypot(b.x - seat.x, b.z - seat.z) < 1,
      `native body at (${Math.round(b.x)}, ${Math.round(b.z)}) while the pilot is seated at (${Math.round(seat.x)}, ${Math.round(seat.z)})`);

    await send(1, { kind: 'mode', mode: 'flight' });
    for (let i = 0; i < 6; i++) await send(1);
    assert.ok(Math.hypot(pilot.pos.x - seat.x, pilot.pos.z - seat.z) < 40,
      `the pilot opened the fight on its seat, not at (${Math.round(pilot.pos.x)}, ${Math.round(pilot.pos.z)})`);

    // The demo's next door on the same session: a new Adventure game seats its pilot in the
    // harbour while the Swarm run's physics owner is still alive. The body must agree there too.
    const adventure = await send(0, { kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'adventure-boot', op: 'newGameBoot', args: { opts: {} } });
    const advAck = adventure.rpcAcks && adventure.rpcAcks.find((row) => row.id === 'adventure-boot');
    assert.equal(advAck && advAck.result && advAck.result.ok, true, `adventure newGameBoot: ${JSON.stringify(advAck && advAck.result)}`);
    const harbourPilot = state.entities.get(state.playerId);
    assert.ok(harbourPilot && harbourPilot !== pilot, 'the new game has its own pilot');
    const rec = physics._sg02 && physics._sg02.records.get(harbourPilot.id);
    assert.ok(rec && rec.body && rec.entity === harbourPilot, 'the harbour pilot has its own native body');
    const hb = rec.body.translation();
    assert.ok(Math.hypot(hb.x - harbourPilot.pos.x, hb.z - harbourPilot.pos.z) < 1,
      `harbour body at (${Math.round(hb.x)}, ${Math.round(hb.z)}), pilot at (${Math.round(harbourPilot.pos.x)}, ${Math.round(harbourPilot.pos.z)})`);
  } finally {
    lane.shutdown();
  }
});
