// Ordinary mouse flight uses the platform cursor. Its visibility and position must not
// depend on a sim input flag, a remembered mouse event, focus bookkeeping or a drawn frame.
export function flightCursorMode(state, flightVisible, centeredSightVisible) {
  if (!flightVisible) return 'ui';
  return state?.input?.autoFire && centeredSightVisible ? 'stick' : 'mouse';
}

export function nativeFlightCursorCss({ lamp, hot, outline }) {
  const escape = value => String(value).replace(/[&"<>]/g, c => ({
    '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;',
  }[c]));
  // Same open gunsight as the flight marker, with a dark keyline so it remains legible
  // over bright hulls and planets. Colours come from the live Deckplate palette.
  const shape = '<circle cx="50" cy="50" r="30"/>'
    + '<path d="M50 6V20M50 80V94M6 50H20M80 50H94"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 100 100">'
    + `<g fill="none" stroke="${escape(outline)}" stroke-width="7" stroke-linecap="round">${shape}</g>`
    + `<g fill="none" stroke="${escape(lamp)}" stroke-width="3" stroke-linecap="round">${shape}</g>`
    + `<circle cx="50" cy="50" r="5" fill="${escape(outline)}"/>`
    + `<circle cx="50" cy="50" r="3" fill="${escape(hot)}"/></svg>`;
  return `body.sf-flight-pointer, body.sf-flight-pointer * {
    cursor: url("data:image/svg+xml,${encodeURIComponent(svg)}") 24 24, crosshair !important;
  }`;
}

export function installNativeFlightCursor(doc) {
  const style = doc.createElement('style');
  let destroyed = false;
  const refresh = () => {
    if (destroyed) return;
    const palette = doc.defaultView.getComputedStyle(doc.documentElement);
    style.textContent = nativeFlightCursorCss({
      lamp: palette.getPropertyValue('--dp-lamp').trim(),
      hot: palette.getPropertyValue('--dp-lamp-hot').trim(),
      outline: palette.getPropertyValue('--dp-void').trim(),
    });
  };
  refresh();
  doc.head.appendChild(style);
  return { refresh, destroy() { destroyed = true; style.remove(); } };
}
