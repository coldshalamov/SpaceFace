// Describes the existing Massline while an uvula is on it. Does not spawn a line.

const TAUT = Object.freeze({ sag: 0, width: 2.4, tint: 0xf7f4ee });
const SHORT = Object.freeze({ sag: 18, width: 1.2, tint: 0xc8c2b8 });
const SLACK = Object.freeze({ sag: 42, width: 0.8, tint: 0x8a847c });

function uvulaHold(state) {
  if (!state) return null;
  const phase = state.player && state.player.tether && state.player.tether.phase;
  if (phase !== 'loaded' && phase !== 'overload') return null;
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId) return null;
  const pid = state.playerId;
  const list = state.entityList || [];
  const rows = Object.values(byId);
  for (let i = 0; i < rows.length; i++) {
    const att = rows[i];
    if (!att || att.state !== 'active') continue;
    if (att.ownerId !== pid && att.controllerId !== pid) continue;
    for (let k = 0; k < list.length; k++) {
      const ent = list[k];
      if (!ent || ent.id !== att.targetId || !ent.data || !ent.data.bolus) continue;
      if (ent.data.bolus.role !== 'uvula') continue;
      return Number(ent.data.bolus.hold) || 0;
    }
  }
  return null;
}

export function bolusCableStyle(state) {
  const hold = uvulaHold(state);
  if (hold == null) return SLACK;
  if (hold >= 0.4) return TAUT;
  return SHORT;
}

/** Write the style onto the active uvula attachment. No geometry. */
export function applyBolusCableStyle(state) {
  const style = bolusCableStyle(state);
  const byId = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId) return style;
  const pid = state.playerId;
  const list = state.entityList || [];
  const rows = Object.values(byId);
  for (let i = 0; i < rows.length; i++) {
    const att = rows[i];
    if (!att || att.state !== 'active') continue;
    if (att.ownerId !== pid && att.controllerId !== pid) continue;
    for (let k = 0; k < list.length; k++) {
      const ent = list[k];
      if (!ent || ent.id !== att.targetId || !ent.data || !ent.data.bolus) continue;
      if (ent.data.bolus.role !== 'uvula') continue;
      att.bolusCable = style;
    }
  }
  return style;
}
