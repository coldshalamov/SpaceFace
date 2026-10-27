// Source-derived layout budgets, NOT browser-computed rectangles or visual acceptance.
// The fixture evaluates only the explicit mobile placement contract. Browser font wrapping,
// computed cascade, safe-area hardware and real pointer hit testing still require live frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOBILE_CSS } from '../src/systems/mobile/styles.js';
const hud = readFileSync(new URL('../src/ui/views/hudStyles.js', import.meta.url), 'utf8');
const lanes = MOBILE_CSS.slice(MOBILE_CSS.indexOf('/* Mobile flight lanes:'));
function blocks(css, media = '') {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let i = 0;
  while (i < css.length) {
    const a = css.indexOf('{', i); if (a < 0) break;
    const selector = css.slice(i, a).trim(); let n = 1, b = a + 1;
    while (b < css.length && n) { if (css[b] === '{') n++; if (css[b] === '}') n--; b++; }
    const body = css.slice(a + 1, b - 1);
    if (selector.startsWith('@media')) out.push(...blocks(body, selector));
    else out.push({ selector, body, media });
    i = b;
  }
  return out;
}
const rules = blocks(lanes);
const endings = {
  dock: '#hud .sf-rightdock', context: '#hud > .sf-leftcontext',
  nav: '#hud #race-tape[data-compact="true"]', radar: '#hud .sf-radar-wrap',
  alerts: '#alerts', receipts: '#toasts',
};
function style(target, state) {
  const result = {};
  for (const rule of rules) {
    if (rule.media.includes('max-height:500px') && !(state.height <= 500 && state.width > state.height)) continue;
    if (rule.media.includes('max-width:374px') && !(state.width <= 374 && state.height >= state.width)) continue;
    for (const selector of rule.selector.split(',\n')) {
      if (selector.includes('data-sf-mobile-lefty') && !state.lefty) continue;
      if (selector.includes('data-sf-mobile-wheel') && !state.wheel) continue;
      if (selector.includes(':has(.sf-radar-wrap--expanded)') && !state.expanded) continue;
      const match = selector.endsWith(endings[target]) || (target === 'radar' && state.expanded && selector.endsWith('#hud .sf-radar-wrap--expanded'));
      if (!match) continue;
      for (const decl of rule.body.split(';')) {
        const at = decl.indexOf(':'); if (at < 0) continue;
        result[decl.slice(0, at).trim()] = decl.slice(at + 1).replace(/!important/g, '').trim();
      }
    }
  }
  return result;
}
function number(value, s) {
  const cluster = Math.round(196 * s.scale);
  const edge = s.height <= 500 ? 24 + cluster * .87 : Math.max(90, 20 + cluster * .266);
  const vars = { '--sf-mobile-edge': edge, '--sf-mobile-nav-w': Math.max(136,Math.min(s.width-528,236)), '--sf-safe-top': 0, '--sf-safe-bottom': 0, '--sf-safe-left': 0, '--sf-safe-right': 0 };
  let expr = value.replace(/var\((--[^,)]+)(?:,[^)]+)?\)/g, (_, name) => {
    assert.ok(name in vars, `unhandled CSS variable ${name}`); return vars[name];
  }).replace(/([\d.]+)(d?vw)/g, (_, n) => Number(n) * s.width / 100)
    .replace(/([\d.]+)(d?vh)/g, (_, n) => Number(n) * s.height / 100)
    .replace(/px/g, '').replace(/calc\(/g, '(').replace(/\b(max|min)\(/g, 'Math.$1(');
  assert.match(expr, /^[\d\s.+*/(),Mathminax-]+$/, `bounded CSS expression: ${expr}`);
  return Function(`return (${expr})`)();
}
function box(target, s) {
  const st = style(target, s), width = number(st.width, s);
  const height = target === 'receipts' ? 74 : target === 'nav' ? 56 : target === 'radar' && !s.expanded ? number(st.height, s) : number(st['max-height'], s);
  const left = st.left && st.left !== 'auto' ? number(st.left, s) : s.width - number(st.right, s) - width;
  return { x: left, y: number(st.top, s), w: width, h: height };
}
const intersects = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
function separate(a,b,label) { assert.equal(intersects(a,b), false, `${label}: ${JSON.stringify({a,b})}`); }
for (const [width,height] of [[320,568],[360,640],[390,664],[667,375],[844,390]]) for (const requestedScale of [1,1.6]) for (const lefty of [false,true]) {
  const scale = Math.min(requestedScale, height <= 500 ? Math.max(.8,(height-164)/220) : 1.6);
  const state = { width,height,scale,lefty };
  test(`${width}x${height}, controls ${requestedScale}, ${lefty?'left':'right'}: source lane budget`, () => {
    const nav=box('nav',state), radar=box('radar',state), context=box('context',state), receipts=box('receipts',state);
    // Two ordinary one-line informational receipts: variable-length required receipts are not bounded by this fixture.
    separate(receipts,context,'ordinary receipts and mission'); separate(receipts,radar,'ordinary receipts and radar'); separate(receipts,nav,'ordinary receipts and navigation');
    separate(nav,context,'camera/Circuits and mission'); separate(radar,context,'radar and mission');
    separate(nav,radar,'navigation and radar'); separate(nav,box('alerts',state),'navigation and alerts');
    const central={x:width/2-20,y:height/2-20,w:40,h:40};
    for (const [name,b] of Object.entries({nav,radar,context,receipts})) {
      separate(b,central,`${name} leaves central flight clear`);
      assert.ok(b.x>=0 && b.y>=0 && b.x+b.w<=width && b.y+b.h<=height, `${name} within viewport`);
    }
    const short=height<=500, cluster=(short?170:196)*scale, gun=(short?82:96)*scale, tether=(short?66:78)*scale;
    const bottom=short?10:18, clusterH=(short?132:156)*scale;
    const gunBox={x:lefty?16:width-16-gun,y:height-bottom-clusterH,w:gun,h:gun};
    const powerW=Math.max(44,48*scale)+18, powerH=short?Math.max(64,88*scale):lefty&&width<375?88*scale:110*scale;
    const powers={x:lefty?0:width-powerW,y:(lefty&&short?118:lefty&&width<375?132:height-bottom-clusterH-78-powerH)-8,w:powerW,h:powerH+16};
    for (const [name,b] of Object.entries({nav,radar,context,receipts})) separate(b,powers,`${name} and Powers hit pad`);
    const status={x:14,y:10,w:width<375?92:124,h:short?94:108};
    for (const [name,b] of Object.entries({nav,radar,context,receipts,powers})) separate(b,status,`${name} and ship status`);
    const tetherBox={x:lefty?16+cluster-tether:width-16-cluster,y:height-bottom-tether,w:tether,h:tether};
    for (const expanded of [false,true]) {
      const r=box('radar',{...state,expanded});
      separate(r,box('alerts',{...state,expanded}),'radar/detail and alerts');
      separate(r,gunBox,'radar/detail and gun'); separate(r,tetherBox,'radar/detail and tether');
      separate(r,central,'radar/detail and central flight'); separate(r,powers,'radar/detail and Powers');
      separate(r,receipts,'radar/detail and ordinary receipts');
    }
    assert.equal(style('context',{...state,expanded:true}).visibility,'hidden','explicit details replace overlapping context, not baseline mission');
    assert.equal(style('dock',{...state,wheel:true}).visibility,'hidden','Powers suppresses invisible dock hit targets');
  });
}
test('mobile geometry has one unscaled authority, independent of desktop dock normal flow', () => {
  assert.ok(lanes.startsWith('/* Mobile flight lanes:'), 'production lane contract present');
  assert.equal(style('dock',{width:390,height:664}).contain,'none');
  assert.equal(style('dock',{width:390,height:664}).transform,'none');
  assert.equal(style('radar',{width:390,height:664}).transform,'none');
  assert.equal(style('nav',{width:390,height:664}).position,'fixed');
  assert.doesNotMatch(hud,/data-sf-mobile-flight="1"[^}]+(?:right:|top:|overflow:|transform:)/,'desktop stylesheet does not reclaim phone geometry');
  assert.match(lanes, /\.sf-rightdock \* \{ pointer-events:none!important/,'wheel descendants cannot re-enable invisible hit targets');
  assert.match(lanes, /\.sf-radar-wrap--expanded \{[^}]*overflow-y:auto!important/,'all optional detail remains scrollable');
  assert.match(lanes, /\.sf-leftcontext \{[^}]*overflow-y:auto!important/,'long mission context has an explicit scroll surface');
});
test('rotation is CSS-only and preserves the live radar expansion and camera actions', () => {
  const portrait=style('radar',{width:390,height:664,expanded:true});
  const landscape=style('radar',{width:844,height:390,expanded:true});
  assert.equal(landscape.width,'120px'); assert.notEqual(portrait.top,landscape.top);
  assert.equal(portrait['overflow-y'],'auto'); assert.equal(landscape['overflow-y'],'auto');
  assert.match(MOBILE_CSS, /\.race-tape-actions \.k-word \{ min-height:44px/);
  assert.match(MOBILE_CSS, /#race-tape \{ font:500 12px/);
});
