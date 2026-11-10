// Fixture: the same words inside comments and strings, plus intents instead of writes. Must trip nothing.
// Math.random() would be wrong here; Date.now() too. e.vel.x *= 0.9 is drag.
export function shove(bus, e, nx, nz) {
  const note = 'never Math.random(); never Date.now(); choices: [ ] is a tree';
  bus.emit('physics:impulseRequested', { id: e.id, x: nx * 40, z: nz * 40, note });
  const speed = Math.hypot(e.vel.x, e.vel.z);
  return speed === e.vel.x || e.vel.x === 0;
}
