import { canonicalSignature, writeDomainSignature } from './simReadModel.mjs';

// Experimental exact comparator for offline/tool benchmarks. The production
// differ intentionally keeps canonicalSignature until a native route proves a
// whole-game gain. Equal tokens are checked against the previous wire string;
// after the first mismatch, the remainder is collected into the canonical
// result so this helper cannot change transport bytes or introduce hashes.
export function canonicalSignatureAgainst(value, previous, scratch) {
  if (typeof previous !== 'string') return canonicalSignature(value, scratch);
  const ctx = scratch || {};
  const parts = ctx.parts || (ctx.parts = []);
  const seen = ctx.seen || (ctx.seen = new Set());
  const stream = ctx.compareStream || (ctx.compareStream = {
    expected: '',
    offset: 0,
    matching: true,
    parts,
    push(first, second, third, fourth) {
      if (arguments.length >= 1) compareSignatureToken(this, first);
      if (arguments.length >= 2) compareSignatureToken(this, second);
      if (arguments.length >= 3) compareSignatureToken(this, third);
      if (arguments.length >= 4) compareSignatureToken(this, fourth);
    },
  });
  stream.expected = previous;
  stream.offset = 0;
  stream.matching = true;
  stream.parts = parts;
  parts.length = 0;
  seen.clear();
  writeDomainSignature(value, stream, seen);
  if (stream.matching) {
    return stream.offset === previous.length
      ? previous
      : previous.slice(0, stream.offset);
  }
  return parts.join('');
}

function compareSignatureToken(stream, token) {
  if (!stream.matching) {
    stream.parts.push(token);
    return;
  }
  if (stream.expected.startsWith(token, stream.offset)) {
    stream.offset += token.length;
    return;
  }
  stream.matching = false;
  stream.parts.push(stream.expected.slice(0, stream.offset), token);
}
