// Choice B presentation contract. The story system already owns and saves these flags; this module
// only gives existing UI readers one exact interpretation so the map and reputation surfaces cannot
// drift apart. It never mutates identity, reputation, hostility, access, or routing state.

function endingFlags(state) {
  const flags = state && state.story && state.story.flags;
  return flags && typeof flags === 'object' ? flags : {};
}

export function hasErasedPublicIdentity(state) {
  const flags = endingFlags(state);
  return flags.identityErased === true || flags.identity_erased === true;
}

export function shouldHideOwnRepDelta(state) {
  const flags = endingFlags(state);
  return hasErasedPublicIdentity(state) || flags.hide_own_rep_delta === true;
}

export function publicOperatorLabel(state) {
  return hasErasedPublicIdentity(state) ? 'OPERATOR: UNKNOWN' : 'YOU';
}
