export const VERSION = 1;
export const COPY = Object.freeze({
  title: 'Tuning Fork Array',
  arrival: 'Three relay forks, three different notes. Someone tried to leave a road through the wreckage.',
  clue: 'Read each fork with your scanner. Tow it into its range band; turn its open mouth toward the carrier. Spread the forks apart. A straight line hears only an echo.',
  backwards: 'This fork is listening with its back. Swing around it with the Massline, or nudge it against the drift. The amber mouth is the receiving end.',
  inverted: 'A reversed service jumper is cancelling the other forks. Reverse it again to undo the mistake. No parts are consumed.',
  lost: 'One fork is out of contact. Follow its last position, or recover its replacement at the service cradle. A replacement retires the old serial.',
  squall: 'Charged dust is beating against the carrier. The squall passes; your work is retained.',
  fixed: 'The three notes agree. The carrier is a wreck beacon. Fly to the fix and scan the recorder at close range.',
  recovered: 'Navigation record recovered. Sell the exclusive chart, or publish a civilian corridor. Choose at the recorder; nothing is decided by opening this panel.',
  sell: 'Sell exclusive navigation record — 1,200 cr. One private survey tender receives the chart; no public route is opened.',
  publish: 'Publish safe civilian corridor — 450 cr. Two civilian survey passes validate the lane before traffic is invited through.',
  published: 'Corridor published. Survey passes have the same chart and safety limits as your completion receipt.',
  sold: 'Exclusive chart sold. The private survey tender has the same fix as your completion receipt.',
});

/** Consume only the supplied GameState RNG, once at creation. All generated values serialize. */
export function defineEncounter(state, { id = 'tuning_fork_array', sectorId, anchor }) {
  if (!/^[a-z0-9_]{1,80}$/.test(id) || typeof sectorId !== 'string' || !sectorId.length || sectorId.length > 100) throw new TypeError('encounter identity');
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z) || typeof state.rng !== 'function') throw new TypeError('anchor / state.rng');
  const unit = () => { const n = state.rng(); if (!(n >= 0 && n < 1)) throw new RangeError('rng'); return n; };
  const angle = unit() * Math.PI * 2;
  const phase = unit() * Math.PI * 2;
  const emitter = { x: anchor.x + Math.cos(angle) * 180, z: anchor.z + Math.sin(angle) * 180 };
  const buoys = [110, 150, 190].map((radius, i) => {
    const a = angle + i * Math.PI * 2 / 3;
    const ideal = { x: emitter.x + Math.cos(a) * radius, z: emitter.z + Math.sin(a) * radius };
    return { slot: i, radius, pos: { x: ideal.x + (unit() - .5) * 90, z: ideal.z + (unit() - .5) * 90 },
      rot: a + Math.PI + (i === 1 ? Math.PI : .5), polarity: 1 };
  });
  return { version: VERSION, id, sectorId, anchor: { x: anchor.x, z: anchor.z }, emitter,
    carrierPhase: phase, emitterVelocity: { x: Math.cos(phase) * .45, z: Math.sin(phase) * .45 },
    buoys, wavelength: 160, bandWidth: 65, maxReach: 850, recoveryRange: 65,
    scanRange: 320, fixThreshold: .68, squallPeriod: 60, squallDuration: 12 };
}

export function bodySpec(def, slot, pose, serial) {
  const emitter = slot === 3;
  return { type: 'wreck', pos: { x: pose.x, y: 0, z: pose.z }, vel: { x: pose.vx || 0, y: 0, z: pose.vz || 0 },
    rot: pose.rot || 0, angVel: pose.angVel || 0, mass: emitter ? 80 : 6, radius: emitter ? 14 : 6,
    hull: 160, hullMax: 160, drag: 0, physicsBody: true, collides: true, homeSectorId: def.sectorId,
    flags: { persistent: true }, data: { role: 'tuning_fork_array', name: emitter ? 'Silent navigation wreck' : `Relay fork ${'ABC'[slot]}`,
      sectorId: def.sectorId, masslineTetherable: !emitter,
      tuningForkArray: { encounterId: def.id, slot, serial },
      // Standard wreck scanning can expose its outline; only this feature validates the carrier fix.
      scanned: false } };
}
