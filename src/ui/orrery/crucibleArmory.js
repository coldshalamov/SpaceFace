// The armory's visual inspection and explicit transaction surface. Owns no wallet or fitting:
// the caller supplies a fresh offer and sends the existing purchase intent when the key is used.
import { equipmentSvg } from './equipmentGlyphs.js';
import { weaponClipUrl } from '../weaponClips.js';
import { hullPosterUrl } from '../hullPosters.js';
import { injectCruciblePreparation } from './cruciblePreparationLayouts.js';
import { createPipSpannerCrew } from './pipSpannerCrew.js';

// DefIds whose clip 404'd this session — each missing file is requested once, not once
// per inspection. Entries never expire: clips land with a build, not mid-session.
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
  let lastArt = null, lastFit = null;
  return {
    wallet(credits, visible = true) { wallet.hidden = !visible; balance.textContent = `${Math.max(0, Number(credits) || 0).toLocaleString('en-US')} cr`; },
    show(offer, lines, { credits = 0, hullId = '', rows = [], armed = true, receipt = null, generation = null } = {}) {
      const fitKey = `${hullId}:${rows.map(row => row.defId || '').join('|')}`;
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
      const artId = `${offer.kind || ''}:${offer.defId || offer.id}`;
      if (lastArt !== artId) {
        lastArt = artId; item.replaceChildren();
        const url = offer.kind === 'hull' ? hullPosterUrl(offer.defId || offer.hullId) : null;
        // A recorded firing pass plays where a clip exists (src/ui/weaponClips.js names the
        // file); the schematic stands until the first frame is playable, so a missing clip is
        // never a blank box. Reduced motion keeps the still schematic.
        const reduceMotion = !!doc.documentElement
          && doc.documentElement.classList.contains('sf-reduce-motion');
        const clip = !reduceMotion && offer.kind !== 'hull' && offer.kind !== 'service' && offer.defId
          && !missingClips.has(offer.defId)
          ? weaponClipUrl(offer.defId)
          : null;
        if (clip) {
          item.appendChild(equipmentSvg(offer, doc));
          const video = make('video', '');
          video.muted = true; video.loop = true;
          video.playsInline = true; video.autoplay = true;
          video.setAttribute('aria-label', `${lines.name} firing`);
          video.addEventListener('error', () => { missingClips.add(offer.defId); }, { once: true });
          video.addEventListener('canplay', () => {
            if (lastArt !== artId) return;
            item.replaceChildren(video);
            label.textContent = 'In action';
            if (typeof video.play === 'function') video.play().catch(() => {});
          }, { once: true });
          video.src = clip;
        } else if (url) {
          const image = make('img', ''); image.src = url; image.alt = ''; image.decoding = 'async';
          image.addEventListener('error', () => {
            if (lastArt === artId) item.replaceChildren(equipmentSvg(offer, doc));
          }, { once: true });
          item.appendChild(image);
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
    setActive(value) { crew?.setActive(value); },
    dispose() { lastArt = null; crew?.dispose(); },
    buy,
  };
}
