// Native selected/engaged target panel, without its simulation dependency graph.
export function targetFrameHtml() {
  return `
    <div class="sf-target__head">
      <span class="sf-target__name">—</span>
      <span class="sf-target__faction"></span>
    </div>
    <!-- J07: the three health bars are GONE. Shield/armour/hull are drawn as arcs around the
         target in the world (hud.js .sf-target-arcs), which is where you are already looking during
         a fight. Duplicating them on a card in the corner spent the card's whole width on a number
         you had to look away to read. What replaces them is the thing the card can say and the world
         mark cannot: how dangerous this contact is, and how far away it is. -->
    <div class="sf-target__threat" data-tier="" hidden>
      <span class="sf-target__threat-pips" aria-hidden="true"></span>
      <span class="sf-target__threat-word"></span>
    </div>
    <div class="sf-target__rangerow">
      <span class="sf-target__rangebar" aria-hidden="true"><i class="sf-target__rangefill"></i></span>
      <span class="sf-target__dist mono">0 wu</span>
    </div>
    <div class="sf-target__engaged mono" role="status" aria-live="polite" aria-atomic="true"
      style="display:none;margin-top:2px;font-size:var(--k-fs-data);line-height:1.3;color:var(--k-signal);"><span data-glyph aria-hidden="true"></span><span data-txt></span></div>
    <div class="sf-target__identity mono" style="display:none"></div>
    <div class="sf-target__intent mono" style="display:none;margin-top:3px;font-size:var(--k-fs-data);line-height:1.3;color:var(--k-bone-62);"></div>
    <div class="sf-target__meta">
      <span class="sf-target__range mono" style="color:var(--k-bone-62);"></span>
      <span class="sf-target__closing mono"><span data-glyph aria-hidden="true"></span><span data-txt></span></span>
    </div>
    <div class="sf-target__triangle" style="display:none">
      <span class="sf-target__tri-label mono">VULN</span>
      <span class="sf-tri sf-tri--e" tabindex="0" role="img" aria-label="Vulnerability to energy weapons" data-why="Energy"><span class="sf-tri__k">E</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-tri sf-tri--k" tabindex="0" role="img" aria-label="Vulnerability to kinetic weapons" data-why="Kinetic"><span class="sf-tri__k">K</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-tri sf-tri--x" tabindex="0" role="img" aria-label="Vulnerability to explosives" data-why="Explosive"><span class="sf-tri__k">X</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-target__tri-layer mono"></span>
    </div>
    <div class="sf-target__weak mono" style="display:none"><span data-glyph aria-hidden="true"></span><span data-txt></span></div>
    <div class="sf-target__component mono" role="button" tabindex="0" aria-label="Cycle target component"
      style="display:none;margin-top:3px;font-size:var(--k-fs-data);pointer-events:auto;cursor:pointer;padding:0 0 .15em;border:0;border-bottom:1px solid var(--k-hair);color:var(--k-bone-62);"><span data-glyph aria-hidden="true"></span><span data-txt></span></div>
    <div class="sf-target__gimmick mono" style="display:none"></div>`;
}
