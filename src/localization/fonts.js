// Font fallback for the five launch languages. The display face (Bricolage Grotesque) and the
// body face (Instrument Sans) already cover Latin Extended; system and Noto stacks catch anything
// the bundled files miss. No CJK in the launch set (EN / ES / FR / DE / PT-BR).

export const LATIN_DISPLAY_STACK = '"Bricolage Grotesque", "Instrument Sans", "Segoe UI", "Noto Sans", system-ui, sans-serif';
export const LATIN_BODY_STACK = '"Instrument Sans", "Segoe UI", "Noto Sans", system-ui, -apple-system, sans-serif';

export const LOCALE_FONT_STACKS = Object.freeze({
  'en-US': Object.freeze({ display: LATIN_DISPLAY_STACK, body: LATIN_BODY_STACK }),
  'es-ES': Object.freeze({ display: LATIN_DISPLAY_STACK, body: LATIN_BODY_STACK }),
  'fr-FR': Object.freeze({ display: LATIN_DISPLAY_STACK, body: LATIN_BODY_STACK }),
  'de-DE': Object.freeze({ display: LATIN_DISPLAY_STACK, body: LATIN_BODY_STACK }),
  'pt-BR': Object.freeze({ display: LATIN_DISPLAY_STACK, body: LATIN_BODY_STACK }),
  'qps-ploc': Object.freeze({ display: LATIN_DISPLAY_STACK, body: LATIN_BODY_STACK }),
});

export function fontStackForLocale(locale) {
  return LOCALE_FONT_STACKS[locale] || LOCALE_FONT_STACKS['en-US'];
}

export function fontFallbackCss(locale) {
  const stack = fontStackForLocale(locale);
  return `html[data-locale="${locale}"] {
    --font: ${stack.body};
    --k-text: ${stack.body};
    --sf-display-face: ${stack.display};
    --sf-subhead-face: ${stack.body};
    --sf-body-face: ${stack.body};
    --sf-data-face: ${stack.body};
  }`;
}

const FONT_STYLE_ID = 'sf-localization-font-fallback';

export function applyLocaleFonts(doc, locale) {
  if (!doc || !doc.documentElement) return false;
  let style = doc.getElementById(FONT_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = FONT_STYLE_ID;
    style.setAttribute('data-localization-skip', '');
    (doc.head || doc.documentElement).appendChild(style);
  }
  const stacks = Object.keys(LOCALE_FONT_STACKS).map(fontFallbackCss);
  style.textContent = stacks.join('\n');
  return true;
}

export default {
  LOCALE_FONT_STACKS,
  fontStackForLocale,
  fontFallbackCss,
  applyLocaleFonts,
};
