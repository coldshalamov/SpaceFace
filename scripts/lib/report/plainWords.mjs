const COUNT_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];

export function countWord(n) {
  const i = Number(n);
  return Number.isInteger(i) && i >= 0 && i < COUNT_WORDS.length ? COUNT_WORDS[i] : String(n);
}

export function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function fmtNumber(value) {
  const r = round2(value);
  return r === null ? '—' : String(r);
}

export function plainValue(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const n = fmtNumber(value);
  switch (unit) {
    case 's':
      return `${n} seconds`;
    case 'events/min':
      return `${n} times a minute`;
    case 'fraction':
      return `${fmtNumber(value * 100)}%`;
    case 'bool':
    case 'boolean':
      return value ? 'yes' : 'no';
    case 'screen depths':
      return `${n} screen depths`;
    case '':
    case null:
    case undefined:
      return n;
    default:
      return `${n} ${unit}`;
  }
}

export function scrubFileNames(text) {
  return String(text ?? '')
    .replace(/[A-Za-z]:[\\/][^\s'",|)]*/g, 'a rule in the game')
    .replace(/(?:[\w.\-]+[\\/])+[\w.\-]+\.(?:mjs|js|cjs|json|ts|md|txt)/g, 'a rule in the game')
    .replace(/[\w.\-]+\.(?:mjs|js|cjs|json|ts)/g, 'a rule in the game');
}

export function plainSentence(text) {
  let t = scrubFileNames(text ?? '');
  t = t.replace(/\bWU\/s\b/g, 'ship lengths per second');
  t = t.replace(/\bWU\b/g, 'ship lengths');
  t = t.replace(/\bevents\/min\b/g, 'times a minute');
  t = t.replace(/(\d+(?:\.\d+)?)\s*s\b/g, '$1 seconds');
  return t.replace(/\s+/g, ' ').trim();
}

export function ensurePeriod(text) {
  const s = String(text ?? '').trim();
  if (!s) return s;
  return /[.!?]["”']?$/.test(s) ? s : `${s}.`;
}

export function capitalize(text) {
  const s = String(text ?? '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
