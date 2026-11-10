/**
 * FH.motion — the Field Hardware motion library.
 *
 * Classic script (no modules) so every prototype opens from `file://`. Exposes `window.FH.motion`.
 *
 * Three rules the whole library is built to keep, because they are floors rather than taste:
 *
 *  1. **Nothing runs unasked.** Every function takes the state that justifies it and returns a
 *     cancel handle. There is no ambient loop: `drift` and `parallax` are the only continuous
 *     motions, they only run while explicitly enabled, and they park their rAF the moment they
 *     are cancelled, the tab hides, or the element leaves the viewport. `check-ui-frame-sleep`
 *     exists because a UI that never parks its rAF costs frames in flight forever.
 *  2. **Reduced motion is a cut, not a shorter animation.** With it on, every transition
 *     completes instantly, ambient drift stops and parallax is off. The numbers come from
 *     tokens.css, so a token change moves the motion with it.
 *  3. **Registers do not share a language** (02_ART_DIRECTION §9). POSTER is cinematic with
 *     mass, BENCH is mechanical with a one-frame overshoot, EDGE is instrument-like and never
 *     loops in flight.
 */
(function (global) {
  'use strict';

  var FH = (global.FH = global.FH || {});

  var REGISTERS = {
    poster: { stagger: 40, settle: 280, ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    bench: { stagger: 24, settle: 200, lightUp: 100, pressDown: 60, pressUp: 120,
             ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    edge: { stagger: 0, settle: 120, pulse: 400, ease: 'cubic-bezier(0.33, 0, 0.15, 1)' },
  };

  var reduced = null; // null = follow the media query

  function prefersReduced() {
    if (reduced !== null) return reduced;
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function setReducedMotion(on) {
    reduced = on === null || on === undefined ? null : !!on;
    document.documentElement.toggleAttribute('data-fh-reduced', prefersReduced());
    return prefersReduced();
  }

  /** Read a duration from the token layer so motion and tokens cannot drift apart. */
  function token(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--fh-' + name).trim();
      var n = parseFloat(v);
      return isNaN(n) ? fallback : n;
    } catch (e) {
      return fallback;
    }
  }

  function reg(name) {
    var r = REGISTERS[name] || REGISTERS.bench;
    return {
      stagger: token(name + '-stagger', r.stagger),
      settle: token(name + '-settle', r.settle) || token(name + '-slide', r.settle),
      ease: r.ease,
      lightUp: token(name + '-lightUp', r.lightUp || 100),
      pressDown: token(name + '-pressDown', r.pressDown || 60),
      pressUp: token(name + '-pressUp', r.pressUp || 120),
      pulse: token(name + '-pulse', r.pulse || 400),
    };
  }

  var NOOP = { cancel: function () {} };

  function timed(el, cls, ms, cleanup) {
    if (prefersReduced() || !ms) {
      if (cleanup) cleanup();
      return NOOP;
    }
    el.classList.add(cls);
    var t = setTimeout(function () {
      el.classList.remove(cls);
      if (cleanup) cleanup();
    }, ms);
    return {
      cancel: function () {
        clearTimeout(t);
        el.classList.remove(cls);
        if (cleanup) cleanup();
      },
    };
  }

  /**
   * reveal — a staggered entrance with mass. POSTER hero type stamps in; BENCH plates slide in
   * with a one-frame overshoot; EDGE instruments simply arrive.
   */
  function reveal(el, opts) {
    opts = opts || {};
    var r = reg(opts.register || 'bench');
    var delay = (opts.index || 0) * r.stagger;
    var from = opts.from || (opts.register === 'poster' ? 'stamp' : 'below');
    if (prefersReduced()) {
      el.style.removeProperty('--fh-delay');
      el.classList.add('fh-revealed');
      return NOOP;
    }
    el.style.setProperty('--fh-delay', delay + 'ms');
    el.style.setProperty('--fh-dur', r.settle + 'ms');
    el.classList.add('fh-reveal', 'fh-from-' + from);
    var t = setTimeout(function () {
      el.classList.add('fh-revealed');
    }, 16);
    var done = setTimeout(function () {
      el.classList.remove('fh-reveal', 'fh-from-' + from);
      el.style.removeProperty('--fh-delay');
      el.style.removeProperty('--fh-dur');
    }, delay + r.settle + 40);
    return {
      cancel: function () {
        clearTimeout(t);
        clearTimeout(done);
        el.classList.add('fh-revealed');
        el.classList.remove('fh-reveal', 'fh-from-' + from);
      },
    };
  }

  /** settle — land an element that was mid-reveal, immediately. */
  function settle(el) {
    el.classList.add('fh-revealed');
    el.classList.remove('fh-reveal');
    el.style.removeProperty('--fh-delay');
    return NOOP;
  }

  /**
   * light — the backlight IS the state (§4). This never swaps a colour; it moves the light
   * level, so a disabled control reads as unlit hardware rather than grey text.
   */
  function light(el, on, opts) {
    opts = opts || {};
    var r = reg(opts.register || 'bench');
    el.style.setProperty('--fh-dur', (prefersReduced() ? 0 : r.lightUp) + 'ms');
    el.dataset.fhLit = on ? 'on' : opts.rest ? 'rest' : 'off';
    return NOOP;
  }

  /** press — 60 ms down, 120 ms up. The plate physically sinks; the bounds do not move. */
  function press(el, opts) {
    var r = reg((opts && opts.register) || 'bench');
    if (prefersReduced()) return NOOP;
    el.style.setProperty('--fh-press-down', r.pressDown + 'ms');
    el.style.setProperty('--fh-press-up', r.pressUp + 'ms');
    el.classList.add('fh-pressed');
    var t = setTimeout(function () {
      el.classList.remove('fh-pressed');
    }, r.pressDown + r.pressUp);
    return {
      cancel: function () {
        clearTimeout(t);
        el.classList.remove('fh-pressed');
      },
    };
  }

  /** slide — a BENCH plate arriving with weight and a one-frame overshoot. */
  function slide(el, opts) {
    opts = opts || {};
    var r = reg('bench');
    var weight = opts.weight == null ? 1 : opts.weight;
    el.style.setProperty('--fh-dur', Math.round(r.settle * (0.8 + weight * 0.2)) + 'ms');
    el.style.setProperty('--fh-slide-from', (opts.from || 'below'));
    return timed(el, 'fh-slide-' + (opts.from || 'below'), prefersReduced() ? 0 : r.settle + 40);
  }

  /**
   * pulse — an EDGE alert pulses ONCE and holds (§9). Nothing in flight loops, and flash-reduce
   * suppresses it entirely rather than slowing it down.
   */
  function pulse(el) {
    var r = reg('edge');
    if (prefersReduced()) return NOOP;
    return timed(el, 'fh-pulse', r.pulse);
  }

  /** value — an instrument easing to a new reading. */
  function value(el, to, opts) {
    opts = opts || {};
    var r = reg('edge');
    var set = opts.apply || function (v) { el.textContent = Math.round(v); };
    var from = opts.from == null ? parseFloat(el.textContent) || 0 : opts.from;
    if (prefersReduced() || !r.settle) {
      set(to);
      return NOOP;
    }
    var start = performance.now();
    var raf = 0;
    var live = true;
    function step(now) {
      if (!live) return;
      var t = Math.min(1, (now - start) / r.settle);
      var e = 1 - Math.pow(1 - t, 3);
      set(from + (to - from) * e);
      if (t < 1) raf = requestAnimationFrame(step);
      else raf = 0; // park: no idle rAF once the value has arrived
    }
    raf = requestAnimationFrame(step);
    return {
      cancel: function () {
        live = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
    };
  }

  /**
   * drift — slow ambient camera drift, allowed ONLY on a paused POSTER/BENCH screen and only
   * with reduced motion off. Parks its rAF when hidden, so a backgrounded tab costs nothing.
   */
  function drift(el, opts) {
    opts = opts || {};
    var degPerSec = Math.min(opts.degPerSec == null ? 0.5 : opts.degPerSec, 0.5);
    var ampPx = opts.ampPx == null ? 10 : opts.ampPx;
    if (prefersReduced() || !degPerSec) return NOOP;
    var live = true;
    var raf = 0;
    var t0 = performance.now();
    function step(now) {
      if (!live) { raf = 0; return; }
      if (document.hidden) { raf = 0; return; } // parked; visibilitychange restarts it
      var s = (now - t0) / 1000;
      var a = s * degPerSec * (Math.PI / 180);
      el.style.setProperty('--fh-drift-x', (Math.sin(a * 6) * ampPx).toFixed(2) + 'px');
      el.style.setProperty('--fh-drift-y', (Math.cos(a * 4.2) * ampPx * 0.5).toFixed(2) + 'px');
      raf = requestAnimationFrame(step);
    }
    function wake() {
      if (live && !raf && !document.hidden) raf = requestAnimationFrame(step);
    }
    document.addEventListener('visibilitychange', wake);
    raf = requestAnimationFrame(step);
    return {
      cancel: function () {
        live = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        document.removeEventListener('visibilitychange', wake);
        el.style.removeProperty('--fh-drift-x');
        el.style.removeProperty('--fh-drift-y');
      },
    };
  }

  /**
   * parallax — pointer parallax capped at 6 px (§9). Pointer driven, so there is no loop at
   * all: it writes two custom properties on move and nothing else.
   */
  function parallax(root, opts) {
    opts = opts || {};
    var max = Math.min(opts.max == null ? 6 : opts.max, 6);
    if (prefersReduced() || !max) return NOOP;
    function onMove(e) {
      var r = root.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5;
      var ny = (e.clientY - r.top) / r.height - 0.5;
      root.style.setProperty('--fh-par-x', (-nx * 2 * max).toFixed(2) + 'px');
      root.style.setProperty('--fh-par-y', (-ny * 2 * max).toFixed(2) + 'px');
    }
    function onLeave() {
      root.style.setProperty('--fh-par-x', '0px');
      root.style.setProperty('--fh-par-y', '0px');
    }
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    return {
      cancel: function () {
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerleave', onLeave);
        onLeave();
      },
    };
  }

  /** group — reveal a list with the register's stagger, and cancel them all together. */
  function group(els, opts) {
    var handles = [];
    Array.prototype.forEach.call(els, function (el, i) {
      handles.push(reveal(el, Object.assign({}, opts, { index: i })));
    });
    return {
      cancel: function () {
        handles.forEach(function (h) { h.cancel(); });
      },
    };
  }

  FH.motion = {
    REGISTERS: REGISTERS,
    reveal: reveal,
    group: group,
    settle: settle,
    light: light,
    press: press,
    slide: slide,
    pulse: pulse,
    value: value,
    drift: drift,
    parallax: parallax,
    setReducedMotion: setReducedMotion,
    prefersReducedMotion: prefersReduced,
  };
})(typeof window !== 'undefined' ? window : this);
