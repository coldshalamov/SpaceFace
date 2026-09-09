// Production station frames. Pure markup; controllers retain all state, intent, focus and lifecycle ownership.
// These exact functions also power the isolated presentation fixture; no game systems are substituted.

export function stationFrameHtml() {
  // The berth: the hull mount stays owned by the station renderer.
  return `<canvas class="k-world sxb-berth__world" aria-hidden="true"></canvas>` +
    // The title block: the station's name at hero size, the news line, leftover event card,
    // leftover story ledger, handoff.
    `<header class="k-title sxb-berth">` +
      `<span class="of-port-mark" aria-hidden="true"></span>` +
      `<h1 class="k-display k-t-hero sxb-berth__name"></h1>` +
      `<p class="k-t-emph k-62 sxb-berth__news"></p>` +
      `<article class="sxb-event" hidden>` +
        `<span class="sxb-event__badge k-caps"></span>` +
        `<strong class="sxb-event__title"></strong>` +
        `<p class="sxb-event__body"></p>` +
      `</article>` +
      `<article class="sxb-event sxb-berth__ledger" hidden>` +
        `<span class="sxb-event__badge k-caps"></span>` +
        `<strong class="sxb-event__title"></strong>` +
        `<p class="sxb-event__body"></p>` +
      `</article>` +
      `<p class="k-t-fine k-62 sxb-berth__patch" hidden></p>` +
      `<p class="k-t-fine k-62 sxb-berth__route" hidden></p>` +
      `<div class="sxb-handoff" hidden></div>` +
    `</header>` +
    // The quiet column top-right: credits as the hero number, the vitals as rows with their verbs.
    `<aside class="k-corner sxb-crown" aria-label="Credits and ship vitals">` +
      `<div class="k-hero sxb-purse"><div class="k-hero__n sxb-purse__value">0</div><div class="k-hero__w sxb-purse__label">credits</div></div>` +
      `<ul class="k-rows sxb-vitals" style="--k-row-cols: 1fr auto auto"></ul>` +
    `</aside>` +
    // The destination's panel spans both columns of the grid; each destination is a .k-panel.
    `<div class="k-span sx-screen__body" id="sx-panel" role="tabpanel" tabindex="0"></div>` +
    // The foot: the destinations as words, the receipts line, Undock at the row's end.
    `<nav class="of-facility-rail" aria-label="Station facilities"><div class="of-rail-label">Facilities</div><div class="sxb-ops__dock"></div></nav>` +
    `<footer class="k-foot sxb-ops">` +
      
      `<aside class="sx-comms" aria-label="Station communications">` +
        `<div class="sx-receipt" role="status" aria-live="polite" aria-atomic="true" hidden>` +
          `<span class="sx-receipt__kind k-caps"></span> <strong class="sx-receipt__title"></strong> <span class="sx-receipt__delta k-62"></span>` +
        `</div>` +
        `<button type="button" class="k-word k-word--fine sx-comms__toggle" aria-expanded="false" aria-controls="sx-comms-history" aria-label="Open station communications history">` +
          `<span>Comms</span><span class="sx-comms__count" hidden>0</span>` +
        `</button>` +
        `<button type="button" class="k-word k-word--fine sxb-help" aria-expanded="false" aria-label="Explain the active station operation" data-why="Context help">Help</button>` +
        `<div class="sx-comms__history" id="sx-comms-history" aria-label="Berth session log" hidden></div>` +
      `</aside>` +
      `<div class="sxb-launch-seat">` +
          `<button type="button" class="k-word k-word--emph k-word--primary sxb-launch" data-act="undock" data-pop-owner>` +
            `<span class="sxb-launch__label">Undock</span>` +
            `<span class="k-word-sub sxb-launch__state"></span>` +
          `</button>` +
      `</div>` +
    `</footer>` +
    `<div class="sx-pop" hidden></div>`;
}

export function marketFrameHtml() {
  return `<nav class="k-hang sx-mkt__list" aria-label="Commodities"></nav>` +
    `<section class="k-stage k-stage--scroll sx-mkt__stage" id="sx-market-instrument" role="tabpanel" aria-describedby="sx-market-driver-summary">` +
      `<div class="sx-mkt__quote"></div>` +
      `<div class="sx-mkt__console">` +
        `<div class="sx-mkt__trade"></div>` +
        `<div class="sx-mkt__routes" aria-label="Trade routes"></div>` +
        `<aside class="k-t-fine k-62 sx-adboard" data-ad-board aria-label="Dockside commerce notice" hidden></aside>` +
      `</div>` +
    `</section>`;
}

export function shipworksFrameHtml() {
  return `<nav class="k-hang sx-sw__rail" aria-label="Shipworks ship selection">` +
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
    `<section class="k-stage sx-sw__main">` +
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
    `<div class="k-hang sx-sw__chooser" hidden></div>`;
}

export function contractsFrameHtml() {
  return `<div class="k-hang sx-ct__hang">` +
      `<p class="k-caps">Posted here</p>` +
      `<p class="k-t-fine k-38 sx-ct-dispatch__label"></p>` +
      `<nav class="sx-ct__board" aria-label="Available missions"></nav>` +
      `<p class="k-caps sx-ct__yours">Yours</p>` +
      `<aside class="sx-ct__active" aria-label="Active missions"></aside>` +
    `</div>` +
    `<section class="k-stage sx-ct__dossier" aria-live="polite"></section>`;
}

export function barFrameHtml() {
  return `<div class="k-hang sx-bar__hang">` +
      `<nav class="sx-bar__rail" aria-label="Contacts"></nav>` +
      `<aside class="sx-bar__leads" aria-label="Leads"></aside>` +
    `</div>` +
    `<section class="k-stage sx-bar__stage" aria-live="polite"></section>`;
}

export function industryFrameHtml() {
  return `<nav class="k-hang sx-ind__list" aria-label="Blueprints"></nav>` +
    `<section class="k-stage sx-ind__stage"></section>`;
}

export function factionsFrameHtml() {
  return `<nav class="k-hang sx-fac__rail" aria-label="Factions"></nav>` +
    `<section class="k-stage sx-fac__stage" aria-live="polite"></section>`;
}
