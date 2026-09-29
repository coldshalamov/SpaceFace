// ESM port of the `shallowequal` package (ISC) — needed because @elemaudio/core imports the
// CJS build as a bare specifier, which the dev-server import map must resolve to ESM.
export default function shallowEqual(objA, objB, compare, compareContext) {
  const ret = compare ? compare.call(compareContext, objA, objB) : void 0;
  if (ret !== void 0) return !!ret;
  if (objA === objB) return true;
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) return false;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  const bHasOwnProperty = Object.prototype.hasOwnProperty.bind(objB);
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!bHasOwnProperty(key)) return false;
    const valueA = objA[key];
    const valueB = objB[key];
    const r = compare ? compare.call(compareContext, valueA, valueB, key) : void 0;
    if (r === false || (r === void 0 && valueA !== valueB)) return false;
  }
  return true;
}
