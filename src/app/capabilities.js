function safely(check) {
  try {
    return Boolean(check());
  } catch {
    return false;
  }
}

export function isLoopbackHostname(hostname = "") {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "::1" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function detectCapabilities(environment = globalThis) {
  const navigatorObject = environment.navigator ?? {};
  const cryptoObject = environment.crypto ?? {};
  const locationObject = environment.location ?? {};
  const loopbackHost = isLoopbackHostname(locationObject.hostname);
  const localHttpServer = locationObject.protocol === "http:" && loopbackHost;
  const hostedHttps = locationObject.protocol === "https:";

  return Object.freeze({
    webBluetooth: safely(() => "bluetooth" in navigatorObject),
    wakeLock: safely(() => "wakeLock" in navigatorObject),
    indexedDb: safely(() => "indexedDB" in environment),
    localStorage: safely(() => {
      const storage = environment.localStorage;
      return storage && typeof storage.getItem === "function";
    }),
    broadcastChannel: safely(() => "BroadcastChannel" in environment),
    webShare: safely(() => typeof navigatorObject.share === "function"),
    secureContext: safely(() => environment.isSecureContext),
    loopbackHost,
    localHttpServer,
    hostedHttps,
    unsafeLanHttp: locationObject.protocol === "http:" && !loopbackHost,
    sha256: safely(() => typeof cryptoObject.subtle?.digest === "function"),
    randomUuid: safely(() => typeof cryptoObject.randomUUID === "function"),
  });
}
