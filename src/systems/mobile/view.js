import { TUNING, clamp, canFly, shapeStick, stickRadius, wheelSlot } from './model.js';
import { POWER_PAGES, icon } from './catalog.js';
import { MOBILE_CSS } from './styles.js';

const UI_SELECTOR = 'button,a,input,textarea,select,[role="button"],[role="dialog"],[contenteditable="true"],[data-sf-touch-ignore]';
/** Pointer ownership and presentation. Physics is deliberately absent from this module. */
export function mountMobileView({ state, model, activate, reset, config, saveConfig, doc = document, win = window }) {
  if (!doc.getElementById('sf-mobile-style')) {
    const style = doc.createElement('style'); style.id = 'sf-mobile-style'; style.textContent = MOBILE_CSS; doc.head.append(style);
  }
  // Preserve browser zoom; safe areas are handled in CSS. Do not add maximum-scale/user-scalable=no.
  const viewport = doc.querySelector('meta[name="viewport"]');
  if (viewport && !viewport.content.includes('viewport-fit')) viewport.content += ', viewport-fit=cover';
  const root = doc.createElement('div'); root.id = 'sf-touch-overlay';
  root.innerHTML = `<div class="mf-flight" hidden>
    <div class="mf-top"><div class="mf-status" aria-label="Ship status">
      <div class="mf-status-line"><span>HULL</span><span data-read="hull">—</span></div>
      <div class="mf-status-line"><span>SHIELD</span><span data-read="shield">—</span></div>
      <div class="mf-status-line"><span>ENERGY</span><span data-read="energy">—</span></div>
      <div class="mf-status-line"><span>BOOST</span><span data-read="boost">—</span></div>
      <div class="mf-status-line"><span>SPEED</span><span class="mf-speed" data-read="speed">—</span></div>
    </div><button class="mf-button mf-pause" data-ui="pause" aria-label="Pause game">${icon('pause')}</button></div>
    <button class="mf-button mf-edge" aria-label="Powers: swipe inward to select, or tap to open" aria-expanded="false">POWERS</button>
    <div class="mf-buttons">
      <button class="mf-button sf-touch-tether" data-role="tether" aria-label="Tether: tap to latch or cut; hold and drag to reel">${icon('tether')}<span>TETHER</span></button>
      <button class="mf-button sf-touch-fire" data-role="fire" aria-label="Gun: hold to fire, drag to aim">${icon('gun')}<span>GUN</span></button>
    </div>
    <div class="mf-stick" hidden><div class="mf-ring"></div><div class="mf-knob"></div><div class="mf-stick-label"></div></div>
    <div class="mf-wheel" hidden><div class="mf-wheel-face"></div><div class="mf-wheel-note">RELEASE<br>TO USE<br><br>CENTER<br>CANCELS</div>
      <div class="mf-pages" role="group" aria-label="Power banks"></div><div class="mf-slots"></div></div>
    <div class="mf-toast" role="status" aria-live="polite" hidden></div>
  </div><button class="mf-guide-open" hidden>TOUCH CONTROLS</button>`;
  doc.body.append(root);
  const q = s => root.querySelector(s);
  const flight = q('.mf-flight'), stick = q('.mf-stick'), knob = q('.mf-knob'), label = q('.mf-stick-label');
  const edge = q('.mf-edge'), wheel = q('.mf-wheel'), face = q('.mf-wheel-face'), note = q('.mf-wheel-note');
  const slots = q('.mf-slots'), pages = q('.mf-pages'), toast = q('.mf-toast'), guideButton = q('.mf-guide-open');
  const guide = doc.createElement('dialog'); guide.className = 'sf-mobile-guide';
  guide.setAttribute('aria-label', 'Touch flight guide');
  guide.innerHTML = `<h2>Your thumbs. Your ship.</h2>
    <p><strong>Touch empty space and drag.</strong> The joystick appears where you land. A small push is fine thrust; farther is full thrust. Cross the dashed ring and hold for boost.</p>
    <p><strong>Flick and lift</strong> for a boost tap. Release normally to coast. Hold a stationary finger in the joystick center to brake.</p>
    <p><strong>GUN:</strong> hold to fire along your heading. Drag that thumb to aim independently.</p>
    <p><strong>TETHER:</strong> tap to latch or cut. Hold and drag up to reel in, down to pay out. Keep flying with your other thumb.</p>
    <p><strong>POWERS:</strong> swipe inward from the inset right-edge handle, sweep around the arc, then lift to request the highlighted power. Return to the center to cancel. Tap the handle for a persistent wheel; choose a bank and tap a power.</p>
    <p>Equipment, resources, cooldowns and the ship's normal turning limits still apply. You can fly and fire while the wheel is open. Landscape gives you more room; portrait is supported.</p>
    <label>Button hand <select data-pref="layout"><option value="standard">Right hand</option><option value="lefty">Left hand</option></select></label>
    <label>Control size <input data-pref="scale" type="range" min="0.8" max="1.3" step="0.05"></label>
    <label><input data-pref="haptics" type="checkbox"> Optional haptics, where supported</label>
    <p>Maps, pause and missions are in Navigation; docking is in Flight. Mining minigames are not adapted in this pass.</p>
    <button data-close>READY</button>`;
  doc.body.append(guide);
  const cleanup = [], captures = new Map(); let raf = 0, visible = false, destroyed = false;
  let wheelGeometry = { cx: 0, cy: 0, radius: 150 }, selected = -1, pinned = false, messageUntil = 0;
  let lastNumbers = -Infinity, lastMode = '', lastTick = -1, lastBoost = false;
  const listen = (el, event, fn, opts) => { el.addEventListener(event, fn, opts); cleanup.push(() => el.removeEventListener(event, fn, opts)); };
  const clock = () => win.performance?.now?.() ?? 0;
  const size = () => ({ w: win.innerWidth, h: win.innerHeight });
  const eat = e => { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); };
  const haptic = () => { if (config().haptics === true) win.navigator?.vibrate?.(12); };
  const schedule = () => { if (!raf && !destroyed) raf = win.requestAnimationFrame(() => { raf = 0; render(); }); };
  function releaseCaptures() {
    for (const [id, target] of captures) { try { if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id); } catch {} }
    captures.clear();
  }
  function cancelAll() { model.reset(); reset(); releaseCaptures(); pinned = false; selected = -1; wheel.hidden = true; edge.setAttribute('aria-expanded','false'); schedule(); }
  function closeWheel() { pinned = false; selected = -1; model.wheel = null; wheel.hidden = true; edge.setAttribute('aria-expanded','false'); schedule(); }
  function showMessage(text) { toast.textContent = text; toast.hidden = false; messageUntil = clock() + 1800; schedule(); }
  function use(power) {
    if (!power || !canFly(state, doc)) { closeWheel(); return; }
    if (power.id === 'jettisonLot' && !win.confirm('Jettison one cargo lot?')) { closeWheel(); return; }
    if (power.id === 'fullscreen') {
      // Must remain directly inside a user gesture; failure never blocks playing.
      const promise = doc.documentElement.requestFullscreen?.();
      promise?.catch?.(() => showMessage('Fullscreen unavailable; play in this tab.'));
    } else if (power.id === 'help') {
      activate({ id: 'pause', kind: 'ui' }); openGuide();
    } else activate(power);
    haptic(); closeWheel();
    if (power.kind !== 'ui') showMessage(`${power.label} requested`);
  }
  function fillWheel() {
    slots.replaceChildren();
    const { cx, cy, radius } = wheelGeometry;
    const page = POWER_PAGES[model.wheelPage];
    page.powers.forEach((power, index) => {
      const angle = (index + 0.5) * Math.PI / page.powers.length;
      const button = doc.createElement('button'); button.className = 'mf-button mf-slot'; button.dataset.index = index;
      button.innerHTML = `${icon(power.symbol)}<span>${power.label}</span>`;
      button.setAttribute('aria-label', power.description); button.title = power.description;
      button.style.left = `${cx - Math.sin(angle) * radius * 0.76}px`;
      button.style.top = `${cy - Math.cos(angle) * radius * 0.76}px`;
      button.addEventListener('click', () => use(power)); slots.append(button);
    });
    [...pages.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === model.wheelPage)));
  }
  POWER_PAGES.forEach((page, i) => {
    const button = doc.createElement('button'); button.textContent = page.name;
    button.addEventListener('click', () => { model.wheelPage = i; selected = -1; fillWheel(); schedule(); }); pages.append(button);
  });
  function openWheel(pointer = null) {
    const { w, h } = size(), bounds = edge.getBoundingClientRect();
    const radius = clamp(h * (h < 500 ? 0.34 : 0.42), 120, Math.min(198, w - 48));
    const cx = bounds.right - 5, cy = clamp(pointer?.oy ?? h * 0.48, radius + 8, h - radius - 8);
    wheelGeometry = { cx, cy, radius }; selected = -1;
    face.style.setProperty('--mf-wheel-d', `${radius * 2}px`); face.style.left = `${cx - radius}px`; face.style.top = `${cy - radius}px`;
    note.style.left = `${cx}px`; note.style.top = `${cy}px`;
    wheel.hidden = false; edge.setAttribute('aria-expanded','true'); fillWheel(); schedule();
  }
  function openGuide() {
    cancelAll(); const cfg = config();
    guide.querySelector('[data-pref="layout"]').value = cfg.layout === 'lefty' ? 'lefty' : 'standard';
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
  listen(q('.mf-pause'), 'click', () => { cancelAll(); activate({ id: 'pause', kind: 'ui' }); });
  function applyConfig() { const cfg = config(); root.dataset.lefty = cfg.layout === 'lefty' ? '1' : '0'; root.style.setProperty('--mf-scale', clamp(Number(cfg.scale) || 1, .8, 1.3)); }
  function pointerDown(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (!canFly(state, doc) || guide.open) return;
    const target = e.target, button = target.closest?.('[data-role]');
    let role = button?.dataset.role;
    if (target.closest?.('.mf-edge')) role = 'wheel';
    if (!role) {
      if (target.closest?.(UI_SELECTOR)) return;
      // Whole playfield, but never consume a menu, radar control or text selection.
      if (target !== doc.getElementById('gl-canvas') && target !== doc.body && !target.closest?.('#hud')) return;
      if (pinned) { closeWheel(); eat(e); return; }
      role = 'stick';
    }
    const { w, h } = size(), radius = stickRadius(w, h, Number(config().scale) || 1);
    if (!model.begin(e.pointerId, role, e.clientX, e.clientY, e.timeStamp, radius)) { eat(e); return; }
    eat(e);
    const capture = button || (role === 'wheel' ? edge : doc.getElementById('gl-canvas')) || root;
    try { capture.setPointerCapture(e.pointerId); captures.set(e.pointerId, capture); } catch {}
    if (role === 'wheel') { model.wheel = model.pointers.get(e.pointerId); pinned = false; openWheel(model.wheel); }
    schedule();
  }
  function pointerMove(e) {
    const p = model.pointers.get(e.pointerId); if (!p) return;
    eat(e);
    for (const sample of (e.getCoalescedEvents?.() || [])) model.move(e.pointerId, sample.clientX, sample.clientY, sample.timeStamp);
    model.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    if (p.role === 'wheel') {
      const g = wheelGeometry, next = wheelSlot(e.clientX, e.clientY, g.cx, g.cy, g.radius, 6, selected);
      if (next !== selected && next >= 0) haptic(); selected = next;
    }
    schedule();
  }
  function pointerEnd(e, cancelled = false) {
    const p = model.pointers.get(e.pointerId); if (!p) return;
    eat(e);
    // The final pointerup can carry movement that never received a pointermove.
    model.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    if (!cancelled && p.role === 'wheel' && p.moved) {
      const g = wheelGeometry; selected = wheelSlot(e.clientX, e.clientY, g.cx, g.cy, g.radius, 6, selected);
    }
    const ended = model.end(e.pointerId, e.clientX, e.clientY, e.timeStamp, cancelled);
    const capture = captures.get(e.pointerId); captures.delete(e.pointerId);
    try { if (capture?.hasPointerCapture?.(e.pointerId)) capture.releasePointerCapture(e.pointerId); } catch {}
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
  listen(win, 'resize', cancelAll); listen(win.visualViewport || win, 'resize', schedule);
  listen(win, 'keydown', e => { if (e.code === 'Escape' && !wheel.hidden) { closeWheel(); e.preventDefault(); } });
  // Mouse/keyboard activation and accessible click path; touch quick-tap is handled above.
  listen(edge, 'click', e => { if (e.detail === 0 || e.pointerType === 'mouse') { pinned = !pinned; if (pinned) openWheel(); else closeWheel(); } });
  const observer = new win.MutationObserver(schedule);
  observer.observe(doc.body, { attributes:true, attributeFilter:['class'], childList:true });
  cleanup.push(() => observer.disconnect());
  function render(frame = null) {
    const permitted = canFly(state, doc) && !guide.open;
    const identity = `${state.mode}:${state.playerId}`;
    const player = state.entities?.get?.(state.playerId);
    if ((visible && !permitted) || (lastMode && identity !== lastMode) || (Number.isFinite(state.tick) && state.tick < lastTick)) cancelAll();
    lastMode = identity; lastTick = state.tick ?? lastTick; visible = permitted;
    flight.hidden = !visible; guideButton.hidden = visible || guide.open;
    doc.documentElement.dataset.sfMobileFlight = visible ? '1' : '0';
    if (!visible) return;
    const p = model.stick; stick.hidden = !p;
    if (p) {
      const s = shapeStick(p.x - p.ox, p.y - p.oy, p.radius, p.boost);
      const extent = Math.min(s.raw, 1.45) * p.radius;
      stick.style.transform = `translate3d(${p.ox}px,${p.oy}px,0)`;
      stick.style.setProperty('--mf-diameter', `${p.radius * 2}px`);
      knob.style.transform = `translate3d(${s.x * extent}px,${s.y * extent}px,0)`;
      if (p.boost && !lastBoost) haptic();
      lastBoost = p.boost;
      stick.dataset.boost = p.boost ? '1' : '0';
      label.textContent = p.boost ? 'BOOST' : frame?.flight?.brake ? 'BRAKE' : `${Math.round(s.magnitude * 100)}% THRUST`;
    }
    q('.sf-touch-fire').dataset.held = model.held('fire') ? '1' : '0';
    q('.sf-touch-tether').dataset.held = model.held('tether') ? '1' : '0';
    q('.sf-touch-tether').dataset.latched = state.player?.tether?.active ? '1' : '0';
    [...slots.children].forEach((b, i) => b.dataset.selected = i === selected ? '1' : '0');
    if (clock() >= messageUntil) toast.hidden = true;
    if (clock() - lastNumbers > 100) {
      lastNumbers = clock();
      const scalar = value => Number.isFinite(value) ? String(Math.round(value)) : '—';
      q('[data-read="hull"]').textContent = scalar(player?.hull);
      q('[data-read="shield"]').textContent = scalar(player?.shield);
      q('[data-read="energy"]').textContent = scalar(player?.cap);
      q('[data-read="boost"]').textContent = player?.boost?.max > 0 ? `${Math.round(player.boost.energy / player.boost.max * 100)}%` : '—';
      q('[data-read="speed"]').textContent = player?.vel ? scalar(Math.hypot(player.vel.x, player.vel.z)) : '—';
    }
  }
  applyConfig(); render();
  return { root, render, applyConfig, cancelAll, showMessage,
    destroy() { destroyed = true; cancelAll(); cleanup.forEach(fn => fn()); if (raf) win.cancelAnimationFrame(raf); root.remove(); guide.remove(); } };
}
