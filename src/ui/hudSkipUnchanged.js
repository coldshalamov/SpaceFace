// Skip HUD/DOM work when the readable value has not changed.

export function hudSignatureUnchanged(state, id, signature) {
  if (!state || typeof state !== 'object') return false;
  const bag = state._hudSignatures || (state._hudSignatures = {});
  if (bag[id] === signature) return true;
  bag[id] = signature;
  return false;
}
