// Asteroid Works render contract — the contact ring the clamp arms are built from.
//
// WHY THIS FILE EXISTS. asteroidRenderer3d.syncMachineArms used to build a machine's clamp arms
// from `projection.machines[i].geo`, which is an alias of asteroidSites' cached `rt.geo[id]`. That
// cache is rebuilt wholesale when a neighbour is bored, so until the screen's projection cache
// caught up the arms kept clamping a cell the player had already hollowed out. The renderer now
// walks its own CONTACT_RING over the LIVE drill field instead — which is the same field-truth
// rule asteroidSites.canInstall already states for itself ("the live session field when drilling,
// else the durable record").
//
// That correctness now rests on the renderer's private ring being byte-identical in ORDER and
// MEANING to siteProduction's unexported RING_OFFSETS. The renderer reports a divergence to the
// console at module load but deliberately does NOT throw: uiRoot.registerScreens() swallows a
// module-evaluation rejection with a console.warn and skips the screen, so throwing would delete
// the entire mining board from the game while boot and every headless check stayed green. This
// file is the hard gate that fails a build instead.
//
// Pure per test/AGENTS.md: no DOM, no WebGL, no canvas, no wall clock. It calls only exported
// pure helpers. The pixels themselves still need a runtime probe — see
// scripts/capture-asteroid-works.mjs and the renderer's machineContacts() hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  CONTACT_RING,
  contactRingDivergence,
  setWorksAnnotationTexture,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { contactKind, contactProfile } from '../src/systems/siteProduction.js';

/** The renderer's own signature rule, reproduced here so a reorder cannot pass silently. */
function ringSignature(field, cols, rows, col, row) {
  const parts = [];
  for (const [dc, dr] of CONTACT_RING) {
    const c = col + dc;
    const r = row + dr;
    const tile = (c >= 0 && c < cols && r >= 0 && r < rows && field[c]) ? field[c][r] : null;
    const kind = contactKind(tile);
    parts.push(`${c},${r},${kind},${kind === 'ore' ? (tile.ore || '') : ''}`);
  }
  return parts.join(';');
}

test('pooled Works annotations only invalidate a material when their texture identity changes', () => {
  const material = { map: null, invalidations: 0 };
  Object.defineProperty(material, 'needsUpdate', {
    set(value) { if (value === true) material.invalidations += 1; },
  });
  const seamTexture = { name: 'seam-count' };
  const nextTexture = { name: 'next-seam-count' };

  assert.equal(setWorksAnnotationTexture(material, seamTexture), true);
  assert.equal(material.invalidations, 1);
  assert.equal(setWorksAnnotationTexture(material, seamTexture), false,
    'the steady annotation frame reuses the existing sampler binding');
  assert.equal(material.invalidations, 1);
  assert.equal(setWorksAnnotationTexture(material, nextTexture), true,
    'a changed label/selection still publishes its new texture');
  assert.equal(material.invalidations, 2);
});

test('renderer CONTACT_RING agrees with the sim ring on every kind and on the boundary', () => {
  assert.equal(
    contactRingDivergence(), null,
    'asteroidRenderer3d.CONTACT_RING no longer matches siteProduction.contactProfile — the clamp '
    + 'arms would be built for different cells than the sim pays yield for',
  );
});

test('CONTACT_RING is the eight neighbours in reading order, centre excluded', () => {
  // Pinned literally: contactRingDivergence() compares the two sides, so a matching reorder of
  // BOTH would still pass. This is the renderer half held still.
  assert.deepEqual(CONTACT_RING.map((o) => [o[0], o[1]]), [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ]);
  assert.equal(CONTACT_RING.length, 8);
  assert.ok(Object.isFrozen(CONTACT_RING), 'a mutable ring could be reordered at runtime');
  assert.ok(
    !CONTACT_RING.some(([dc, dr]) => dc === 0 && dr === 0),
    'the seat itself is never a contact — a machine sits on a hollow cell',
  );
});

test('contactKind maps every drill tile type the renderer can meet', () => {
  assert.equal(contactKind(null), 'empty', 'out of bounds contributes nothing');
  assert.equal(contactKind(undefined), 'empty');
  assert.equal(contactKind({ type: 'empty' }), 'empty');
  assert.equal(contactKind({ type: 'dirt' }), 'matrix');
  assert.equal(contactKind({ type: 'rock' }), 'basalt');
  assert.equal(contactKind({ type: 'gas' }), 'gas');
  assert.equal(contactKind({ type: 'vein', ore: 'ore_iron' }), 'ore');
  // A vein with no ore id is not a payable contact; it must not read as ore or the arm would be
  // painted for a material the sim never credits.
  assert.equal(contactKind({ type: 'vein', ore: null }), 'basalt');
  // A machine housing stamped onto a hollow cell (asteroidSites._stampStructures writes
  // tile.structure and leaves tile.type alone) stays hollow, so it never grows a clamp arm.
  assert.equal(contactKind({ type: 'empty', structure: 'm_1' }), 'empty');
});

test('boring a neighbour releases that contact from the ring signature', () => {
  // The whole point of reading the live field: the signature must change the instant the tile
  // does, without waiting for a projection rebuild.
  const cols = 3;
  const rows = 3;
  const field = [];
  for (let c = 0; c < cols; c++) {
    field[c] = [];
    for (let r = 0; r < rows; r++) field[c][r] = { type: 'vein', ore: 'ore_iron' };
  }
  field[1][1] = { type: 'empty' };            // the seat

  const before = ringSignature(field, cols, rows, 1, 1);
  assert.ok(before.includes('0,0,ore,ore_iron'), before);
  assert.equal(contactProfile(field, 1, 1, cols, rows).solid, 8);

  field[0][0] = { type: 'empty' };            // the player bores one neighbour
  const after = ringSignature(field, cols, rows, 1, 1);
  assert.notEqual(after, before, 'a bored neighbour must change the ring signature');
  assert.ok(after.includes('0,0,empty,'), after);
  assert.equal(contactProfile(field, 1, 1, cols, rows).solid, 7, 'the sim agrees it is gone');
});

test('the ring signature and the sim profile stay cell-for-cell identical as the field changes', () => {
  const cols = 5;
  const rows = 5;
  const field = [];
  for (let c = 0; c < cols; c++) {
    field[c] = [];
    for (let r = 0; r < rows; r++) {
      const m = (c + r) % 5;
      if (m === 0) field[c][r] = { type: 'vein', ore: `ore_${c}_${r}` };
      else if (m === 1) field[c][r] = { type: 'gas' };
      else if (m === 2) field[c][r] = { type: 'rock' };
      else if (m === 3) field[c][r] = { type: 'empty' };
      else field[c][r] = { type: 'dirt' };
    }
  }

  // Every legal seat on the board, including the corners where five neighbours are off-field.
  const seats = [[0, 0], [2, 2], [4, 4], [0, 2], [4, 0]];
  const bores = [null, [1, 1], [3, 3], [0, 1], [4, 3]];

  for (const bore of bores) {
    if (bore) field[bore[0]][bore[1]] = { type: 'empty' };
    for (const [col, row] of seats) {
      const seat = field[col][row];
      field[col][row] = { type: 'empty' };
      const cells = contactProfile(field, col, row, cols, rows).cells;
      const simSig = cells
        .map((c) => `${c.col},${c.row},${c.kind},${c.kind === 'ore' ? (c.ore || '') : ''}`)
        .join(';');
      assert.equal(
        ringSignature(field, cols, rows, col, row), simSig,
        `seat ${col},${row} after boring ${bore ? bore.join(',') : 'nothing'}`,
      );
      field[col][row] = seat;
    }
  }
});

test('the renderer module evaluates in plain Node and reports its ring without throwing', async () => {
  // Guards two things at once: the file parses and its whole import graph resolves (no DOM or
  // canvas touched at module scope), and the module-load ring probe stays non-fatal. A throw here
  // would be swallowed by uiRoot.registerScreens() in the real game and silently remove the
  // mining screen, so it must never be the failure mode.
  //
  // The cache-buster is load-bearing: this file's static import at the top already evaluated the
  // module before any test ran, so importing the plain specifier would return the cached instance
  // and the console spy below would capture nothing. A distinct specifier forces a fresh
  // evaluation with the spy installed. (`three` keeps its own specifier, so it stays cached.)
  const errors = [];
  const realError = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); };
  let mod;
  try {
    mod = await import(`../src/ui/asteroid/asteroidRenderer3d.js?fresh=${Date.now()}`);
  } finally {
    console.error = realError;
  }
  assert.equal(typeof mod.createAsteroidRenderer3d, 'function');
  assert.equal(typeof mod.contactRingDivergence, 'function');
  assert.deepEqual(
    errors.filter((e) => e.includes('CONTACT_RING')), [],
    'module load reported a ring divergence',
  );
});

// ==================== design law, source half (PQ-185.00) ====================
// The binding authority is design/ASTEROID_WORKS_DESIGN_LAW.md; its hex, px and em
// values are literal law (§0, §3.2, §3.3). The invariants that need glass — §11.1
// flatness, §11.2 board fraction, §11.3 word budget, computed type/palette, live fog
// state, live event expression — are asserted by scripts/check-asteroid-theater.mjs
// against the running renderer's canvas.__ast3d hook. What follows is the half that
// lives in this repo's own text: the token block, the stylesheet, the injected overlay
// style and the screen/renderer modules, so a source-level regression fails here in
// milliseconds instead of after a browser boot.

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const LAW_CSS = readFileSync(new URL('../styles/asteroid-ops.css', import.meta.url), 'utf8');
const LAW_CSS_CLEAN = stripComments(LAW_CSS);
const LAW_TOKENS_CSS = stripComments(
  readFileSync(new URL('../assets/ui/kit/tokens/tokens.css', import.meta.url), 'utf8'));
const LAW_FONTS_CSS = stripComments(
  readFileSync(new URL('../styles/fonts.css', import.meta.url), 'utf8'));
const LAW_SCREEN_JS = readFileSync(new URL('../src/ui/asteroid/asteroidScreen.js', import.meta.url), 'utf8');
const LAW_RENDERER_JS = readFileSync(new URL('../src/ui/asteroid/asteroidRenderer3d.js', import.meta.url), 'utf8');

// Strip `//` line comments too — the `[^:]` guard keeps `://` inside string literals.
const stripJsComments = (s) => stripComments(s).replace(/(^|[^:"'])\/\/[^\n]*/g, '$1');

// Every live surface file, comment-stripped: the stylesheet plus all of src/ui/asteroid/.
const LAW_SURFACE = { 'styles/asteroid-ops.css': LAW_CSS_CLEAN };
{
  const astDir = new URL('../src/ui/asteroid/', import.meta.url);
  for (const f of readdirSync(astDir)) {
    if (f.endsWith('.js')) {
      LAW_SURFACE[`src/ui/asteroid/${f}`] = stripJsComments(
        readFileSync(new URL(f, astDir), 'utf8'));
    }
  }
}

/** Every `--name: value` declaration across the given sheets, in source order. */
function tokenTable(...cssTexts) {
  const table = new Map();
  for (const text of cssTexts) {
    for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
      const list = table.get(m[1]) || [];
      list.push(m[2].trim());
      table.set(m[1], list);
    }
  }
  return table;
}
// Kit tokens first, then the screen's own block — a local override must be measured too.
const LAW_VARS = tokenTable(LAW_TOKENS_CSS, LAW_CSS_CLEAN);

/** Resolve a declaration value; a whole-value var() expands to every definition found. */
function resolveDecl(value) {
  const vm = value.trim().match(/^var\((--[\w-]+)\s*(?:,[^)]*)?\)$/);
  if (!vm) return [value.trim()];
  return LAW_VARS.get(vm[1]) || [];
}

/** All `{ selector body }` rule blocks whose body contains `needle`. */
function rulesContaining(css, needle) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[2].includes(needle)) out.push(m[1].trim());
  }
  return out;
}

test('law §3.2: the warm --aw-* chrome tokens exist at the law hexes', () => {
  const expected = {
    '--aw-bg': '#171310', '--aw-surface': '#221c15', '--aw-raised': '#2d251b',
    '--aw-line': '#3a3126', '--aw-ink': '#f2e8d5', '--aw-ink-2': '#bfae94',
    '--aw-ink-3': '#8a7a66', '--aw-gold': '#ffb648', '--aw-mint': '#7cd9a2',
    '--aw-coral': '#ff6242', '--aw-sky': '#5cc8f2',
  };
  const defined = tokenTable(LAW_CSS_CLEAN);
  for (const [name, hex] of Object.entries(expected)) {
    const got = defined.get(name);
    assert.ok(got, `${name} is not defined — the chrome palette is incomplete`);
    assert.ok(
      got.includes(hex),
      `${name} = ${got.join(', ')} — law §3.2 requires ${hex}`,
    );
  }
});

test('law §3.2: no foreign sheet redefines an --aw-* token at runtime', () => {
  // The deckplate bridge (src/ui/deckplate/screens.js) injects a stylesheet that reaches every
  // #screens child. A `--aw-x: value` declaration there silently remaps the law palette on the
  // live route while this file's token assertions stay green — it once flattened --aw-mint and
  // --aw-sky to bone and swapped --aw-mono off Spline Sans Mono. The tokens are the screen's own;
  // nothing outside asteroid-ops.css may declare them.
  const bridge = stripJsComments(
    readFileSync(new URL('../src/ui/deckplate/screens.js', import.meta.url), 'utf8'));
  const foreign = [...bridge.matchAll(/(--aw-[\w-]+)\s*:/g)].map((m) => m[1]);
  assert.deepEqual(foreign, [],
    `deckplate bridge redefines law tokens: ${foreign.join(', ')}`);

  // Same reach, other direction: the bridge's screen-scoped selectors would pin kit
  // uppercase/.1em keys at ~(1,4,2), where the screen's own (0,2,0) rules cannot win.
  // The drill mount is `#screens > .screen[data-screen="drill"]` — the `.ast-screen`
  // class sits one level down on the wrap, so excluding the class itself does nothing.
  // Every bare `#screens > :not(...)` child selector must carry the drill exclusion;
  // child selectors qualified by a class (`.k-screen`, `.of-*`) cannot match the mount.
  for (const m of bridge.matchAll(/#screens\s*>\s*(?::not\([^)]*\))+/g)) {
    assert.ok(m[0].includes('data-screen="drill"'),
      `bridge child selector lacks the drill exclusion: ${m[0]}`);
  }
});

test('law §3.2/§11.5: the banned blue-gray family and deleted --ao-* voice are absent', () => {
  const banned = ['#14171d', '#1b2027', '#0b1220', '#2a303a', '#0d0f13'];
  for (const [file, text] of Object.entries(LAW_SURFACE)) {
    for (const hex of banned) {
      const re = new RegExp(`${hex}\\b`, 'i');
      assert.ok(!re.test(text), `${file} paints banned blue-gray ${hex}`);
    }
    assert.ok(!/var\(--ao-/.test(text), `${file} still consumes the deleted --ao-* voice`);
  }
});

test('law §3.3: the faces are the law\'s, vendored, and Bricolage has exactly one job', () => {
  const defined = tokenTable(LAW_CSS_CLEAN);
  assert.match(defined.get('--aw-font')[0], /^"Instrument Sans"/,
    '--aw-font must lead with Instrument Sans');
  assert.match(defined.get('--aw-mono')[0], /^"Spline Sans Mono"/,
    '--aw-mono must lead with Spline Sans Mono (numerals only)');
  assert.match(defined.get('--aw-name-font')[0], /^"Bricolage Grotesque"/,
    '--aw-name-font must lead with Bricolage Grotesque');
  for (const fam of ['Instrument Sans', 'Spline Sans Mono', 'Bricolage Grotesque']) {
    const re = new RegExp(`font-family:\\s*["']?${fam.replace(/ /g, '\\s')}`);
    assert.ok(re.test(LAW_FONTS_CSS), `${fam} has no @font-face — it is not vendored`);
  }
  const sairaHits = Object.keys(LAW_SURFACE)
    .filter((f) => /saira/i.test(LAW_SURFACE[f]));
  assert.deepEqual(sairaHits, [],
    'Saira — the "harsh" face the law deleted — is back on: ' + sairaHits.join(', '));
  // Bricolage in exactly one place: the asteroid's name in the crest, 20px (§3.3).
  const users = rulesContaining(LAW_CSS_CLEAN, 'var(--aw-name-font');
  assert.deepEqual(
    users.filter((s) => !s.includes('.aw-crest-name')), [],
    `--aw-name-font leaks outside the crest name: ${users.join(' | ')}`,
  );
  const crest = users.find((s) => s.includes('.aw-crest-name'));
  assert.ok(crest, 'the crest name no longer uses --aw-name-font');
  const crestBody = LAW_CSS_CLEAN.match(
    new RegExp(`${crest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))[1];
  assert.match(crestBody, /font:\s*600\s+20px\//, 'the crest name must be Bricolage 600 at 20px');
});

test('law §3.3/§11.4: zero uppercase transforms and no tracking above .02em', () => {
  // ui.css ships global tracked-caps rules; .ast-screen must actively suppress them.
  const guard = rulesContaining(LAW_CSS_CLEAN, 'text-transform: none')
    .filter((s) => /\.ast-screen/.test(s));
  assert.ok(guard.some((s) => s.includes('*')),
    '.ast-screen * no longer pins text-transform:none — inherited caps can leak back in');
  for (const [file, text] of Object.entries(LAW_SURFACE)) {
    assert.ok(!/text-transform\s*:\s*uppercase/i.test(text),
      `${file} sets text-transform:uppercase`);
    assert.ok(!/textTransform['"]?\s*[:=]\s*['"]uppercase/i.test(text),
      `${file} sets style textTransform uppercase`);
    for (const m of text.matchAll(/letter-spacing\s*:\s*([^;'"}\n]+)/g)) {
      const decl = m[1].trim();
      if (decl === 'normal') continue;
      const values = resolveDecl(decl);
      assert.ok(values.length, `${file}: letter-spacing ${decl} resolves to nothing`);
      for (const v of values) {
        const n = parseFloat(v);
        assert.ok(
          v.endsWith('em') && n <= 0.02,
          `${file}: letter-spacing ${decl} resolves to ${v} — the law caps tracking at .02em`,
        );
      }
    }
  }
});

test('law §3.3/§11.4: no glyph under the 12px floor', () => {
  const bad = [];
  const checkValue = (file, decl) => {
    const values = resolveDecl(decl);
    if (!values.length) { bad.push(`${file}: '${decl}' resolves to nothing`); return; }
    for (const v of values) {
      if (/^\d+(?:\.\d+)?px$/.test(v)) {
        if (parseFloat(v) < 12) bad.push(`${file}: '${decl}' -> ${v}`);
      } else {
        bad.push(`${file}: '${decl}' -> '${v}' is not a px size this check can measure`);
      }
    }
  };
  for (const [file, text] of Object.entries(LAW_SURFACE)) {
    for (const m of text.matchAll(/font-size\s*:\s*([^;'"}\n]+)/g)) {
      checkValue(file, m[1]);
    }
    // `font:` shorthand — the size is the token immediately before the slash.
    for (const m of text.matchAll(/font\s*:\s*[^;{}]*?(\d+(?:\.\d+)?px|var\(--[\w-]+\s*(?:,[^)]*)?\))\s*\//g)) {
      checkValue(file, m[1]);
    }
  }
  assert.deepEqual(bad, [], `glyphs below the law's 12px floor:\n  ${bad.join('\n  ')}`);
});

test('law §3.4: shape vocabulary — 8px keys, pill chips, nothing rounder than a card', () => {
  const keyRule = LAW_CSS_CLEAN.match(/\.aw-build-key\s*\{([^}]*)\}/);
  assert.ok(keyRule, '.aw-build-key missing — the build palette key is law §6.3');
  assert.match(keyRule[1], /width:\s*46px/, 'build keys are 46px square');
  assert.match(keyRule[1], /height:\s*46px/, 'build keys are 46px square');
  assert.match(keyRule[1], /border-radius:\s*8px/, 'keys carry the law\'s 8px radius');
  // Every literal radius on the surface: a px corner no rounder than the 10px card, or a
  // pill (50% / 999px). Anything else is a shape the law never drew.
  for (const m of LAW_CSS_CLEAN.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
    for (const part of m[1].trim().split(/\s+/)) {
      assert.ok(
        part === '0' || /^50%$/.test(part) || /^9{2,}(px|em|%)?$/.test(part)
          || (/^\d+(?:\.\d+)?px$/.test(part) && parseFloat(part) <= 10),
        `border-radius ${m[1].trim()} — law §3.4 only draws 8px keys, 10px cards, pill chips`,
      );
    }
  }
});

test('law §5/§3.5: the yield floater is mono 13px --aw-gold rising 24px over 700ms', () => {
  assert.match(LAW_RENDERER_JS, /FLOATER_LIFE_S\s*=\s*0\.7/, 'floater life must be 700ms');
  assert.match(LAW_RENDERER_JS, /FLOATER_RISE_PX\s*=\s*24/, 'floater rise must be 24px');
  const overlay = LAW_RENDERER_JS.match(/\.ast3d-overlay\s*\{([^}]*)\}/);
  const floater = LAW_RENDERER_JS.match(/\.ast3d-floater\s*\{([^}]*)\}/);
  assert.ok(overlay && floater, 'the injected overlay/floater style is missing');
  assert.match(overlay[1], /font-family:\s*"Spline Sans Mono"/, 'floaters must be mono');
  assert.match(floater[1], /font-size:\s*13px/, 'floaters must be 13px');
  assert.match(floater[1], /color:\s*#ffb648/i, 'floaters must be --aw-gold #ffb648');
});

test('law §2.3/§11.6: no fog construct, and the live hook reports material identity', () => {
  for (const [file, text] of Object.entries(LAW_SURFACE)) {
    if (file.endsWith('.css')) continue;
    assert.ok(!/new\s+THREE\.Fog|FogExp2|scene\.fog\s*=/.test(text),
      `${file} constructs scene fog — law §2.3 removed it`);
  }
  // §11.6 is only honest measured against the LIVE renderer; this pins the hook the
  // theater check reads so it cannot be quietly deleted.
  for (const field of ['canvas.__ast3d', 'cellAppearance', 'material', 'anonymous', 'revealed']) {
    assert.ok(LAW_RENDERER_JS.includes(field),
      `renderer no longer publishes ${field} — §11.6 becomes unmeasurable`);
  }
});

test('law §11.8: the board event surface is published and the screen subscribes', () => {
  for (const ev of ["bus.on('drill:yield'", "bus.on('drill:gasHit'"]) {
    assert.ok(LAW_SCREEN_JS.includes(ev) || LAW_SCREEN_JS.includes(ev.replace("'", '"')),
      `asteroidScreen no longer subscribes to ${ev} — the event dies off-board`);
  }
  for (const hook of ['events()', 'kickPx(', 'vignette(', 'fx(']) {
    assert.ok(LAW_RENDERER_JS.includes(hook),
      `renderer no longer publishes ${hook} — §11.8 becomes unmeasurable`);
  }
});

test('law §11: the glass-side invariants stay asserted by their live checks', () => {
  // The DOM/canvas halves of §11 are unmeasurable in plain node by design — this pins
  // that the checks which DO measure them still exist and still name the laws, so the
  // coverage cannot be silently dropped while this file stays green.
  const theater = readFileSync(new URL('../scripts/check-asteroid-theater.mjs', import.meta.url), 'utf8');
  for (const marker of ['boardPct', 'word budget', 'projectCell', 'cellAppearance', 'kickPx']) {
    assert.ok(theater.includes(marker),
      `check-asteroid-theater.mjs no longer asserts the invariant behind '${marker}'`);
  }
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const script of ['check:asteroid-theater', 'check:asteroid-drive-cadence', 'check:asteroid-sound']) {
    assert.ok(pkg.scripts[script], `${script} is missing — a §11 invariant lost its check`);
  }
});

// Grammar floor the matrix measures on the live shell (PQ-185.01). These are the
// cells the screen itself can fail: a figure face, an ultrawide stretch, and a
// 1px announcement box the probe would call a clip. Seam cells (type role, motion,
// keyboard, frame time) stay unproven until PQ-180 grows a seam — this file does
// not pretend a proxy passes them.
test('grammar floor: numeral face, ultrawide clamp, announcement is not a measured clip', () => {
  const shell = LAW_CSS_CLEAN.match(/#screens\s*>\s*\.screen\[data-screen="drill"\]\s*\{([^}]*)\}/);
  assert.ok(shell, 'the drill screen shell is not clamped — the grammar root would stay 100vw at 2560');
  assert.match(shell[1], /max-width:\s*2508px/, '2560px × 0.98 is 2508.8; 2509px already fails the stretch line');
  assert.match(shell[1], /width:\s*100vw/, 'below ultrawide the mine stays edge to edge');
  const name = LAW_CSS_CLEAN.match(/\.aw-crest-name\s*\{([^}]*)\}/);
  const chip = LAW_CSS_CLEAN.match(/\.aw-chip\s*\{([^}]*)\}/);
  assert.ok(name && chip, 'crest name or claim chip rule missing');
  assert.match(name[1], /font-variant-numeric:\s*tabular-nums/, 'AST-<id> is a figure and must be tabular');
  assert.match(chip[1], /font-variant-numeric:\s*tabular-nums/, 'an assay count on the chip is a figure');
  const label = LAW_CSS_CLEAN.match(/\.aw-gauge-label\s*\{([^}]*)\}/);
  assert.ok(label, 'gauge label rule missing');
  assert.match(label[1], /min-width:\s*56px/, 'the rig was measured against a 56px label floor');
  assert.doesNotMatch(label[1], /(?:^|;)\s*width:\s*56px/, 'a fixed 56px label clips the pseudo-locale word');
  const sr = LAW_CSS_CLEAN.match(/\.ast-sr-status\s*\{([^}]*)\}/);
  assert.ok(sr, 'screen-reader status rule missing');
  assert.match(sr[1], /opacity:\s*0/, 'the 1px announcement box is a grammar clip unless the probe treats it as hidden');
});
