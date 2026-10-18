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
