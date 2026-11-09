export const FEATURE_FLAGS = Object.freeze({
  robot: false,
  music: false,
  msync: false,
  sharing: false,
  voice: false,
});

export function enabledFeatures(flags = FEATURE_FLAGS) {
  return Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}
