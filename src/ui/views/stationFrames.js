import { stationIcon, stationSealHtml, stationSymbolsHtml } from '../station/stationArt.js';
// Production station frames. Pure markup; controllers retain all state, intent, focus and lifecycle ownership.
// These exact functions also power the isolated presentation fixture; no game systems are substituted.
// Field Hardware POSTER/BENCH: stencil name, legend tape, vitals plate, destination keys on the
// bottom rail, smoked workspace — the 3D berth is the picture, not a website behind words.

/**
 * The berth shell. Deckplate assembly as of 2026-09-22 (design/frontend/THE_BAR.md).
 *
 * What it replaces: a grid with `padding: 22px 400px 14px 32px` -- a four-hundred-pixel hole
 * punched in the right of every station tab so an absolutely-positioned vitals panel could float
 * over it in its own visual language. That hole is why the market's title collided with the
 * faction badge, why the credits rail read as a separate application, and why seven tabs each
 * started their content somewhere different.
 *
 * The regions are the frame's own: head (the berth's name and its tape), body (the workspace and
 * the vitals column, side by side, both INSIDE the frame), foot (the destination rail, comms, and
 * undock). Every tab frame below is a dp-work split, so all seven agree on where content begins.
 */
export function stationFrameHtml() {
  return `${stationSymbolsHtml()}
    <div class="k-world k-world--plate sxb-berth__plate" aria-hidden="true"></div>
    <canvas class="k-world sxb-berth__world" aria-hidden="true"></canvas>
    <header class="sxb-berth dp-frame__head">
      <span class="sxb-berth__lamp" aria-hidden="true"></span>
      <div class="so-station-mark">${stationSealHtml()}</div>
      <div class="so-station-title dp-title"><p class="sxb-berth__ident dp-title__eyebrow" data-live="1"></p><h1 class="sxb-berth__name dp-title__name"></h1><div class="dp-title__rule" aria-hidden="true"></div></div>
      <button type="button" class="so-command-trigger dp-key dp-key--small" aria-haspopup="dialog" aria-controls="so-command-palette">${stationIcon('search')}<span>Find a service</span><kbd class="dp-kbd">Ctrl K</kbd></button>
      <div class="sxb-tape">
        <p class="sxb-berth__news"></p>
        <article class="sxb-event" hidden><span class="sxb-event__badge"></span><strong class="sxb-event__title"></strong><p class="sxb-event__body"></p></article>
        <article class="sxb-event sxb-berth__ledger" hidden><span class="sxb-event__badge"></span><strong class="sxb-event__title"></strong><p class="sxb-event__body"></p></article>
        <article class="sxb-event sxb-berth__mechanic" hidden><span class="sxb-event__badge"></span><strong class="sxb-event__title"></strong><p class="sxb-event__body"></p></article>
        <p class="sxb-berth__patch" hidden></p><p class="sxb-berth__route" hidden></p>
      </div>
      <div class="sxb-handoff" hidden></div>
    </header>
    <div class="dp-frame__body dp-frame__body--station">
      <div class="sx-screen__body" id="sx-panel" role="tabpanel" tabindex="0"></div>
      <aside class="sxb-crown dp-plate dp-pad dp-stack" aria-label="Ship vitals and services"><div class="sxb-purse dp-stack" aria-label="Available credits"><div class="sxb-purse__label dp-etch">Credits</div><div class="sxb-purse__value dp-read">0</div><span class="so-credit-delta" aria-hidden="true"></span></div><ul class="sxb-vitals dp-stack"></ul></aside>
    </div>
    <footer class="sxb-ops dp-frame__foot">
      <nav class="of-facility-rail" aria-label="Station facilities"><div class="sxb-ops__dock"></div><span class="so-berth-status">${stationIcon('signal')}Docked</span></nav>
      <aside class="sx-comms" aria-label="Station communications">
        <div class="sx-receipt" role="status" aria-live="polite" aria-atomic="true" hidden>
          <svg class="so-transfer" viewBox="0 0 64 24" aria-hidden="true"><path d="M2 12h50m-7-6 7 6-7 6" fill="none" stroke="currentColor" pathLength="1"/></svg>
          <span class="sx-receipt__kind"></span><strong class="sx-receipt__title"></strong><span class="sx-receipt__delta"></span>
        </div>
        <button type="button" class="sx-comms__toggle fh-key fh-key--small" aria-expanded="false" aria-controls="sx-comms-history" aria-label="Open station communications history">${stationIcon('comms')}<span>Comms</span><span class="sx-comms__count" hidden>0</span></button>
        <button type="button" class="sxb-help fh-key fh-key--small" aria-expanded="false" aria-label="Explain the active station operation" data-why="Context help">${stationIcon('help')}<span>Help</span></button>
        <div class="sx-comms__history fh-plate fh-plate--raised" id="sx-comms-history" aria-label="Berth session log" hidden></div>
      </aside>
      <div class="sxb-launch-seat"><button type="button" class="sxb-launch fh-key fh-key--primary" data-act="undock" data-pop-owner>
        <span class="sxb-launch__light" aria-hidden="true"></span><span class="sxb-launch__copy"><span class="sxb-launch__label">Undock</span><span class="sxb-launch__state"></span></span>${stationIcon('launch')}
      </button></div>
    </footer>
    <div class="sx-pop fh-plate fh-plate--raised" hidden></div>`;
}

export function marketFrameHtml() {
  return `<nav class="dp-work__index dp-frame__scroll sx-mkt__list" aria-label="Commodities"></nav>` +
    `<section class="dp-work__stage dp-frame__scroll sx-mkt__stage" id="sx-market-instrument" role="tabpanel" aria-describedby="sx-market-driver-summary">` +
      `<div class="sx-mkt__analysis"><div class="sx-mkt__quote"></div>` +
        `<details class="so-route-disclosure"><summary>Route intelligence</summary>` +
          `<div class="sx-mkt__routes" aria-label="Trade routes"></div>` +
        `</details>` +
        `<aside class="k-t-fine k-62 sx-adboard" data-ad-board aria-label="Dockside commerce notice" hidden></aside>` +
      `</div>` +
      `<div class="sx-mkt__console"><div class="sx-mkt__trade"></div></div>` +
    `</section>`;
}

export function shipworksFrameHtml() {
  return `<nav class="dp-work__index dp-frame__scroll sx-sw__rail" aria-label="Shipworks ship selection">` +
      `<ul class="k-words k-words--row sx-seg" aria-label="Fleet or buy">` +
        `<li><button type="button" class="k-word k-word--body sx-seg__btn is-on" data-mode="fleet" aria-pressed="true">Fleet</button></li>` +
        `<li><button type="button" class="k-word k-word--body sx-seg__btn" data-mode="buy" aria-pressed="false">For sale</button></li>` +
      `</ul>` +
      `<div class="sx-sw__carousel">` +
        `<button type="button" class="sx-sw__railstep is-prev" data-rail-step="prev" aria-label="Previous ships" hidden>‹</button>` +
        `<div class="k-rows sx-sw__list" tabindex="0" aria-label="Available ships"></div>` +
        `<button type="button" class="sx-sw__railstep is-next" data-rail-step="next" aria-label="Next ships" hidden>›</button>` +
        `<span class="sx-sw__railtrack" aria-hidden="true" hidden><i></i></span>` +
      `</div>` +
    `</nav>` +
    `<section class="dp-work__stage dp-frame__scroll sx-sw__main">` +
      `<div class="sx-sw__stage sf-stage">` +
        `<canvas class="sx-sw__canvas" tabindex="0" aria-label="Interactive ship preview. Drag or scroll horizontally to orbit; scroll vertically or pinch to zoom."></canvas>` +
        `<div class="sx-sw__baylines" aria-hidden="true"><span></span><span></span><span></span></div>` +
        `<div class="sx-sw__power" aria-hidden="true"></div>` +
        `<ul class="k-rows sx-sw__gauges" role="group" aria-label="Ship gauges"></ul>` +
        `<div class="sx-sw__slotfield" role="group" aria-label="Ship systems"></div>` +
        `<div class="sx-sw__scarfield" role="group" aria-label="Living hull condition markers"></div>` +
        `<div class="sx-sw__focusline" aria-hidden="true"></div>` +
        `<div class="sx-sw__delta k-t-fine k-38" aria-live="polite" hidden></div>` +
        `<div class="sx-sw__acquiring" data-sf-acquire-host></div>` +
        `<div class="sx-sw__nameplate"></div>` +
        `<ul class="k-words k-words--row sx-sw__camera" aria-label="Ship preview controls">` +
          `<li><button type="button" class="k-word k-word--fine" data-camera="left" aria-label="Rotate ship left">Left</button></li>` +
          `<li><button type="button" class="k-word k-word--fine" data-camera="reset" aria-label="Reset ship view">Center</button></li>` +
          `<li><button type="button" class="k-word k-word--fine" data-camera="right" aria-label="Rotate ship right">Right</button></li>` +
        `</ul>` +
        `<span class="sx-sw__dragcue k-t-fine k-38" aria-hidden="true">Drag to orbit · pinch to zoom</span>` +
      `</div>` +
      `<div class="sx-sw__stats"></div>` +
    `</section>` +
    `<aside class="sx-sw__side" aria-label="Shipworks operation controls"></aside>` +
    `<div class="dp-work__index dp-frame__scroll sx-sw__chooser" hidden></div>`;
}

export function contractsFrameHtml() {
  return `<div class="dp-work__index dp-frame__scroll sx-ct__hang">` +
      `<p class="k-caps">Posted here</p>` +
      `<p class="k-t-fine k-38 sx-ct-dispatch__label"></p>` +
      `<nav class="sx-ct__board" aria-label="Available missions"></nav>` +
      `<p class="k-caps sx-ct__yours">Yours</p>` +
      `<aside class="sx-ct__active" aria-label="Active missions"></aside>` +
    `</div>` +
    `<section class="dp-work__stage dp-frame__scroll sx-ct__dossier" aria-live="polite"></section>`;
}

export function barFrameHtml() {
  return `<div class="dp-work__index dp-frame__scroll sx-bar__hang">` +
      `<nav class="sx-bar__rail" aria-label="Contacts"></nav>` +
      `<aside class="sx-bar__leads" aria-label="Leads"></aside>` +
    `</div>` +
    `<section class="dp-work__stage dp-frame__scroll sx-bar__stage" aria-live="polite"></section>`;
}

export function industryFrameHtml() {
  return `<nav class="dp-work__index dp-frame__scroll sx-ind__list" aria-label="Blueprints"></nav>` +
    `<section class="dp-work__stage dp-frame__scroll sx-ind__stage"></section>`;
}

export function factionsFrameHtml() {
  return `<nav class="dp-work__index dp-frame__scroll sx-fac__rail" aria-label="Factions"></nav>` +
    `<section class="dp-work__stage dp-frame__scroll sx-fac__stage" aria-live="polite"></section>`;
}
