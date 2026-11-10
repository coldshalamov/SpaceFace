import { advectMaterialEnvironment } from './materialEnvironment.js';
import { MATERIAL_FLOW_RECIPES } from './livingVfxCatalog.js';

// Presentation-only Lagrangian transport: parcels carry velocity and remember deflections.
// The vector field is the curl of three smooth scalar potentials. Unlike a sine trajectory,
// neighbouring parcels share eddies, but their paths depend on their own previous velocity.
// No allocation, scene access, RNG consumption or simulation mutation in this module.
export const MATERIAL_STEP = 1 / 120;
export const MATERIAL_STATE_SIZE = 64;
export const MATERIAL_HISTORY_COUNT = 10;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash(x, y, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}
// Derivatives of quintic-interpolated value noise. C2 interpolation keeps acceleration smooth
// at lattice boundaries. out[o], out[o+1] are exact spatial derivatives, not finite differences.
function potential(x, y, seed, out, o) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dx = 30 * fx * fx * (fx - 1) * (fx - 1);
  const dy = 30 * fy * fy * (fy - 1) * (fy - 1);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  out[o] = dx * ((b - a) * (1 - uy) + (d - c) * uy);
  out[o + 1] = dy * ((c - a) * (1 - ux) + (d - b) * ux);
}
/** scratch has >=6 numbers; out has >=3. Coordinates are emitter-relative, so rebases are exact. */
export function sampleMaterialCurl(x, y, z, time, seed, out, scratch) {
  out[0] = out[1] = out[2] = 0;
  // Two distinct spatial scales, neither a global repeating animation clock.
  for (let octave = 0; octave < 2; octave++) {
    const f = octave ? 3.71 : 1.67, weight = octave ? .27 : .73;
    const k = (seed | 0) ^ Math.imul(octave + 1, 0x9e3779b1);
    const px = x * f + time * .23, py = y * f - time * .17, pz = z * f + time * .11;
    potential(py + 13.7, pz - 8.1, k, scratch, 0);
    potential(pz + 5.3, px + 19.2, k ^ 0x68bc21eb, scratch, 2);
    potential(px - 7.4, py + 3.9, k ^ 0x02e5be93, scratch, 4);
    out[0] += (scratch[5] - scratch[2]) * weight;
    out[1] += (scratch[1] - scratch[4]) * weight;
    out[2] += (scratch[3] - scratch[0]) * weight;
  }
  return out;
}

// State: local position XYZ(0..2), local velocity(3..5), physical age(6), event seed(7),
// contact heat(8), prior velocity(9..11), bend(12), contact count(13), coverage(14), spare(15).
// m is the existing 15-float ForceParticleFlow descriptor; retaining it preserves adapters.
export function seedMaterialParcel(m, s, life, seed, velocity, scratch) {
  s.fill(0); s[7] = seed | 0; s[14] = 1;
  const r = MATERIAL_FLOW_RECIPES[m[0]], phase = m[7], variety = m[8];
  const inward = r.transport === 'sink' || r.transport === 'lock' || r.transport === 'converge';
  const radial = inward || r.transport === 'eject' || r.transport === 'pressure'
    || r.transport === 'ballistic' || r.transport === 'creep';
  const reach = inward ? .82 + variety * .16 : r.transport === 'creep' ? .2 + variety * .48 : .045;
  if (radial) { s[0] = Math.cos(phase) * reach; s[2] = Math.sin(phase) * reach; }
  else { s[0] = .02; s[2] = (variety - .5) * .004; }
  for (let i = 18; i < 48; i += 3) { s[i] = s[0]; s[i + 1] = s[1]; s[i + 2] = s[2]; }
  s[50] = 1;
  materialVelocity(m, s, life, velocity, scratch);
  s[3] = velocity[0]; s[4] = velocity[1]; s[5] = velocity[2];
  s[9] = s[3]; s[10] = s[4]; s[11] = s[5];
}
function materialVelocity(m, s, life, out, scratch) {
  const recipe = MATERIAL_FLOW_RECIPES[m[0]], u = s[0], h = s[1], v = s[2];
  const radius = Math.hypot(u, v), inv = 1 / Math.max(.055, radius);
  const nx = radius > 1e-7 ? u * inv : Math.cos(m[7]);
  const nz = radius > 1e-7 ? v * inv : Math.sin(m[7]);
  const age = s[6] / life, variety = m[8];
  sampleMaterialCurl(u, h, v, age, s[7], out, scratch);
  let x = 0, y = 0, z = 0, curl = recipe.curl;
  switch (recipe.transport) {
    case 'sink': {
      const radial = -.96 * Math.min(1, radius / .09);
      // Differential angular velocity: inner material overtakes the outer intake.
      const swirl = -(1.05 + .82 * (1 - Math.min(1, radius)));
      x = nx * radial - nz * swirl; z = nz * radial + nx * swirl;
      y = -.30 * h; curl *= Math.min(1, radius * 4); break;
    }
    case 'lock':
      x = -u * 2.7; z = -v * 2.7; y = -h * 5; curl *= .4; break;
    case 'converge':
      x = -nx * .95; z = -nz * .95; y = -h * 4;
      if (radius < .07) { x = -u * 12; z = -v * 12; curl *= radius * 8; } break;
    case 'pressure': {
      const speed = 1.48 * Math.exp(-age * .85);
      x = nx * speed; z = nz * speed; y = -h * 2; break;
    }
    case 'eject': {
      const speed = (1.05 + variety * .70) * Math.exp(-age * 1.7);
      x = Math.cos(m[7]) * speed; z = Math.sin(m[7]) * speed;
      y = .18 * Math.sin(m[7] * 1.7) - h * .5; break;
    }
    case 'ballistic': {
      const speed = (1.10 + variety * .65) * Math.exp(-age * .72);
      x = Math.cos(m[7]) * speed; z = Math.sin(m[7]) * speed;
      y = .12 * Math.sin(m[7] * 1.9); break;
    }
    case 'creep':
      x = nx * .12 - nz * .065; z = nz * .12 + nx * .065;
      // Connected matter stretches from and rejoins its substrate instead of escaping as sparks.
      y = .055 * Math.PI * Math.sin(TAU * age) * (.65 + variety * .35);
      curl *= .12; break;
    case 'intake':
      x = 1.03; z = -v * 2.8; y = -.8 * h; break;
    case 'branch':
      x = 1.24; z = -v * 3.2; y = -h * 3; break;
    case 'conduit':
      x = 1.18; z = -v * 6; y = -h * 6; break;
    default: // a continuously driven axial jet, not a radial bloom
      x = 1.20; z = (variety - .5) * .30 - v * .6; y = -h * 1.2;
  }
  // Curl is secondary motion; it cannot reverse the identifying verb of a material.
  out[0] = x + out[0] * curl * .35;
  out[1] = y + out[1] * curl * .17;
  out[2] = z + out[2] * curl * .35;
}
function contain(m, s) {
  const kind = m[0];
  if (kind === 2) {
    s[0] = clamp(s[0], .001, .998);
    const side = Math.min(Math.tan(m[13]) * s[0] * .97, Math.sqrt(Math.max(0, .998 ** 2 - s[0] ** 2)));
    if (Math.abs(s[2]) > side) { s[2] = clamp(s[2], -side, side); s[5] *= .35; }
  } else if (kind === 3) {
    s[0] = clamp(s[0], .001, .998);
    const side = m[14] / m[6] * .97;
    if (Math.abs(s[2]) > side) { s[2] = clamp(s[2], -side, side); s[5] *= .35; }
  } else if (kind === 0 || kind === 1 || kind === 4) {
    const d = Math.hypot(s[0], s[2]);
    if (d > .998) { s[0] *= .998 / d; s[2] *= .998 / d; }
  }
}
function collide(m, s, life, step, oldX, oldZ, contacts, count) {
  if (!count) return;
  const R = m[6], cx = m[4], cz = m[5], time = s[6], recipe = MATERIAL_FLOW_RECIPES[m[0]];
  let wx = m[1] + R * (cx * s[0] - cz * s[2]);
  let wz = m[3] + R * (cz * s[0] + cx * s[2]);
  const px = m[1] + R * (cx * oldX - cz * oldZ), pz = m[3] + R * (cz * oldX + cx * oldZ);
  for (let i = 0; i < Math.min(3, count); i++) {
    const o = i * 8, radius = contacts[o + 2], strength = contacts[o + 6];
    if (!(radius > 0 && strength > 0)) continue;
    const bx = contacts[o] + contacts[o + 3] * time, bz = contacts[o + 1] + contacts[o + 4] * time;
    const ax = px - (bx - contacts[o + 3] * step), az = pz - (bz - contacts[o + 4] * step);
    let dx = wx - bx, dz = wz - bz, d = Math.hypot(dx, dz);
    // Relative swept circle: a fast small parcel cannot tunnel through a moving body.
    if (d >= radius) {
      const qx = dx - ax, qz = dz - az, A = qx * qx + qz * qz;
      const B = 2 * (ax * qx + az * qz), C = ax * ax + az * az - radius * radius;
      const D = B * B - 4 * A * C;
      if (!(A > 1e-12 && C > 0 && D >= 0)) continue;
      const hit = (-B - Math.sqrt(D)) / (2 * A);
      if (!(hit >= 0 && hit <= 1)) continue;
      dx = ax + qx * hit; dz = az + qz * hit; d = Math.hypot(dx, dz);
    }
    const approachX=cx*s[3]-cz*s[5],approachZ=cz*s[3]+cx*s[5];
    const approachSpeed=Math.hypot(approachX,approachZ);
    // A parcel born exactly at a body centre exits opposite its incoming velocity.
    // Choosing the source axis instead can preserve a nonsensical un-deflected heading.
    const nx = d > 1e-8 ? dx / d : approachSpeed>1e-8 ? -approachX/approachSpeed : cx;
    const nz = d > 1e-8 ? dz / d : approachSpeed>1e-8 ? -approachZ/approachSpeed : cz;
    const bvx = contacts[o + 3] * life / R, bvz = contacts[o + 4] * life / R;
    let vx = cx * s[3] - cz * s[5] - bvx, vz = cz * s[3] + cx * s[5] - bvz;
    const inward = vx * nx + vz * nz;
    const bounce = recipe.contact === 'rebound' ? .36 : 0;
    if (inward < 0) { vx -= nx * inward * (1 + bounce); vz -= nz * inward * (1 + bounce); }
    const friction = recipe.contact === 'adhere' ? .22 : .88;
    vx = vx * friction + bvx; vz = vz * friction + bvz;
    s[3] = cx * vx + cz * vz; s[5] = -cz * vx + cx * vz;
    const separation = Math.max(.002, R * .00015);
    wx = bx + nx * (radius + separation); wz = bz + nz * (radius + separation);
    const qx = wx - m[1], qz = wz - m[3];
    s[0] = (cx * qx + cz * qz) / R; s[2] = (-cz * qx + cx * qz) / R;
    s[8] = Math.min(1, s[8] + Math.max(.08, -inward * .4) * strength);
    s[13]++;
  }
}
// A real footprint and a solid body can have no common empty space. In that case retire
// decorative material; never show a parcel inside a rock or outside the gameplay footprint.
function resolveFootprint(m,s,contacts,count){
  contain(m,s);
  if(!count)return;
  const wx=m[1]+m[6]*(m[4]*s[0]-m[5]*s[2]);
  const wz=m[3]+m[6]*(m[5]*s[0]+m[4]*s[2]);
  for(let i=0;i<Math.min(3,count);i++){
    const o=i*8,r=contacts[o+2];
    if(!(r>0&&contacts[o+6]>0))continue;
    const bx=contacts[o]+contacts[o+3]*s[6],bz=contacts[o+1]+contacts[o+4]*s[6];
    if(Math.hypot(wx-bx,wz-bz)<r-1e-6){s[14]=0;return;}
  }
}
/** Resolve initial overlaps before the very first drawn frame, without consuming lifetime. */
export function settleMaterialParcel(m,s,life,contacts,count){
  collide(m,s,life,0,s[0],s[2],contacts,count);
  resolveFootprint(m,s,contacts,count);
  for(let i=18;i<48;i+=3){s[i]=s[0];s[i+1]=s[1];s[i+2]=s[2];}
}
/** Advance in bounded fixed-size steps. Absolute-age admission replays exactly this same kernel. */
export function advanceMaterialParcel(m, s, life, dt, contacts, count, velocity, scratch, environment=null) {
  if (!(dt > 0) || !Number.isFinite(dt) || !(life > 0)) return;
  let remaining = Math.min(dt, Math.max(0, life - s[6]));
  if(s[14]===0){s[6]+=remaining;return;}
  const recipe = MATERIAL_FLOW_RECIPES[m[0]];
  while (remaining > 1e-10) {
    const step = Math.min(MATERIAL_STEP, remaining), h = step / life;
    materialVelocity(m, s, life, velocity, scratch);
    const relax = 1 - Math.exp(-recipe.response * h);
    const vx = s[3], vy = s[4], vz = s[5], px = s[0], pz = s[2];
    s[9] = vx; s[10] = vy; s[11] = vz;
    s[3] += (velocity[0] - s[3]) * relax;
    s[4] += (velocity[1] - s[4]) * relax;
    s[5] += (velocity[2] - s[5]) * relax;
    advectMaterialEnvironment(m,s,life,step,environment);
    s[0] += (vx + s[3]) * .5 * h; s[1] += (vy + s[4]) * .5 * h; s[2] += (vz + s[5]) * .5 * h;
    s[6] += step; s[8] *= Math.exp(-step * 7);
    collide(m, s, life, step, px, pz, contacts, count);
    resolveFootprint(m, s, contacts, count);
    // Connected goo has an authored substrate height, but planar creep and collision velocity
    // remain integrated. This prevents a disconnected luminous mote after the neck rejoins.
    if (m[0] === 9) s[1] = .055 * Math.sin(Math.PI * s[6] / life) ** 2 * (.65 + m[8] * .35);
    s[12] = clamp((vx * s[5] - vz * s[3]) / Math.max(.01, vx * vx + vz * vz) / Math.max(h, .001), -3, 3);
    // Ten actual advected poses, sampled at 60 Hz, fit inside the particle's warmed state.
    // They are not rebuilt from current velocity: impact bends remain visible in the wake.
    if (s[6] + 1e-9 >= (s[16] + 1) / 60) {
      for (let j = 45; j >= 21; j -= 3) { s[j] = s[j - 3]; s[j + 1] = s[j - 2]; s[j + 2] = s[j - 1]; }
      s[18] = s[0]; s[19] = s[1]; s[20] = s[2]; s[16]++; s[50] = Math.min(MATERIAL_HISTORY_COUNT, s[50] + 1);
    }
    remaining -= step;
  }
}
export function writeMaterialPosition(m, s, out) {
  out.set(m[1] + m[6] * (m[4] * s[0] - m[5] * s[2]), m[2] + m[6] * s[1],
    m[3] + m[6] * (m[5] * s[0] + m[4] * s[2]));
  return out;
}
