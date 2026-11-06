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
  const modal = activeModal(doc, view);
  const controls = (PRIMARY_CONTROLS[surface] || []).flatMap(([selector, name]) =>
    [...doc.querySelectorAll(selector)].map(el => ({ el, name })));
  // A modal owns pointer input while it is open. Check its own actions, but do not report the
  // otherwise-valid screen controls behind it as blocked by the dialog that intentionally covers
  // them. The regular screen primaries continue to be checked when no nested modal is active.
  if (modal && !isScreenRoot(modal)) {
    for (const el of modal.querySelectorAll?.('button, [role="button"], [role="option"], input, select, textarea') || []) {
      if (!el.disabled && el.getAttribute?.('aria-disabled') !== 'true') controls.push({ el, name: 'Active dialog action' });
    }
  }
  for (const { el, name } of controls) {
      // The top modal is the active interaction surface. Underlying controls are deferred until it
      // closes; their hit points cannot establish a product defect while the modal owns input.
      if (modal && !modal.contains?.(el)) continue;
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
      if (r.width <= 0 || r.height <= 0) {
        findings.push(`${prefix}: rect has no visible area`);
        continue;
      }
      const visibility = visibleControlRect(doc, el, r, view);
      const offscreenX = r.left < 0 || r.right > view.innerWidth;
      const offscreenY = r.top < 0 || r.bottom > view.innerHeight;
      const canScrollIntoView = visibility.clippedByScrollableAncestor && !visibility.blockedByClip
        && (!offscreenX || visibility.scrollableX) && (!offscreenY || visibility.scrollableY);
      if (!canScrollIntoView && (r.left < 0 || r.top < 0 || r.right > view.innerWidth || r.bottom > view.innerHeight)) {
        findings.push(`${prefix}: rect is not fully inside the viewport (${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)})`);
      }
      // Test a point the user can currently see. A center outside a scrollport is not a pointer
      // interception; if that scrollport can bring the control into view, defer the hit test until
      // the route scrolls it there. A non-scrollable clipping ancestor remains a real failure.
      if (!visibility.rect && canScrollIntoView) continue;
      if (!visibility.rect) {
        findings.push(`${prefix}: fully clipped by a non-scrollable ancestor`);
        continue;
      }
      const hitX = (visibility.rect.left + visibility.rect.right) / 2;
      const hitY = (visibility.rect.top + visibility.rect.bottom) / 2;
      const top = doc.elementFromPoint(hitX, hitY);
      if (!top || (top !== el && !el.contains(top))) {
        const blocker = top ? `${top.tagName.toLowerCase()}${top.className ? `.${String(top.className).trim().replace(/\s+/g, '.')}` : ''}` : 'nothing';
        findings.push(`${prefix}: centre hit reaches ${blocker}`);
      }
  }
  return findings;
}

function activeModal(doc, view) {
  let modals = [];
  // Prefer the browser's actual top-layer modal query (which distinguishes showModal() from a
  // merely open dialog). Fall back to the app's explicit aria-modal owners for custom dialogs.
  try { modals = [...doc.querySelectorAll('dialog:modal')]; } catch { /* older DOM implementation */ }
  if (!modals.length) {
    try { modals = [...doc.querySelectorAll('[aria-modal="true"]')]; } catch { return null; }
  }
  return modals.filter(el => isVisibleElement(el, view)).at(-1) || null;
}

function isScreenRoot(el) {
  return !!(el.matches?.('.screen[data-screen], [data-screen][role="dialog"]'));
}

function isVisibleElement(el, view) {
  if (!el || el.hidden) return false;
  for (let node = el; node && node.nodeType !== 9; node = node.parentElement || node.parentNode) {
    if (node.hidden) return false;
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || /hidden|collapse/.test(style.visibility) || Number(style.opacity) === 0) return false;
  }
  const rect = el.getBoundingClientRect?.();
  return !!rect && rect.width > 0 && rect.height > 0;
}

function visibleControlRect(doc, el, rect, view) {
  const visible = { left: Math.max(0, rect.left), top: Math.max(0, rect.top),
    right: Math.min(view.innerWidth, rect.right), bottom: Math.min(view.innerHeight, rect.bottom) };
  const clipRegion = { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight };
  let scrollableX = false, scrollableY = false, blockedX = false, blockedY = false;
  for (let node = el.parentElement || el.parentNode; node && node.nodeType !== 9; node = node.parentElement || node.parentNode) {
    const style = view.getComputedStyle(node);
    const clipX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX || style.overflow || 'visible');
    const clipY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY || style.overflow || 'visible');
    if (!clipX && !clipY) continue;
    const bounds = node.getBoundingClientRect?.();
    if (!bounds) continue;
    const left = bounds.left + (node.clientLeft || 0), top = bounds.top + (node.clientTop || 0);
    const right = left + (node.clientWidth || bounds.width), bottom = top + (node.clientHeight || bounds.height);
    const outsideX = clipX && (rect.left < left || rect.right > right);
    const outsideY = clipY && (rect.top < top || rect.bottom > bottom);
    const scrollX = clipX && /^(auto|scroll)$/.test(style.overflowX || style.overflow || '')
      && (node.scrollWidth || 0) > (node.clientWidth || bounds.width) + 1 && rect.width <= (node.clientWidth || bounds.width) + 1;
    const scrollY = clipY && /^(auto|scroll)$/.test(style.overflowY || style.overflow || '')
      && (node.scrollHeight || 0) > (node.clientHeight || bounds.height) + 1 && rect.height <= (node.clientHeight || bounds.height) + 1;
    // Walk from the control outward: a deeper scroller can move its child through a fixed outer
    // clip, but an outer scroller cannot undo a child already clipped by an inner hidden frame.
    if (outsideX && !scrollX && !scrollableX) blockedX = true;
    if (outsideY && !scrollY && !scrollableY) blockedY = true;
    if (scrollX) scrollableX = true;
    if (scrollY) scrollableY = true;
    if (clipX) { visible.left = Math.max(visible.left, left); visible.right = Math.min(visible.right, right); }
    if (clipY) { visible.top = Math.max(visible.top, top); visible.bottom = Math.min(visible.bottom, bottom); }
    if (clipX) { clipRegion.left = Math.max(clipRegion.left, left); clipRegion.right = Math.min(clipRegion.right, right); }
    if (clipY) { clipRegion.top = Math.max(clipRegion.top, top); clipRegion.bottom = Math.min(clipRegion.bottom, bottom); }
  }
  // A nested scroll can resolve multiple outer clipping bounds only when their shared visible
  // aperture is large enough to contain the control. A tiny overlap is still genuinely blocked.
  scrollableX = scrollableX && clipRegion.right - clipRegion.left >= rect.width;
  scrollableY = scrollableY && clipRegion.bottom - clipRegion.top >= rect.height;
  const outsideClipX = rect.left < clipRegion.left || rect.right > clipRegion.right;
  const outsideClipY = rect.top < clipRegion.top || rect.bottom > clipRegion.bottom;
  return {
    rect: visible.right > visible.left && visible.bottom > visible.top ? visible : null,
    clippedByScrollableAncestor: (outsideClipX && scrollableX) || (outsideClipY && scrollableY),
    blockedByClip: (outsideClipX && !scrollableX) || (outsideClipY && !scrollableY) || blockedX || blockedY,
    scrollableX, scrollableY,
  };
}
