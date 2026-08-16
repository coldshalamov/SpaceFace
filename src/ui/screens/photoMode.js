// Plan 54 Photo Mode — presentation-only controls over the renderer-owned free camera.
//
// ScreenManager owns the simulation freeze. This screen owns only transient UI/key state and calls
// the camera controller's presentation API; it never writes entity pose, velocity, time, or gameplay
// input. The normal HUD stays hidden while the screen is active, and H hides the final control strip.

const PHOTO_ACTION_BY_CODE = Object.freeze({
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  KeyE: 'up',
  KeyQ: 'down',
  ShiftLeft: 'fast',
  ShiftRight: 'fast',
  AltLeft: 'slow',
  AltRight: 'slow',
  ArrowLeft: 'lookLeft',
  ArrowRight: 'lookRight',
  ArrowUp: 'lookUp',
  ArrowDown: 'lookDown',
});

function cameraController(ctx) {
  return ctx && ctx.state && ctx.state.render && ctx.state.render.cameraCtrl || null;
}

function photoActionForEvent(ev) {
  return PHOTO_ACTION_BY_CODE[String(ev && ev.code || '')] || null;
}

export function routePhotoModeKey(controller, ev, active) {
  const action = photoActionForEvent(ev);
  if (!action || !controller || typeof controller.setPhotoModeAction !== 'function') return false;
  return controller.setPhotoModeAction(action, active === true);
}

export const photoModeScreen = {
  id: 'photoMode',
  title: 'Photo Mode',
  data: { autoFocus: false },

  mount(rootEl, ctx) {
    this._root = rootEl;
    this._ctx = ctx;
    rootEl.classList.add('sf-photo-mode-screen');
    rootEl.innerHTML = `
      <div class="sf-photo-mode-ui" aria-live="polite">
        <strong>PHOTO MODE</strong>
        <span>WASD move · Q/E down/up · click + mouse or arrows look · wheel speed · Shift fast · Alt precise</span>
        <span>H hide controls · Esc return</span>
        <span class="sf-photo-mode-speed" data-photo-speed></span>
      </div>`;

    rootEl.addEventListener('pointerdown', () => this._requestPointerLock());
    rootEl.addEventListener('pointermove', (ev) => {
      if (!this._active || !document.pointerLockElement) return;
      const controller = cameraController(this._ctx);
      if (controller && typeof controller.addPhotoModeLook === 'function') {
        controller.addPhotoModeLook(ev.movementX, ev.movementY);
      }
    });
    rootEl.addEventListener('wheel', (ev) => {
      if (!this._active) return;
      ev.preventDefault();
      const controller = cameraController(this._ctx);
      if (controller && typeof controller.adjustPhotoModeSpeed === 'function') {
        controller.adjustPhotoModeSpeed(-Math.sign(ev.deltaY));
        this._refreshSpeed();
      }
    }, { passive: false });

    if (!this._keyupBound) {
      this._keyupBound = (ev) => {
        if (!this._active) return;
        routePhotoModeKey(cameraController(this._ctx), ev, false);
      };
      document.addEventListener('keyup', this._keyupBound);
    }
  },

  onShow(ctx) {
    this._ctx = ctx;
    this._active = true;
    this._uiHidden = false;
    document.body.classList.add('sf-photo-mode');
    document.body.classList.remove('sf-photo-mode-ui-hidden');
    const controller = cameraController(ctx);
    if (controller && typeof controller.enterPhotoMode === 'function') controller.enterPhotoMode();
    this._refreshSpeed();
  },

  onHide() {
    this._active = false;
    document.body.classList.remove('sf-photo-mode', 'sf-photo-mode-ui-hidden');
    const controller = cameraController(this._ctx);
    if (controller && typeof controller.exitPhotoMode === 'function') controller.exitPhotoMode();
    if (document.pointerLockElement && typeof document.exitPointerLock === 'function') {
      try { document.exitPointerLock(); } catch (_) { /* browser may already have released it */ }
    }
  },

  onKey(ev, ctx) {
    const code = String(ev && ev.code || '');
    if (code === 'KeyH' && !ev.repeat) {
      this._uiHidden = !this._uiHidden;
      document.body.classList.toggle('sf-photo-mode-ui-hidden', this._uiHidden);
      return true;
    }
    return routePhotoModeKey(cameraController(ctx), ev, true);
  },

  _requestPointerLock() {
    if (!this._active || !this._root || typeof this._root.requestPointerLock !== 'function') return;
    try { this._root.requestPointerLock(); } catch (_) { /* click remains a retry surface */ }
  },

  _refreshSpeed() {
    if (!this._root) return;
    const controller = cameraController(this._ctx);
    const state = controller && typeof controller.photoModeState === 'function'
      ? controller.photoModeState() : null;
    const speed = this._root.querySelector('[data-photo-speed]');
    if (speed) speed.textContent = state ? `${Math.round(state.moveSpeed)} WU/s` : '';
  },
};
