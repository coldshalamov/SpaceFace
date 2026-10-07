import { clamp, canFly, distanceToRect, stickRadius, wheelSlot } from './model.js';
import { POWER_PAGES, icon } from './catalog.js';
import { MOBILE_CSS } from './styles.js';
import { createStick, dialDeg } from './instrument.js';
import { createWheel } from './wheel.js';
import { injectOrrery } from '../../ui/orrery/tokens.js';
import { arcD } from '../../ui/orrery/svg.js';

// A thumb starting on one of these is using the page, not flying. Everything else in the flight field,
// including HUD text and receipts that are not controls, starts the stick.
const UI_SELECTOR = 'button,a,input,textarea,select,label,[role="button"],[role="dialog"],[role="slider"],[contenteditable="true"],[data-sf-touch-ignore]';
const NO_FLY_SELECTOR = '.screen,[aria-modal="true"],.sf-radar-wrap';
/** The strip along the handle's screen edge that opens the wheel even when the thumb misses the handle. */
const EDGE_ZONE_PX = 34;
const STATUS_MS = 100;

const row = (key, label) => `<div class="mf-row" data-k="${key}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100">
        <span class="mf-lab">${label}</span><span class="mf-scale"><i class="mf-fill" data-read="${key}"></i></span></div>`;

/** Pointer ownership and presentation. Physics is deliberately absent from this module. */
export function mountMobileView({ state, model, activate, reset, config, saveConfig, doc = document, win = window }) {
  if (!doc.getElementById('sf-mobile-style')) {
    const style = doc.createElement('style'); style.id = 'sf-mobile-style'; style.textContent = MOBILE_CSS; doc.head.append(style);
  }
  injectOrrery(doc); // the --dp-void/-ice/-hand roots the deck's light is drawn in, even before the HUD mounts
  // Preserve browser zoom; safe areas are handled in CSS. Do not add maximum-scale/user-scalable=no.
  const viewport = doc.querySelector('meta[name="viewport"]');
  if (viewport && !viewport.content.includes('viewport-fit')) viewport.content += ', viewport-fit=cover';
  const root = doc.createElement('div'); root.id = 'sf-touch-overlay';
  root.innerHTML = `<div class="mf-flight" hidden>
    <div class="mf-top">
      <div class="mf-status" role="group" aria-label="Ship status">
        <div class="mf-speed"><b data-read="speed">0</b><i>speed</i></div>
        ${row('hull', 'Hull')}${row('shield', 'Shield')}${row('energy', 'Energy')}${row('boost', 'Boost')}
      </div>
      <button class="mf-pause" data-ui="pause" aria-label="Pause game"><svg viewBox="0 0 56 56" aria-hidden="true" focusable="false"><circle class="mf-r-band" cx="28" cy="28" r="24"/><circle class="mf-r-edge" cx="28" cy="28" r="24"/><path class="mf-r-glyph" d="M22 19v18 M34 19v18"/></svg></button>
    </div>
    <button class="mf-edge" aria-label="Powers: swipe inward to select, or tap to open" aria-expanded="false">
      <svg class="mf-edge-art" viewBox="0 0 48 132" aria-hidden="true" focusable="false"><path class="mf-e-plate" d="M48 0 C22 20 16 46 16 66 C16 86 22 112 48 132 Z"/><path class="mf-e-edge" d="M48 0 C22 20 16 46 16 66 C16 86 22 112 48 132"/><path class="mf-e-tick" d="M31 36l6 0 M26 66l7 0 M31 96l6 0"/></svg>
      <span class="mf-edge-word">Powers</span>
    </button>
    <div class="mf-reel" hidden><i class="mf-reel-up">Reel in</i><i class="mf-reel-rail"><b class="mf-reel-bead"></b></i><i class="mf-reel-down">Pay out</i></div>
    <svg class="mf-beam" hidden aria-hidden="true" focusable="false"><line class="mf-beam-bloom"/><line class="mf-beam-core"/><circle class="mf-beam-tip" r="5"/></svg>
    <div class="mf-buttons">
      <button class="mf-key mf-tether sf-touch-tether" data-role="tether" aria-label="Tether: tap to latch or cut; hold and drag to reel">
        <svg class="mf-ring-art" viewBox="0 0 80 80" aria-hidden="true" focusable="false"><circle class="mf-r-plate" cx="40" cy="40" r="37"/><circle class="mf-r-band" cx="40" cy="40" r="34"/><circle class="mf-r-edge" cx="40" cy="40" r="34"/><g class="mf-pulse"><circle class="mf-r-pulse" cx="40" cy="40" r="34"/></g></svg>
        ${icon('tether')}<span class="mf-key-word">Tether</span>
      </button>
      <button class="mf-key mf-gun sf-touch-fire" data-role="fire" aria-label="Gun: hold to fire, drag to aim">
        <span class="mf-gun-field"></span><span class="mf-ping"></span>
        <svg class="mf-aimring" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><circle class="mf-a-edge" cx="60" cy="60" r="55"/><path class="mf-a-arc" d=""/></svg>
        ${icon('gun')}<span class="mf-key-word">Gun</span>
      </button>
    </div>
    <button class="mf-dock" hidden aria-label="Dock at the station"><span>Dock</span></button>
    <div class="mf-ghost"><svg viewBox="-170 -170 340 340" aria-hidden="true" focusable="false"><circle class="mf-band" r="100"/><circle class="mf-edge-ring" r="100"/><circle class="mf-boost-dash" r="138" stroke-dasharray="10 9.7" transform="rotate(-90)"/><path class="mf-ghost-hand" d="M0 0 L58 -58"/><circle class="mf-pivot" r="8"/></svg><div class="mf-ghost-label">Touch anywhere and drag to fly</div></div>
    <div class="mf-toast" role="status" aria-live="polite" hidden></div>
  </div><button class="mf-guide-open" hidden><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 8a4 4 0 1 1 7 3l-3 2v3 M12 20v1"/></svg>Touch controls</button>`;
  doc.body.append(root);
  const q = s => root.querySelector(s);
  const flight = q('.mf-flight'), edge = q('.mf-edge'), toast = q('.mf-toast'), guideButton = q('.mf-guide-open');
  const gunKey = q('.mf-gun'), tetherKey = q('.mf-tether'), dockKey = q('.mf-dock'), pauseKey = q('.mf-pause');
  const aimArc = q('.mf-a-arc'), reel = q('.mf-reel'), reelBead = q('.mf-reel-bead'), ghost = q('.mf-ghost');
  const beam = q('.mf-beam'), beamBloom = q('.mf-beam-bloom'), beamCore = q('.mf-beam-core'), beamTip = q('.mf-beam-tip');

  const stickUI = createStick(doc);
  flight.insertBefore(stickUI.root, q('.mf-toast'));

  const guide = doc.createElement('dialog'); guide.className = 'sf-mobile-guide';
  guide.setAttribute('aria-label', 'Touch flight guide');
  guide.innerHTML = `<h2>Your thumbs. Your ship.</h2>
    <ul class="mg-list">
      <li><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 12l5-5"/></svg><div><b>Fly</b>Touch empty space and drag. The stick appears where you land. A light push is gentle thrust, the ring is full thrust, and past the dashed ring you boost.</div></li>
      <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l7 4-7 4 M10 8l7 4-7 4 M17 8l5 4-5 4"/></svg><div><b>Flick</b>A fast flick and lift is a boost tap. Let go to coast; hold a still thumb at the center to brake.</div></li>
      <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h13l3 3-3 3h-5l-2 6H7l1-7H5z"/></svg><div><b>Gun</b>Hold to fire along your heading. Drag that thumb to aim on its own; a beam shows where shots go.</div></li>
      <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19l7-7 M8 8a5 5 0 1 1 8 8 M16 4l4 4"/></svg><div><b>Tether</b>Tap to latch or cut. Hold and slide up to reel in, down to pay out, while your other thumb keeps flying.</div></li>
      <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 3a14 14 0 0 0 0 18 M16 8a6 6 0 0 0 0 8"/></svg><div><b>Powers</b>Swipe in from the edge handle, sweep to a power, lift to use it. Slide back to the middle to cancel. Tap the handle to pin it open.</div></li>
    </ul>
    <p class="mg-note">Equipment, cooldowns and the ship's turning limits still apply. Maps, pause and missions are in the Navigation bank; docking has its own key when a station is in range.</p>
    <label>Button hand <select data-pref="layout"><option value="standard">Right hand</option><option value="lefty">Left hand</option><option value="compact">Compact</option></select></label>
    <label>Control size <input data-pref="scale" type="range" min="0.8" max="1.6" step="0.05"></label>
    <label class="mg-check"><input data-pref="haptics" type="checkbox"> Haptic taps, where the phone supports them</label>
    <button class="mg-ready" data-close>Ready</button>`;
  doc.body.append(guide);

  const cleanup = [], captures = new Map(); let raf = 0, visible = false, destroyed = false, taught = false;
  let pinned = false, messageUntil = 0, dockReady = false, lastFrame = null;
  let lastNumbers = -Infinity, lastMode = '', lastTick = -1, lastBoost = false, aimDeg = NaN;
  const listen = (el, event, fn, opts) => { el.addEventListener(event, fn, opts); cleanup.push(() => el.removeEventListener(event, fn, opts)); };
  const clock = () => win.performance?.now?.() ?? 0;
  const size = () => ({ w: win.innerWidth, h: win.innerHeight });
  const eat = e => { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); };
  const haptic = () => { if (config().haptics === true) win.navigator?.vibrate?.(12); };
  const schedule = () => { if (!raf && !destroyed) raf = win.requestAnimationFrame(() => { raf = 0; render(); }); };
  const setIf = (el, key, value) => { const v = String(value); if (el.dataset[key] !== v) el.dataset[key] = v; };
  const hand = () => (root.dataset.lefty === '1' ? 'left' : 'right');
  function releaseCaptures() {
    for (const [id, target] of captures) { try { if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id); } catch {} }
    captures.clear();
  }

  // ---- the powers wheel ---------------------------------------------------------------------------------
  const wheel = createWheel(doc, {
    pages: POWER_PAGES, icon,
    onUse: power => use(power),
    onPage: i => { model.wheelPage = i; wheel.setPage(i); schedule(); },
  });
  flight.insertBefore(wheel.root, q('.mf-toast'));
  let wheelGeometry = { cx: 0, cy: 0, radius: 150 }, selected = -1;
  function markWheel(open) { doc.documentElement.dataset.sfMobileWheel = open ? '1' : '0'; }
  function cancelAll() {
    model.reset(); reset(); releaseCaptures(); pinned = false; selected = -1;
    wheel.close(); markWheel(false); edge.setAttribute('aria-expanded', 'false');
    stickUI.release({ immediate: true }); schedule();
  }
  function closeWheel() { pinned = false; selected = -1; model.wheel = null; wheel.close(); markWheel(false); edge.setAttribute('aria-expanded', 'false'); schedule(); }
  function showMessage(text) { toast.textContent = text; toast.hidden = false; messageUntil = clock() + 1800; schedule(); }
  function use(power) {
    if (!power || !canFly(state, doc)) { closeWheel(); return; }
    if (power.id === 'jettisonLot' && !win.confirm('Jettison one cargo lot?')) { closeWheel(); return; }
    if (power.id === 'fullscreen') {
      // Must remain directly inside a user gesture; failure never blocks playing. iPhone Safari has no element
      // fullscreen at all, and some browsers throw instead of rejecting: either way the pilot is told.
      const unavailable = () => showMessage('Fullscreen unavailable; play in this tab.');
      const page = doc.documentElement;
      if (typeof page.requestFullscreen !== 'function') unavailable();
      else { try { page.requestFullscreen()?.catch?.(unavailable); } catch { unavailable(); } }
    } else if (power.id === 'help') {
      activate({ id: 'pause', kind: 'ui' }); openGuide();
    } else activate(power);
    haptic(); closeWheel();
    if (power.kind !== 'ui') showMessage(`${power.label} requested`);
  }
  function openWheel(pointer = null) {
    const { w, h } = size(), bounds = edge.getBoundingClientRect();
    const short = h < 500;
    // Portrait: the bank tabs and the readout stand above the rail, the key cluster below it, so the rail's
    // radius is whatever the gap between them allows. Landscape: they sit beside it, and the rail takes the
    // screen's height (nodes need ~62px of arc each, which a small rail cannot give them).
    const topClear = 236, bottomClear = h < 650 ? 100 : 184;
    const radius = short
      ? clamp((h - 24) / 2, 92, Math.min(150, w * 0.4))
      : clamp((h - topClear - bottomClear) / 2, 96, Math.min(198, w - 56));
    const cy = short
      ? clamp(pointer?.oy ?? h * 0.5, radius + 12, h - radius - 12)
      : clamp(pointer?.oy ?? h * 0.56, topClear + radius, Math.max(topClear + radius, h - bottomClear - radius));
    const side = hand();
    const cx = side === 'left' ? bounds.left + 4 : bounds.right - 4;
    wheelGeometry = { cx, cy, radius }; selected = -1;
    wheel.open({ cx, cy, radius, side }, model.wheelPage, !pointer);
    markWheel(true); edge.setAttribute('aria-expanded', 'true'); schedule();
  }
  function openGuide() {
    cancelAll(); const cfg = config();
    const layout = cfg.layout === 'lefty' || cfg.layout === 'compact' ? cfg.layout : 'standard';
    guide.querySelector('[data-pref="layout"]').value = layout;
    guide.querySelector('[data-pref="scale"]').value = String(cfg.scale || 1);
    guide.querySelector('[data-pref="haptics"]').checked = cfg.haptics === true;
    if (!guide.open) guide.showModal();
  }
  listen(guideButton, 'click', openGuide);
  listen(guide.querySelector('[data-close]'), 'click', () => { guide.close(); guideButton.focus(); schedule(); });
  listen(guide, 'change', e => {
    const key = e.target.dataset.pref; if (!key) return;
    const value = key === 'haptics' ? e.target.checked : key === 'scale' ? Number(e.target.value) : e.target.value;
    saveConfig(key, value); applyConfig();
  });
  listen(pauseKey, 'click', () => { cancelAll(); activate({ id: 'pause', kind: 'ui' }); });
  listen(dockKey, 'click', () => { haptic(); activate({ id: 'dock', kind: 'ui' }); });
  function applyConfig() {
    const cfg = config();
    const layout = cfg.layout === 'lefty' || cfg.layout === 'compact' ? cfg.layout : 'standard';
    root.dataset.layout = layout;
    root.dataset.lefty = layout === 'lefty' ? '1' : '0';
    const scale = clamp(Number(cfg.scale) || 1, 0.8, 1.6);
    root.style.setProperty('--mf-scale', scale);
    // the page's own receipts line keeps clear of the key cluster: it needs the cluster's side and width
    const html = doc.documentElement;
    html.dataset.sfMobileLefty = layout === 'lefty' ? '1' : '0';
    html.style.setProperty('--mf-cluster-w', `${Math.round(196 * scale)}px`);
  }

  // ---- pointer ownership -------------------------------------------------------------------------------
  function nearestMiss(x, y) {
    if (distanceToRect(x, y, pauseKey.getBoundingClientRect?.()) <= 14) return 'pause';
    let best = null, bestD = 22;
    for (const el of [gunKey, tetherKey, edge]) {
      const d = distanceToRect(x, y, el.getBoundingClientRect());
      if (d > 0 && d <= bestD) { best = el; bestD = d; }
    }
    if (!best) return null;
    return best === edge ? 'wheel' : best.dataset.role;
  }
  function inEdgeZone(x, y) {
    const { w, h } = size();
    if (y < h * 0.16 || y > h * 0.84) return false;
    return hand() === 'left' ? x <= EDGE_ZONE_PX : x >= w - EDGE_ZONE_PX;
  }
  /** Fix the instrument to its contact: the stick stays where the thumb landed, whatever the thumb then does. */
  function placeStick(p) {
    const { w, h } = size();
    stickUI.root.style.transform = `translate3d(${p.ox}px,${p.oy}px,0)`;
    stickUI.root.style.setProperty('--mf-r', `${p.radius}px`);
    // keep the numeric readout on screen when the thumb lands near a side edge
    const half = 92, centre = clamp(p.ox, half + 6, w - half - 6);
    stickUI.root.style.setProperty('--mf-shift', `${centre - p.ox}px`);
    // the numeric readout goes where there is room: under the ring unless that would run off the bottom
    const keys = q('.mf-buttons')?.getBoundingClientRect?.();
    const under = { l: p.ox - 90, r: p.ox + 90, t: p.oy + p.radius * 1.62, b: p.oy + p.radius * 1.62 + 58 };
    const hitsKeys = !!keys && under.r > keys.left && under.l < keys.right && under.b > keys.top && under.t < keys.bottom;
    stickUI.root.dataset.side = under.b > h || hitsKeys ? 'above' : 'below';
  }
  function pointerDown(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (!canFly(state, doc) || guide.open) return;
    const target = e.target;
    let button = target.closest?.('[data-role]');
    let role = button?.dataset.role;
    if (target.closest?.('.mf-edge')) role = 'wheel';
    if (!role) {
      if (target.closest?.(UI_SELECTOR) || target.closest?.(NO_FLY_SELECTOR)) return;
      if (pinned) closeWheel(); // a tap in open space puts the wheel away and flies on, in one touch
      const magnet = nearestMiss(e.clientX, e.clientY);
      if (magnet === 'pause') { eat(e); return; }
      if (magnet === 'wheel' || inEdgeZone(e.clientX, e.clientY)) role = 'wheel';
      else if (magnet) {
        role = magnet;
        button = magnet === 'fire' ? gunKey : tetherKey;
      } else role = 'stick';
    }
    if (role === 'stick') taught = true;
    const { w, h } = size(), radius = stickRadius(w, h, Number(config().scale) || 1);
    if (!model.begin(e.pointerId, role, e.clientX, e.clientY, e.timeStamp, radius)) { eat(e); return; }
    eat(e);
    const capture = button || (role === 'wheel' ? edge : doc.getElementById('gl-canvas')) || root;
    try { capture.setPointerCapture(e.pointerId); captures.set(e.pointerId, capture); } catch {}
    if (role === 'stick') placeStick(model.stick);
    if (role === 'wheel') { model.wheel = model.pointers.get(e.pointerId); pinned = false; openWheel(model.wheel); }
    schedule();
  }
  function pointerMove(e) {
    const p = model.pointers.get(e.pointerId); if (!p) return;
    eat(e);
    for (const sample of (e.getCoalescedEvents?.() || [])) model.move(e.pointerId, sample.clientX, sample.clientY, sample.timeStamp);
    model.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    if (p.role === 'wheel') {
      const g = wheelGeometry, next = wheelSlot(e.clientX, e.clientY, g.cx, g.cy, g.radius, 6, selected, hand());
      if (next !== selected && next >= 0) haptic();
      selected = next; wheel.select(next);
    }
    schedule();
  }
  function pointerEnd(e, cancelled = false) {
    const p = model.pointers.get(e.pointerId); if (!p) return;
    eat(e);
    // The final pointerup can carry movement that never received a pointermove.
    model.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    if (!cancelled && p.role === 'wheel' && p.moved) {
      const g = wheelGeometry; selected = wheelSlot(e.clientX, e.clientY, g.cx, g.cy, g.radius, 6, selected, hand());
    }
    const ended = model.end(e.pointerId, e.clientX, e.clientY, e.timeStamp, cancelled);
    const capture = captures.get(e.pointerId); captures.delete(e.pointerId);
    try { if (capture?.hasPointerCapture?.(e.pointerId)) capture.releasePointerCapture(e.pointerId); } catch {}
    if (p.role === 'stick') {
      // a flick can begin and end between two animation frames, before the instrument was ever drawn: draw it
      // once so the streak still shows
      if (!cancelled && model.flickS > 0 && stickUI.root.hidden) { placeStick(p); stickUI.show(p, { heading: null }); }
      stickUI.release({ flick: !cancelled && model.flickS > 0, immediate: cancelled });
    }
    if (p.role === 'wheel') {
      model.wheel = null;
      if (cancelled) closeWheel();
      else if (!ended.moved) { pinned = true; openWheel(); }
      else if (selected >= 0) use(POWER_PAGES[model.wheelPage].powers[selected]);
      else closeWheel();
    }
    if (cancelled) reset(p.role);
    schedule();
  }
  // Registered before legacy input attaches: touch never also becomes a mouse fire/aim packet.
  listen(win, 'pointerdown', pointerDown, { capture:true, passive:false });
  listen(win, 'pointermove', pointerMove, { capture:true, passive:false });
  listen(win, 'pointerup', e => pointerEnd(e), { capture:true, passive:false });
  listen(win, 'pointercancel', e => pointerEnd(e, true), { capture:true, passive:false });
  listen(win, 'lostpointercapture', e => { if (model.pointers.has(e.pointerId)) pointerEnd(e, true); }, { capture:true });
  listen(win, 'blur', cancelAll); listen(win, 'pagehide', cancelAll);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancelAll(); schedule(); });
  let viewportSize = size();
  listen(win, 'resize', () => {
    const next = size();
    const rotated = Math.abs(next.w - viewportSize.w) > 48;
    viewportSize = next;
    if (rotated) cancelAll();
    else schedule();
  });
  if (win.visualViewport) listen(win.visualViewport, 'resize', schedule);
  listen(win, 'keydown', e => { if (e.code === 'Escape' && !wheel.root.hidden) { closeWheel(); e.preventDefault(); } });
  // Mouse/keyboard activation and accessible click path; touch quick-tap is handled above.
  listen(edge, 'click', e => { if (e.detail === 0 || e.pointerType === 'mouse') { pinned = !pinned; if (pinned) openWheel(); else closeWheel(); } });
  const observer = new win.MutationObserver(schedule);
  observer.observe(doc.body, { attributes:true, attributeFilter:['class'], childList:true });
  cleanup.push(() => observer.disconnect());

  // ---- drawing -----------------------------------------------------------------------------------------
  /** The title is where a phone player looks for help; no other screen gets the pill (Pause has its own Help verb). */
  function guideWanted() {
    const stack = state.ui?.screenStack;
    const top = Array.isArray(stack) ? stack[stack.length - 1] : null;
    return top === 'mainMenu';
  }
  function paintStatus(player) {
    const paint = (name, value, max) => {
      const el = q(`[data-read="${name}"]`);
      const ok = Number.isFinite(value) && Number.isFinite(max) && max > 0;
      const frac = ok ? clamp(value / max, 0, 1) : 0;
      el.style.transform = `scaleX(${frac.toFixed(3)})`;
      const meter = el.closest('.mf-row');
      meter.dataset.low = ok && frac < 0.28 ? '1' : '0';
      meter.setAttribute('aria-valuenow', ok ? String(Math.round(frac * 100)) : '0');
      meter.setAttribute('aria-valuetext', ok ? `${Math.round(frac * 100)}%` : 'unknown');
    };
    paint('hull', player?.hull, player?.hullMax);
    paint('shield', player?.shield, player?.shieldMax);
    paint('energy', player?.cap, player?.capMax);
    paint('boost', player?.boost?.energy, player?.boost?.max);
    const speed = player?.vel ? Math.hypot(player.vel.x, player.vel.z) : NaN;
    const text = Number.isFinite(speed) ? String(Math.round(speed)) : '—';
    const out = q('[data-read="speed"]');
    if (out.textContent !== text) out.textContent = text;
  }
  function paintAim(frame) {
    let gun = null, tether = null;
    for (const c of model.pointers.values()) { if (c.role === 'fire') gun = c; else if (c.role === 'tether') tether = c; }
    const dx = gun ? gun.x - gun.ox : 0, dy = gun ? gun.y - gun.oy : 0;
    const aiming = !!gun && Math.hypot(dx, dy) > 14;
    setIf(gunKey, 'aim', aiming ? '1' : '0');
    if (aiming) {
      const deg = dialDeg(dx, dy);
      if (!(Math.abs(deg - aimDeg) < 1)) { aimDeg = deg; aimArc.setAttribute('d', arcD(60, 60, 55, deg - 26, deg + 26)); }
    }
    // The beam from the hull along the independent aim: where shots will go, drawn on the field.
    const at = frame?.shipScreen;
    const showBeam = aiming && !!frame?.aim && !!at;
    if (beam.hidden === showBeam) beam.hidden = !showBeam;
    if (showBeam) {
      const { w, h } = size(), len = Math.min(w, h) * 0.46;
      const x2 = at.x + frame.aim.x * len, y2 = at.y + frame.aim.y * len;
      for (const l of [beamBloom, beamCore]) { l.setAttribute('x1', at.x.toFixed(1)); l.setAttribute('y1', at.y.toFixed(1)); l.setAttribute('x2', x2.toFixed(1)); l.setAttribute('y2', y2.toFixed(1)); }
      beamTip.setAttribute('cx', x2.toFixed(1)); beamTip.setAttribute('cy', y2.toFixed(1));
    }
    // tether reel ladder: visible while the thumb is on the key, its bead follows the slide
    const reeling = !!tether;
    if (reel.hidden === reeling) reel.hidden = !reeling;
    if (tether) reelBead.style.transform = `translateY(${clamp(tether.y - tether.oy, -64, 64).toFixed(1)}px)`;
  }
  function render(frame = null) {
    if (frame) lastFrame = frame;
    const f = lastFrame;
    const permitted = canFly(state, doc) && !guide.open;
    const identity = `${state.mode}:${state.playerId}`;
    const player = state.entities?.get?.(state.playerId);
    if ((visible && !permitted) || (lastMode && identity !== lastMode) || (Number.isFinite(state.tick) && state.tick < lastTick)) cancelAll();
    lastMode = identity; lastTick = state.tick ?? lastTick; visible = permitted;
    flight.hidden = !visible; guideButton.hidden = visible || guide.open || !guideWanted();
    doc.documentElement.dataset.sfMobileFlight = visible ? '1' : '0';
    if (!visible) return;
    const p = model.stick;
    if (p) {
      stickUI.show(p, { brake: !!f?.flight?.brake, heading: f?.heading ?? null, labelSide: stickUI.root.dataset.side || 'below' });
      if (p.boost && !lastBoost) haptic();
      lastBoost = p.boost;
    } else { lastBoost = false; if (!stickUI.leaving) stickUI.hide(); }
    ghost.hidden = taught || !!p || !wheel.root.hidden;
    setIf(gunKey, 'held', model.held('fire') ? '1' : '0');
    setIf(tetherKey, 'held', model.held('tether') ? '1' : '0');
    setIf(tetherKey, 'latched', state.player?.tether?.active ? '1' : '0');
    paintAim(f);
    if (dockKey.hidden === dockReady) dockKey.hidden = !dockReady;
    if (clock() >= messageUntil && !toast.hidden) toast.hidden = true;
    if (clock() - lastNumbers > STATUS_MS) { lastNumbers = clock(); paintStatus(player); }
  }
  applyConfig(); render();
  return { root, render, applyConfig, cancelAll, showMessage, openGuide,
    setDockReady(ready) { dockReady = !!ready; schedule(); },
    destroy() {
      destroyed = true; cancelAll(); delete doc.documentElement.dataset.sfMobileWheel; delete doc.documentElement.dataset.sfMobileLefty;
      doc.documentElement.style.removeProperty('--mf-cluster-w'); cleanup.forEach(fn => fn());
      if (raf) win.cancelAnimationFrame(raf); wheel.destroy(); root.remove(); guide.remove();
    } };
}
