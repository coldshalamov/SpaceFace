import { FAUNA_ROLE_SOUND, MACHINE_SOUND_IDS } from '../data/discoveryAudio.js';
import { faunaSpeciesById } from '../data/alienFauna.js';

// Existing physical casts supply positions. No sound-only entities, RNG, timers or new audio bus.
export function tickDiscoverySound(world, cast, kind, player, now) {
  if (!player?.pos || !world.bus || world.state?.paused || world.state?.mode !== 'flight') return false;
  const sector = world.state.world?.currentSectorId;
  const runtime = world._discoverySound ||= { sector, fauna: 0, machine: 0, seen: new Map() };
  if (runtime.sector !== sector) { runtime.sector = sector; runtime.fauna = 0; runtime.machine = 0; runtime.seen.clear(); }
  if (now < runtime[kind]) return false;
  let pick = null, nearest = 900 ** 2;
  for (const entity of cast || []) {
    if (!entity?.pos || entity.alive === false || now < (runtime.seen.get(entity.id) || 0)) continue;
    const distance = (entity.pos.x - player.pos.x) ** 2 + (entity.pos.z - player.pos.z) ** 2;
    if (distance >= nearest) continue;
    const machine = entity.data?.machine;
    const role = faunaSpeciesById(entity.data?.ecology?.speciesId)?.role;
    const id = kind === 'machine' ? (MACHINE_SOUND_IDS.includes(machine?.kind) ? `ambient_machine_${machine.kind}` : null)
      : FAUNA_ROLE_SOUND[role] || null;
    if (!id) continue;
    nearest = distance; pick = { entity, id };
  }
  if (!pick) return false;
  const distance = Math.sqrt(nearest);
  world.bus.emit('audio:cue', { id: pick.id, position: { ...pick.entity.pos },
    gain: .18 + .42 * (1 - distance / 900) });
  runtime[kind] = now + 2.5;
  runtime.seen.set(pick.entity.id, now + 9);
  if (runtime.seen.size > 64) runtime.seen.delete(runtime.seen.keys().next().value);
  return true;
}
