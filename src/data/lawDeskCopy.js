// lawDeskCopy.js — the law desk and after-action sentence copy as keyed, placeholder-bearing
// bank rows (inf-fine-why + inf-defeat-situation).
//
// The fine card's why clause and the defeat sheet's hunt clause used to be built from free
// template literals in their owners — real sentences, but invisible to the localization
// extractor, the one part of the pipeline that carries copy to the reviewed translation
// tables. This bank moves them onto the same law the registry's honorific already follows:
// authored rows with recognized text fields (`{placeholder}` survives translation —
// hasPlaceholderParity checks it), owners fill placeholders and never concatenate around
// them. Unknown keys render NOTHING (the anti-free-text failure mode).

export const FINE_WHY_COPY = Object.freeze({
  price: Object.freeze({
    text: 'The price is the read: {base} cr for the warrant plus {perStep} cr for each heat step — assessed at step {step}.',
  }),
  answersFor: Object.freeze({ text: ' It answers for{trace}.' }),
});

export const DEFEAT_HUNT_COPY = Object.freeze({
  band: Object.freeze({ text: 'hunt live: {band} sheet' }),
  clearClock: Object.freeze({ text: 'clears in {seconds}s out of the zone' }),
  tracedTo: Object.freeze({ text: 'traced to{trace}' }),
});

/** Fill one bank row's placeholders left-to-right; unknown keys return the row untouched. */
export function lawDeskLine(row, fills = {}) {
  let text = row && typeof row.text === 'string' ? row.text : '';
  for (const [key, value] of Object.entries(fills || {})) {
    text = text.split('{' + key + '}').join(String(value == null ? '' : value));
  }
  return text;
}
