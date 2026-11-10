// A small, owned icon vocabulary. Shape communicates function; colour is never the only signal.
// No network, observers or animation loops. All player strings passed into markup are escaped.
export function escapeMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const paths = Object.freeze({
  market: '<path d="M3 7h17m-5-4 5 4-5 4M21 17H4m5-4-5 4 5 4"/>',
  shipworks: '<path d="m12 2 5 7v11l-5-3-5 3V9zM7 12l-4 5v4l4-1m10-8 4 5v4l-4-1M12 7v6"/>',
  contracts: '<path d="M7 3h12v18H5V5zm2 4h6m-6 4h6m-6 4h3M3 3h4v4H3z"/>',
  bar: '<path d="M4 4h16v11h-9l-5 5v-5H4zM8 8h8m-8 3h5"/>',
  industry: '<path d="M3 21V10l6 3V8l6 3V3h4l2 18zM7 17h1m4 0h1m4 0h1"/>',
  factions: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM12 6v11M7 9l5 3 5-3"/>',
  ledger: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 7h8m-8 4h8m-8 4h3"/>',
  research: '<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M8 14h8"/>',
  navigation: '<circle cx="12" cy="12" r="9"/><path d="m16 7-3 7-6 3 3-7z"/>',
  ship: '<path d="m12 2 8 18-8-4-8 4zM12 8v8"/>',
  warning: '<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',
  ore: '<path d="m4 8 7-5 9 5 1 10-9 4-9-5zM4 8l7 5 9-5m-9 5 1 9"/>',
  fuel: '<path d="M7 4h10v17H7zM9 1h6v3M10 8h4m-2 3-2 4h4l-2 3"/>',
  cargo: '<path d="m3 7 9-4 9 4v12l-9 3-9-3zM3 7l9 4 9-4m-9 4v11M7 5l9 4v5"/>',
  save: '<path d="M3 3h15l3 3v15H3zM7 3v6h9V3M7 21v-8h10v8"/>',
});
export function iconHtml(name, className = 'of-icon') {
  const path = paths[name] || paths.navigation;
  return `<svg class="${escapeMarkup(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${path}</svg>`;
}
