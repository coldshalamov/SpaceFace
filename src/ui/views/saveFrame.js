// Native save inspection DOM. Storage, conflict confirmations and 3D hull ownership stay in saveLoad.
import { el, hero } from '../kit/dom.js';
export function createSaveStage() {
    const stage = el('div', 'k-stage');
    const caption = el('div', 'k-stage__foot');
    const shipName = el('h2', 'k-display k-t-title', '');
    const portrait = el('div', 'sf-save-portrait');
    portrait.setAttribute('aria-label', 'Save portrait');
    const scars = el('p', 'k-sentence k-t-fine sf-portrait-scars', '');
    scars.dataset.portraitField = 'scars';
    const titles = el('p', 'k-sentence k-t-fine sf-portrait-titles', '');
    titles.dataset.portraitField = 'titles';
    const rapSheet = el('p', 'k-sentence k-t-fine sf-portrait-rap', '');
    rapSheet.dataset.portraitField = 'rapSheet';
    const grudge = el('p', 'k-sentence k-t-fine sf-portrait-grudge', '');
    grudge.dataset.portraitField = 'grudge';
    portrait.appendChild(scars);
    portrait.appendChild(titles);
    portrait.appendChild(rapSheet);
    portrait.appendChild(grudge);
    const objective = el('p', 'k-sentence k-sentence--emph sf-slot-detail', '');
    const credits = hero('', 'credits', { size: 'hero' });
    const fine = el('p', 'k-t-fine k-38 sf-slot-context', '');
    const actions = el('div', 'sf-save-actions');
    caption.appendChild(shipName);
    caption.appendChild(portrait);
    caption.appendChild(objective);
    caption.appendChild(credits);
    caption.appendChild(fine);
    caption.appendChild(actions);
    stage.appendChild(caption);
    return { stage, caption, shipName, portrait, scars, titles, rapSheet, grudge, objective, credits, fine, actions };
}
