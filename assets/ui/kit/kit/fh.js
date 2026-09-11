/**
 * fh.js — component behaviours for the Field Hardware kit.
 *
 * Classic script (no modules) so every page opens from `file://`. Exposes `window.FH.kit`.
 *
 * Everything here is wiring: the materials are in the produced assets and the timings are in
 * motion.js. Nothing in this file draws a surface.
 */
(function (global) {
  'use strict';

  var FH = (global.FH = global.FH || {});
  var M = function () { return FH.motion; };
  var S = function () { return FH.sound; };

  /* ---------------------------------------------------------------- icons and marks
   *
   * Inline SVG rather than a CSS background image: `currentColor` survives forced colours and
   * a background image does not, and the accent slot has to be recolourable from CSS.
   */
  var spriteReady = false;

  function injectSprite(text) {
    if (spriteReady) return;
    var host = document.createElement('div');
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML = text;
    document.body.insertBefore(host, document.body.firstChild);
    spriteReady = true;
  }

  function icon(name, size, label) {
    var s = size || 24;
    var svg = '<svg class="fh-icon' + (s === 32 ? ' fh-icon--32' : s === 48 ? ' fh-icon--48' : '') +
      '" viewBox="0 0 ' + s + ' ' + s + '"' +
      (label ? ' role="img" aria-label="' + label + '">' : ' aria-hidden="true">') +
      '<use href="#icon-' + name + '"/></svg>';
    return svg;
  }

  function mark(name, cls) {
    return '<svg class="' + (cls || 'fh-mark') + '" viewBox="0 0 240 240" aria-hidden="true">' +
      '<use href="#' + name + '"/></svg>';
  }

  /* ---------------------------------------------------------------- controls */

  function wireKeys(root) {
    root.addEventListener('pointerdown', function (e) {
      var k = e.target.closest('.fh-key, .fh-socket, .fh-stepper-minus, .fh-stepper-plus');
      if (!k || k.disabled) return;
      M().press(k);
      S().play(k.getAttribute('data-fh-cue') || 'ui_key_press');
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var k = e.target.closest('.fh-key, .fh-socket');
      if (!k || k.disabled) return;
      M().press(k);
      S().play(k.getAttribute('data-fh-cue') || 'ui_key_press');
    });
  }

  function wireToggles(root) {
    root.addEventListener('click', function (e) {
      var t = e.target.closest('.fh-toggle');
      if (!t || t.disabled) return;
      var on = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', String(on));
      S().play(on ? 'ui_confirm' : 'ui_tab');
    });
  }

  /** A slider whose thumb, track and lit fill are three produced assets, keyboard reachable. */
  function slider(el) {
    var track = el.querySelector('.fh-slider-track');
    var fill = el.querySelector('.fh-slider-fill');
    var thumb = el.querySelector('.fh-slider-thumb');
    var min = +el.dataset.min || 0;
    var max = +el.dataset.max || 100;
    var value = +el.dataset.value || 0;

    function render() {
      var t = (value - min) / (max - min);
      var w = track.clientWidth;
      fill.style.width = Math.round(t * w) + 'px';
      thumb.style.left = Math.round(t * w - 12) + 'px';
      thumb.setAttribute('aria-valuenow', String(Math.round(value)));
      el.dataset.value = String(value);
    }
    function set(v, cue) {
      var next = Math.max(min, Math.min(max, v));
      if (Math.round(next) !== Math.round(value) && cue) S().play('ui_tick');
      value = next;
      render();
    }
    thumb.setAttribute('role', 'slider');
    thumb.setAttribute('tabindex', '0');
    thumb.setAttribute('aria-valuemin', String(min));
    thumb.setAttribute('aria-valuemax', String(max));
    thumb.addEventListener('keydown', function (e) {
      var step = (max - min) / 20;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(value - step, true); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(value + step, true); e.preventDefault(); }
      if (e.key === 'Home') { set(min, true); e.preventDefault(); }
      if (e.key === 'End') { set(max, true); e.preventDefault(); }
    });
    el.addEventListener('pointerdown', function (e) {
      var r = track.getBoundingClientRect();
      set(min + ((e.clientX - r.left) / r.width) * (max - min), true);
      function move(ev) {
        set(min + ((ev.clientX - r.left) / r.width) * (max - min), true);
      }
      function up() {
        global.removeEventListener('pointermove', move);
        global.removeEventListener('pointerup', up);
      }
      global.addEventListener('pointermove', move);
      global.addEventListener('pointerup', up);
    });
    render();
    return { set: set, value: function () { return value; } };
  }

  function stepper(el) {
    var well = el.querySelector('.fh-stepper-well');
    var v = +el.dataset.value || 0;
    var step = +el.dataset.step || 1;
    var unit = el.dataset.unit || '';
    function render() { well.textContent = v + (unit ? ' ' + unit : ''); }
    el.querySelector('.fh-stepper-minus').addEventListener('click', function () {
      v = Math.max(0, v - step); render(); S().play('ui_tick');
    });
    el.querySelector('.fh-stepper-plus').addEventListener('click', function () {
      v += step; render(); S().play('ui_tick');
    });
    render();
    return { value: function () { return v; } };
  }

  /* ---------------------------------------------------------------- indicators */

  /** A segmented bar: `n` produced segment sprites, `on` of them lit. */
  function bar(el, on, total, kind) {
    el.innerHTML = '';
    for (var i = 0; i < total; i++) {
      var seg = document.createElement('span');
      seg.className = 'fh-bar-seg' + (i < on ? ' is-' + (kind || 'on') : '');
      el.appendChild(seg);
    }
    el.setAttribute('role', 'meter');
    el.setAttribute('aria-valuenow', String(on));
    el.setAttribute('aria-valuemax', String(total));
  }

  /**
   * The radar: the face and bezel are produced PNGs; the rings, the sweep and the contact
   * glyphs are SVG geometry, so the sweep rotates and the glyphs scale without re-rasterising.
   */
  function radar(el, opts) {
    opts = opts || {};
    var contacts = opts.contacts || [];
    var svg = ['<svg viewBox="0 0 320 320" class="fh-radar-svg" aria-hidden="true"',
      ' style="position:absolute;inset:0;width:100%;height:100%">'];
    svg.push('<g fill="none" stroke="currentColor" stroke-opacity=".22">');
    [40, 80, 120].forEach(function (r) {
      svg.push('<circle cx="160" cy="160" r="' + r + '"/>');
    });
    svg.push('<path d="M160 36V284M36 160H284"/></g>');
    if (opts.sweep !== false) {
      svg.push('<g class="fh-radar-sweep" style="transform-origin:160px 160px;' +
        'transform:rotate(' + (opts.sweepAngle || 0) + 'deg)">' +
        '<path d="M160 160 L160 34 A126 126 0 0 1 249 71 Z" fill="var(--fh-signal)"' +
        ' fill-opacity=".14"/></g>');
    }
    contacts.forEach(function (c) {
      var x = 160 + c.x * 118, y = 160 - c.y * 118;
      svg.push('<g transform="translate(' + (x - 8) + ',' + (y - 8) + ')"' +
        ' style="color:' + (c.hostile ? 'var(--fh-wanted)' : 'var(--fh-signal)') + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24"><use href="#icon-' + c.cls +
        '"/></svg></g>');
    });
    svg.push('</svg>');
    // Insert rather than replace: the radar's own legends (N, RANGE, YOU) are authored in the
    // page as children, and innerHTML would silently delete them along with their ids.
    el.querySelectorAll('.fh-radar-face, .fh-radar-svg').forEach(function (o) { o.remove(); });
    el.insertAdjacentHTML('afterbegin',
      '<span class="fh-radar-face"></span>' + svg.join(''));
    return el;
  }

  /** The speed gauge: a produced bezel, a real needle rotated about its documented pivot. */
  function gauge(el, value, max) {
    var t = Math.max(0, Math.min(1, value / (max || 200)));
    var deg = -110 + t * 220;
    el.style.setProperty('--fh-gauge-value', deg.toFixed(1));
    var needle = el.querySelector('.fh-gauge-needle');
    if (needle) needle.style.transform = 'rotate(' + deg.toFixed(1) + 'deg)';
    var read = el.querySelector('[data-gauge-readout]');
    if (read) M().value(read, value);
    el.setAttribute('role', 'meter');
    el.setAttribute('aria-valuenow', String(Math.round(value)));
    el.setAttribute('aria-valuemax', String(max || 200));
  }

  /* ---------------------------------------------------------------- boot */

  function init(opts) {
    opts = opts || {};
    if (opts.sprite) injectSprite(opts.sprite);
    if (global.FH_SOUND_RECIPES) S().load(global.FH_SOUND_RECIPES);
    var root = opts.root || document;
    wireKeys(root);
    wireToggles(root);
    root.querySelectorAll('.fh-slider').forEach(slider);
    root.querySelectorAll('.fh-stepper').forEach(stepper);
    S().attach(root);
    return FH.kit;
  }

  FH.kit = {
    init: init,
    icon: icon,
    mark: mark,
    injectSprite: injectSprite,
    slider: slider,
    stepper: stepper,
    bar: bar,
    radar: radar,
    gauge: gauge,
  };
})(typeof window !== 'undefined' ? window : this);
