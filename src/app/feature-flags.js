export const FEATURE_FLAGS = Object.freeze({
  robot: false,
  music: true,
  msync: true,
  sharing: true,
  voice: false,
});

export function enabledFeatures(flags = FEATURE_FLAGS) {
  return Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}
