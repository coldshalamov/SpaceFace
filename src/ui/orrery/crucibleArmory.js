// The armory's visual inspection and explicit transaction surface. Owns no wallet or fitting:
// the caller supplies a fresh offer and sends the existing purchase intent when the key is used.
import { equipmentSvg } from './equipmentGlyphs.js';
import { hullPosterUrl } from '../hullPosters.js';
import { fittingMedia } from '../../data/fittingDossier.js';
import { injectCruciblePreparation } from './cruciblePreparationLayouts.js';

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
    show(offer, lines, { credits = 0, hullId = '', rows = [] } = {}) {
      const fitKey = `${hullId}:${rows.map(row => row.defId || '').join('|')}`;
      if (fitKey !== lastFit) {
        lastFit = fitKey; buildList.replaceChildren();
        buildSummary.textContent = `Current build · ${rows.filter(row => row.defId).length} / ${rows.length} fitted`;
        for (const row of rows) {
          const li = make('li', '');
          li.appendChild(equipmentSvg({ defId: row.defId || row.slotType }, doc));
          const text = make('span', '');
          text.append(make('small', '', `${row.slotIndex + 1} / ${row.slotType} ${row.slotSize}`),
            make('span', '', row.defId ? row.name || row.defId : 'Empty'));
          li.appendChild(text); buildList.appendChild(li);
        }
      }
      const artId = `${offer.kind || ''}:${offer.defId || offer.id}`;
      if (lastArt !== artId) {
        lastArt = artId; item.replaceChildren();
        const url = offer.kind === 'hull' ? hullPosterUrl(offer.defId || offer.hullId) : null;
        const media = offer.kind === 'hull' || offer.kind === 'service' ? null : fittingMedia(offer.defId);
        const fallback = () => { item.replaceChildren(equipmentSvg(offer, doc)); label.textContent = 'Equipment schematic'; };
        if (url) {
          const image = make('img', ''); image.src = url; image.alt = ''; image.decoding = 'async';
          image.addEventListener('error', () => { item.replaceChildren(equipmentSvg(offer, doc)); }, { once: true });
          item.appendChild(image);
        } else if (media) {
          // The showcase clip is the schematic's upgrade: the real fitting firing in the
          // sim. A webm that never decodes (missing on disk, unsupported codec) falls back
          // to the authored equipment drawing.
          const video = doc.createElement('video');
          video.className = 'orr-armory-clip';
          video.muted = true; video.loop = true; video.autoplay = true; video.playsInline = true;
          video.preload = 'metadata'; video.setAttribute('aria-label', `${offer.name || 'Fitting'} in action`);
          video.src = media.clip;
          video.poster = media.poster;
          let settled = false;
          video.addEventListener('error', () => { if (!settled) { settled = true; fallback(); } }, { once: true });
          item.appendChild(video);
          label.textContent = 'In action';
        } else item.appendChild(equipmentSvg(offer, doc));
        label.textContent = offer.kind === 'hull' ? 'Hull preview'
          : item.querySelector('video') ? 'In action' : 'Equipment schematic';
      }
      fitline.textContent = lines.slot || (offer.kind === 'service' ? 'Applies to this run.' : 'Inspect before you fit.');
      const price = Math.max(0, Number(offer.price) || 0);
      buy.disabled = !offer.available || !!offer.purchased;
      buy.setAttribute('aria-disabled', String(buy.disabled));
      buy.textContent = offer.purchased ? 'Already fitted' : !offer.available ? 'Unavailable'
        : `${offer.kind === 'hull' ? 'Switch hull' : offer.kind === 'service' ? 'Purchase' : 'Install'} · ${price.toLocaleString('en-US')} cr`;
      buy.setAttribute('aria-label', `${buy.textContent}: ${lines.name}`);
      refusal.textContent = offer.purchased ? 'This item is part of your current build.'
        : !offer.available ? offer.unavailableReason || 'This offer cannot be fitted to the current build.'
          : `${Math.max(0, credits - price).toLocaleString('en-US')} cr remaining after purchase${offer.replaces ? ` · replaces ${offer.replacesName || 'the fitted item'}` : ''}.`;
    },
    buy,
  };
}
