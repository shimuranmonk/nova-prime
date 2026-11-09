function safely(check) {
  try {
    return Boolean(check());
  } catch {
    return false;
  }
}

export function detectCapabilities(environment = globalThis) {
  const navigatorObject = environment.navigator ?? {};
  const cryptoObject = environment.crypto ?? {};

  return Object.freeze({
    webBluetooth: safely(() => "bluetooth" in navigatorObject),
    wakeLock: safely(() => "wakeLock" in navigatorObject),
    indexedDb: safely(() => "indexedDB" in environment),
    localStorage: safely(() => {
      const storage = environment.localStorage;
      return storage && typeof storage.getItem === "function";
    }),
    broadcastChannel: safely(() => "BroadcastChannel" in environment),
    secureContext: safely(() => environment.isSecureContext),
    sha256: safely(() => typeof cryptoObject.subtle?.digest === "function"),
    randomUuid: safely(() => typeof cryptoObject.randomUUID === "function"),
  });
}
