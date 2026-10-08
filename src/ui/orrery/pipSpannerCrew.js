// Authored armory crew. Every consequence comes from survivalDraft's scoped receipt;
// this presenter owns neither run money nor equipment and never delays a launch.
import { createPipSpannerPreview } from './pipSpannerPreview.js';
import { equipmentSvg } from './equipmentGlyphs.js';
export function createPipSpannerCrew({ host, doc = host?.ownerDocument } = {}) {
  if (!host || !doc?.createElementNS) return null;
  const make = (tag, cls, text) => {
    const node = doc.createElement(tag); node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const root = make('div', 'orr-pip-spanner');
  root.dataset.state = 'inspect';
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 280 76'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const showSchematic = shown => {
    if (shown) svg.removeAttribute('hidden');
    else svg.setAttribute('hidden', '');
  };
  const shape = (tag, attrs, parent = svg) => {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.appendChild(node); return node;
  };
  // Pip: triangular survey drone, optic and a solid pointer aimed at the inspected mount.
  const pip = shape('g', { class: 'orr-crew-pip' });
  shape('path', { d: 'M18 38 44 17 59 38 44 59Z M19 38H9 M44 17V10 M44 59V66' }, pip);
  shape('circle', { cx:44, cy:38, r:7 }, pip);
  shape('path', { class:'orr-crew-pointer', d:'M59 38H113L105 33M113 38 105 43' }, pip);
  // Spanner: open service sled, two hinged jaws and a supported item cradle.
  const spanner = shape('g', { class:'orr-crew-spanner' });
  shape('path', { d:'M240 15H258V61H240 M248 25H270 M248 51H270 M205 32H230V44H205 M211 37H224' }, spanner);
  shape('path', { class:'orr-crew-jaw-upper', d:'M241 22H220L197 12 185 22' }, spanner);
  shape('path', { class:'orr-crew-jaw-lower', d:'M241 54H220L197 64 185 54' }, spanner);
  shape('circle', { cx:241,cy:22,r:3 }, spanner);
  shape('circle', { cx:241,cy:54,r:3 }, spanner);
  shape('path', { class:'orr-crew-mount', d:'M132 30H156V46H132Z M126 38H132 M156 38H162' });
  const names = make('p', 'orr-crew-names', 'Pip · inspect      Spanner · prepare');
  const status = make('p', 'orr-crew-status', 'Select equipment. Pip checks its mount; Spanner waits for your order.');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.append(svg, names, status); host.appendChild(root);
  let selection = null, receiptKey = null, generation = null, active = true;
  let preview = null, stage = null, item = null, itemLabel = null, selectedOffer = null;
  const ensurePreview = () => {
    if (preview || !active || !doc.defaultView) return;
    const canvas = doc.createElement('canvas');
    if (!canvas.getContext) return;
    if (!stage) {
      stage = make('div', 'orr-crew-stage');
      stage.setAttribute('aria-hidden', 'true'); stage.hidden = true;
      item = make('div', 'orr-crew-item'); itemLabel = make('span', 'orr-crew-item-label');
      stage.append(item, itemLabel); root.prepend(stage);
    }
    canvas.setAttribute('aria-hidden', 'true'); canvas.setAttribute('focusable', 'false');
    stage.prepend(canvas);
    preview = createPipSpannerPreview({ canvas, doc,
      onReady() { if (active) { stage.hidden = false; showSchematic(false); root.dataset.visual = 'authored'; } },
      onError() { stage.hidden = true; showSchematic(true); root.dataset.visual = 'schematic'; },
      onProject({ x, y }) {
        item.style.left = `${x}px`; item.style.top = `${y}px`;
        itemLabel.style.left = `${x}px`; itemLabel.style.top = `${y + 27}px`;
      },
    });
    if (selectedOffer) preview?.inspect(selectedOffer);
  };
  const retirePreview = () => {
    preview?.dispose(); preview = null;
    stage?.querySelector('canvas')?.remove();
    if (stage) stage.hidden = true;
    showSchematic(true);
  };
  return {
    scope(value) {
      if (value === generation) return;
      generation = value; selection = null; receiptKey = null;
      selectedOffer = null; preview?.reset();
      root.dataset.state = 'inspect'; root.dataset.animate = 'false';
    },
    inspect(offer) {
      if (!offer || selection === offer.id) return;
      selectedOffer = offer; ensurePreview(); preview?.inspect(offer);
      if (item) { item.replaceChildren(equipmentSvg(offer, doc)); itemLabel.textContent = `${offer.name || offer.defId} · schematic`; }
      selection = offer.id; root.dataset.state = offer.purchased ? 'installed' : 'inspect';
      status.textContent = offer.purchased ? `${offer.name || offer.defId} is already fitted.`
        : `Pip: ${offer.name || offer.defId}. ${offer.kind === 'service' ? 'Service for the current run'
          : Number.isInteger(offer.slotIndex) ? `Mount ${offer.slotIndex + 1}` : 'Hull cradle'}. Spanner awaits confirmation.`;
    },
    pending(offer) {
      root.dataset.state = 'pending';
      status.textContent = `Spanner: preparing ${offer?.name || offer?.defId || 'equipment'}…`;
    },
    receipt(value) {
      if (value && generation != null && value.generation !== generation) return;
      if (!value) {
        if (root.dataset.state === 'pending') {
          root.dataset.state = 'inspect';
          status.textContent = 'Preparation did not complete. Inspect the current build before trying again.';
        }
        return;
      }
      const key = `${value.generation}:${value.sequence}:${value.outcome}`;
      if (key === receiptKey) return;
      receiptKey = key;
      const selectedResult = value.offerId === selection;
      root.dataset.state = selectedResult ? value.outcome : 'inspect';
      // Closed/retired screens can reread the result without replaying the old action.
      root.dataset.animate = active && selectedResult && value.outcome === 'accepted' ? 'true' : 'false';
      if (active && selectedResult) preview?.receipt(value, selection);
      status.textContent = value.outcome === 'accepted'
        ? `Spanner: ${value.name} ready. ${value.text}${value.charged ? ` ${value.price} run credits spent.` : ' No run credits spent.'}`
        : value.outcome === 'pending' ? `Spanner: preparing ${value.name}…`
          : `Pip: preparation refused. ${value.text}`;
    },
    setActive(value) {
      active = !!value; root.dataset.animate = 'false';
      root.hidden = !active;
      if (active) ensurePreview(); else retirePreview();
    },
    dispose() { active = false; retirePreview(); root.remove?.(); },
    root, status,
  };
}
