// Presentation only: readiness, cargo, consequences and route policy are supplied by the native
// missionPreflight/controller. *Html values are trusted renderer fragments, never raw user text.
import { escapeMarkup as escapeHtml } from './identity.js';
export function termRow(k, v, sub) {
  return (
    `<li class="k-row k-row--static">` +
      `<span class="k-62">${k}</span>` +
      `<span class="k-row__num sx-term__v">${v}${sub ? `<span class="k-row__sub sx-term__sub">${sub}</span>` : ''}</span>` +
    `</li>`
  );
}

/** The Accept word (or its final-disposition variant); disabled with its reason while blocked. */
export function commitWordHtml({ id, ready, readyLabel, blockedLabel, aria, focus, reason }) {
  return (
    `<ul class="k-words k-words--row sx-dossier__foot">` +
      `<li><button type="button" class="k-word k-word--emph k-word--primary sx-ct-commit${focus ? ' is-attention' : ''}"` +
        ` data-accept="${escapeHtml(String(id))}"${ready ? '' : ' disabled'} aria-label="${escapeHtml(aria)}">` +
        `<span>${ready ? readyLabel : blockedLabel}</span>` +
      `</button>` +
      (ready ? '' : `<span class="k-word-sub">${escapeHtml(reason)}</span>`) +
      `</li>` +
    `</ul>`
  );
}


export function contractDossierView({ typeName, titleHtml, clientHtml, reward, summary, routeHtml,
  riskHtml, termsHtml, readiness = {}, clausesHtml = '', focusAccept = false, action }) {
  return `<div class="sx-dossier${focusAccept ? ' is-attention' : ''}">
    <p class="k-caps">${escapeHtml(typeName)}</p>
    <h2 class="k-display k-t-title sx-dossier__title">${titleHtml}</h2>
    <p class="k-sentence k-sentence--emph sx-dossier__client">${clientHtml} · ${escapeHtml(typeName)}</p>
    <div class="k-hero k-hero--hero k-hero--signal sx-dossier__reward"><span class="k-hero__n">${escapeHtml(reward)}</span><span class="k-hero__w">cr on delivery</span></div>
    ${summary ? `<p class="k-sentence sx-dossier__summary">${escapeHtml(summary)}</p>` : ''}
    <p class="k-sentence sx-dossier__route" aria-label="Mission operation route">${routeHtml}</p>
    <p class="k-sentence sx-dossier__risk">${riskHtml}</p>
    <ul class="k-rows sx-dossier__terms">${termsHtml}</ul>
    ${readiness.blocker ? `<p class="k-sentence k-bad sx-dossier__gate">${escapeHtml(readiness.blocker)}</p>`
      : readiness.warning ? `<p class="k-sentence sx-dossier__gate">${escapeHtml(readiness.warning)}</p>` : ''}
    ${clausesHtml ? `<ul class="k-words k-words--row sx-dossier__clauses" aria-label="Contract clauses">${clausesHtml}</ul>` : ''}
    ${commitWordHtml(action)}
  </div>`;
}
