function payloadText(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.svg === 'string') return payload.svg;
  if (typeof payload.markup === 'string') return payload.markup;
  if (typeof payload.bytes === 'string') return payload.bytes;
  if (typeof payload.pixels === 'string') return payload.pixels;
  if (typeof payload.image === 'string') return payload.image;
  return '';
}

function asByteView(bytes) {
  if (bytes == null || typeof bytes === 'string') return null;
  if (ArrayBuffer.isView(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (Array.isArray(bytes) && bytes.every((n) => typeof n === 'number')) return Uint8Array.from(bytes);
  return null;
}

function payloadBinary(payload) {
  if (payload == null || typeof payload === 'string') return null;
  if (typeof payload !== 'object') return null;
  const direct = asByteView(payload);
  if (direct) return direct;
  return asByteView(payload.bytes ?? payload.pixels ?? payload.image ?? null);
}

function bytePrefixText(bytes) {
  const view = asByteView(bytes);
  if (!view || view.length === 0) return '';
  let start = 0;
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) start = 3;
  const end = Math.min(view.length, start + 512);
  let text = '';
  for (let i = start; i < end; i += 1) text += String.fromCharCode(view[i] & 0xff);
  return text;
}

function textLooksLikeSvg(text) {
  if (!text) return false;
  const trimmed = String(text).replace(/^\uFEFF/, '').trim().toLowerCase();
  return trimmed.startsWith('<svg') || trimmed.startsWith('<?xml') || trimmed.includes('<svg');
}

/**
 * An SVG document is a string, a format tag, or bytes that carry an svg or xml marker.
 * A PNG byte buffer does not.
 */
export function isSvgPayload(payload) {
  if (payload == null) return false;
  if (typeof payload === 'string') return textLooksLikeSvg(payload);
  if (typeof payload !== 'object') return false;
  if (payload.format === 'svg' || payload.source === 'semantic-svg') return true;
  if (textLooksLikeSvg(payloadText(payload))) return true;
  return textLooksLikeSvg(bytePrefixText(payloadBinary(payload)));
}
