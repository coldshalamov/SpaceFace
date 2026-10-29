// Primary actions must work on arrival, even when the text audit finds nothing wrong.
const PRIMARY_CONTROLS = {
  station: [
    ['.sx-dock__group--nav [role="tab"]', 'Station tab'],
    ['.sx-mkt [data-mode="buy"]', 'Market BUY'],
    ['.sx-mkt [data-mode="sell"]', 'Market SELL'],
    ['.sx-mkt .sx-qty', 'Market quantity dial'],
    ['.sx-mkt .sx-qty__in', 'Market quantity input'],
    ['.sx-mkt .sx-qty__b, .sx-mkt .sx-qty__max', 'Market quantity step'],
    ['.sxb-launch', 'UNDOCK'],
    ['.sx-comms__toggle', 'COMMS'],
    ['.sxb-help', 'HELP'],
    ['.sx-receipt', 'TRADE CLEARED'],
  ],
  pause: [['.orr-pause [data-action], .orr-pause--phone [data-action]', 'Pause menu']],
  mainMenu: [['.orr-title [data-action], .orr-title--phone [data-action]', 'Title menu']],
};

/** Snapshot visible controls with a semantic identity that survives screen remounts. */
export function snapshotBenchControls(elements) {
  const controls = [...(elements || [])];
  const totals = new Map();
  for (const element of controls) {
    const base = controlIdentityBase(element);
    totals.set(base, (totals.get(base) || 0) + 1);
  }
  const duplicateCounts = new Map();
  return controls.map((element, index) => {
    const base = controlIdentityBase(element);
    const duplicate = duplicateCounts.get(base) || 0;
    duplicateCounts.set(base, duplicate + 1);
    return {
      element,
      index,
      label: controlLabel(element),
      identity: `${base}#${duplicate}/${totals.get(base)}`,
      ambiguous: totals.get(base) > 1,
    };
  });
}

/** Resolve the recorded identity against the current DOM; numeric indices remain for manual probes. */
export function resolveBenchControl(elements, reference) {
  const rows = snapshotBenchControls(elements);
  return typeof reference === 'number'
    ? (rows[reference] || null)
    : (rows.find((row) => row.identity === reference && !row.ambiguous) || null);
}

function controlIdentityBase(element) {
  const attr = (name) => element?.getAttribute?.(name) || '';
  const ancestors = [];
  for (let node = element?.parentElement; node && ancestors.length < 4; node = node.parentElement) {
    const identity = [
      node.id || '',
      node.getAttribute?.('data-section') || '',
      node.getAttribute?.('data-testid') || '',
      node.getAttribute?.('aria-label') || '',
      node.getAttribute?.('role') || '',
    ];
    if (identity.some(Boolean)) ancestors.push(identity);
  }
  return JSON.stringify({
    tag: String(element?.tagName || '').toLowerCase(),
    id: element?.id || '',
    action: element?.dataset?.action || '',
    testid: attr('data-testid'),
    name: attr('name'),
    type: attr('type'),
    role: attr('role'),
    ariaLabel: attr('aria-label'),
    title: attr('title'),
    href: attr('href'),
    label: controlLabel(element),
    ancestors,
  });
}

function controlLabel(element) {
  return (element?.getAttribute?.('aria-label') || element?.innerText
    || element?.dataset?.action || element?.textContent || '')
    .trim().replace(/\s+/g, ' ').slice(0, 48);
}

export function measureControlReachability(doc, surface) {
  const view = doc.defaultView, findings = [];
  const viewport = `${view.innerWidth}×${view.innerHeight}`;
  for (const [selector, name] of PRIMARY_CONTROLS[surface] || []) {
    for (const el of doc.querySelectorAll(selector)) {
      // The status region exists before a trade, but is deliberately absent from the picture.
      if (name === 'TRADE CLEARED' && el.hidden) continue;
      // The product removed this action on purpose (Quit in a browser, Continue with no save): the
      // `hidden` property on it or a containing row is intent. CSS that hides an applicable action
      // is still a finding below.
      let omitted = false;
      for (let node = el; node && node.nodeType !== 9; node = node.parentElement || node.parentNode) if (node.hidden === true) { omitted = true; break; }
      if (omitted) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48);
      const prefix = `"${name}${label ? ` ${label}` : ''}" at ${viewport}`;
      const style = view.getComputedStyle(el);
      // Visibility can be restored by a child; display and opacity cannot.
      let hidden = /hidden|collapse/.test(style.visibility) ? `visibility:${style.visibility}` : '';
      for (let node = el; node; node = node.parentElement || node.parentNode) {
        if (node.nodeType === 9) break;
        const s = view.getComputedStyle(node);
        if (s.display === 'none' || Number(s.opacity) === 0) {
          hidden = `display:${s.display}, visibility:${s.visibility}, opacity:${s.opacity}`;
          break;
        }
      }
      if (hidden || style.pointerEvents === 'none') {
        findings.push(`${prefix}: style prevents reachability (${hidden || 'pointer-events:none'})`);
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.left < 0 || r.top < 0 || r.right > view.innerWidth || r.bottom > view.innerHeight) {
        findings.push(`${prefix}: rect is not fully inside the viewport (${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)})`);
      }
      const top = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || (top !== el && !el.contains(top))) {
        const blocker = top ? `${top.tagName.toLowerCase()}${top.className ? `.${String(top.className).trim().replace(/\s+/g, '.')}` : ''}` : 'nothing';
        findings.push(`${prefix}: centre hit reaches ${blocker}`);
      }
    }
  }
  return findings;
}
