// #164: quiet-flight SG-02 owner step — 11 awake craft with control commands + 4 statics
// (census of the stack quiet frame: 10–13 dynamic, all awake S0/S1, ~4 statics).
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
const DT = 1 / 60;
const TICKS = +(process.env.TICKS || 20000);
function craft(id, x, z) {
  return { id, type: 'ship', alive: true, radius: 6, mass: 24, pos: { x, z }, vel: { x: 30, z: 0 }, rot: 0, angVel: 0,
    physicsBody: { schemaVersion: 1, radius: 6, mass: 24, inertiaY: 48, dynamic: true, ccd: true, revision: 0 },
    data: { defId: 'ship_kestrel' }, isPlayer: id === 1 };
}
function stat(id, x, z) {
  return { id, type: 'station', alive: true, radius: 16, mass: 1e6, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    physicsBody: { schemaVersion: 1, radius: 16, mass: 1e6, inertiaY: 1e6, dynamic: false, ccd: false, revision: 0 }, data: { stationId: 's' + id } };
}
const owner = await createSg02DynamicBodyOwner({ publishTelemetry: process.env.TELEM !== '0', fixedDt: DT });
const ships = []; for (let i = 0; i < 11; i++) ships.push(craft(i + 1, i * 300, (i % 3) * 300));
const statics = []; for (let i = 0; i < 4; i++) statics.push(stat(100 + i, -2000 - i * 400, 2000));
owner.syncFromEntities([...ships, ...statics]);
function tick(t) {
  for (const s of ships) writePhysicsControl(s, { mode: 'flight', force: { x: 200 * Math.sin(t * 0.01 + s.id), y: 0, z: 100 }, torque: { x: 0, y: 5 * Math.cos(t * 0.02), z: 0 }, maxSpeed: 140, source: 'bench' });
  owner.step(DT);
}
for (let t = 0; t < 3000; t++) tick(t);
const t0 = process.hrtime.bigint();
for (let t = 3000; t < 3000 + TICKS; t++) tick(t);
console.log(JSON.stringify({ usPerTick: Number(process.hrtime.bigint() - t0) / 1000 / TICKS }));
