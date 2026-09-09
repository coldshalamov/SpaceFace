// Native chart chrome. All controls, IDs, hidden states, and route/engage boundaries are retained.
// HTML parameters are trusted, already-escaped fragments constructed by galaxyMap's own models.
export function navigationFrameHtml({ hintRowsHtml = '', layerButtonsHtml = '', legendHtml = '', markLegendHtml = '' } = {}) {
  return `
      <div class="gm-head k-title">
        <div class="gm-title-lockup">
          <h1 class="gm-title k-display k-t-title">Star Chart</h1>
          <p class="gm-stamp k-t-emph k-62">Nav chart / Survey table</p>
        </div>
        <div class="gm-search-container">
          <input type="text" class="gm-search-input k-input" placeholder="Search galaxy… (Press /)" aria-label="Search map" tabindex="-1" spellcheck="false" autocomplete="off" />
          <span class="gm-search-kbd" aria-hidden="true">/</span>
          <div class="gm-search-results k-rows" hidden></div>
        </div>
        <div class="gm-rail">
          <span class="gm-rail-track" aria-hidden="true"><span class="gm-rail-marker"></span></span>
          <div class="gm-scale-buttons k-words k-words--row" role="group" aria-label="Map scale">
            <button class="gm-scale-btn k-word k-word--body" type="button" data-focus="local" aria-pressed="false">Local</button>
            <button class="gm-scale-btn k-word k-word--body" type="button" data-focus="system" aria-pressed="false">System</button>
            <button class="gm-scale-btn k-word k-word--body" type="button" data-focus="galaxy" aria-pressed="false">Galaxy</button>
          </div>
          <span class="gm-level k-t-fine k-38">Scale <b data-level>GALAXY</b></span>
        </div>
        <div class="gm-weather k-t-fine k-38" id="gm-crest-weather" role="status" aria-live="polite"></div>
        <button class="gm-hint-btn k-word k-word--fine" type="button" aria-label="Map controls" aria-expanded="false">Controls</button>
        <button class="gm-close k-word k-word--fine" type="button" aria-label="Close Map">Close</button>
        <div class="gm-hints" hidden>
          <div class="gm-hints-title k-caps">Chart controls</div>${hintRowsHtml}
          <div class="gm-hints-note k-t-fine k-38">Edge ticks mark stations, gates, claims and hostiles that fall outside the current view. Click a tick to inspect it.</div>
        </div>
      </div>
      <div class="gm-body-container">
        <!-- ═══ LEFT RAIL ═══════════════════════════════════════════════════════════════════════
             SLICE C — PROGRESSIVE DISCLOSURE (ADR D9.9). This rail used to be four always-open
             stacked blocks (overlays, market intel, two legends) plus a footer. Every one of them
             was on glass at all times, including two pure reference legends the player consults
             perhaps twice — which is the reported density paradox exactly: "too little useful
             information, yet crowded".

             They are now disclosure sections and only ONE (Lenses, the primary tool) is open by
             default. Native details/summary elements are deliberate over a hand-rolled accordion:
             they are keyboard-operable, expose expanded/collapsed state to screen readers, and
             survive forced-colors without any JavaScript of ours. The information did not shrink;
             the default view did. -->
        <div class="gm-left-rail k-hang">
          <details class="gm-rail-sec" data-rail-sec="lenses" open>
            <summary class="gm-rail-sum k-caps"><span class="gm-rail-sum-t">Lenses</span><span class="gm-rail-sum-n" data-lens-count></span></summary>
            <div class="gm-rail-body">
              <div class="gm-layer-buttons">${layerButtonsHtml}
              </div>
              <div class="gm-rail-commodity">
                <label for="gm-commodity-select" class="k-caps">Market lens · commodity</label>
                <select id="gm-commodity-select" aria-label="Select Commodity"></select>
              </div>
            </div>
          </details>

          <details class="gm-rail-sec" data-rail-sec="missions">
            <summary class="gm-rail-sum k-caps"><span class="gm-rail-sum-t">Missions</span><span class="gm-rail-sum-n" data-mission-count></span></summary>
            <div class="gm-rail-body k-rows" id="gm-rail-missions"></div>
          </details>

          <details class="gm-rail-sec" data-rail-sec="bookmarks">
            <summary class="gm-rail-sum k-caps"><span class="gm-rail-sum-t">Bookmarks</span><span class="gm-rail-sum-n" data-bookmark-count></span></summary>
            <div class="gm-rail-body k-rows" id="gm-rail-bookmarks"></div>
          </details>

          <details class="gm-rail-sec" data-rail-sec="alternatives">
            <summary class="gm-rail-sum k-caps"><span class="gm-rail-sum-t">Route alternatives</span></summary>
            <div class="gm-rail-body k-rows" id="gm-rail-alternatives"></div>
          </details>

          <details class="gm-rail-sec" data-rail-sec="key">
            <summary class="gm-rail-sum k-caps"><span class="gm-rail-sum-t">Chart key</span></summary>
            <div class="gm-rail-body">
              <div class="gm-rail-legend k-rows">
                <div class="gm-rail-title k-caps">Service marks</div>${legendHtml}
              </div>
              <div class="gm-rail-legend k-rows">
                <div class="gm-rail-title k-caps">Chart marks</div>${markLegendHtml}
              </div>
              <div class="gm-hint-text k-t-fine k-38">A working instrument, not a picture: <b>double-click any mark to lay a course</b>. <b>Controls</b> in the corner shows the full control key.</div>
            </div>
          </details>
        </div>

        <!-- Viewport -->
        <div class="gm-viewport">
          <canvas aria-label="Galaxy navigation map"></canvas>
        </div>

        <!-- ═══ RIGHT INSPECTOR ═════════════════════════════════════════════════════════════════
             SLICE C — DEPTH ON DEMAND. The inspector previously rendered its whole no-selection
             payload at once (command status + trade lanes + best-known quotes + a note). Now one
             tab is visible at a time and Overview is the default, so the panel answers the
             navigation questions first and everything else is one keystroke away rather than
             permanently stacked underneath.

             The tablist is a real ARIA tablist with roving tabindex and arrow-key traversal — see
             the _onTabKey handler. Tabs are NOT links and NOT divs-with-click. -->
        <div class="gm-right-inspector">
          <div class="gm-tabs k-words k-words--row" id="gm-tabs" role="tablist" aria-label="Inspector detail"></div>
          <div class="gm-inspector-content k-rows">
            <!-- Slice A: the two "never lost" framing controls. They live ABOVE the target actions
                 and are never hidden, because their whole job is to be reachable at the moment the
                 pilot has lost the thread — which is exactly when nothing is selected. Both follow
                 the shipped engage-button contract: visibly disabled plus a spoken reason, never a
                 silent no-op. -->
            <div class="gm-frame-group" role="group" aria-label="Chart framing">
              <button class="gm-ins-btn gm-frame-btn k-word k-word--body" id="gm-return-ship-btn" type="button" data-framing="return-to-ship" disabled aria-disabled="true">Return to ship</button>
              <button class="gm-ins-btn gm-frame-btn k-word k-word--body" id="gm-frame-both-btn" type="button" data-framing="frame-both" disabled aria-disabled="true">Frame ship + destination</button>
              <div class="gm-frame-reason k-t-fine k-38" id="gm-frame-reason" aria-live="polite"></div>
            </div>
            <div class="gm-inspector-details" id="gm-tabpanel" role="tabpanel" tabindex="0">
              <div class="gm-inspector-empty">No target selected. <b>Click</b> a sector, station or contact to inspect it — <b>double-click</b> to lay a course.</div>
            </div>
            <button class="gm-ins-btn k-word k-word--emph" id="gm-set-course-btn" type="button" hidden disabled>Set Waypoint</button>
            <!-- SECONDARY PLOT (ADR D6). Contextual, never permanent: it reveals ONLY when the
                 primary action is a commitment — "Set Course & Jump" for an adjacent sector — and
                 stays hidden whenever the primary already IS "Plot Course", so the chart never
                 shows two buttons that do the same thing. Without it, plot-without-committing was
                 unreachable for every neighbouring destination, which is most of them. -->
            <button class="gm-ins-btn gm-plot-btn k-word k-word--emph k-word--primary" id="gm-plot-course-btn" type="button" hidden disabled>Plot Course</button>
            <div class="gm-plot-reason k-t-fine k-38" id="gm-plot-reason" aria-live="polite"></div>
            <!-- W1-8: engage is a SEPARATE control from plot, never the same button. -->
            <button class="gm-ins-btn k-word k-word--emph" id="gm-engage-route-btn" type="button" hidden disabled>Engage Route</button>
            <div class="gm-engage-reason k-t-fine k-38" id="gm-engage-reason" aria-live="polite"></div>
            <!-- Place context actions for the current selection. Each one is resolved from real
                 state and ships disabled-with-a-reason when it has no consumer. -->
            <div class="gm-place-actions" id="gm-place-actions" role="group" aria-label="Place actions"></div>
          </div>
        </div>
      </div>
      <div class="gm-apron k-foot" id="gm-apron">
        <div class="gm-apron-ribbon">
          <div class="gm-ribbon" id="gm-route-ribbon" role="region" aria-label="Route" hidden>
            <div class="gm-ribbon-main">
              <p class="gm-ribbon-head k-sentence k-sentence--emph">
                <span class="gm-ribbon-status" id="gm-ribbon-status"></span>
                <span class="gm-ribbon-arrival" id="gm-ribbon-arrival"></span>
              </p>
              <ol class="gm-ribbon-legs" id="gm-ribbon-legs"></ol>
              <div class="gm-ribbon-meta k-t-fine k-38" id="gm-ribbon-meta"></div>
            </div>
            <div class="gm-ribbon-actions k-words k-words--row" id="gm-ribbon-actions" role="group" aria-label="Route control"></div>
            <div class="gm-ribbon-reason k-t-fine k-38" id="gm-ribbon-reason" aria-live="polite"></div>
          </div>
        </div>
        <div class="gm-deck" id="gm-cargo-deck" aria-label="Cargo deck">
          <div class="gm-deck-head">
            <div class="gm-deck-title k-caps">Cargo deck</div>
            <button class="gm-deck-sort k-word k-word--fine" id="gm-deck-sort" type="button" aria-label="Sort cargo deck routes">
              Sort · best
            </button>
          </div>
          <div class="gm-deck-table k-table" id="gm-deck-table" role="list"></div>
        </div>
      </div>
    `;
}
