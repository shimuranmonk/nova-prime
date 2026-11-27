const excludedKeys = /^(Shift|Control|Alt|AltGraph|Meta|CapsLock|Fn|Tab|Escape|Unidentified|Process|Dead|n|a|o)$/i;
const remoteSubmissions = new WeakMap();

function usableKey(event) {
  return event.key && !excludedKeys.test(event.key) && !event.isComposing
    && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

export function learnRemoteKey(event) {
  if (event.repeat || !usableKey(event)) return null;
  return { key: event.key, code: event.code === "Unidentified" ? "" : event.code || "" };
}

export function matchesRemoteKey(event, binding) {
  if (!binding || !usableKey(event)) return false;
  if (binding.code && event.code && event.code !== "Unidentified") return binding.code === event.code;
  return event.key === binding.key;
}

export function submitRemoteStart(form, immediate) {
  remoteSubmissions.set(form, immediate);
  try { form.requestSubmit(); }
  finally { remoteSubmissions.delete(form); }
}

export function remoteStartMode(form) {
  if (!remoteSubmissions.has(form)) return null;
  return remoteSubmissions.get(form) ? "immediate" : "countdown";
}

export function createRemotePressHandler({ snapshot, allowed, start, command, schedule = setTimeout, cancel = clearTimeout }) {
  let pending = null;
  const clear = () => {
    if (pending) cancel(pending.timer);
    pending = null;
  };
  const inSession = (state) => ["COUNTDOWN", "RUNNING", "PAUSED"].includes(state);
  const sameRun = (left, right) => left.spec === right.spec;

  return {
    clear,
    press() {
      if (!allowed()) { clear(); return; }
      const current = snapshot();
      if (!inSession(current.state)) {
        clear();
        if (current.state === "IDLE") start();
        return;
      }
      if (pending && sameRun(current, pending.run)) {
        clear();
        command("stop");
        return;
      }
      clear();
      pending = { run: current, timer: schedule(() => {
        pending = null;
        const latest = snapshot();
        if (!allowed() || !sameRun(current, latest) || latest.state !== current.state) return;
        if (latest.state === "RUNNING") command("pause");
        if (latest.state === "PAUSED") command("resume");
      }, 450) };
    },
  };
}
