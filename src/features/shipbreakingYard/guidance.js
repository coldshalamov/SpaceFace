/** A foreman's next physical step, derived from the live work graph, not a quest counter.
 * Advice never releases hardware, changes custody, or authorizes a stale command. */
export function yardWorkGuidance(job, layout, { couplingReason = () => null, body = () => null } = {}) {
  if (!job || !layout || !['working', 'parked'].includes(job.status)) return null;
  const active = layout.modules.filter(m => !['delivered', 'lost'].includes(job.modules[m.id]?.status));
  const live = m => { const e = body(m.id); return e && e.alive !== false && e.hull > 0; };
  const links = m => layout.couplings.filter(c => (c.a === m.id || c.b === m.id) && job.couplings[c.id]?.status === 'connected');
  // Finish the loose load before inviting another cut. This also clears a real extraction lane.
  const loose = active.find(m => live(m) && links(m).length === 0);
  if (loose) return { moduleId: loose.id, kind: 'tow', label: `Recover ${loose.label}`,
    detail: `${loose.label} is free: tow it to the receiving scale on your MassLine.` };
  const safeLink = m => links(m).find(c => !couplingReason(c));
  const beginner = active.find(m => m.beginner && live(m) && safeLink(m));
  if (beginner) {
    const link = safeLink(beginner);
    return { moduleId: beginner.id, kind: 'release', label: `Work on ${beginner.label}`,
      detail: `Hold ${beginner.label} on your MassLine, then release ${link.label}.` };
  }
  const pressure = active.find(m => m.hazardous && live(m) && !job.hazard.vented && !job.hazard.burst);
  if (pressure) return { moduleId: pressure.id, kind: 'vent', label: `Inspect ${pressure.label} pressure`,
    detail: `${pressure.label} is still charged: vent it at the service port first.` };
  const coupling = layout.couplings.find(c => job.couplings[c.id]?.status === 'connected'
    && active.some(m => m.id === c.b && live(m)) && !couplingReason(c));
  if (coupling) {
    const part = active.find(m => m.id === coupling.b);
    return { moduleId: part.id, kind: 'release', label: `Work on ${part.label}`,
      detail: `Hold ${part.label} on your MassLine, then release ${coupling.label}.` };
  }
  return null;
}

/** A natural stopping point, not whole-job completion or a new payout.
 * Read the same receipts that survive Continue; never store a second progress flag. */
export function yardSortingShiftCloseout(job, layout) {
  if (!job || layout?.id !== 'lark' || layout.variant < 6 || layout.variant > 11
      || !['working', 'parked'].includes(job.status)) return null;
  const loads = ['engine', 'cargo'].map(id => job.modules[id]);
  if (!loads.every((part, index) => part?.status === 'delivered' && part.receipt?.jobId === job.id
      && part.receipt.moduleId === ['engine', 'cargo'][index]
      && Number.isFinite(part.receipt.credits))) return null;
  const remaining = layout.modules.filter(part => !['delivered', 'lost'].includes(job.modules[part.id]?.status));
  if (!remaining.length) return null;
  const earned = loads.reduce((sum, part) => sum + part.receipt.credits, 0);
  return {
    detail: `Sorting shift settled: ${earned} cr earned against your ${job.paidCr} cr claim.`,
  };
}
