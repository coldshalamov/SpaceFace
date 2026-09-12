// Field Hardware chrome for station interiors (Market, Missions, Shipworks).
// Produced kit sprites are pinned onto the live markup so leftover word-tables
// read as plates, keys and stencil type. Existing data-* hooks stay untouched.

const STYLE_ID = 'sf-station-interior-fh';

const FH_KEY = {
  primary: { file: 'key.primary', width: '18px', minW: '132px', minH: '44px', pad: '0 16px', font: '16px' },
  legend: { file: 'key.legend', width: '14px', minW: '72px', minH: '32px', pad: '0 10px', font: '12px' },
  small: { file: 'key.small', width: '12px', minW: '56px', minH: '28px', pad: '0 8px', font: '12px' },
};

export function fhUrl(rel) {
  try { return new URL('../../../assets/ui/kit/assets/' + rel, import.meta.url).href; }
  catch { return 'assets/ui/kit/assets/' + rel; }
}

function forcedColorsActive() {
  return typeof matchMedia === 'function' && matchMedia('(forced-colors: active)').matches;
}

export function pin(node, props) {
  if (!node || !node.style || typeof node.style.setProperty !== 'function') return node;
  for (const name of Object.keys(props)) node.style.setProperty(name, props[name], 'important');
  return node;
}

export function ensureInteriorStyle() {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.sx-mkt .k-word.fh-key::after,.sx-ct .k-word.fh-key::after,.sx-sw .k-word.fh-key::after{display:none!important}' +
    '.sx-mkt .fh-keyrack,.sx-ct .fh-keyrack,.sx-sw .fh-keyrack{gap:6px!important;align-items:center!important;flex-wrap:wrap!important}' +
    '.sx-mkt-table thead th{font-family:var(--fh-face-display)!important;font-variation-settings:"wght" 600,"wdth" 62!important;letter-spacing:var(--fh-track-legend)!important;text-transform:uppercase!important;color:var(--fh-legend-rest,var(--fh-legend))!important}' +
    '.sx-mkt-row.is-active td{border-top-color:transparent!important}' +
    '.sx-mkt .k-table tbody tr.is-active,.sx-mkt .k-table tbody tr:hover,.sx-mkt .k-table tbody tr:focus-visible{box-shadow:none!important}' +
    '.sx-ct-row.fh-row,.sx-sw-row.fh-row,.sx-modrow.fh-row{box-shadow:none!important;background-color:transparent!important}';
  document.head.appendChild(style);
}

export function paintMarking(node) {
  if (!node) return node;
  if (node.classList) node.classList.add('fh-title');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 900, 'wdth' 125",
    'letter-spacing': 'var(--fh-track-display)',
    'text-transform': 'uppercase',
    'line-height': '0.9',
    color: 'var(--fh-text)',
  });
}

export function paintLegend(node, lit = false) {
  if (!node) return node;
  if (node.classList) node.classList.add('fh-legend');
  if (typeof node.setAttribute === 'function' && !node.getAttribute('data-fh-lit')) {
    node.setAttribute('data-fh-lit', lit ? 'on' : 'off');
  }
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 600, 'wdth' 62",
    'letter-spacing': 'var(--fh-track-legend)',
    'text-transform': 'uppercase',
    'font-size': 'var(--fh-size-fine)',
    color: lit ? 'var(--fh-legend-lit, var(--fh-legend))' : 'var(--fh-legend-rest, var(--fh-legend))',
    margin: '0',
  });
}

export function paintHero(node) {
  if (!node) return node;
  if (node.classList) node.classList.add('fh-hero');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 800, 'wdth' 125",
    'letter-spacing': 'var(--fh-track-display)',
    'text-transform': 'uppercase',
    'line-height': '0.9',
    'font-size': 'var(--fh-size-hero)',
    'font-variant-numeric': 'tabular-nums',
    color: 'var(--fh-legend-lit, var(--fh-signal))',
    margin: '0',
  });
}

export function paintHeroNum(node) {
  if (!node) return node;
  if (node.classList) node.classList.add('fh-heronum');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 800, 'wdth' 125",
    'letter-spacing': 'var(--fh-track-display)',
    'line-height': '0.9',
    'font-size': 'var(--fh-size-heroNum)',
    'font-variant-numeric': 'tabular-nums',
    color: 'var(--fh-text)',
    margin: '0',
  });
}

export function paintPlate(node, variant = 'sunk', extra = {}) {
  if (!node) return node;
  const file = variant === 'raised' ? 'plate.bench.raised.png'
    : variant === 'edge' ? 'plate.edge.small.png'
    : 'plate.bench.sunk.png';
  const width = variant === 'edge' ? '16px' : '24px';
  if (node.classList) {
    node.classList.add('fh-plate', variant === 'raised' ? 'fh-plate--raised'
      : variant === 'edge' ? 'fh-plate--edge' : 'fh-plate--sunk');
  }
  if (forcedColorsActive()) {
    return pin(node, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', ...extra,
    });
  }
  return pin(node, {
    'border-style': 'solid',
    'border-width': width,
    'border-image-source': 'url("' + fhUrl('plates/' + file) + '")',
    'border-image-slice': (variant === 'edge' ? '16' : '24') + ' fill',
    'border-image-repeat': 'stretch',
    'border-image-width': width,
    background: 'transparent',
    'box-sizing': 'border-box',
    padding: '10px 14px',
    ...extra,
  });
}

export function paintWindow(node) {
  if (!node) return node;
  if (node.classList) node.classList.add('fh-window');
  if (forcedColorsActive()) {
    return pin(node, { 'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid', background: 'transparent' });
  }
  return pin(node, {
    'border-style': 'solid',
    'border-width': '20px',
    'border-image-source': 'url("' + fhUrl('windows/window.glass.png') + '")',
    'border-image-slice': '20 fill',
    'border-image-repeat': 'stretch',
    'border-image-width': '20px',
    background: 'transparent',
    'box-sizing': 'border-box',
    padding: '8px 10px',
  });
}

export function paintInput(input) {
  if (!input) return input;
  if (input.classList) input.classList.add('fh-input');
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(input, { 'border-image-source': 'none', 'border-bottom': '1px solid CanvasText', background: 'transparent' });
      return;
    }
    pin(input, {
      'border-style': 'solid',
      'border-width': '12px',
      'border-image-source': 'url("' + fhUrl('controls/input.underline.' + state + '.png') + '")',
      'border-image-slice': '12 fill',
      'border-image-repeat': 'stretch',
      'border-image-width': '12px',
      background: 'transparent',
      color: 'var(--fh-text)',
      'min-height': '40px',
      padding: '0 8px',
      'box-sizing': 'border-box',
    });
  };
  apply('rest');
  if (input.dataset && input.dataset.fhBound !== '1') {
    input.dataset.fhBound = '1';
    input.addEventListener('focus', () => apply('focus'));
    input.addEventListener('blur', () => apply('rest'));
  }
  return input;
}

function keyState(button, kind) {
  const disabled = !!(button && (button.disabled || (button.getAttribute && button.getAttribute('aria-disabled') === 'true')));
  const lit = !!(button && button.getAttribute && (
    button.getAttribute('aria-pressed') === 'true'
    || button.getAttribute('aria-selected') === 'true'
    || button.getAttribute('aria-current') === 'true'
    || (button.classList && button.classList.contains('is-on'))
    || (button.classList && button.classList.contains('is-active'))
    || (button.classList && button.classList.contains('is-selected'))
    || (button.classList && button.classList.contains('is-lit'))
  ));
  if (disabled) return 'disabled';
  if (kind === 'legend' && lit) return 'lit';
  return 'rest';
}

export function paintKey(button, kind = 'legend') {
  if (!button) return button;
  const spec = FH_KEY[kind] || FH_KEY.legend;
  if (button.classList) button.classList.add('k-word', 'fh-key', 'fh-key--' + kind);
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(button, {
        'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
        background: 'transparent', color: 'CanvasText',
      });
      return;
    }
    pin(button, {
      display: 'inline-flex',
      width: 'max-content',
      'max-width': '100%',
      'min-width': spec.minW,
      'min-height': spec.minH,
      padding: spec.pad,
      'font-size': spec.font,
      'font-family': 'var(--fh-face-display)',
      'font-variation-settings': "'wght' 600, 'wdth' 62",
      'letter-spacing': 'var(--fh-track-legend)',
      'text-transform': 'uppercase',
      'justify-content': 'center',
      'align-items': 'center',
      'box-sizing': 'border-box',
      overflow: 'hidden',
      background: 'transparent',
      color: 'var(--fh-text)',
      'border-style': 'solid',
      'border-width': spec.width,
      'border-image-source': 'url("' + fhUrl('keys/' + spec.file + '.' + state + '.png') + '")',
      'border-image-slice': parseInt(spec.width, 10) + ' fill',
      'border-image-repeat': 'stretch',
      'border-image-width': spec.width,
    });
  };
  const sync = () => apply(keyState(button, kind));
  button._fhSync = sync;
  if (!(button.dataset && button.dataset.fhBound === '1')) {
    if (button.dataset) button.dataset.fhBound = '1';
    button.addEventListener('pointerenter', () => {
      if (keyState(button, kind) === 'disabled') return;
      apply(kind === 'legend' && keyState(button, kind) === 'lit' ? 'lit' : 'hover');
    });
    button.addEventListener('pointerleave', sync);
    button.addEventListener('pointerdown', () => {
      if (keyState(button, kind) === 'disabled') return;
      apply(kind === 'legend' ? 'hover' : 'pressed');
    });
    button.addEventListener('pointerup', sync);
    button.addEventListener('focus', () => {
      if (keyState(button, kind) === 'disabled') return;
      apply('hover');
    });
    button.addEventListener('blur', sync);
  }
  sync();
  return button;
}

export function paintCap(node) {
  if (!node) return node;
  if (node.classList) node.classList.add('fh-key', 'fh-key--small');
  if (forcedColorsActive()) {
    return pin(node, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', color: 'CanvasText', cursor: 'default',
    });
  }
  return pin(node, {
    display: 'inline-flex',
    width: 'max-content',
    'max-width': '100%',
    'min-width': FH_KEY.small.minW,
    'min-height': FH_KEY.small.minH,
    padding: FH_KEY.small.pad,
    'font-size': FH_KEY.small.font,
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 600, 'wdth' 62",
    'letter-spacing': 'var(--fh-track-legend)',
    'text-transform': 'uppercase',
    'justify-content': 'center',
    'align-items': 'center',
    'box-sizing': 'border-box',
    background: 'transparent',
    color: 'var(--fh-text)',
    cursor: 'default',
    'border-style': 'solid',
    'border-width': FH_KEY.small.width,
    'border-image-source': 'url("' + fhUrl('keys/' + FH_KEY.small.file + '.rest.png') + '")',
    'border-image-slice': '12 fill',
    'border-image-repeat': 'stretch',
    'border-image-width': FH_KEY.small.width,
  });
}

export function paintRow(node, selected = false) {
  if (!node) return node;
  if (node.classList) {
    node.classList.add('fh-row');
    node.classList.toggle('is-selected', !!selected);
  }
  if (forcedColorsActive()) {
    return pin(node, { 'border-image-source': 'none', 'border-width': selected ? '2px' : '0', 'border-style': 'solid', background: 'transparent' });
  }
  if (selected) {
    return pin(node, {
      'border-style': 'solid',
      'border-width': '8px 16px',
      'border-image-source': 'url("' + fhUrl('plates/plate.row.selected.png') + '")',
      'border-image-slice': '8 16 8 16 fill',
      'border-image-repeat': 'stretch',
      'border-image-width': '8px 16px',
      'box-shadow': 'none',
      'background-image': 'none',
      'background-color': 'transparent',
      color: 'var(--fh-text)',
    });
  }
  return pin(node, {
    'border-style': 'none',
    'border-width': '0',
    'border-image-source': 'none',
    'box-shadow': 'none',
    'background-color': 'transparent',
    'background-image': 'url("' + fhUrl('tiles/tile.etch.hairline.png') + '")',
    'background-repeat': 'repeat-x',
    'background-position': 'top left',
    color: 'var(--fh-text-resting)',
  });
}

export function paintSelectedTableRow(row, selected = false) {
  if (!row) return row;
  if (row.classList) {
    row.classList.add('fh-row');
    row.classList.toggle('is-selected', !!selected);
  }
  if (forcedColorsActive()) {
    return pin(row, { outline: selected ? '2px solid CanvasText' : 'none', background: 'transparent' });
  }
  if (selected) {
    return pin(row, {
      'background-image': 'url("' + fhUrl('plates/plate.row.selected.png') + '")',
      'background-size': '100% 100%',
      'background-repeat': 'no-repeat',
      'box-shadow': 'none',
      color: 'var(--fh-text)',
    });
  }
  return pin(row, {
    'background-image': 'none',
    'box-shadow': 'none',
    color: 'var(--fh-text-resting)',
  });
}

export function pinKeyrack(node) {
  if (!node) return node;
  if (node.classList) node.classList.add('fh-keyrack');
  return pin(node, { gap: '6px', 'align-items': 'center', 'flex-wrap': 'wrap' });
}

export function syncKeys(root) {
  if (!root || !root.querySelectorAll) return;
  for (const button of root.querySelectorAll('.fh-key')) {
    if (typeof button._fhSync === 'function') button._fhSync();
  }
}

export function dressState(host) {
  if (!host) return;
  const head = host.querySelector('.sf-state__head, .sf-state__word');
  if (head) paintLegend(head, true);
  const verb = host.querySelector('.sf-state__verb');
  if (verb) paintKey(verb, 'legend');
}
