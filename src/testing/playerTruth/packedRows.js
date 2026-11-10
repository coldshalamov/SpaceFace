// Lossless observer transport. Binary stays out of the saved trace schema: Node
// restores the same logical rows before checks or gzip serialization.
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
function base64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  const parts = [];
  for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(parts.join(''));
}
function bytesOf(text) {
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'base64');
  const textBytes = atob(text), bytes = new Uint8Array(textBytes.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = textBytes.charCodeAt(i);
  return bytes;
}
export function encodePlayerTruthRows(rows) {
  if (!Array.isArray(rows) || !rows.length || !rows.every(row => Array.isArray(row)
    && row.length === 12 && row.every(v => typeof v === 'number' || v == null))) return null;
  const values = new Float64Array(rows.length * 12);
  let missing = null;
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < 12; j++) {
    const value = rows[i][j];
    if (value == null) {
      missing ||= new Uint32Array(rows.length);
      missing[i] |= (value === null ? 1 : 2) << (j * 2);
    } else values[i * 12 + j] = value;
  }
  const bytes = new Uint8Array(values.buffer);
  if (!LITTLE_ENDIAN) {
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < values.length; i++) view.setFloat64(i * 8, values[i], true);
  }
  let flags = null;
  if (missing) {
    const flagBytes = new Uint8Array(missing.buffer);
    if (!LITTLE_ENDIAN) {
      const view = new DataView(flagBytes.buffer);
      for (let i = 0; i < missing.length; i++) view.setUint32(i * 4, missing[i], true);
    }
    flags = base64(flagBytes);
  }
  return { schema: 'sf.observer.rows.f64le.v1', count: rows.length, values: base64(bytes), flags };
}
export function decodePlayerTruthRows(packet) {
  if (packet?.schema !== 'sf.observer.rows.f64le.v1' || !Number.isSafeInteger(packet.count)
    || packet.count < 1 || typeof packet.values !== 'string') throw new Error('Invalid observer row packet');
  const bytes = bytesOf(packet.values);
  if (bytes.byteLength !== packet.count * 96) throw new Error('Truncated observer row packet');
  const values = new Float64Array(packet.count * 12);
  if (LITTLE_ENDIAN) new Uint8Array(values.buffer).set(bytes);
  else {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < values.length; i++) values[i] = view.getFloat64(i * 8, true);
  }
  let missing = null;
  if (packet.flags != null) {
    const flags = bytesOf(packet.flags);
    if (flags.byteLength !== packet.count * 4) throw new Error('Truncated observer row flags');
    missing = new Uint32Array(packet.count);
    const view = new DataView(flags.buffer, flags.byteOffset, flags.byteLength);
    for (let i = 0; i < missing.length; i++) missing[i] = view.getUint32(i * 4, true);
  }
  return { rowCount: packet.count, packed: values, missing };
}
