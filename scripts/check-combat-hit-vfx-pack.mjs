/** Behavioral/structural verification for combat contact and damage-layer VFX. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveImpactPresentationProfile } from '../src/render/vfxProfiles.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(OUT, 'combat_hit_vfx_verify.json');
const vfx = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
const physics = readFileSync(resolve(ROOT, 'src/core/physics.js'), 'utf8');
const damage = readFileSync(resolve(ROOT, 'src/combat/damage.js'), 'utf8');
const beams = readFileSync(resolve(ROOT, 'src/render/combat/persistentBeams.js'), 'utf8');
const projectileBlock = vfx.slice(vfx.indexOf('  _onProjectileHit(p)'), vfx.indexOf('  _onDamage(p)'));
const muzzleBlock = vfx.slice(vfx.indexOf('  _spawnMuzzleBallistic('), vfx.indexOf('  _onProjectileHit(p)'));
const damageBlock = vfx.slice(vfx.indexOf('  _onDamage(p)'), vfx.indexOf('  _onPresentationCue(p)'));
const failures = [];
const check = (name, condition, evidence) => {
  const ok = !!condition;
  if (!ok) failures.push(name);
  return { name, ok, evidence };
};

const weaponIds = [
  'wpn_autocannon_m',
  'wpn_railgun_m',
  'wpn_plasma_cannon_m',
  'wpn_beam_laser_m',
  'wpn_missile_rack_m',
  'wpn_emp_disruptor_m',
];
const profiles = weaponIds.map((weaponId) => ({ weaponId, ...resolveImpactPresentationProfile(weaponId) }));
const modes = new Set(profiles.map((profile) => profile.mode));
const shieldBreakStart = damageBlock.indexOf('if (p.brokeShield)');
const shieldBreakEnd = damageBlock.indexOf('} else {', shieldBreakStart);
const shieldBreak = damageBlock.slice(shieldBreakStart, shieldBreakEnd);

const validation = [
  check('six structural impact modes', modes.size === weaponIds.length, [...modes]),
  check('ordinary contacts do not spawn rings', !projectileBlock.includes('SPR_RING'), 'projectile contact block has no SPR_RING'),
  check('ordinary muzzles do not spawn rings', !muzzleBlock.includes('SPR_RING'), 'muzzle block has no SPR_RING'),
  check('muzzle structure consumes family and variant', muzzleBlock.includes('profile.family') && muzzleBlock.includes('profile.variant'), 'structural family branching'),
  check('contacts consume approach and normal', projectileBlock.includes('p.approach') && projectileBlock.includes('p.normal'), 'directional event receipt'),
  check('contacts use pooled directional streaks', projectileBlock.includes('_spawnProjectileTrailStreak'), 'instanced streak pool'),
  check('physics publishes contact direction', physics.includes('approach,') && physics.includes('normal,'), 'projectileHitPayload'),
  check('damage routing preserves contact direction', damage.includes('approach: packet.hit') && damage.includes('normal: packet.hit'), 'combat:damage receipt'),
  check('beam body is persistent and bounded', beams.includes('class PersistentCombatBeamPool') && beams.includes('InstancedMesh'), 'two instanced meshes'),
  check('beam contact retargets and throttles', damageBlock.includes('_combatBeams.retarget') && damageBlock.includes('_beamDamageCueNext'), 'sustained contact path'),
  check('shield break uses attached tears without an annulus', shieldBreak.includes('_spawnProjectileTrailStreak') && !shieldBreak.includes('SPR_RING') && !shieldBreak.includes('SPR_FRESNEL'), 'fixed tangent tears'),
  check('armor and hull material layers remain distinct', damageBlock.includes('p.armorHit') && damageBlock.includes('p.hullHit') && damageBlock.includes('SPR_PUFF'), 'metal ejecta versus cooling residue'),
  check('player damage camera response retained', damageBlock.includes("camera:shake"), 'camera response'),
];

mkdirSync(OUT, { recursive: true });
const report = {
  schema: 'spaceface.combatHitVfxVerify.v2',
  pack: 'combat_hit_vfx',
  profiles,
  validation,
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error('FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checks: validation.length, modes: [...modes], report: REPORT }, null, 2));
