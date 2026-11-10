import { EventEmitter } from 'node:events';

const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;

const KEY_DEFINITIONS = Object.freeze({
  Space: Object.freeze({ key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' }),
  Shift: Object.freeze({ key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 }),
  F13: Object.freeze({ key: 'F13', code: 'F13', windowsVirtualKeyCode: 124 }),
  KeyW: Object.freeze({ key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, text: 'w' }),
});

export const RAW_CDP_LIFECYCLE_INITIALIZATION_COMMANDS = Object.freeze([
  'Runtime.enable',
  'Page.enable',
  'Log.enable',
  'Network.enable',
]);

export function buildOwnedChromeLifecycleArgs({
  userDataDir,
  rootUrl = 'about:blank',
  viewport = { width: 1440, height: 900 },
} = {}) {
  if (!userDataDir) throw new Error('owned Chrome lifecycle profile is required');
  return [
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--window-size=${Number(viewport.width)},${Number(viewport.height)}`,
    '--force-device-scale-factor=1',
    '--new-window',
    rootUrl,
  ];
}

export function buildPageFunctionExpression(pageFunction, arg) {
  if (typeof pageFunction !== 'function') throw new TypeError('raw CDP evaluation requires a function');
  const serializedArg = arg === undefined ? 'undefined' : JSON.stringify(arg);
  return `(${pageFunction.toString()})(${serializedArg})`;
}

export function normalizeRawNavigationUrl(url) {
  return new URL(String(url)).href;
}

export class RawCdpSession extends EventEmitter {
  static async connect(webSocketUrl, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('raw CDP WebSocket connection timed out')), timeoutMs);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener('error', (event) => {
        clearTimeout(timer);
        reject(new Error(`raw CDP WebSocket connection failed: ${event?.message || 'unknown error'}`));
      }, { once: true });
    });
    return new RawCdpSession(socket, { timeoutMs });
  }

  constructor(socket, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
    super();
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.nextId = 0;
    this.pending = new Map();
    this.closed = false;
    socket.addEventListener('message', (event) => this.#handleMessage(event));
    socket.addEventListener('close', () => this.#handleClose());
    socket.addEventListener('error', (event) => this.emit('protocolerror', event));
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error(`raw CDP session closed before ${method}`));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`raw CDP command ${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  notify(method, params = {}) {
    if (this.closed) return false;
    this.socket.send(JSON.stringify({ id: ++this.nextId, method, params }));
    return true;
  }

  async close() {
    if (this.closed) return true;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1_000);
      this.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.close();
    });
    return this.closed;
  }

  #handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
      return;
    }
    if (message.method) this.emit('event', message.method, message.params || {});
  }

  #handleClose() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`raw CDP session closed during ${pending.method}`));
    }
    this.pending.clear();
    this.emit('close');
  }
}

export class RawCdpLifecyclePage extends EventEmitter {
  constructor(session, { initialUrl = 'about:blank', activateWindow = null } = {}) {
    super();
    this.session = session;
    this.currentUrl = String(initialUrl || 'about:blank');
    this.closed = false;
    this.requests = new Map();
    this.activateWindow = typeof activateWindow === 'function' ? activateWindow : null;
    this.mainFrameHandle = { url: () => this.currentUrl };
    this.keyboard = {
      press: async (key) => {
        await this.#dispatchKey(key, 'rawKeyDown');
        await this.#dispatchKey(key, 'keyUp');
      },
      down: async (key) => this.#dispatchKey(key, 'rawKeyDown'),
      up: async (key) => this.#dispatchKey(key, 'keyUp'),
    };
    session.on('event', (method, params) => this.#handleProtocolEvent(method, params));
    session.on('close', () => {
      this.closed = true;
      this.emit('close');
    });
  }

  async initialize() {
    for (const method of RAW_CDP_LIFECYCLE_INITIALIZATION_COMMANDS) await this.session.send(method);
    const frameTree = await this.session.send('Page.getFrameTree');
    const liveUrl = frameTree?.frameTree?.frame?.url;
    if (liveUrl) this.currentUrl = liveUrl;
    return this;
  }

  async goto(url, { timeout = 60_000 } = {}) {
    const expectedUrl = normalizeRawNavigationUrl(url);
    const navigation = await this.session.send('Page.navigate', { url: expectedUrl });
    if (navigation.errorText) throw new Error(`raw CDP navigation failed: ${navigation.errorText}`);
    await this.waitForFunction((expected) => (
      location.href === expected && ['interactive', 'complete'].includes(document.readyState)
    ), expectedUrl, { timeout });
    return null;
  }

  async evaluate(pageFunction, arg) {
    const result = await this.session.send('Runtime.evaluate', {
      expression: buildPageFunctionExpression(pageFunction, arg),
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) throw protocolException(result.exceptionDetails);
    return remoteObjectValue(result.result);
  }

  async waitForFunction(pageFunction, arg, { timeout = 30_000 } = {}) {
    const deadline = Date.now() + timeout;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const value = await this.evaluate(pageFunction, arg);
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await delay(50);
    }
    throw new Error(`raw CDP waitForFunction timed out: ${lastError?.message || 'predicate remained false'}`);
  }

  locator(selector) {
    return {
      isVisible: async () => this.evaluate((requestedSelector) => {
        const element = document.querySelector(requestedSelector);
        if (!element || element.hidden) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
      }, selector),
      waitFor: async ({ state = 'visible', timeout = 30_000 } = {}) => this.waitForFunction(
        ({ requestedSelector, requestedState }) => {
          const element = document.querySelector(requestedSelector);
          const visible = (() => {
            if (!element || element.hidden) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
              && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
          })();
          return requestedState === 'hidden' ? !visible : visible;
        },
        { requestedSelector: selector, requestedState: state },
        { timeout },
      ),
      fill: async (value) => this.evaluate(({ requestedSelector, requestedValue }) => {
        const element = document.querySelector(requestedSelector);
        if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
          throw new Error(`fillable control ${requestedSelector} is missing`);
        }
        element.focus();
        const prototype = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (!setter) throw new Error(`fillable control ${requestedSelector} has no value setter`);
        setter.call(element, String(requestedValue));
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, { requestedSelector: selector, requestedValue: value }),
      focus: async () => this.evaluate((requestedSelector) => {
        const element = document.querySelector(requestedSelector);
        if (!(element instanceof HTMLElement)) throw new Error(`focus target ${requestedSelector} is missing`);
        element.focus();
        return document.activeElement === element;
      }, selector),
      click: async ({ timeout = 30_000 } = {}) => {
        const deadline = Date.now() + timeout;
        let target = null;
        while (Date.now() < deadline && !target) {
          target = await this.evaluate((requestedSelector) => {
            const element = document.querySelector(requestedSelector);
            if (!element || element.hidden) return null;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const visible = style.display !== 'none' && style.visibility !== 'hidden'
              && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
            return visible ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
          }, selector);
          if (!target) await delay(50);
        }
        if (!target) throw new Error(`raw CDP click target ${selector} was not reachable`);
        await this.session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: target.x, y: target.y, button: 'none', buttons: 0,
        });
        await this.session.send('Input.dispatchMouseEvent', {
          type: 'mousePressed', x: target.x, y: target.y, button: 'left', buttons: 1, clickCount: 1,
        });
        await this.session.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: target.x, y: target.y, button: 'left', buttons: 0, clickCount: 1,
        });
      },
    };
  }

  getByRole(role, { name, exact = false } = {}) {
    if (role !== 'button') throw new Error(`raw CDP role ${role} is unsupported`);
    return {
      click: async ({ timeout = 30_000 } = {}) => {
        const deadline = Date.now() + timeout;
        let target = null;
        while (Date.now() < deadline && !target) {
          target = await this.evaluate(({ requestedName, exactName }) => {
            const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            for (const element of document.querySelectorAll('button,[role="button"]')) {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              const visible = !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
              if (!visible || element.disabled || element.getAttribute('aria-disabled') === 'true') continue;
              const accessibleName = clean(element.getAttribute('aria-label') || element.textContent);
              const matches = exactName ? accessibleName === requestedName : accessibleName.includes(requestedName);
              if (matches) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
            return null;
          }, { requestedName: String(name), exactName: exact });
          if (!target) await delay(50);
        }
        if (!target) throw new Error(`raw CDP button ${name} was not reachable`);
        await this.session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: target.x, y: target.y, button: 'none', buttons: 0,
        });
        await this.session.send('Input.dispatchMouseEvent', {
          type: 'mousePressed', x: target.x, y: target.y, button: 'left', buttons: 1, clickCount: 1,
        });
        await this.session.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: target.x, y: target.y, button: 'left', buttons: 0, clickCount: 1,
        });
      },
    };
  }

  async bringToFront() {
    await this.activateWindow?.();
    await this.session.send('Page.bringToFront');
  }

  url() {
    return this.currentUrl;
  }

  isClosed() {
    return this.closed || this.session.closed;
  }

  mainFrame() {
    return this.mainFrameHandle;
  }

  #handleProtocolEvent(method, params) {
    if (method === 'Page.frameNavigated' && !params.frame?.parentId) {
      this.currentUrl = String(params.frame.url || this.currentUrl);
      this.emit('framenavigated', this.mainFrameHandle);
      return;
    }
    if (method === 'Runtime.exceptionThrown') {
      this.emit('pageerror', protocolException(params.exceptionDetails || {}));
      return;
    }
    if (method === 'Runtime.consoleAPICalled') {
      const type = params.type === 'warning' ? 'warning' : params.type;
      const text = (params.args || []).map(remoteObjectText).join(' ');
      this.emit('console', { type: () => type, text: () => text });
      return;
    }
    if (method === 'Log.entryAdded') {
      const type = params.entry?.level === 'warning' ? 'warning' : params.entry?.level;
      this.emit('console', { type: () => type, text: () => String(params.entry?.text || '') });
      return;
    }
    if (method === 'Network.requestWillBeSent') {
      const request = rawRequest(params.requestId, params.request?.url);
      this.requests.set(params.requestId, request);
      this.emit('request', request);
      return;
    }
    if (method === 'Network.responseReceived') {
      this.emit('response', {
        status: () => Number(params.response?.status || 0),
        url: () => String(params.response?.url || ''),
      });
      return;
    }
    if (method === 'Network.loadingFinished') {
      const request = this.requests.get(params.requestId) || rawRequest(params.requestId, '');
      this.requests.delete(params.requestId);
      this.emit('requestfinished', request);
      return;
    }
    if (method === 'Network.loadingFailed') {
      const request = this.requests.get(params.requestId) || rawRequest(params.requestId, '');
      request._failure = { errorText: String(params.errorText || 'network failure') };
      this.requests.delete(params.requestId);
      this.emit('requestfailed', request);
    }
  }

  async #dispatchKey(keyName, type) {
    const definition = KEY_DEFINITIONS[keyName];
    if (!definition) throw new Error(`raw CDP key ${keyName} is unsupported`);
    const text = type === 'keyUp' ? undefined : definition.text;
    await this.session.send('Input.dispatchKeyEvent', {
      type: type === 'rawKeyDown' && text ? 'keyDown' : type,
      key: definition.key,
      code: definition.code,
      windowsVirtualKeyCode: definition.windowsVirtualKeyCode,
      nativeVirtualKeyCode: definition.windowsVirtualKeyCode,
      modifiers: type === 'keyUp' ? 0 : (definition.modifiers || 0),
      ...(text ? { text, unmodifiedText: text } : {}),
      autoRepeat: false,
      location: 0,
    });
  }
}

function rawRequest(requestId, url) {
  return {
    requestId,
    _url: String(url || ''),
    _failure: null,
    url() { return this._url; },
    failure() { return this._failure; },
  };
}

function remoteObjectValue(remoteObject = {}) {
  if ('value' in remoteObject) return remoteObject.value;
  if (remoteObject.unserializableValue === 'NaN') return Number.NaN;
  if (remoteObject.unserializableValue === 'Infinity') return Number.POSITIVE_INFINITY;
  if (remoteObject.unserializableValue === '-Infinity') return Number.NEGATIVE_INFINITY;
  if (remoteObject.type === 'undefined') return undefined;
  return null;
}

function remoteObjectText(remoteObject = {}) {
  if ('value' in remoteObject) return String(remoteObject.value);
  return String(remoteObject.description || remoteObject.unserializableValue || '');
}

function protocolException(details) {
  const message = details?.exception?.description || details?.exception?.value || details?.text || 'raw CDP evaluation failed';
  const error = new Error(String(message));
  error.code = 'RAW_CDP_EVALUATION_FAILED';
  return error;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
