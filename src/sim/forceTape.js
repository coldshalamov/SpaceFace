// Read-only, bounded force channels shared by the adventure tape and the death camera.
// Tick writes reuse typed arrays and primitive identity slots; only sealing/reading allocates.
export const FORCE_TAPE_MAX_LINES = 6;
export const FORCE_TAPE_MAX_FIELDS = 7;
const LINE_STRIDE = 7; // ax, az, bx, bz, tension, load, restLength
const FIELD_STRIDE = 8; // x, z, dx, dz, radius, halfAngle, halfWidth, engaged
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;

export function createForceTapeRecorder(sampleCount) {
  const capacity = Math.max(2, sampleCount | 0);
  const lines = new Float32Array(capacity * FORCE_TAPE_MAX_LINES * LINE_STRIDE);
  const lineIds = new Array(capacity * FORCE_TAPE_MAX_LINES).fill(null);
  const sourceIds = new Array(lineIds.length).fill(null);
  const targetIds = new Array(lineIds.length).fill(null);
  const fields = new Float32Array(capacity * FORCE_TAPE_MAX_FIELDS * FIELD_STRIDE);
  const fieldIds = new Array(capacity * FORCE_TAPE_MAX_FIELDS).fill(null);
  const fieldKinds = new Array(fieldIds.length).fill(null);
  const lineCounts = new Uint8Array(capacity), fieldCounts = new Uint8Array(capacity);
  const sequences = new Float64Array(capacity).fill(-1);
  let newest = -1;

  function putLine(slot, count, state, id, sourceId, targetId, link, mirror) {
    if (count >= FORCE_TAPE_MAX_LINES) return count;
    const source = state.entities?.get(sourceId), target = state.entities?.get(targetId);
    if (!source?.pos || !target?.pos || source.alive === false || target.alive === false) return count;
    const at = slot * FORCE_TAPE_MAX_LINES + count, b = at * LINE_STRIDE;
    const a = link?.sourceAnchorLocal, z = link?.targetAnchorLocal;
    const ar = finite(source.rot), br = finite(target.rot);
    lines[b] = finite(source.pos.x) + finite(a?.x) * Math.cos(ar) - finite(a?.z) * Math.sin(ar);
    lines[b + 1] = finite(source.pos.z) + finite(a?.x) * Math.sin(ar) + finite(a?.z) * Math.cos(ar);
    lines[b + 2] = finite(target.pos.x) + finite(z?.x) * Math.cos(br) - finite(z?.z) * Math.sin(br);
    lines[b + 3] = finite(target.pos.z) + finite(z?.x) * Math.sin(br) + finite(z?.z) * Math.cos(br);
    const telemetry = link?.masslineTelemetry;
    const ceiling = link?.tetherPolicy?.break?.maxTension;
    lines[b + 4] = finite(mirror?.tensionEstimate, finite(telemetry?.tensionFraction,
      ceiling > 0 ? finite(link?.lastTension) / ceiling : finite(mirror?.strain)));
    lines[b + 5] = finite(mirror?.load, finite(link?.load, lines[b + 4]));
    lines[b + 6] = finite(link?.restLength, finite(mirror?.restLength));
    lineIds[at] = id; sourceIds[at] = sourceId; targetIds[at] = targetId;
    return count + 1;
  }

  return {
    capacity,
    clear() {
      newest = -1; sequences.fill(-1); lineCounts.fill(0); fieldCounts.fill(0);
      lineIds.fill(null); sourceIds.fill(null); targetIds.fill(null);
      fieldIds.fill(null); fieldKinds.fill(null);
    },
    note(state, sequence) {
      const slot = sequence % capacity;
      let count = 0;
      const mirror = state.player?.tether, byId = state.combat?.attachments?.byId;
      // The player's line has first refusal; busy traffic can never push it out of the tape.
      if (mirror?.active) {
        const link = byId?.[mirror.attachmentId];
        count = putLine(slot, count, state, mirror.attachmentId ?? 'player-line',
          link?.ownerId ?? state.playerId, mirror.targetId, link, mirror);
      }
      for (const id in byId) {
        const link = byId[id];
        if (!link || link.state !== 'active' || link.defId !== 'tether_standard'
          || (mirror?.active && link.id === mirror.attachmentId)) continue;
        count = putLine(slot, count, state, link.id ?? id, link.ownerId, link.targetId, link, null);
        if (count >= FORCE_TAPE_MAX_LINES) break;
      }
      lineCounts[slot] = count;
      const active = state.fields?.active;
      count = 0;
      for (let i = 0; i < (active?.length || 0) && count < FORCE_TAPE_MAX_FIELDS; i++) {
        const f = active[i];
        if (!f?.center || !Number.isFinite(f.center.x) || !Number.isFinite(f.center.z) || !(f.radius > 0)) continue;
        const at = slot * FORCE_TAPE_MAX_FIELDS + count++, b = at * FIELD_STRIDE;
        fields[b] = f.center.x; fields[b + 1] = f.center.z;
        fields[b + 2] = finite(f.dir?.x, 1); fields[b + 3] = finite(f.dir?.z);
        fields[b + 4] = f.radius; fields[b + 5] = finite(f.halfAngleRad, 0.56);
        fields[b + 6] = finite(f.halfWidth, 52); fields[b + 7] = f.engaged ? 1 : 0;
        fieldIds[at] = f.id; fieldKinds[at] = f.kind;
      }
      fieldCounts[slot] = count;
      sequences[slot] = sequence; newest = Math.max(newest, sequence);
    },
    read(sequence) {
      const slot = sequence % capacity;
      if (sequence < 0 || sequences[slot] !== sequence) return null;
      const out = { lines: [], fields: [] };
      for (let i = 0; i < lineCounts[slot]; i++) {
        const at = slot * FORCE_TAPE_MAX_LINES + i, b = at * LINE_STRIDE;
        out.lines.push({ id: lineIds[at], sourceId: sourceIds[at], targetId: targetIds[at],
          ax: lines[b], az: lines[b + 1], bx: lines[b + 2], bz: lines[b + 3],
          tension: lines[b + 4], load: lines[b + 5], restLength: lines[b + 6] });
      }
      for (let i = 0; i < fieldCounts[slot]; i++) {
        const at = slot * FORCE_TAPE_MAX_FIELDS + i, b = at * FIELD_STRIDE;
        out.fields.push({ id: fieldIds[at], kind: fieldKinds[at],
          center: { x: fields[b], z: fields[b + 1] }, dir: { x: fields[b + 2], z: fields[b + 3] },
          radius: fields[b + 4], halfAngleRad: fields[b + 5], halfWidth: fields[b + 6], engaged: fields[b + 7] === 1 });
      }
      return out;
    },
    encode(from, to) {
      const frames = [];
      for (let sequence = Math.max(from, newest - capacity + 1); sequence <= Math.min(to, newest); sequence++) {
        const frame = this.read(sequence);
        if (frame) frames.push({ sample: sequence - from, ...frame });
      }
      return frames;
    },
  };
}
