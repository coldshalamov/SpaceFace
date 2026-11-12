import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { input } from '../src/systems/input.js';
import { runSession } from '../src/systems/runSession.js';
import { combat } from '../src/systems/combat.js';
import { actions } from '../src/systems/actions.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { environmentMaterials } from '../src/systems/environmentMaterials.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { createRunState } from '../src/core/runState.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';

// Controlled encounter, not earned earlier rounds or hardware input. The arena creates
// the ordinary continuation; no body pose, impulse, damage or attachment is scripted.
test('ordinary catch, swing, cut and brake preserve material laws and earn a released hit', async t => {
  const kit = COMBAT_LAB_STARTER_PACKAGES.find(k => k.id === 'ricochet_runner');
  const fittings = Array(13).fill(null);
  for (const row of kit.loadout) fittings[row.slotIndex] = row.defId;
  const h = await bootRealPath({ seed: 4242,
    systems: [input, runSession, combat, actions, tetherGameplay, masslineThrow,
      tumbleStates, environmentMaterials, swarmArena, 'flightV3', 'physics'],
    hulls: [{ hullId: kit.hullId, fittings, isPlayer: true, pos: { x: -150, z: 0 } }] });
  t.after(() => h.dispose());
  const s = h.state, p = h.player, arena = h.runtime.getSystem('swarmArena');
  s.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 4, arenaId: 'helios_core' };
  arena._brood.prepareWave(s.run, 4, planWave({ seed: 4242, wave: 4,
    arenaId: 'helios_core', ruleset: 'swarm' }));
  h.bus.emit('run:waveStarted', { wave: 4 });
  const rock = s.entityList.find(e => e.data?.openingContinuation === 4);
  assert.ok(rock);
  const lines = [], kills = [], contacts = [], tells = [];
  for (const event of ['tether:latched', 'tether:released'])
    h.bus.on(event, data => lines.push({ event, tick: s.tick, ...data }));
  h.bus.on('swarm:broodKills', data => kills.push({ tick: s.tick, ...data }));
  h.bus.on('physics:impact', data => contacts.push({ tick: s.tick, ...data }));
  h.bus.on('swarm:broodTelegraph', data => tells.push({ tick: s.tick, ...data }));
  const inp = h.runtime.getSystem('input');
  const key = (code, pressed) => inp.ingestLaneDomEvent({ type: pressed ? 'keydown' : 'keyup', code, pressed, blocked: false });
  const mouse = pressed => inp.ingestLaneDomEvent({ type: pressed ? 'mousedown' : 'mouseup', button: 2,
    clientX: 600, clientY: 400, blocked: false, offCanvas: false });
  s.input.autoFire = false;
  h.step(0);
  assert.equal(kills.length, 0);
  inp.ingestLaneDomEvent({ type: 'pointermove', clientX: 600, clientY: 400 });
  inp.ingestLaneDomEvent({ type: 'cursorProjection', x: rock.pos.x, z: rock.pos.z });
  h.step(1); mouse(true); noteSwarmPilotAction(s); h.step(1); mouse(false);
  let requestedAt = null;
  for (let i = 0; i < 720; i++) {
    const b = arena._brood._bodies, speed = Math.hypot(rock.vel.x, rock.vel.z);
    const gap = Math.hypot(rock.pos.x - p.pos.x, rock.pos.z - p.pos.z);
    let forecast = false;
    if (requestedAt == null && s.player.tether.active && s.player.tether.targetId === rock.id
      && speed > 25 && gap > 25) {
      for (let j = 0; j < b.alive.length; j++) if (b.alive[j]) {
        const vx = rock.vel.x - b.vx[j], vz = rock.vel.z - b.vz[j];
        const dx = b.px[j] - rock.pos.x, dz = b.pz[j] - rock.pos.z;
        const time = (dx * vx + dz * vz) / (vx * vx + vz * vz);
        if (time > 0.1 && time < 0.9 && Math.hypot(dx - vx * time, dz - vz * time) < 8) {
          forecast = true; break;
        }
      }
    }
    if (forecast) { mouse(true); requestedAt = s.tick; } else mouse(false);
    const code = ['KeyQ', 'KeyW', 'KeyE', 'KeyS'][Math.floor(i / 70) % 4];
    const moving = requestedAt == null && Math.hypot(p.vel.x, p.vel.z) < 90;
    for (const k of ['KeyQ', 'KeyW', 'KeyE', 'KeyS']) key(k, moving && k === code);
    key('Digit0', !moving);
    h.step(1);
    assert.equal(rock.alive, true, 'the original payload survives its actual material owner');
    if (requestedAt != null && s.tick - requestedAt > 120) break;
  }
  const caught = lines.find(e => e.event === 'tether:latched');
  const released = lines.find(e => e.event === 'tether:released');
  assert.equal(caught?.targetId, rock.id); assert.equal(released?.targetId, rock.id);
  assert.ok(released.tick > caught.tick);
  assert.equal(contacts.filter(e => e.tick >= released.tick
    && ((e.aId === p.id && e.bId === rock.id) || (e.aId === rock.id && e.bId === p.id))).length, 0);
  const paid = kills.filter(e => e.tick > released.tick && e.cause === 'collision' && e.count > 0);
  assert.equal(paid.reduce((n, e) => n + e.count, 0), 1);
  assert.equal(paid.reduce((n, e) => n + e.credits, 0), 2);
  assert.equal(paid.reduce((n, e) => n + e.score, 0), 25);
  assert.equal(s.run.credits, 5, 'earlier pilot contacts are separate from the one released hit');
  assert.ok(tells.some(e => e.familyId === 'spitter' && e.tick > caught.tick));
  assert.equal(h.proof().backend, 'rapier-dynamic');
  t.diagnostic(`native catch ${caught.tick}, release ${released.tick}, released hit ${paid[0].tick}`);
});
