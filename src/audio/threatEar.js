import { queryNearbyEntities } from '../core/spatialQuery.js';

export const THREAT_EAR_CAP = 6;
export function threatEarBearing(player, entity) {
  const dx = entity.pos.x - player.pos.x, dz = entity.pos.z - player.pos.z;
  const rot = Number(player.rot) || 0;
  const right = dx * -Math.sin(rot) + dz * Math.cos(rot);
  const forward = dx * Math.cos(rot) + dz * Math.sin(rot);
  const distance = Math.hypot(dx, dz);
  return { right, forward, distance, cutoff: forward < 0 ? 1500 : 6000 };
}

export function createThreatEar(ctx, destination) {
  const voices = new Map(), scratch = [];
  const stop = voice => { try { voice.osc.stop(); } catch (_) {} for (const n of [voice.osc, voice.filter, voice.gain, voice.pan]) try { n.disconnect(); } catch (_) {} };
  return {
    voices,
    update(state, player, enabled = true) {
      const chosen = [];
      if (enabled && player && player.alive !== false && player.pos) {
        const fallback = state.entityIndex?.ships || state.entityList || [];
        for (const e of queryNearbyEntities(state, player.pos, 1600, scratch, fallback)) {
          if (!e?.alive || e.type !== 'ship' || e.id === player.id || e.team === player.team || !e.pos) continue;
          const combat = e.data?.combat;
          if (combat?.targetId !== player.id && combat?.lockTarget !== player.id) continue;
          const bearing = threatEarBearing(player, e);
          if (bearing.distance <= 1600) chosen.push({ e, bearing });
        }
        chosen.sort((a, b) => a.bearing.distance - b.bearing.distance || String(a.e.id).localeCompare(String(b.e.id)));
        chosen.length = Math.min(THREAT_EAR_CAP, chosen.length);
      }
      const live = new Set(chosen.map(v => v.e.id));
      for (const [id, voice] of voices) if (!live.has(id)) { stop(voice); voices.delete(id); }
      for (const { e, bearing } of chosen) {
        let v = voices.get(e.id);
        if (!v) {
          const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
          const pan = typeof ctx.createPanner === 'function' ? ctx.createPanner() : ctx.createStereoPanner();
          osc.type = 'triangle'; osc.frequency.value = 96 + (Number(e.id) || 0) % 7 * 13;
          filter.type = 'lowpass';
          gain.gain.value = 0;
          if ('panningModel' in pan || !pan.pan) {
            pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 1; pan.maxDistance = 8; pan.rolloffFactor = 1;
          }
          osc.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(destination); osc.start();
          v = { osc, filter, gain, pan }; voices.set(e.id, v);
        }
        const t = ctx.currentTime;
        v.filter.frequency.setTargetAtTime(bearing.cutoff, t, 0.08);
        v.gain.gain.setTargetAtTime(0.018 * Math.max(0, 1 - bearing.distance / 1800), t, 0.1);
        const x = bearing.right / 200, z = -bearing.forward / 200;
        if (v.pan.positionX) {
          v.pan.positionX.setTargetAtTime(x, t, 0.08); v.pan.positionY.setTargetAtTime(0, t, 0.08); v.pan.positionZ.setTargetAtTime(z, t, 0.08);
        } else if (v.pan.setPosition) v.pan.setPosition(x, 0, z);
        else if (v.pan.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, x / 4)), t, 0.08);
      }
    },
    destroy() { for (const voice of voices.values()) stop(voice); voices.clear(); },
  };
}
