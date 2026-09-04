// scripts/lib/critic/jsonExtract.mjs — Balanced-brace JSON extraction.
//
// Extracts the first balanced {...} block from model stdout, properly handling
// string literals, escape sequences, and nested structures.

/**
 * Extracts and parses the first balanced JSON object from raw text.
 *
 * @param {string} text Raw model stdout
 * @returns {object} Parsed JSON object
 * @throws {Error} If no valid balanced JSON object can be extracted and parsed
 */
export function extractBalancedJson(text) {
  if (typeof text !== 'string' || !text.includes('{')) {
    throw new Error('No JSON object found in text: missing "{"');
  }

  let searchStart = 0;

  while (searchStart < text.length) {
    const startIndex = text.indexOf('{', searchStart);
    if (startIndex === -1) break;

    let depth = 0;
    let inString = false;
    let isEscaped = false;
    let endIndex = -1;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const candidateStr = text.slice(startIndex, endIndex + 1);
      try {
        return JSON.parse(candidateStr);
      } catch {
        // If this balanced block didn't parse as JSON (e.g. template or stray text),
        // try searching for the next '{'.
      }
    }

    searchStart = startIndex + 1;
  }

  throw new Error('Failed to extract valid balanced JSON object from model output');
}
