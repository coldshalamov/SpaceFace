// Minimal ESM invariant() matching the `invariant` npm contract used by @elemaudio/core:
// invariant(condition, format, ...args) throws Error(format with %s substitution) when falsy.
export default function invariant(condition, format, ...args) {
  if (condition) return;
  let index = 0;
  const message = args.length
    ? String(format).replace(/%s/g, () => String(args[index++]))
    : String(format);
  const error = new Error(message);
  error.framesToPop = 1;
  error.name = 'Invariant Violation';
  throw error;
}
