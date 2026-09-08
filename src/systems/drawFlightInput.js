// Relative trackpad ink. Convert motion with the camera's LOCAL screen-to-world basis, not
// absolute cursor coordinates: camera pan must never draw a segment on the pilot's behalf.
export const DRAW_GESTURE_IDLE_MS = 180;
export const DRAW_GESTURE_MIN_PX = 3;
export const DRAW_GESTURE_MAX_POINTS = 256;
export const DRAW_GESTURE_MAX_BACKLOG_S = 0.7;

export function emptyDrawFlightPath() {
  return { active: false, drawing: false, cursorX: 0, cursorY: 0, pointIndex: 1, points: [] };
}
export function emptyDrawFlightGesture() {
  return { cursorX: 0, cursorY: 0, lastSampleX: 0, lastSampleY: 0,
    lastMs: -Infinity, lastSimMs: -Infinity, pendingX: 0, pendingY: 0,
    pendingWorldX: 0, pendingWorldZ: 0 };
}
const valid = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.z);

/** Record one non-duplicated DOM mouse delta, using the caller's simulation clock. */
export function recordDrawFlightGesture(host, dx, dy, now, width, height) {
  const state = host.state, inp = state?.input;
  if (!inp?.autoFire || inp.blocked || inp.drawFlightManual
    || !Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return false;
  const player = state.entities?.get(state.playerId);
  if (!valid(player?.pos) || !(width > 0) || !(height > 0)) return false;
  // A corrupt device packet is ignored, not clamped into an arbitrary full-screen dodge.
  if (Math.hypot(dx, dy) > Math.max(width, height) * 4) return false;
  const raycast = host.helpers?.raycastToPlane;
  if (typeof raycast !== 'function') return false;
  const screen = host.helpers?.worldToScreen?.({ ...player.pos, y: 0 });
  const sx = Number.isFinite(screen?.x) ? screen.x : width * 0.5;
  const sy = Number.isFinite(screen?.y) ? screen.y : height * 0.5;
  const at = (x, y) => raycast({ x: x / width * 2 - 1, y: 1 - y / height * 2 });
  const center = at(sx, sy), right = at(sx + 1, sy), down = at(sx, sy + 1);
  if (!valid(center) || !valid(right) || !valid(down)) return false;
  const wx = (right.x - center.x) * dx + (down.x - center.x) * dy;
  const wz = (right.z - center.z) * dx + (down.z - center.z) * dy;
  if (!Number.isFinite(wx) || !Number.isFinite(wz) || Math.hypot(wx, wz) > 100000) return false;

  const g = host._autoTargetGesture || (host._autoTargetGesture = emptyDrawFlightGesture());
  const idle = now - g.lastSimMs > DRAW_GESTURE_IDLE_MS;
  if (idle) { g.pendingX = g.pendingY = g.pendingWorldX = g.pendingWorldZ = 0; }
  g.pendingX = (g.pendingX || 0) + dx;
  g.pendingY = (g.pendingY || 0) + dy;
  g.pendingWorldX = (g.pendingWorldX || 0) + wx;
  g.pendingWorldZ = (g.pendingWorldZ || 0) + wz;
  // Preserve the clutch edge while sub-pixel packets accumulate into a meaningful stroke.
  if (idle) g.reanchor = true;
  g.lastMs = g.lastSimMs = now;
  if (Math.hypot(g.pendingX, g.pendingY) < DRAW_GESTURE_MIN_PX) return false;

  let route = inp.autoTargetPath;
  const reanchor = !route?.active || !Array.isArray(route.points) || g.reanchor || inp.drawFlight?.exhausted
    || inp.drawFlight?.backlogS > DRAW_GESTURE_MAX_BACKLOG_S
    || route.points.length >= DRAW_GESTURE_MAX_POINTS;
  if (reanchor) {
    route = inp.autoTargetPath = emptyDrawFlightPath();
    route.active = true;
    route.points.push({ x: player.pos.x, z: player.pos.z });
    g.cursorX = sx;
    g.cursorY = sy;
    g.reanchor = false;
  }
  const tail = route.points.at(-1);
  const point = { x: tail.x + g.pendingWorldX, z: tail.z + g.pendingWorldZ };
  if (!valid(point) || Math.hypot(point.x - tail.x, point.z - tail.z) < 1e-5) return false;
  route.points.push(point);
  route.drawing = true;
  g.cursorX += g.pendingX;
  g.cursorY += g.pendingY;
  // These are presentation coordinates only. They can pass the viewport boundary; no edge
  // clamp may eat steering input, even during an uninterrupted pointer-locked trackpad stroke.
  const pen = host.helpers?.worldToScreen?.({ ...point, y: 0 });
  route.cursorX = Number.isFinite(pen?.x) ? pen.x : g.cursorX;
  route.cursorY = Number.isFinite(pen?.y) ? pen.y : g.cursorY;
  g.lastSampleX = g.cursorX;
  g.lastSampleY = g.cursorY;
  g.pendingX = g.pendingY = g.pendingWorldX = g.pendingWorldZ = 0;
  return true;
}
