// The probe hand: real-style input through the Chrome DevTools protocol (Input.dispatchMouseEvent /
// dispatchKeyEvent), shared by the no-freeze and smoothness probes so both drive the game the same
// way. The mouse moves continuously at ~125 Hz, held keys auto-repeat at ~30 Hz like an operating
// system, the trigger is held, and powers are tapped.
export const HAND_KEYS = {
  KeyW: { key: 'w', vk: 87 }, KeyA: { key: 'a', vk: 65 }, KeyS: { key: 's', vk: 83 }, KeyD: { key: 'd', vk: 68 },
  Digit1: { key: '1', vk: 49 }, Digit2: { key: '2', vk: 50 }, Digit3: { key: '3', vk: 51 },
  Digit4: { key: '4', vk: 52 }, Digit5: { key: '5', vk: 53 }, ShiftLeft: { key: 'Shift', vk: 16 },
  Space: { key: ' ', vk: 32 }, Escape: { key: 'Escape', vk: 27 },
};

/**
 * @param cdp a CDP session on the game page
 * @param viewport {w,h} in CSS pixels
 * @param opts.aim optional () => ({x, y}) | null: a fixed cursor target (CSS px) that replaces the
 *   default loose circle (used to fly a straight line to a sector edge)
 */
export function createHand(cdp, viewport, opts = {}) {
  const held = new Set();
  let mouseDown = false;
  let mx = viewport.w / 2; let my = viewport.h / 2;
  let timer = null; let repeatTimer = null; let t0 = Date.now();
  let moves = 0; let repeats = 0;
  let aim = typeof opts.aim === 'function' ? opts.aim : null;
  const fire = (method, params) => { cdp.send(method, params).catch(() => {}); };
  const keyEvent = (type, code, autoRepeat = false) => {
    const k = HAND_KEYS[code];
    fire('Input.dispatchKeyEvent', {
      type, code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, autoRepeat,
      ...(type === 'keyDown' && k.key.length === 1 ? { text: k.key } : {}),
    });
  };
  return {
    start() {
      t0 = Date.now();
      // ~125 Hz continuous mouse: a loose circle around the screen centre with a little jitter,
      // so the default nose-to-cursor scheme flies loops instead of into a wall.
      timer = setInterval(() => {
        const a = (Date.now() - t0) / 1000 * 1.7;
        const fixed = aim ? aim() : null;
        if (fixed) {
          mx = fixed.x + Math.sin(a * 7.3) * 6;
          my = fixed.y + Math.cos(a * 5.1) * 6;
        } else {
          mx = viewport.w / 2 + Math.cos(a) * viewport.w * 0.22 + Math.sin(a * 7.3) * 6;
          my = viewport.h / 2 + Math.sin(a) * viewport.h * 0.22 + Math.cos(a * 5.1) * 6;
        }
        fire('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, buttons: mouseDown ? 1 : 0,
          ...(mouseDown ? { button: 'left' } : {}) });
        moves++;
      }, 8);
      // OS key repeat: the most recently pressed held key repeats ~30 times a second.
      repeatTimer = setInterval(() => {
        const last = [...held].at(-1);
        if (last) { keyEvent('keyDown', last, true); repeats++; }
      }, 33);
    },
    stop() { clearInterval(timer); clearInterval(repeatTimer); },
    setAim(fn) { aim = typeof fn === 'function' ? fn : null; },
    down(code) { if (!held.has(code)) { held.add(code); keyEvent('keyDown', code); } },
    up(code) { if (held.delete(code)) keyEvent('keyUp', code); },
    releaseAll() { for (const c of [...held]) this.up(c); this.trigger(false); },
    tap(code) { keyEvent('keyDown', code); setTimeout(() => keyEvent('keyUp', code), 60); },
    trigger(on) {
      if (on === mouseDown) return;
      mouseDown = on;
      fire('Input.dispatchMouseEvent', { type: on ? 'mousePressed' : 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1, buttons: on ? 1 : 0 });
    },
    counts: () => ({ moves, repeats }),
  };
}

/** Press whatever screen button stands between the probe and live flight (in-page, one pass). */
export const PRESS_THROUGH_SCREENS = `(() => {
  const n = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const all = [...document.querySelectorAll('#screens button, #screens [role="button"]')].filter((x) => x.offsetParent && !x.disabled);
  const take = all.find((x) => /TAKE$/i.test(n(x.textContent)));
  if (take) { take.click(); return 'take'; }
  const again = all.find((x) => /^(Retry|Restart|Run it again|Run again|Play again|New run|Try again)/i.test(n(x.textContent)));
  if (again) { again.click(); return 'again'; }
  const b = all.find((x) => /^(Launch round \\d+|Launch|Keep current loadout|Continue|Resume|Start run|Begin|Retry|Restart|Respawn|Undock|Skip)/i.test(n(x.textContent)));
  if (b) { b.click(); return n(b.textContent).slice(0, 24); }
  return null;
})()`;
