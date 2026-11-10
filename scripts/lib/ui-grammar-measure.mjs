// ui-grammar-measure.mjs — PQ-180 the measurable half of the grammar matrix.
//
// Two things live here and nothing else:
//   1. `surfaceProbe` — a SELF-CONTAINED, READ-ONLY browser function (no closures, no imports) that
//      observes one open surface. It never calls a game function, never steps a cadence and never
//      mutates the DOM: a measurement that changes what it measures is not a measurement.
//   2. The PURE evaluation: observations + thresholds -> cells -> row status. Pure so
//      `test/ui-grammar-matrix.test.mjs` can prove a deliberately too-small font goes red without a
//      browser, a GPU, or a capture window.
//
// THE PASS RULE (controller correction, 2026-09-04). A cell is green ONLY when the rule itself was
// directly measured. A proxy is not a pass:
//   * listing `check:wcag-contrast` in a manifest does not measure contrast;
//   * counting focusable elements does not exercise keyboard reachability;
//   * counting visible text under forced-colors does not prove the surface is legible;
//   * a non-empty screen-memory bag does not prove state was RESTORED;
//   * one `[data-why]` node does not prove three disclosure tiers.
// Those observations are kept — in the cell `detail`, where they are useful evidence for whoever
// does the work — but the status stays `unproven`, and unproven fails.
//
// Cell vocabulary. Only `green` and `n/a` pass:
//   green      the rule itself was measured and is at or above the floor
//   red        the rule itself was measured and is below the floor
//   unproven   not directly exercised (may carry an observation) — FAILS
//   unmeasured no seam exists to measure it at all — FAILS, names the missing seam
//   n/a        the rule cannot apply to this archetype (recorded, never inferred)

import { THRESHOLDS } from '../ui-grammar-thresholds.mjs';

export const PASS_STATUSES = Object.freeze(['green', 'n/a']);

/**
 * The measurement passes. Every cell records WHICH pass produced it, so no cell can be quietly
 * credited to a run that never happened.
 */
export const MEASUREMENT_PASSES = Object.freeze([
  Object.freeze({ id: 'base', width: 1920, height: 1080, mode: 'default', locale: null }),
  Object.freeze({ id: 'narrow', width: 1280, height: 720, mode: 'default', locale: null }),
  Object.freeze({ id: 'ultrawide', width: 2560, height: 1080, mode: 'default', locale: null }),
  Object.freeze({ id: 'reduced-motion', width: 1920, height: 1080, mode: 'reduced-motion', locale: null }),
  Object.freeze({ id: 'forced-colors', width: 1920, height: 1080, mode: 'forced-colors', locale: null }),
  Object.freeze({ id: 'pseudo', width: 1280, height: 720, mode: 'default', locale: 'qps-ploc' }),
]);

/**
 * Ownership of a rule that the MATRIX cannot yet measure. This is the seam gap, not the surface's
 * fault, so it is owned by the packet that must build the seam — independent of who owns the screen
 * (controller correction: PQ-183 owns links and PQ-184 owns UI performance even when the screen
 * belongs to somebody else; a missing tool/coverage seam is PQ-180 until it is implemented).
 *
 * `leaf` is the work item that clears it. PQ-180's leaves are the real ones from the packet; a leaf
 * key on another packet is a proposal the owning packet may rename — it exists so no red cell is
 * ever assigned to a packet without saying WHICH piece of work clears it.
 */
export const RULE_SEAM_OWNERS = Object.freeze({
  'type-roles': { packet: 'PQ-180', leaf: '.00', why: 'no runtime seam names a type ROLE; only sizes are visible to the DOM' },
  'colour-on-state': { packet: 'PQ-180', leaf: '.00', why: 'no runtime seam separates state colour from decorative colour' },
  'motion-contract': { packet: 'PQ-180', leaf: '.00', why: 'no runtime seam maps an animation to a row of GRAMMAR §5' },
  'reduce-motion': { packet: 'PQ-180', leaf: '.00', why: 'infinite CSS loops are observable; JS/WebGL motion and legibility are not' },
  'forced-colors': { packet: 'PQ-180', leaf: '.00', why: 'text presence is observable; legibility under forced-colors is not' },
  'layout-skeleton': { packet: 'PQ-180', leaf: '.00', why: 'no runtime seam identifies STAGE / APRON / DISPLAY regions' },
  'disclosure-tiers': { packet: 'PQ-180', leaf: '.00', why: 'tier-2 markers are countable; three-tier disclosure is not exercised' },
  'load-bearing-names': { packet: 'PQ-180', leaf: '.00', why: 'no runtime seam distinguishes a load-bearing name from flavour' },
  'data-states': { packet: 'PQ-180', leaf: '.00', why: 'the four states are never driven; only declared markers are visible' },
  'screen-memory': { packet: 'PQ-180', leaf: '.00', why: 'restore is not exercised (close/reopen/compare) by this harness' },
  keyboard: { packet: 'PQ-180', leaf: '.00', why: 'focusables are countable; a keyboard traversal is not performed' },
  gamepad: { packet: 'PQ-180', leaf: '.00', why: 'no gamepad seam in the capture harness' },
  contrast: { packet: 'PQ-180', leaf: '.00', why: 'not measured here; check:wcag-contrast is a separate audit and its result is not imported' },
  'entity-links': { packet: 'PQ-183', leaf: 'entity-links', why: 'link coverage is PQ-183 work regardless of who owns the screen' },
  'ui-frame-ms': { packet: 'PQ-184', leaf: 'ui-frame-timing', why: 'no published UI frame timing seam; measuring it by calling refresh() would change the cadence it claims to measure' },
  'reference-frames': { packet: 'PQ-180', leaf: '.03', why: 'reference-frame coverage is PQ-180 .03' },
  'pseudo-loc': { packet: 'PQ-180', leaf: '.00', why: 'pseudo expansion must be witnessed in the measured text, not assumed from a locale flag' },
});

/** The last-resort owner for a red cell nobody else owns: assigning it is PQ-180 .02's job. */
export const UNASSIGNED_OWNER = Object.freeze({ packet: 'PQ-180', leaf: '.02', why: 'no admitted packet owns this surface yet — assignment is PQ-180 .02' });

export const RULES = Object.freeze([
  // --- directly measurable from the DOM
  Object.freeze({ id: 'reachable', label: 'opened on a public route', source: 'PQ-180 outcome', kind: 'measured' }),
  Object.freeze({ id: 'type-floor', label: `no text below ${THRESHOLDS.minFontPx}px`, source: 'GRAMMAR §12.2', kind: 'measured' }),
  Object.freeze({ id: 'tabular-numerals', label: 'tabular numeral face on every figure', source: 'GRAMMAR §3', kind: 'measured' }),
  Object.freeze({ id: 'dom-budget', label: `≤ ${THRESHOLDS.maxSurfaceDomNodes} nodes`, source: 'PQ-180 .01', kind: 'measured' }),
  Object.freeze({ id: 'safe-frame', label: 'no clipping at 1280/1920/2560, clamped ultrawide', source: 'GRAMMAR §12.12', kind: 'measured' }),
  Object.freeze({ id: 'pseudo-loc', label: 'witnessed +40% expansion without clipping', source: 'GRAMMAR §12.11', kind: 'measured' }),
  Object.freeze({ id: 'reference-frames', label: 'reference frames on disk', source: 'PQ-180 .03', kind: 'measured' }),
  // --- named by the packet, not yet directly exercised (observation only)
  Object.freeze({ id: 'type-roles', label: 'type roles, one DISPLAY element', source: 'GRAMMAR §12.2', kind: 'seam' }),
  Object.freeze({ id: 'colour-on-state', label: 'colour spent only on state', source: 'GRAMMAR §4', kind: 'seam' }),
  Object.freeze({ id: 'motion-contract', label: 'every animation maps to §5', source: 'GRAMMAR §12.5', kind: 'seam' }),
  Object.freeze({ id: 'reduce-motion', label: 'legible under reduced motion', source: 'GRAMMAR §12.6', kind: 'seam' }),
  Object.freeze({ id: 'forced-colors', label: 'legible under forced-colors', source: 'GRAMMAR §12.6', kind: 'seam' }),
  Object.freeze({ id: 'layout-skeleton', label: 'the layout skeleton', source: 'GRAMMAR §2', kind: 'seam' }),
  Object.freeze({ id: 'disclosure-tiers', label: 'three disclosure tiers', source: 'GRAMMAR §12.7', kind: 'seam' }),
  Object.freeze({ id: 'load-bearing-names', label: 'load-bearing names', source: 'GRAMMAR §6', kind: 'seam' }),
  Object.freeze({ id: 'data-states', label: 'four data states driven', source: 'GRAMMAR §12.9', kind: 'seam' }),
  Object.freeze({ id: 'screen-memory', label: 'state restored per save', source: 'GRAMMAR §12.10', kind: 'seam' }),
  Object.freeze({ id: 'keyboard', label: 'keyboard reachable', source: 'GRAMMAR §12.4', kind: 'seam' }),
  Object.freeze({ id: 'gamepad', label: 'gamepad reachable', source: 'GRAMMAR §12.4', kind: 'seam' }),
  Object.freeze({ id: 'contrast', label: 'contrast', source: 'GRAMMAR §4', kind: 'seam' }),
  Object.freeze({ id: 'entity-links', label: 'entity links', source: 'GRAMMAR §7', kind: 'seam' }),
  Object.freeze({ id: 'ui-frame-ms', label: `≤ ${THRESHOLDS.maxUiFrameMs} ms UI frame`, source: 'PQ-180 .01', kind: 'seam' }),
]);

export const RULE_IDS = Object.freeze(RULES.map((r) => r.id));

// ---------------------------------------------------------------------------------------------
// The browser probe. SELF-CONTAINED and READ-ONLY — do not add imports, outer references, or any
// call into game code.
// ---------------------------------------------------------------------------------------------

/**
 * Observe one open surface. `arg` is { selectors, surfaceId, screenId }.
 * Returns raw observations only; every judgement happens in `evaluateSurface`.
 */
export function surfaceProbe(arg) {
  const selectors = (arg && arg.selectors) || [];
  const out = {
    surfaceId: (arg && arg.surfaceId) || null,
    rootSelector: null,
    found: false,
    nodeCount: 0,
    visibleTextNodes: 0,
    textChars: 0,
    textSample: '',
    minFontPx: null,
    minFontSample: null,
    distinctFontSizes: 0,
    numeralNodes: 0,
    nonTabularNumeralNodes: 0,
    nonTabularSample: null,
    dataStates: [],
    whyNodes: 0,
    focusables: 0,
    clipped: [],
    contentWidth: 0,
    viewportWidth: (typeof window !== 'undefined' && window.innerWidth) || 0,
    infiniteAnimations: 0,
    memorySeam: null,
    memoryKeys: [],
    localeAttr: null,
    error: null,
  };

  // Visibility must consider ANCESTORS: a 9 px caption inside a display:none template is not on
  // screen, and sampling it would report a defect the player can never see.
  const styleCache = new Map();
  function styleOf(node) {
    let cached = styleCache.get(node);
    if (!cached) { cached = getComputedStyle(node); styleCache.set(node, cached); }
    return cached;
  }
  const hiddenCache = new Map();
  function hiddenSelfOrAncestor(node) {
    const memo = hiddenCache.get(node);
    if (memo !== undefined) return memo;
    let cur = node;
    while (cur && cur.nodeType === 1) {
      const style = styleOf(cur);
      if (cur.hidden
        || (cur.getAttribute && cur.getAttribute('aria-hidden') === 'true')
        || style.display === 'none'
        || style.visibility === 'hidden'
        || parseFloat(style.opacity || '1') <= 0.01) {
        hiddenCache.set(node, true);
        return true;
      }
      if (cur === document.body) break;
      cur = cur.parentElement;
    }
    hiddenCache.set(node, false);
    return false;
  }

  function visible(node) {
    if (!node || !node.getBoundingClientRect) return false;
    if (hiddenSelfOrAncestor(node)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function cssPath(node) {
    if (!node) return '';
    const parts = [];
    let cur = node;
    for (let depth = 0; cur && cur.nodeType === 1 && depth < 4; depth += 1) {
      let part = cur.tagName ? cur.tagName.toLowerCase() : '?';
      if (cur.id) { part += '#' + cur.id; parts.unshift(part); break; }
      const cls = typeof cur.className === 'string' ? cur.className.trim().split(/\s+/)[0] : '';
      if (cls) part += '.' + cls;
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  try {
    out.localeAttr = document.documentElement.dataset
      ? (document.documentElement.dataset.locale || null)
      : null;
  } catch (err) { out.localeAttr = null; }

  let root = null;
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node && visible(node)) { root = node; out.rootSelector = selector; break; }
  }
  if (!root) {
    out.error = 'no visible root matched ' + JSON.stringify(selectors);
    return out;
  }
  out.found = true;

  const all = root.querySelectorAll('*');
  out.nodeCount = all.length + 1;

  const rootRect = root.getBoundingClientRect();
  out.contentWidth = Math.round(rootRect.width);

  const digits = /[0-9]/;
  const sizes = {};
  const nodes = [root].concat(Array.prototype.slice.call(all));
  for (const node of nodes) {
    if (!visible(node)) continue;
    const style = styleOf(node);

    // Own text only — a container inherits its children's text and would double count.
    let ownText = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) ownText += child.nodeValue;
    }
    ownText = ownText.replace(/\s+/g, ' ').trim();

    if (ownText) {
      out.visibleTextNodes += 1;
      out.textChars += ownText.length;
      if (out.textSample.length < 200) out.textSample += ownText.slice(0, 40) + ' | ';
      const px = parseFloat(style.fontSize);
      if (Number.isFinite(px)) {
        sizes[px.toFixed(2)] = true;
        if (out.minFontPx == null || px < out.minFontPx) {
          out.minFontPx = px;
          out.minFontSample = { px, text: ownText.slice(0, 48), path: cssPath(node) };
        }
      }
      if (digits.test(ownText)) {
        out.numeralNodes += 1;
        const variant = String(style.fontVariantNumeric || '');
        const feature = String(style.fontFeatureSettings || '');
        const tabular = variant.indexOf('tabular-nums') >= 0
          || feature.indexOf('tnum') >= 0
          || String(style.fontFamily || '').toLowerCase().indexOf('mono') >= 0;
        if (!tabular) {
          out.nonTabularNumeralNodes += 1;
          if (!out.nonTabularSample) {
            out.nonTabularSample = { text: ownText.slice(0, 48), path: cssPath(node) };
          }
        }
      }
    }

    // Clipping: a box whose content overflows its own width is a clip, not a scroller, unless it
    // opted in to scrolling.
    const scrolls = style.overflowX === 'auto' || style.overflowX === 'scroll'
      || style.overflow === 'auto' || style.overflow === 'scroll'
      || node.hasAttribute('data-sf-scroll');
    if (!scrolls && node.scrollWidth - node.clientWidth > 1 && node.clientWidth > 0) {
      if (out.clipped.length < 8) {
        out.clipped.push({
          path: cssPath(node),
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          text: ownText.slice(0, 40),
        });
      }
    }

    if (String(style.animationIterationCount || '').indexOf('infinite') >= 0) out.infiniteAnimations += 1;

    if (node.hasAttribute && (node.hasAttribute('data-why') || node.hasAttribute('data-tier2'))) {
      out.whyNodes += 1;
    }
    if (node.hasAttribute && node.hasAttribute('data-state')) {
      const value = node.getAttribute('data-state');
      if (value && out.dataStates.indexOf(value) < 0) out.dataStates.push(value);
    }
  }
  out.distinctFontSizes = Object.keys(sizes).length;

  const focusable = root.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  let focusCount = 0;
  for (const node of focusable) {
    if (node.disabled) continue;
    if (!visible(node)) continue;
    focusCount += 1;
  }
  out.focusables = focusCount;

  // Screen memory: READ what is stored. This observes a bag; it does not prove a restore, and the
  // evaluator will not treat it as one.
  try {
    const sf = window.SF;
    const memory = sf && sf.ctx && sf.ctx.screenMemory;
    const bags = sf && sf.state && sf.state.ui && sf.state.ui.screenMemory
      ? sf.state.ui.screenMemory.bags : null;
    if (memory || bags) {
      out.memorySeam = memory ? 'ctx.screenMemory' : 'state.ui.screenMemory.bags';
      const screenId = arg && arg.screenId;
      const bag = bags && screenId ? bags[screenId] : null;
      if (bag && bag.d) out.memoryKeys = Object.keys(bag.d);
      else if (bag) out.memoryKeys = Object.keys(bag);
    }
  } catch (err) {
    out.memorySeam = 'error: ' + (err && err.message ? err.message : String(err));
  }

  return out;
}

// ---------------------------------------------------------------------------------------------
// Pure evaluation
// ---------------------------------------------------------------------------------------------

function cell(status, detail, extra) {
  return Object.freeze({ status, detail: detail || '', ...(extra || {}) });
}

/** Who clears this cell when it is not passing. Never null for a failing cell. */
export function resolveCellOwner(ruleId, surface, status) {
  if (PASS_STATUSES.includes(status)) return null;
  const seam = RULE_SEAM_OWNERS[ruleId];
  // A seam gap belongs to the packet that must build the seam, whatever the screen's owner is.
  if (seam && (status === 'unproven' || status === 'unmeasured')) return seam;
  if (surface && surface.owner) return { packet: surface.owner, leaf: surface.ownerLeaf || 'surface', why: `${surface.owner} owns this surface` };
  if (seam) return seam;
  return UNASSIGNED_OWNER;
}

/**
 * Judge one surface.
 * @param {object} params
 * @param {object} params.surface       manifest entry
 * @param {object} params.passes        { [passId]: probeResult } — a missing pass is unproven
 * @param {object} [params.thresholds]
 * @param {object} [params.frames]      { expected, present } reference-frame coverage
 */
export function evaluateSurface({ surface, passes = {}, thresholds = THRESHOLDS, frames = null }) {
  const raw = {};
  const base = passes.base || null;
  const opened = !!(base && base.found);

  // --- reachability: green ONLY when the surface actually opened through a public route.
  const evidence = surface.entry ? surface.entry.evidence : 'none';
  if (evidence === 'public-route') {
    raw.reachable = opened
      ? cell('green', `opened via ${surface.entry.kind}: ${surface.entry.detail || ''}`.trim())
      : cell('red', `public route declared (${surface.entry.detail || surface.entry.kind}) but the surface did not open${base && base.error ? `: ${base.error}` : ''}`);
  } else if (evidence === 'fixture') {
    // A nested surface inherits `fixture` evidence from its parent but has no fixture of its own,
    // so name the chain instead. Printing `fixture "undefined"` sent a reader looking for a
    // fixture that never existed and hid the real reason: the parent is not on a player route.
    raw.reachable = surface.entry.inheritedFrom
      ? cell('red', `reachable only through ${surface.entry.inheritedFrom}, which itself opens by a named fixture rather than a player route — ${surface.entry.detail || ''}`)
      : cell('red', `opened by the named fixture "${surface.entry.fixture}" only, which is an environmental state, not a player route — ${surface.entry.detail || ''}`);
  } else {
    raw.reachable = cell('red', surface.entry && surface.entry.detail ? surface.entry.detail : 'no entry route');
  }

  // --- rules with no runtime seam: never green, always carry the observation we do have.
  const seamCell = (ruleId, observation) => cell('unproven', `${RULE_SEAM_OWNERS[ruleId].why}${observation ? ` — observed: ${observation}` : ''}`);

  if (!opened) {
    const why = base && base.error ? base.error : 'surface never opened';
    for (const ruleId of RULE_IDS) {
      if (ruleId === 'reachable') continue;
      if (ruleId === 'reference-frames') { raw[ruleId] = frameCell(surface, frames); continue; }
      if (ruleId === 'ui-frame-ms') { raw[ruleId] = cell('unmeasured', RULE_SEAM_OWNERS['ui-frame-ms'].why); continue; }
      raw[ruleId] = cell('unproven', why);
    }
    return finish(surface, raw, false);
  }

  // --- directly measured -------------------------------------------------------------------
  if (base.minFontPx == null) {
    raw['type-floor'] = cell('unproven', 'no visible text-bearing node found on this surface');
  } else if (base.minFontPx + 1e-6 < thresholds.minFontPx) {
    const s = base.minFontSample || {};
    raw['type-floor'] = cell('red', `${base.minFontPx.toFixed(2)}px < ${thresholds.minFontPx}px at ${s.path || '?'} "${s.text || ''}"`, { value: base.minFontPx });
  } else {
    raw['type-floor'] = cell('green', `min ${base.minFontPx.toFixed(2)}px over ${base.visibleTextNodes} visible text nodes`, { value: base.minFontPx });
  }

  if (!base.numeralNodes) {
    raw['tabular-numerals'] = cell('n/a', 'no figures on this surface');
  } else if (base.nonTabularNumeralNodes > 0) {
    const s = base.nonTabularSample || {};
    raw['tabular-numerals'] = cell('red', `${base.nonTabularNumeralNodes}/${base.numeralNodes} figures not on a tabular face (e.g. ${s.path || '?'} "${s.text || ''}")`, { value: base.nonTabularNumeralNodes });
  } else {
    raw['tabular-numerals'] = cell('green', `${base.numeralNodes} figures, all tabular`, { value: 0 });
  }

  raw['dom-budget'] = base.nodeCount > thresholds.maxSurfaceDomNodes
    ? cell('red', `${base.nodeCount} nodes > ${thresholds.maxSurfaceDomNodes}`, { value: base.nodeCount })
    : cell('green', `${base.nodeCount} nodes`, { value: base.nodeCount });

  raw['safe-frame'] = evaluateSafeFrame(passes, thresholds);
  raw['pseudo-loc'] = evaluatePseudoLoc(passes, thresholds);
  raw['reference-frames'] = frameCell(surface, frames);

  // --- observation only: never green ---------------------------------------------------------
  raw['type-roles'] = seamCell('type-roles', `${base.distinctFontSizes} distinct font sizes`);
  raw['colour-on-state'] = seamCell('colour-on-state', null);
  raw['motion-contract'] = seamCell('motion-contract', `${base.infiniteAnimations} infinite CSS animation(s)`);
  raw['layout-skeleton'] = seamCell('layout-skeleton', `${base.nodeCount} nodes under ${base.rootSelector}`);
  raw['load-bearing-names'] = seamCell('load-bearing-names', null);
  raw['disclosure-tiers'] = seamCell('disclosure-tiers', `${base.whyNodes} tier-2 [data-why] node(s)`);
  raw['data-states'] = seamCell('data-states', base.dataStates.length ? `declared markers: ${base.dataStates.join(', ')}` : 'no [data-state] marker present');
  raw['screen-memory'] = surface.screenId
    ? seamCell('screen-memory', base.memorySeam
      ? `${base.memorySeam} holds [${base.memoryKeys.join(', ') || 'nothing'}] for "${surface.screenId}"`
      : 'no screen-memory seam readable')
    : cell('n/a', 'not a stack screen; there is no per-save memory bag to restore');
  raw.keyboard = surface.archetype === 'FLIGHT-HUD'
    ? cell('n/a', 'the HUD is not a focus surface; flight input owns the keyboard')
    : seamCell('keyboard', `${base.focusables} visible focusable control(s)`);
  raw.gamepad = seamCell('gamepad', null);
  raw.contrast = seamCell('contrast', null);
  raw['entity-links'] = seamCell('entity-links', null);
  raw['ui-frame-ms'] = cell('unmeasured', RULE_SEAM_OWNERS['ui-frame-ms'].why);

  const reduced = passes['reduced-motion'] || null;
  raw['reduce-motion'] = !reduced
    ? cell('unproven', 'reduced-motion pass not run')
    : !reduced.found
      ? cell('red', `did not open under reduced motion: ${reduced.error || 'unknown'}`)
      : seamCell('reduce-motion', `${reduced.infiniteAnimations} infinite CSS loop(s), ${reduced.visibleTextNodes} visible text node(s)`);

  const forced = passes['forced-colors'] || null;
  raw['forced-colors'] = !forced
    ? cell('unproven', 'forced-colors pass not run')
    : !forced.found
      ? cell('red', `did not open under forced-colors: ${forced.error || 'unknown'}`)
      : seamCell('forced-colors', `${forced.visibleTextNodes} visible text node(s)`);

  return finish(surface, raw, true);
}

function evaluateSafeFrame(passes, thresholds) {
  const widths = [['narrow', 1280], ['base', 1920], ['ultrawide', 2560]];
  const problems = [];
  let measured = 0;
  for (const [passId, width] of widths) {
    const pass = passes[passId];
    if (!pass) { problems.push(`${width}: pass not run`); continue; }
    if (!pass.found) { problems.push(`${width}: did not open (${pass.error || 'unknown'})`); continue; }
    measured += 1;
    if (pass.clipped && pass.clipped.length) {
      const c = pass.clipped[0];
      problems.push(`${width}: ${pass.clipped.length} clipped box(es), e.g. ${c.path} ${c.scrollWidth}>${c.clientWidth}`);
    }
    if (width === thresholds.ultrawideWidth && pass.viewportWidth > 0) {
      const fraction = pass.contentWidth / pass.viewportWidth;
      if (fraction > thresholds.ultrawideMaxContentFraction) {
        problems.push(`${width}: content fills ${(fraction * 100).toFixed(1)}% of the viewport — stretched, not clamped`);
      }
    }
  }
  if (measured < widths.length) return cell('unproven', problems.join('; ') || 'widths not measured');
  if (problems.length) return cell('red', problems.join('; '));
  return cell('green', `clean at ${widths.map(([, w]) => w).join('/')}`);
}

/**
 * Pseudo-localization. A `qps-ploc` boot flag is a REQUEST, not a result: the cell only goes green
 * when the measured text on this surface actually grew, so a locale that silently fell back to
 * English can never be mistaken for a passing localization.
 */
function evaluatePseudoLoc(passes, thresholds) {
  const pseudo = passes.pseudo || null;
  const narrow = passes.narrow || null; // same 1280 viewport, English — the comparison baseline
  if (!pseudo) return cell('unproven', 'pseudo-localized pass not run');
  if (!pseudo.found) return cell('red', `did not open under qps-ploc: ${pseudo.error || 'unknown'}`);
  if (!narrow || !narrow.found) {
    return cell('unproven', 'no English 1280 pass to compare against, so expansion cannot be witnessed');
  }
  const grew = narrow.textChars > 0 ? pseudo.textChars / narrow.textChars - 1 : 0;
  const witnessed = grew >= thresholds.pseudoLocGrowth * thresholds.pseudoLocWitnessFraction;
  if (!witnessed) {
    return cell('unproven', `expansion not witnessed: text grew ${(grew * 100).toFixed(1)}% (${narrow.textChars} -> ${pseudo.textChars} chars); locale attribute "${pseudo.localeAttr || 'none'}". A locale flag is not expansion.`, { value: grew });
  }
  if (pseudo.clipped && pseudo.clipped.length) {
    const c = pseudo.clipped[0];
    return cell('red', `text grew ${(grew * 100).toFixed(1)}% and ${pseudo.clipped.length} box(es) clip, e.g. ${c.path} ${c.scrollWidth}>${c.clientWidth}`, { value: pseudo.clipped.length });
  }
  return cell('green', `text grew ${(grew * 100).toFixed(1)}% with no clipping`, { value: grew });
}

function frameCell(surface, frames) {
  if (!frames) return cell('unproven', 'reference-frame coverage not supplied');
  if (frames.expected <= 0) return cell('red', 'no frames planned for this surface');
  if (frames.present >= frames.expected) {
    return cell('green', `${frames.present}/${frames.expected} reference frames`, { value: frames.present });
  }
  // A surface with no route into it cannot be photographed by anyone, and telling the next agent to
  // run a capture for it sends them to spend an hour proving that. The cell stays RED — it is real
  // missing coverage, and PQ-180 .02 requires it to carry an owner — but the remedy has to be the
  // true one: build the screen. `check:visual-regression` draws the same line and does not FAIL on
  // these, because a gate that is permanently red is a gate agents learn to ignore.
  if (surface.entry && surface.entry.kind === 'none') {
    return cell('red', `${frames.present}/${frames.expected} reference frames — no route opens this surface `
      + `(${surface.entry.detail || 'unreachable'}); it cannot be photographed until ${surface.owner || 'its owner packet'} builds it`,
    { value: frames.present });
  }
  // --fill-missing, not --update: --update rewrites EVERY reference, including the calibrated ones.
  return cell('red', `${frames.present}/${frames.expected} reference frames — run capture:ui-matrix -- --fill-missing --only=${surface.id}`, { value: frames.present });
}

function finish(surface, raw, measured = false) {
  const cells = {};
  for (const ruleId of RULE_IDS) {
    const base = raw[ruleId] || cell('unproven', 'rule not evaluated');
    const owner = resolveCellOwner(ruleId, surface, base.status);
    cells[ruleId] = Object.freeze({ ...base, owner });
  }
  const failing = RULE_IDS.filter((id) => !PASS_STATUSES.includes(cells[id].status));
  return {
    id: surface.id,
    title: surface.title,
    archetype: surface.archetype,
    ownerFile: surface.ownerFile || null,
    owner: surface.owner || null,
    // `measured` = the probe found and read the surface, however it was opened (a fixture counts).
    // `openedOnPublicRoute` = a player could have done it. They are reported separately on purpose.
    measured,
    openedOnPublicRoute: cells.reachable.status === 'green',
    status: failing.length ? 'red' : 'green',
    failing,
    cells,
  };
}

/**
 * Judge the whole manifest. `measurements` is { [surfaceId]: { [passId]: probeResult } }.
 * A surface with no measurements at all is unproven across the board — never skipped.
 */
export function evaluateMatrix({ surfaces, measurements = {}, thresholds = THRESHOLDS, frames = {} }) {
  const rows = surfaces.map((surface) => evaluateSurface({
    surface,
    passes: measurements[surface.id] || {},
    thresholds,
    frames: frames[surface.id] || null,
  }));
  const red = rows.filter((r) => r.status !== 'green');
  return {
    rows,
    green: rows.length - red.length,
    red: red.length,
    total: rows.length,
    // "≥ 30 surfaces" means thirty surfaces we actually OPENED on a public route. A manifest row for
    // a legacy or non-existent screen is not a reachable surface and must never be counted as one.
    measuredSurfaces: rows.filter((r) => r.measured).length,
    openedOnPublicRoute: rows.filter((r) => r.openedOnPublicRoute).length,
  };
}

/**
 * Flat ownership rows for the map table: one entry per failing cell, each with the packet AND the
 * leaf that clears it. This is the artifact §18 mirrors.
 */
export function ownershipRows(matrix) {
  const out = [];
  for (const row of matrix.rows) {
    for (const ruleId of row.failing) {
      const c = row.cells[ruleId];
      out.push({
        surface: row.id,
        surfaceTitle: row.title,
        archetype: row.archetype,
        rule: ruleId,
        status: c.status,
        packet: c.owner ? c.owner.packet : null,
        leaf: c.owner ? c.owner.leaf : null,
        detail: c.detail,
      });
    }
  }
  return out;
}

/** Compact status glyph for the printed matrix. */
export function cellGlyph(status) {
  switch (status) {
    case 'green': return 'OK ';
    case 'n/a': return ' - ';
    case 'red': return 'RED';
    case 'unmeasured': return 'UNM';
    default: return 'UNP';
  }
}

export default { RULES, RULE_IDS, evaluateSurface, evaluateMatrix, surfaceProbe, MEASUREMENT_PASSES };
