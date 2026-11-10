// Minimal ESM EventEmitter covering the API @elemaudio/core and @elemaudio/web-renderer use
// (on/once/off/emit + listener aliases, prefixed event keys like the real eventemitter3).
const has = Object.prototype.hasOwnProperty;
const prefix = '~';

function Events() {}

export default class EventEmitter {
  constructor() {
    this._events = new Events();
    this._eventsCount = 0;
  }

  eventNames() {
    const names = [];
    if (this._eventsCount === 0) return names;
    for (const name in this._events) names.push(name);
    return names;
  }

  listeners(event) {
    const handlers = this._events[prefix + event];
    if (!handlers) return [];
    if (handlers.fn) return [handlers.fn];
    const out = new Array(handlers.length);
    for (let i = 0; i < handlers.length; i++) out[i] = handlers[i].fn;
    return out;
  }

  listenerCount(event) {
    const handlers = this._events[prefix + event];
    if (!handlers) return 0;
    return handlers.fn ? 1 : handlers.length;
  }

  emit(event, ...args) {
    const handlers = this._events[prefix + event];
    if (!handlers) return false;
    if (handlers.fn) {
      handlers.fn.apply(handlers.context || this, args);
      if (handlers.once) this.removeListener(event, handlers.fn, undefined, true);
    } else {
      const list = handlers.slice();
      for (const h of list) {
        h.fn.apply(h.context || this, args);
        if (h.once) this.removeListener(event, h.fn, undefined, true);
      }
    }
    return true;
  }

  on(event, fn, context) {
    return this._add(event, fn, context, false);
  }

  once(event, fn, context) {
    return this._add(event, fn, context, true);
  }

  _add(event, fn, context, once) {
    const listener = { fn, context, once };
    const key = prefix + event;
    if (!this._events[key]) {
      this._events[key] = listener;
      this._eventsCount++;
    } else if (!this._events[key].fn) {
      this._events[key].push(listener);
    } else {
      this._events[key] = [this._events[key], listener];
    }
    return this;
  }

  removeListener(event, fn, context, once) {
    const key = prefix + event;
    const handlers = this._events[key];
    if (!handlers) return this;
    if (handlers.fn) {
      if (handlers.fn === fn && (!once || handlers.once) && (!context || handlers.context === context)) {
        delete this._events[key];
        this._eventsCount--;
      }
    } else {
      const list = [];
      for (const h of handlers) {
        if (!(h.fn === fn && (!once || h.once) && (!context || h.context === context))) list.push(h);
      }
      if (list.length) this._events[key] = list.length === 1 ? list[0] : list;
      else { delete this._events[key]; this._eventsCount--; }
    }
    return this;
  }

  off(event, fn, context, once) {
    return this.removeListener(event, fn, context, once);
  }

  removeAllListeners(event) {
    if (event) {
      const key = prefix + event;
      if (this._events[key]) { delete this._events[key]; this._eventsCount--; }
    } else {
      this._events = new Events();
      this._eventsCount = 0;
    }
    return this;
  }

  addListener(event, fn, context) { return this.on(event, fn, context); }
}

EventEmitter.prefixed = prefix;
EventEmitter.EventEmitter = EventEmitter;
