function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function replaceTextureInfoIndex(sourceInfo, index, defaults = {}) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`texture index must be a non-negative integer, received ${index}`);
  }
  return {
    ...clone(defaults),
    ...(sourceInfo ? clone(sourceInfo) : {}),
    index,
  };
}

export function assertTextureInfoPreserved(actual, sourceInfo, index, defaults, label) {
  const expected = replaceTextureInfoIndex(sourceInfo, index, defaults);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} lost texture sampling metadata`);
  }
  return true;
}
