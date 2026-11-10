const DAY_MS = 24 * 60 * 60 * 1000;
const MODES = Object.freeze(["reps", "time", "music", "msync"]);

function timestamp(value) {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function currentStreak(dayKeys, nowMs) {
  const days = new Set(dayKeys);
  let cursor = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate());
  if (!days.has(dayKey(cursor))) cursor -= DAY_MS;
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

function guidanceFor(summary, modeBreakdown, calibrationProfile, lastSessionAt, nowMs) {
  const guidance = [];
  if (!summary.sessions) {
    guidance.push({
      id: "baseline",
      tone: "start",
      title: "Build a local baseline",
      reason: "No sessions are recorded in this period yet.",
      action: "Complete three short simulation sessions before changing the plan.",
    });
  } else {
    const daysSinceLast = lastSessionAt ? Math.floor((nowMs - lastSessionAt) / DAY_MS) : 0;
    if (daysSinceLast >= 7) guidance.push({
      id: "return",
      tone: "steady",
      title: "Restart gently",
      reason: `The most recent local session was ${daysSinceLast} days ago.`,
      action: "Use a short Level 1 Reps or Time session to rebuild the routine.",
    });
    if (summary.sessions >= 3 && summary.completionRate < 70) guidance.push({
      id: "reduce",
      tone: "steady",
      title: "Make completion easier",
      reason: `The local session completion rate is ${summary.completionRate}%.`,
      action: "Reduce the count or duration by about 20%, then reassess after three sessions.",
    });
    const dominant = modeBreakdown.find((mode) => mode.share > 80 && summary.sessions >= 5);
    if (dominant) guidance.push({
      id: "diversify",
      tone: "explore",
      title: "Add a second training mode",
      reason: `${dominant.label} accounts for ${dominant.share}% of recorded sessions.`,
      action: `Keep the familiar plan and add one ${dominant.id === "reps" ? "Time" : "Reps"} session this week.`,
    });
    if (summary.sessions >= 8 && summary.completionRate >= 90 && !guidance.some((item) => item.id === "return")) guidance.push({
      id: "progress",
      tone: "progress",
      title: "Progress one variable",
      reason: `${summary.completionRate}% of ${summary.sessions} local sessions were completed.`,
      action: "Increase either the target or duration by 10%—not both—and keep the same level for three sessions.",
    });
  }

  if (!calibrationProfile || calibrationProfile.status !== "complete") guidance.push({
    id: "calibrate",
    tone: "check",
    title: "Complete calibration",
    reason: "No completed calibration profile is active.",
    action: "Run guided calibration before relying on visual placement previews.",
  });
  else if (!calibrationProfile.quickCheck) guidance.push({
    id: "quick-check",
    tone: "check",
    title: "Run a Quick Check",
    reason: "The active calibration has no recent Quick Check result.",
    action: "Confirm the setup before a longer training block.",
  });

  if (!guidance.length) guidance.push({
    id: "steady",
    tone: "steady",
    title: "Keep the plan steady",
    reason: "The current local activity pattern does not trigger a corrective rule.",
    action: "Repeat the current plan and review again after three more sessions.",
  });

  return guidance.slice(0, 3);
}

export function buildStatistics(records = [], { now = new Date().toISOString(), days = 30, calibrationProfile = null } = {}) {
  const nowMs = timestamp(now) ?? Date.now();
  const periodDays = days === "all" ? null : Math.max(1, Math.floor(Number(days) || 30));
  const cutoff = periodDays == null ? -Infinity : nowMs - (periodDays * DAY_MS);
  const selected = records
    .map((record) => ({ record, startedAt: timestamp(record?.startedAt) }))
    .filter(({ startedAt }) => startedAt != null && startedAt <= nowMs && startedAt >= cutoff)
    .sort((a, b) => a.startedAt - b.startedAt);

  const completed = selected.filter(({ record }) => record.outcome === "completed").length;
  const dayKeys = selected.map(({ startedAt }) => dayKey(startedAt));
  const summary = Object.freeze({
    sessions: selected.length,
    durationSeconds: selected.reduce((total, { record }) => total + safeNumber(record.durationSeconds), 0),
    completedCycles: selected.reduce((total, { record }) => total + safeNumber(record.completedCycles), 0),
    completionRate: percent(completed, selected.length),
    activeDays: new Set(dayKeys).size,
    currentStreak: currentStreak(dayKeys, nowMs),
  });

  const modeBreakdown = MODES.map((id) => {
    const matching = selected.filter(({ record }) => record.mode === id);
    return Object.freeze({
      id,
      label: id === "msync" ? "MSYNC" : `${id[0].toUpperCase()}${id.slice(1)}`,
      sessions: matching.length,
      share: percent(matching.length, selected.length),
      durationSeconds: matching.reduce((total, { record }) => total + safeNumber(record.durationSeconds), 0),
      completedCycles: matching.reduce((total, { record }) => total + safeNumber(record.completedCycles), 0),
    });
  });

  const dailyMap = new Map();
  selected.forEach(({ record, startedAt }) => {
    const key = dayKey(startedAt);
    const current = dailyMap.get(key) ?? { date: key, sessions: 0, durationSeconds: 0, completedCycles: 0 };
    current.sessions += 1;
    current.durationSeconds += safeNumber(record.durationSeconds);
    current.completedCycles += safeNumber(record.completedCycles);
    dailyMap.set(key, current);
  });
  const daily = [...dailyMap.values()].slice(-14).map(Object.freeze);

  const drillMap = new Map();
  selected.forEach(({ record }) => {
    if (!record.drillId) return;
    const current = drillMap.get(record.drillId) ?? { drillId: record.drillId, sessions: 0, completedCycles: 0 };
    current.sessions += 1;
    current.completedCycles += safeNumber(record.completedCycles);
    drillMap.set(record.drillId, current);
  });
  const drills = [...drillMap.values()]
    .sort((a, b) => b.sessions - a.sessions || b.completedCycles - a.completedCycles || a.drillId.localeCompare(b.drillId))
    .slice(0, 5)
    .map(Object.freeze);

  const lastSessionAt = selected.at(-1)?.startedAt ?? null;
  return Object.freeze({
    periodDays,
    summary,
    daily: Object.freeze(daily),
    modes: Object.freeze(modeBreakdown),
    drills: Object.freeze(drills),
    guidance: Object.freeze(guidanceFor(summary, modeBreakdown, calibrationProfile, lastSessionAt, nowMs).map(Object.freeze)),
    lastSessionAt: lastSessionAt == null ? null : new Date(lastSessionAt).toISOString(),
  });
}
