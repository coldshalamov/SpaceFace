// Reads (including equality comparisons) do not grant firing authority. Mutations
// of these legacy intent fields belong to the canonical firing-intent owner.
export function hasLegacyFireIntentMutation(source) {
  return /\bintent\s*\.\s*(?:fire|fireGroup)\s*(?:=(?!=)|\+=|-=|\*=|\/=|%=|\*\*=|&&=|\|\|=|\?\?=|&=|\|=|\^=|<<=|>>>=|>>=|\+\+|--)/.test(source)
    || /(?:\+\+|--)\s*(?:[\w$]+\s*\.\s*)*intent\s*\.\s*(?:fire|fireGroup)\b/.test(source);
}
