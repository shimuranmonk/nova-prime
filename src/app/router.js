const DEFAULT_ROUTE = "train";

export function routeFromHash(hash = "") {
  const candidate = hash.replace(/^#/, "").trim().toLowerCase();
  return ["train", "music", "msync", "data", "overview", "capabilities", "roadmap"].includes(candidate)
    ? candidate
    : DEFAULT_ROUTE;
}

export function createRouter({ windowObject = window, onRoute }) {
  const notify = () => onRoute(routeFromHash(windowObject.location.hash));

  return Object.freeze({
    start() {
      windowObject.addEventListener("hashchange", notify);
      notify();
    },
    stop() {
      windowObject.removeEventListener("hashchange", notify);
    },
  });
}

