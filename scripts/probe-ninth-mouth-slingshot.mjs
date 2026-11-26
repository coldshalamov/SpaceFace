// Probe for the earned-route lamp slingshot: reproduce the test's scene and tow
// loop, instrumenting the lamp's speed, player distance, contact events and
// tether telemetry. Run: node scripts/probe-ninth-mouth-slingshot.mjs
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { domKeyEvent } from '../src/systems/input.js';
import { CERES_NINTH_MOUTH as CUT, worldPoint, localPoint } from '../src/data/ceresNinthMouth.js';
import { applyFeatureConfigToMaps } from '../src/data/featureFlags.js';

const rt = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 47 });
applyFeatureConfigToMaps(rt.config.features);
const s = rt.state; s.mode = 'flight'; s.run.kind = 'adventure'; s.ui.screenStack = []; s.world.currentSectorId = CUT.sectorId;
rt.getSystem('ships').newGame();
const p = rt.spawn(makeShipEntitySpec('ship_pelican', { isPlayer: true, player: s.player, team: 0, pos: worldPoint({ x: -900, z: 0 }), fittings: [] }));
p.rot = Math.PI; s.playerId = p.id;
s.settings.controls.bindings = { tether: ['KeyF'], brake: ['Digit0'], reelIn: ['BracketLeft'], reelOut: ['BracketRight'], strafeLeft: ['KeyQ'], strafeRight: ['KeyE'], contextWheel: [], interact: [] };
const physics = rt.getSystem('physics'); await physics.prepareBackend(s);
const input = rt.getSystem('input'); input.ingestLaneDomEvent({ type: 'viewport', width: 640, height: 480 });
const step = n => { for (let i = 0; i < n; i++) rt.step(1 / 60); };
const key = (code, pressed) => domKeyEvent(input, { code, pressed, blocked: false, repeat: false });
const entity = role => s.entityList.find(e => e.alive && e.data?.ninthMouthRole === role);
step(60);
key('KeyS', true); for (let n = 0; n < 1800 && localPoint(p.pos).x < -240; n++) step(1); key('KeyS', false);
key('Digit0', true); step(240); key('Digit0', false); step(60);

const lamp = entity('lamp:0');
const desc = id => { const e = s.entities.get(id); return e ? { id, type: e.type, name: e.data?.name || e.name, role: e.data?.ninthMouthRole, ctx: e.data?.ai?.spawnContext, act: e.data?.ai?.activity?.kind, actReason: e.data?.ai?.activity?.reason, conductStance: e.data?.ai?.conductStance, factionId: e.factionId || e.data?.factionId, presence: e.data?.factionPresence, archetype: e.data?.ai?.archetype, motive: e.data?.ai?.motive, mass: e.mass, vel: { x: +e.vel.x.toFixed(2), z: +e.vel.z.toFixed(2) }, pos: localPoint(e.pos) } : { id, gone: true }; };
const impacts = [];
rt.bus.on('physics:impact', e => {
  if (e && (e.aId === lamp.id || e.bId === lamp.id)) impacts.push({ t: s.simTime, a: desc(e.aId), b: desc(e.bId), dv: e.deltaV ?? e.dv ?? null });
});
const aim = e => { input.ingestLaneDomEvent({ type: 'mousemove', clientX: 320, clientY: 240, movementX: 1, movementY: 0 }); input.ingestLaneDomEvent({ type: 'cursorProjection', x: e.pos.x, z: e.pos.z }); step(2); };
const tap = c => { key(c, true); step(1); key(c, false); step(6); };
const clear = () => { for (const k of ['KeyW', 'KeyS', 'KeyQ', 'KeyE', 'Digit0']) key(k, false); };
const move = (x, z, max = 3000) => { for (let n = 0; n < max; n++) { const q = localPoint(p.pos), dx = x - q.x, dz = z - q.z; const vx = Math.max(-10, Math.min(10, dx * 1.5)), vz = Math.max(-10, Math.min(10, dz * 1.5)); key('KeyS', p.vel.x < vx - 1); key('KeyW', p.vel.x > vx + 1); key('KeyQ', p.vel.z < vz - 1); key('KeyE', p.vel.z > vz + 1); key('Digit0', Math.hypot(dx, dz) < 3); step(1); if (Math.hypot(dx, dz) < 2 && Math.hypot(p.vel.x, p.vel.z) < 1) break; } clear(); key('Digit0', true); step(120); key('Digit0', false); };

move(-160, -45); aim(lamp); tap('KeyF');
console.log('attached?', s.player.tether.active, 'target', s.player.tether.targetId, 'lamp', lamp.id);

// Tow loop identical to the test, instrumented.
const recent = [];
let maxSpeed = 0, maxAt = null, minDist = Infinity, minAt = null;
let attachInfo = () => {
  const a = Object.values(s.combat?.attachments?.byId || {}).find(a => a.targetId === lamp.id || a.ownerId === lamp.id);
  return a ? { id: a.id, rest: a.restLength?.toFixed(1), state: a.state, defId: a.defId } : null;
};
for (let n = 0; n < 12000; n++) {
  const tp = localPoint(p.pos), off = (tp.x + 95) * -.319 + (tp.z + 23) * .948;
  const corr = Math.max(-.6, Math.min(.6, off * .04));
  const vx = .65 * .948 + corr * .319, vz = .65 * .319 - corr * .948;
  key('KeyS', p.vel.x < vx - .1); key('KeyW', p.vel.x > vx + .1); key('KeyQ', p.vel.z < vz - .1); key('KeyE', p.vel.z > vz + .1); key('Digit0', false); step(1);
  const lv = Math.hypot(lamp.vel.x, lamp.vel.z);
  const dp = Math.hypot(lamp.pos.x - p.pos.x, lamp.pos.z - p.pos.z);
  recent.push([n, s.simTime, lv, dp]); if (recent.length > 240) recent.shift();
  if (lv > maxSpeed) { maxSpeed = lv; maxAt = { n, t: s.simTime, lamp: localPoint(lamp.pos), player: localPoint(p.pos), dp: +dp.toFixed(1), att: attachInfo() }; }
  if (dp < minDist) { minDist = dp; minAt = { n, t: s.simTime, lv: +lv.toFixed(2) }; }
  if (lv > 3) {
    console.log('SPEED>3 at n=' + n, 't=' + s.simTime.toFixed(2), 'lamp', JSON.stringify(localPoint(lamp.pos)), 'lv', lv.toFixed(2), 'dp', dp.toFixed(1), 'att', JSON.stringify(attachInfo()), 'pvel', p.vel.x.toFixed(2), p.vel.z.toFixed(2));
    const ships = s.entityList.filter(e => e.alive && (e.type === 'ship' || e.type === 'drone') && e !== p).map(e => desc(e.id));
    console.log('SHIPS', JSON.stringify(ships));
    console.log('REPUTATION', JSON.stringify(s.player?.reputation || s.reputation || null));
    console.log('CONDUCT', JSON.stringify(s.factionPresence?.conduct || null));
    console.log('recent (n,t,lv,dp):', JSON.stringify(recent.slice(-30).map(r => [r[0], +r[1].toFixed(2), +r[2].toFixed(2), +r[3].toFixed(1)])));
    // run a few more ticks to see it evolve
    for (let k2 = 0; k2 < 300; k2++) step(1);
    console.log('after 300: lv', Math.hypot(lamp.vel.x, lamp.vel.z).toFixed(2), 'lamp', JSON.stringify(localPoint(lamp.pos)), 'att', JSON.stringify(attachInfo()));
    break;
  }
  const l = localPoint(lamp.pos), rem = Math.hypot(l.x + 95, l.z + 23);
  const v2 = lamp.vel.x ** 2 + lamp.vel.z ** 2, dot = (-95 - l.x) * lamp.vel.x + (-23 - l.z) * lamp.vel.z;
  const disc = dot * dot - v2 * (rem * rem - 64);
  const eta = v2 > .0025 && dot > 0 && disc >= 0 ? (dot - Math.sqrt(disc)) / v2 : Infinity;
  if ((rem < 25 && rem > 8) || eta < 40) { console.log('loop exit n=' + n, 'rem', rem.toFixed(1), 'lv', lv.toFixed(2)); break; }
}
console.log('MAX', JSON.stringify({ maxSpeed, maxAt, minDist, minAt }));
console.log('IMPACTS', JSON.stringify(impacts.slice(0, 20)));
rt.dispose();
