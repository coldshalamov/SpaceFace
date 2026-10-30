/** Authored XZ metres. Seed varies the work lamps, never puzzle clearances. */
export const SITE_ID = 'nacre_sluice';
export const ASSETS = Object.freeze({
  wall: 'place_slurry_tank', anchor: 'place_slurry_tank',
  baffle: 'place_aftermath_frag_plate_curl', gate: 'place_tanker_coupling',
  core: 'place_power_skid', control: 'place_works_refinery',
  plug: 'place_tanker_coupling', salvage: 'place_cargo_pod_standard',
});
export function createLayout(variant = 0) {
  const bodies = [];
  const add = (id, kind, x, z, radius, mass, fixed = false) => bodies.push({
    id, kind, x, z, radius, mass, fixed, hull: kind === 'core' ? 600 : 240,
    assetId: ASSETS[kind],
  });
  // Broken outer banks leave a northern service bypass; two large anchors split it
  // into safe eddies. No invisible logical wall closes the alternative route.
  for (const [i,x] of [-120,-80,-40,0,40,80,120].entries()) add(`bank_s_${i}`, 'wall', x, -66, 20, 5000, true);
  for (const [i,x] of [-110,-65,65,110].entries()) add(`bank_n_${i}`, 'wall', x, 66, 19, 5000, true);
  add('anchor_w', 'anchor', -45, 118, 19, 5000, true);
  add('anchor_e', 'anchor', 55, 118, 19, 5000, true);
  add('baffle_w', 'baffle', -42, 0, 17, 160);
  add('baffle_e', 'baffle', 42, 0, 17, 160);
  add('gate', 'gate', 112, 0, 18, 220);
  add('core', 'core', -112, 0, 9, 28);
  add('control', 'control', -145, -29, 10, 5000, true);
  add('plug', 'plug', -18, -28, 7, 12);
  add('salvage', 'salvage', 22, -38, 7, 14);
  return {
    version: 1, variant: variant >>> 0, bodies,
    receiver: { x: 172, z: 0, radius: 25, maxSpeed: 4, dwell: 2 },
    salvageReceiver: { x: 172, z: 0, radius: 25, maxSpeed: 4, dwell: 2 },
    pockets: [{ x:-80,z:32,radius:17 },{x:0,z:104,radius:22},{x:82,z:32,radius:17}],
    jets: [{ id:'west',x:-72,z:0,halfX:22,halfZ:21,dx:0,dz:1 },
      { id:'east',x:72,z:0,halfX:22,halfZ:21,dx:0,dz:-1 }],
    signs: [
      {x:-172,z:0,text:'NACRE SLUICE — Recover the stranded catalyst core. Tow it into the east cradle below 4 m/s.'},
      {x:-145,z:-29,text:'CONTROL: purge gives 12 seconds of quiet. Gate opens after pressure drops. Controls require close approach.'},
      {x:-40,z:90,text:'SERVICE BYPASS — Wide northern arc. Use the tank anchors; keep the core clear of the banks.'},
      {x:-18,z:-28,text:'MANUAL RELIEF — Pull the red coupling 24 m from its seat to vent permanently. Works without the control tower.'},
      {x:22,z:-38,text:'OPTIONAL: catalyst pallet. Same cradle, separate receipt. Pressure is your clock.'},
    ],
    // Reproducible decorative source, consumed only by presentation.
    lamps: Array.from({length:12},(_,i)=>({x:-132+i*24,z:i%2?62:-62,phase:((variant>>>0)+i*17)%31/31})),
  };
}
export const distance = (a,b) => a && b ? Math.hypot(a.x-b.x,a.z-b.z) : Infinity;
export const speed = b => b?.vel && Number.isFinite(b.vel.x) && Number.isFinite(b.vel.z) ? Math.hypot(b.vel.x,b.vel.z) : Infinity;
export function inCradle(body, receiver) {
  return body?.alive !== false && body?.hull > 0 && Number.isFinite(body.radius)
    && distance(body.pos,receiver) + body.radius <= receiver.radius && speed(body) <= receiver.maxSpeed;
}
