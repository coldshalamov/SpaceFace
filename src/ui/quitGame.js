// Quit the game — works in Electron (closes the app) and browser (closes tab/window).
// Called from Main Menu and Pause menu.

function hasDesktopQuit() {
  try {
    if (typeof window !== 'undefined') {
      if (window.spacefaceShell && typeof window.spacefaceShell.quit === 'function') return true;
      if (window.spacefaceLifecycle && typeof window.spacefaceLifecycle.quit === 'function') return true;
      if (window.spacefaceQuit && typeof window.spacefaceQuit === 'function') return true;
    }
  } catch (e) {}
  return false;
}

function tryDesktopQuit() {
  try {
    if (typeof window !== 'undefined') {
      if (window.spacefaceShell && typeof window.spacefaceShell.quit === 'function') {
        window.spacefaceShell.quit();
        return true;
      }
      if (window.spacefaceLifecycle && typeof window.spacefaceLifecycle.quit === 'function') {
        window.spacefaceLifecycle.quit();
        return true;
      }
      if (window.spacefaceQuit && typeof window.spacefaceQuit === 'function') {
        window.spacefaceQuit();
        return true;
      }
    }
  } catch (e) {}
  return false;
}

export function canQuit() {
  // Quit is always offered — in browser window.close may be blocked, but
  // we still show the button and explain how to close the tab.
  return true;
}

export function isDesktopQuitAvailable() {
  return hasDesktopQuit();
}

export function requestQuit(ctx) {
  // 1) Electron — ask the shell to quit
  if (tryDesktopQuit()) return { handled: true, kind: 'desktop' };

  // 2) Browser — try window.close() (works when the tab was opened by script,
  // or as a user gesture in some browsers). If blocked, inform the player.
  try {
    if (typeof window !== 'undefined' && typeof window.close === 'function') {
      window.close();
      // window.close may be silently ignored; check after a short delay.
      setTimeout(() => {
        try {
          if (typeof window !== 'undefined' && !window.closed) {
            if (ctx && ctx.bus && ctx.bus.emit) {
              ctx.bus.emit('toast', {
                text: 'Browser blocked closing the tab — please close this tab manually to quit.',
                kind: 'info',
                ttl: 4000,
              });
            }
          }
        } catch (e) {}
      }, 350);
      return { handled: true, kind: 'browser-close' };
    }
  } catch (e) {}

  if (ctx && ctx.bus && ctx.bus.emit) {
    ctx.bus.emit('toast', { text: 'Close this tab/window to quit.', kind: 'info', ttl: 3000 });
  }
  return { handled: false, kind: 'fallback' };
}
