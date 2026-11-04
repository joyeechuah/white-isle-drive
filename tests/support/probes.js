// Page-side counters for leak checks, installed before the game's code runs (page.addInitScript):
//   __probe.listeners()  event listeners currently attached anywhere in the page
//   __probe.timers()     timeouts and intervals currently pending
// They wrap the browser's own functions and change nothing about how they behave.
function installProbes() {
  const live = new WeakMap();
  let listeners = 0;
  const key = (type, fn, opt) => type + "|" + (typeof opt === "boolean" ? opt : !!(opt && opt.capture));
  const add = EventTarget.prototype.addEventListener,
    rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opt) {
    if (fn) {
      let m = live.get(this);
      if (!m) live.set(this, (m = new Map()));
      const k = key(type, fn, opt);
      let s = m.get(k);
      if (!s) m.set(k, (s = new Set()));
      if (!s.has(fn)) {
        s.add(fn);
        listeners++;
      }
    }
    return add.call(this, type, fn, opt);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opt) {
    const m = live.get(this),
      s = m && m.get(key(type, fn, opt));
    if (s && s.delete(fn)) listeners--;
    return rem.call(this, type, fn, opt);
  };
  const pending = new Set();
  const st = window.setTimeout,
    ct = window.clearTimeout,
    si = window.setInterval,
    ci = window.clearInterval;
  window.setTimeout = function (fn, ms, ...a) {
    const id = st.call(
      window,
      function () {
        pending.delete(id);
        return typeof fn === "function" ? fn.apply(this, arguments) : undefined;
      },
      ms,
      ...a
    );
    pending.add(id);
    return id;
  };
  window.clearTimeout = function (id) {
    pending.delete(id);
    return ct.call(window, id);
  };
  window.setInterval = function (fn, ms, ...a) {
    const id = si.call(window, fn, ms, ...a);
    pending.add(id);
    return id;
  };
  window.clearInterval = function (id) {
    pending.delete(id);
    return ci.call(window, id);
  };
  window.__probe = { listeners: () => listeners, timers: () => pending.size };
}

module.exports = { installProbes };
