// Phase 2b system #6 bench: weapon time-to-kill + heat. The REAL weapons/combat/damage path:
// the player's fitted weapon fires continuously (locked target, cursor on it) at one enemy built by
// the production spawn spec (shield -> armor -> hull, armorFlat, regen) at its minimum level.
//   dummy: the enemy is pinned 150 wu ahead (AI runs but its pose is reset every tick) -> the
//          weapon's own TTK with every round on target, heat/vent rhythm included.
//   live:  AI free, player holds position and keeps the nose on the target (helm) -> TTK with
//          real evasion folded in (cap 60 s).
// Player is invulnerable. Reports TTK, shots, hits, rounds/s, vents, duty (share of the fight the
// gun could fire), damage per layer, overkill on the killing shot.
import { createLabWorld, wrapAngle, SIM_DT } from '../labWorld.mjs';
import { ENEMY_TYPES } from '../../../src/data/enemies.js';
import * as weaponsModule from '../../../src/systems/weapons.js';

export const WEAPONS = ['wpn_pulse_laser_s', 'wpn_autocannon_s', 'wpn_concussion_cannon_s', 'wpn_flak_turret_s',
  'wpn_pulse_laser_m', 'wpn_bank_stream_m', 'wpn_autocannon_m', 'wpn_beam_laser_m', 'wpn_railgun_m',
  'wpn_plasma_cannon_m', 'wpn_missile_rack_m', 'wpn_emp_disruptor_m', 'wpn_rcs_disruptor_m', 'wpn_concussion_cannon_m'];
export const ENEMIES = ENEMY_TYPES.filter((d) => !/boss|queen|tendril|regent|foreman/.test(d.id)).map((d) => d.id);
const DEF = new Map(ENEMY_TYPES.map((d) => [d.id, d]));
import { WEAPONS as WEAPON_LIST } from '../../../src/data/weapons.js';
const WDEF = new Map((Array.isArray(WEAPON_LIST) ? WEAPON_LIST : Object.values(WEAPON_LIST || {})).map((d) => [d.id, d]));

export const SCENARIOS = {};
for (const w of WEAPONS) for (const e of ENEMIES) {
  SCENARIOS[`${w.replace('wpn_', '')}|${e}|dummy`] = { weapon: w, enemy: e, mode: 'dummy', dist: 150, capS: 60 };
}
export const LIVE_ENEMIES = ['wasp_swarmer', 'corsair_raider', 'reaver_pirate', 'lancer_sniper', 'bruiser_brawler', 'detonator_dart', 'quiet_ghost', 'mine_layer_jackal'];
for (const w of WEAPONS) for (const e of LIVE_ENEMIES) {
  SCENARIOS[`${w.replace('wpn_', '')}|${e}|live`] = { weapon: w, enemy: e, mode: 'live', dist: 220, capS: 60 };
}
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS).filter((k) => k.startsWith('pulse_laser_s|'));

const hp = (e) => (e ? Math.max(0, e.shield || 0) + Math.max(0, e.armorHp || 0) + Math.max(0, e.hull || 0) : 0);

export async function runScenario(id, { seed = 1, bundle = 'focused', params = {} } = {}) {
  const sc = typeof id === 'object' ? id : (SCENARIOS[id] || parseId(id));
  if (typeof weaponsModule.setWeaponBalanceLab === 'function') weaponsModule.setWeaponBalanceLab(params.weaponLab || {});
  const world = await createLabWorld({ seed, bundle, settings: { controlScheme: 'pilot' } });
  try {
    // S weapons on the Hitch (starter), M weapons on the Drifter (first M hardpoint is forward).
    const size = (WDEF.get(sc.weapon) || {}).size || 'S';
    const shipId = sc.shipId || (size === 'M' ? 'ship_drifter' : 'ship_kestrel');
    const modules = shipId === 'ship_kestrel' ? [sc.weapon, 'mod_engine_ion_m', 'mod_shield_booster_s'] : [sc.weapon];
    world.spawnPlayer({ shipId, modules, pos: { x: 0, z: 0 }, rot: 0 });
    const level = sc.level || (DEF.get(sc.enemy).levelRange || [1])[0];
    const pin = { x: sc.dist, z: 0 };
    const en = world.spawnEnemy({ typeId: sc.enemy, level, pos: { ...pin }, rot: Math.PI });
    await world.prepare();
    const ws = world.player().data.weapons || [];
    const w = ws.find((x) => (x.defId || x.id) === sc.weapon);
    if (!w) throw new Error(`weapon ${sc.weapon} did not fit on ${shipId} (got ${ws.map((x) => x.defId || x.id).join(',')})`);
    for (const x of ws) if (x !== w) { x._disabledByLab = true; x.enabled = false; }
    const pl = world.player();
    pl.flags = pl.flags || {}; pl.flags.invuln = true; pl._invulnUntil = Infinity;
    const hp0 = hp(en);
    const layers0 = { shield: en.shield || 0, armor: en.armorHp || 0, hull: en.hull || 0 };
    let shots = 0, hits = 0, firstShot = null, killTick = null, lastHitDmg = null, prevHp = hp0;
    const bus = world.runtime.bus;
    bus.on('combat:fire', (ev) => { if (ev && ev.ownerId === world.state.playerId) { shots++; if (firstShot == null) firstShot = world.state.tick; } });
    let ventTicks = 0, vents = 0, wasVent = false, heatPeak = 0, canFireTicks = 0;
    const capTicks = Math.round(sc.capS / SIM_DT);
    let t = 0;
    for (; t < capTicks; t++) {
      const alive = en.alive !== false && world.state.entities.get(en.id) === en && (en.hull || 0) > 0;
      if (!alive) { killTick = world.state.tick; break; }
      world.state.player.targetId = en.id;
      world.aim.x = en.pos.x; world.aim.z = en.pos.z;
      // Keep the nose on the target (fixed mounts): yaw toward it with A/D.
      const err = wrapAngle(Math.atan2(en.pos.z - pl.pos.z, en.pos.x - pl.pos.x) - pl.rot);
      const keys = Math.abs(err) > 0.03 ? [err > 0 ? 'KeyD' : 'KeyA'] : [];
      world.keys(keys, { fire: t > 20 });
      world.step();
      if (sc.mode === 'dummy' && world.state.entities.get(en.id) === en) {
        en.pos.x = pin.x; en.pos.z = pin.z; en.vel.x = 0; en.vel.z = 0; en.rot = Math.PI; if ('angVel' in en) en.angVel = 0;
      }
      pl.pos.x = 0; pl.pos.z = 0; pl.vel.x = 0; pl.vel.z = 0;
      const now = hp(en);
      if (now < prevHp - 1e-9) { hits++; lastHitDmg = prevHp - now; }
      prevHp = now;
      const venting = (pl.data.weaponVentUntil || 0) > (world.state.simTime || 0);
      if (venting) ventTicks++;
      if (venting && !wasVent) vents++;
      wasVent = venting;
      heatPeak = Math.max(heatPeak, w._heat || 0);
      if (t > 20 && !venting) canFireTicks++;
    }
    const fightTicks = (killTick != null ? killTick : world.state.tick) - (firstShot != null ? firstShot : world.state.tick);
    const ttk = killTick != null && firstShot != null ? (killTick - firstShot) * SIM_DT : null;
    const fightS = Math.max(SIM_DT, fightTicks * SIM_DT);
    return {
      key: `${sc.weapon}|${sc.enemy}|${sc.mode}|L${level}`, weapon: sc.weapon, shipId, otherWeapons: ws.length - 1, enemy: sc.enemy, mode: sc.mode, level, seed,
      ehp: +hp0.toFixed(1), layers0, killed: killTick != null, ttkS: ttk == null ? null : +ttk.toFixed(3),
      shots, hits, roundsPerS: +(shots / fightS).toFixed(3), vents, ventS: +(ventTicks * SIM_DT).toFixed(2),
      duty: +(1 - Math.min(ventTicks, fightTicks) / Math.max(1, fightTicks)).toFixed(3), heatPeak: +heatPeak.toFixed(1),
      dmgPerHit: hits ? +((hp0 - prevHp) / hits).toFixed(2) : null, killingHit: lastHitDmg == null ? null : +lastHitDmg.toFixed(2),
      leftHp: +prevHp.toFixed(1), dps: +((hp0 - prevHp) / fightS).toFixed(2),
    };
  } finally {
    world.dispose();
    if (typeof weaponsModule.setWeaponBalanceLab === 'function') weaponsModule.setWeaponBalanceLab({});
  }
}

function parseId(id) {
  const [w, e, mode] = String(id).split('|');
  return { weapon: `wpn_${w}`, enemy: e, mode: mode || 'dummy', dist: 150, capS: 60 };
}

export function summarizeRuns(runs) { return runs; }
