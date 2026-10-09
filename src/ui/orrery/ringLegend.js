// The flight ring names the hull the player gave it. Empty custom name keeps the class name.

export function ringLegendText({ defName = '', classLine = '', customName = '' } = {}) {
  const custom = typeof customName === 'string' ? customName.trim() : '';
  const base = custom || (typeof defName === 'string' ? defName.trim() : '') || 'Hull';
  const cls = typeof classLine === 'string' ? classLine.trim() : '';
  const line = cls ? `${base} · ${cls}` : base;
  return line.toUpperCase();
}
