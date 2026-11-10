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
    detail: `${loose.label} is free. Take this original on your MassLine to the receiving scale, brake and keep the line attached for handover.` };
  const safeLink = m => links(m).find(c => !couplingReason(c));
  const beginner = active.find(m => m.beginner && live(m) && safeLink(m));
  if (beginner) {
    const link = safeLink(beginner);
    return { moduleId: beginner.id, kind: 'release', label: `Work on ${beginner.label}`,
      detail: `Control ${beginner.label} with your MassLine, then inspect ${link.label}. Release this connection gently; other connections may still hold the original.` };
  }
  const pressure = active.find(m => m.hazardous && live(m) && !job.hazard.vented && !job.hazard.burst);
  if (pressure) return { moduleId: pressure.id, kind: 'vent', label: `Inspect ${pressure.label} pressure`,
    detail: `${pressure.label} is still charged. Inspect its service port and vent before opening the live couplings. The controlled vent still produces physical recoil.` };
  const coupling = layout.couplings.find(c => job.couplings[c.id]?.status === 'connected'
    && active.some(m => m.id === c.b && live(m)) && !couplingReason(c));
  if (coupling) {
    const part = active.find(m => m.id === coupling.b);
    return { moduleId: part.id, kind: 'release', label: `Work on ${part.label}`,
      detail: `Control ${part.label} before inspecting ${coupling.label}. This connection can be released now; the original remains physical, and any other clamps still hold it.` };
  }
  return null;
}
