// Live customs gate the picture can draw. Null when this sector has no weir.

export function readCustomsWeir(state) {
  const live = state && state.lawSecurity && state.lawSecurity.customsWeir;
  if (!live || live.active !== true || !Array.isArray(live.segments) || live.segments.length === 0) {
    return null;
  }
  return live;
}
