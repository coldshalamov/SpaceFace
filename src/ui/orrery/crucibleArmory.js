// The armory's visual inspection and explicit transaction surface. Owns no wallet or fitting:
// the caller supplies a fresh offer and sends the existing purchase intent when the key is used.
import { equipmentSvg } from './equipmentGlyphs.js';
import { weaponClipUrl } from '../weaponClips.js';
import { hullPosterUrl } from '../hullPosters.js';
import { injectCruciblePreparation } from './cruciblePreparationLayouts.js';
import { createPipSpannerCrew } from './pipSpannerCrew.js';
import { createArmoryPreviewMedia } from './armoryPreviewMedia.js';

// Missing/unsupported clips are requested once per session. Aborted loads and transient
// network errors are not permanent catalog misses.
const missingClips = new Set();

export function createVisualArmory({ root, reading, parts, onPurchase } = {}) {
  const doc = root?.ownerDocument;
  if (!doc?.createElementNS || !reading || !parts) return null;
  injectCruciblePreparation(doc); root.classList.add('orr-visual-armory');
  reading.removeAttribute('aria-hidden'); reading.setAttribute('aria-label', 'Inspect equipment and purchase');
  const make = (tag, cls, text) => {
    const n = doc.createElement(tag); n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (tag === 'button') n.type = 'button';
    return n;
  };
  const visual = make('div', 'orr-armory-visual');
  const item = make('div', 'orr-armory-item');
  const label = make('p', 'orr-armory-object-label', 'Equipment schematic');
  const build = make('details', 'orr-armory-build');
  const buildSummary = make('summary', '', 'Current build');
  const buildList = make('ul', ''); build.append(buildSummary, buildList);
  visual.append(item, label, parts.jig, build); reading.prepend(visual);
  const crew = createPipSpannerCrew({ host: visual, doc });
  const fitline = make('p', 'orr-armory-fitline', '');
  parts.act.after(fitline);
  // The words remain accessible even when the catalog is empty or no illustration is available.
  const buy = make('button', 'orr-armory-purchase', 'Install'); buy.addEventListener('click', onPurchase);
  const refusal = make('p', 'orr-armory-refusal', '');
  parts.buy.replaceChildren(buy, refusal);
  const wallet = make('div', 'orr-armory-wallet');
  const balance = make('strong', '', '');
  wallet.append(balance, make('span', '', 'Run credits · not campaign credits'));
  root.querySelector('.k-title').appendChild(wallet);
  const motionQuery = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motionReduced = () => !!doc.documentElement?.classList.contains('sf-reduce-motion')
    || !!motionQuery?.matches;
  const preview = createArmoryPreviewMedia({ motionReduced });
  let lastArt = null, lastFit = null, lastOffer = null, disposed = false;
  return {
    wallet(credits, visible = true) { wallet.hidden = !visible; balance.textContent = `${Math.max(0, Number(credits) || 0).toLocaleString('en-US')} cr`; },
    show(offer, lines, { credits = 0, hullId = '', rows = [], armed = true, receipt = null, generation = null } = {}) {
      if (disposed) return;
      const offerKey = JSON.stringify([offer.kind, offer.id ?? offer.defId ?? offer.hullId, offer._ownedIndex]);
      if (offerKey !== lastOffer) {
        lastOffer = offerKey;
        // A new selection starts at its sentence, not at the previous item's scrolled schematic.
        // Do not scroll the outer phone page or reset inspection during a wallet/receipt refresh.
        reading.scrollTop = 0;
      }
      const fitKey = JSON.stringify([hullId, rows.map(row => [row.defId, row.name, row.slotIndex,
        row.slotType, row.slotSize, row.intrinsicDefId, row.intrinsicName])]);
      if (fitKey !== lastFit) {
        lastFit = fitKey; buildList.replaceChildren();
        buildSummary.textContent = `Current build · ${rows.filter(row => row.defId).length} fitted`
          + (rows.some(row => row.intrinsicDefId) ? ' · alien emitters built in' : ` / ${rows.length}`);
        for (const row of rows) {
          const li = make('li', '');
          li.appendChild(equipmentSvg({ defId: row.defId || row.slotType }, doc));
          const text = make('span', '');
          text.append(make('small', '', `${row.slotIndex + 1} / ${row.slotType} ${row.slotSize}`),
            make('span', '', row.defId ? row.name || row.defId : row.intrinsicDefId ? `${row.intrinsicName} · built in` : 'Empty'));
          li.appendChild(text); buildList.appendChild(li);
        }
      }
      const reduceMotion = motionReduced();
      const artId = JSON.stringify([offer.kind, offer.defId || offer.hullId || offer.id, reduceMotion]);
      if (lastArt !== artId) {
        lastArt = artId;
        const token = preview.begin();
        item.replaceChildren();
        const url = offer.kind === 'hull' ? hullPosterUrl(offer.defId || offer.hullId) : null;
        // A recorded firing pass plays where a clip exists (src/ui/weaponClips.js names the
        // file); the schematic stands until the first frame is playable, so a missing clip is
        // never a blank box. Reduced motion keeps the still schematic.
        const clip = !reduceMotion && offer.kind !== 'hull' && offer.kind !== 'service' && offer.defId
          && !missingClips.has(offer.defId)
          ? weaponClipUrl(offer.defId)
          : null;
        if (clip) {
          item.appendChild(equipmentSvg(offer, doc));
          const video = make('video', '');
          video.muted = true; video.loop = true;
          video.playsInline = true; video.preload = 'auto';
          preview.attach(token, video);
          video.setAttribute('aria-label', `${lines.name} firing`);
          video.addEventListener('error', () => {
            if (!preview.owns(token)) return;
            if (video.error?.code === 4) missingClips.add(offer.defId);
            preview.clear();
            item.replaceChildren(equipmentSvg(offer, doc));
            label.textContent = 'Equipment schematic';
          }, { once: true });
          video.addEventListener('canplay', () => {
            if (!preview.owns(token)) return;
            item.replaceChildren(video);
            label.textContent = 'In action';
            preview.ready(token, video);
          }, { once: true });
          video.src = clip;
        } else if (url) {
          item.appendChild(equipmentSvg(offer, doc));
          const image = make('img', ''); image.alt = ''; image.decoding = 'async';
          image.addEventListener('load', () => {
            if (preview.owns(token)) item.replaceChildren(image);
          }, { once: true });
          // The schematic remains visible if the image is slow or missing.
          image.src = url;
        } else item.appendChild(equipmentSvg(offer, doc));
        label.textContent = offer.kind === 'hull' ? 'Ship preview' : 'Equipment schematic';
      }
      fitline.textContent = lines.slot || (offer.kind === 'service' ? 'Applies to this run.' : 'Inspect before you fit.');
      const price = Math.max(0, Number(offer.price) || 0);
      buy.disabled = !offer.available || !!offer.purchased || !armed;
      buy.setAttribute('aria-disabled', String(buy.disabled));
      buy.textContent = offer.purchased ? 'Already fitted' : !offer.available ? 'Unavailable' : !armed ? 'Select an item to prepare'
        : `${offer.kind === 'hull' ? (Number.isInteger(offer._ownedIndex) ? 'Switch ship' : 'Buy & fly') : offer.kind === 'service' ? 'Purchase' : 'Install'} · ${price.toLocaleString('en-US')} cr`;
      buy.setAttribute('aria-label', `${buy.textContent}: ${lines.name}`);
      refusal.textContent = offer.purchased ? 'This item is part of your current build.'
        : !offer.available ? offer.unavailableReason || 'This offer cannot be fitted to the current build.'
          : `${Math.max(0, credits - price).toLocaleString('en-US')} cr remaining after purchase${offer.replaces ? ` · replaces ${offer.replacesName || 'the fitted item'}` : ''}.`;
      crew?.scope(generation); crew?.inspect(offer); crew?.receipt(receipt);
    },
    pending(offer) { crew?.pending(offer); buy.disabled = true; buy.setAttribute('aria-disabled', 'true'); },
    setActive(value) { if (!disposed) { preview.setActive(value); crew?.setActive(value); } },
    dispose() {
      if (disposed) return;
      disposed = true; lastArt = null;
      preview.dispose();
      buy.removeEventListener('click', onPurchase);
      crew?.dispose();
    },
    buy,
  };
}
