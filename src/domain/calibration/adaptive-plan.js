// Adapted from nova_fan's Nova Trainer 0.1.0-beta.9 calibration planner.
import { spinLimitForSpeed as maxSpin } from "../drills/schema.js";
import { PRIOR, fullParams, simulate, fitParams, fitBest, objective } from "./trainer-physics.js";

const KINDS = [
  {
    id: "top",
    name: "Topspin",
    base: { speed: 3, spin: 5, type: "top" },
    net: { speed: 4.5, spin: 3, type: "top" },
    long: { speed: 2.5, spin: 6, type: "top" },
    loop: { speed: 3.5, spin: 8, type: "top" }
  },
  {
    id: "none",
    name: "No spin",
    base: { speed: 3.5, spin: 0, type: "top" },
    net: { speed: 2.5, spin: 0, type: "top" },
    long: { speed: 4.5, spin: 0, type: "top" },
    loop: { speed: 3, spin: 0, type: "top" }
  },
  {
    id: "back",
    name: "Backspin",
    base: { speed: 1.8, spin: 5.5, type: "back" },
    net: { speed: 3, spin: 4, type: "back" },
    long: { speed: 2.5, spin: 7, type: "back" },
    loop: { speed: 1.5, spin: 3, type: "back" }
  }
];
const MIDDLE = { x: 0, y: 68 };
const LIMIT_GAP = 3;
const LIMIT_MAX = 5;
const MIDDLE_OK = 12;
const MIDDLE_MAX = 3;
const H_MIN = 0;
const H_MAX = 100;
const COVER_STOP = 1.1;
const DT = 3e-3;
const fixSpin = (b) => ({ ...b, spin: Math.min(b.spin, maxSpin(b.speed)) });
const sim = (b, p, setup2) => simulate(b, p, setup2, DT);
function predictNetLimit(base, p, setup2, drop = 0) {
  for (let h = H_MIN; h <= H_MAX; h++) if (!sim({ ...base, height: h, drop }, p, setup2).net) return h;
  return null;
}
function predictLongLimit(base, p, setup2, drop = 0) {
  const n = predictNetLimit(base, p, setup2, drop);
  if (n === null) return { limit: null, net: null };
  let landed = null;
  for (let h = n; h <= H_MAX; h++) {
    const r = sim({ ...base, height: h, drop }, p, setup2);
    if (r.ok) landed = h;
    else if (r.out === "long") return { limit: landed === null ? h - 1 : landed, net: n };
  }
  return { limit: null, net: n };
}
function aim(base, target, p, setup2, hRange = [H_MIN, H_MAX]) {
  let best = null, drop = 0;
  for (let round = 0; round < 3; round++) {
    best = null;
    for (let h = hRange[0]; h <= hRange[1]; h++) {
      const r = sim({ ...base, height: h, drop }, p, setup2);
      if (!r.ok) continue;
      const e = Math.abs(r.y - target.y);
      if (!best || e < best.e) best = { h, e, r };
    }
    if (!best) return null;
    let bd = null;
    for (let d = -10; d <= 10; d += 0.5) {
      const r = sim({ ...base, height: best.h, drop: d }, p, setup2);
      if (!r.ok) continue;
      const e = Math.abs(r.x - target.x);
      if (!bd || e < bd.e) bd = { d, e };
    }
    if (!bd || bd.d === drop) break;
    drop = bd.d;
  }
  const ball2 = { ...base, height: best.h, drop };
  return { ball: ball2, pred: sim(ball2, p, setup2) };
}
function loopBall(spec, p, setup2) {
  let sp = spec.speed;
  for (let k = 0; k < 6; k++, sp = Math.round((sp - 0.5) * 10) / 10) {
    const base = fixSpin({ ...spec, speed: sp });
    for (let h = 95; h >= 50; h--) {
      const r = sim({ ...base, height: h, drop: 0 }, p, setup2);
      if (r.ok && r.y > 25 && r.y < 110) return { ...base, height: h, drop: 0 };
    }
  }
  return { ...fixSpin(spec), height: 60, drop: 0 };
}
const SERVES = [
  { type: "sflat", kind: "serve", name: "Backspin serve: flat limit", base: { speed: 2, spin: 5, type: "back" } },
  { type: "sflat", kind: "serve", name: "Topspin serve: flat limit", base: { speed: 2.5, spin: 4, type: "top" } },
  { type: "saim", kind: "serve", name: "Short backspin serve", base: { speed: 1.8, spin: 5.5, type: "back" }, target: { x: 0, y: 110 } },
  { type: "saim", kind: "serve", name: "Long backspin serve", base: { speed: 3, spin: 6, type: "back" }, target: { x: 0, y: 40 } },
  { type: "saim", kind: "serve", name: "Short topspin serve", base: { speed: 2, spin: 3, type: "top" }, target: { x: 0, y: 75 } },
  { type: "saim", kind: "serve", name: "Long topspin serve", base: { speed: 3, spin: 5, type: "top" }, target: { x: 0, y: 25 } },
  { type: "saim", kind: "serve", name: "Serve without spin", base: { speed: 2.5, spin: 0, type: "top" }, target: { x: 0, y: 60 } }
];
const S_MIN = -50;
const S_MAX = -2;
const QUICK = [
  { type: "saim", kind: "top", name: "Topspin, deep backhand", base: { speed: 3, spin: 5, type: "top" }, target: { x: -35, y: 40 }, range: [0, 100], aims: 2 },
  { type: "saim", kind: "none", name: "No spin, forehand", base: { speed: 3.5, spin: 0, type: "top" }, target: { x: 35, y: 75 }, range: [0, 100], aims: 2 },
  { type: "saim", kind: "back", name: "Backspin, short middle", base: { speed: 1.8, spin: 5.5, type: "back" }, target: { x: 0, y: 100 }, range: [0, 100], aims: 2 },
  { type: "saim", kind: "top", name: "Fast topspin, deep forehand", base: { speed: 4.5, spin: 3, type: "top" }, target: { x: 35, y: 30 }, range: [0, 100], aims: 2 },
  { type: "saim", kind: "serve", name: "Short backspin serve", base: { speed: 1.8, spin: 5.5, type: "back" }, target: { x: 0, y: 110 }, aims: 2 }
];
function predictServeFlat(base, p, setup2, drop = 0) {
  for (let h = S_MAX; h >= S_MIN; h--) if (sim({ ...base, height: h, drop }, p, setup2).ok) return h;
  return null;
}
const feat = (b) => [b.speed / 1.5, (b.type === "back" ? -1 : 1) * b.spin / 2.5, b.height / 20, b.drop / 4];
const dist = (f, g) => Math.hypot(f[0] - g[0], f[1] - g[1], f[2] - g[2], f[3] - g[3]);
function allSettings() {
  const out = [];
  for (let sp = 0.5; sp <= 10.001; sp += 0.5) {
    const m = maxSpin(sp), mid = Math.floor(m) / 2 >= 1 ? Math.round(m) / 2 : null;
    const spins = [{ spin: 0, type: "top" }];
    if (m > 0) spins.push({ spin: m, type: "top" }, { spin: m, type: "back" });
    if (mid) spins.push({ spin: Math.round(mid * 2) / 2, type: "top" }, { spin: Math.round(mid * 2) / 2, type: "back" });
    for (const s of spins) for (let h = -50; h <= 100; h += 10) for (const d of [-9, 0, 9]) {
      out.push({ speed: Math.round(sp * 10) / 10, spin: s.spin, type: s.type, height: h, drop: d });
    }
  }
  return out;
}
function safeSettings(p, setup2) {
  return allSettings().filter((b) => {
    const r = simulate(b, p, setup2, 6e-3);
    return r.ok && r.y > 8 && r.y < 128 && Math.abs(r.x) < 68 && (r.netClear === null || r.netClear > 0.03);
  });
}
export class AdaptiveCalibrationPlan {
  constructor({ setup: setup2, start = PRIOR, serves = true, fit: fit2 = fitParams, kinds = KINDS, earlier: earlier2 = [], cover = 0, quick = false } = {}) {
    this.earlier = earlier2;
    this.found = {};
    this.setup = setup2;
    this.params = fullParams(start);
    this.fit = fit2;
    this.shots = [];
    this.log = [];
    this.middle = {};
    this.steps = [];
    this.cur = null;
    this.dirty = false;
    this.quick = quick;
    if (quick) {
      this.steps.push(...QUICK.map((x) => ({ ...x })));
      this.total = this.steps.length;
      this.index = -1;
      this.history = [];
      return;
    }
    this.steps.push(...[[0, "Middle"], [-8, "Left"], [8, "Right"]].map(([drop, name]) => ({ type: "align", kind: "top", name: `Alignment ${name.toLowerCase()}`, drop })));
    for (const k of kinds) {
      this.steps.push({ type: "net", kind: k.id, name: `${k.name}: net limit`, spec: k });
      this.steps.push({ type: "long", kind: k.id, name: `${k.name}: long limit`, spec: k });
      this.steps.push({ type: "loop", kind: k.id, name: `${k.name}: loop`, spec: k });
      this.steps.push({ type: "middle", kind: k.id, name: `${k.name}: aim at the middle`, spec: k });
    }
    if (cover > 0) this.steps.push({ type: "cover", kind: "cover", name: "All settings", max: cover });
    if (serves) this.steps.push(...SERVES.map((x) => ({ ...x })));
    this.total = this.steps.length;
    this.index = -1;
    this.history = [];
  }
  refit() {
    if (!this.dirty) return;
    const all = this.all();
    const f = this.fit(all, this.setup, this.params, 25);
    if (this.quick) {
      this.params = f.params;
      this.dirty = false;
      return;
    }
    const bad = objective(f.params, all, this.setup) > 6 + 3 * all.length;
    this.params = bad ? fitBest(all, this.setup, f.params, { starts: 4, iters: 20 }).params : f.params;
    this.dirty = false;
  }
  // ---- next ball
  next() {
    if (this.pending) return this.pending;
    while (true) {
      if (!this.cur) {
        this.index++;
        if (this.index >= this.steps.length) return null;
        this.cur = { ...this.steps[this.index], n: 0 };
        this.refit();
        this.startTask(this.cur);
      }
      const ball2 = this.cur.done ? null : this.ballFor(this.cur);
      if (ball2) {
        const b = { ...fixSpin(ball2), height: Math.round(ball2.height), drop: ball2.drop };
        this.pending = {
          ball: b,
          step: this.index + 1,
          of: this.total,
          label: this.cur.name,
          kind: this.cur.kind,
          type: this.cur.type,
          pred: sim(b, this.params, this.setup),
          why: this.cur.why,
          n: this.cur.n,
          max: this.cur.max
        };
        return this.pending;
      }
      this.cur = null;
    }
  }
  startTask(t) {
    const p = this.params, st = this.setup;
    if (t.type === "align") {
      const base = { speed: 3, spin: 3, type: "top" };
      const a = aim(base, { x: 0, y: 70 }, p, st);
      t.ball = { ...base, height: a ? a.ball.height : 35, drop: t.drop };
      t.why = "which way the robot points and how far drop moves the ball";
    } else if (t.type === "net" || t.type === "long") {
      const base = fixSpin(t.spec[t.type] || t.spec.base);
      t.drop = t.type === "net" ? -4 : 4;
      t.base = base;
      if (t.type === "net") {
        let n = predictNetLimit(base, p, st, t.drop), sp = base.speed;
        while (n !== null && n < 6 && sp > 1.5) {
          sp = Math.round((sp - 0.5) * 10) / 10;
          t.base = fixSpin({ ...base, speed: sp });
          n = predictNetLimit(t.base, p, st, t.drop);
        }
        t.h = n === null ? 60 : Math.min(H_MAX, n + 1);
        t.why = "lowest height that clears the net";
      } else {
        let lim = predictLongLimit(base, p, st, t.drop), sp = base.speed;
        while (lim.limit === null && sp < 6) {
          sp = Math.round((sp + 0.5) * 10) / 10;
          t.base = fixSpin({ ...base, speed: sp });
          lim = predictLongLimit(t.base, p, st, t.drop);
        }
        t.h = lim.limit === null ? 80 : Math.max(H_MIN, lim.limit - 1);
        t.why = "highest height that still lands (end line)";
      }
      t.good = null;
      t.bad = null;
      t.up = t.type === "net";
      t.badSet = [t.type];
      t.lo = H_MIN;
      t.hi = H_MAX;
    } else if (t.type === "sflat") {
      const base = fixSpin(t.base);
      t.drop = 0;
      const f = predictServeFlat(base, p, st);
      t.h = f === null ? -25 : Math.max(S_MIN, f - 1);
      t.good = null;
      t.bad = null;
      t.up = false;
      t.badSet = ["net", "long"];
      t.lo = S_MIN;
      t.hi = S_MAX;
      t.why = "flattest serve that still lands (flatter: it bounces too close to the net)";
    } else if (t.type === "loop") {
      t.ball = loopBall(t.spec.loop, p, st);
      t.why = "high arc with strong spin";
    } else if (t.type === "middle") {
      t.why = "the model aims at the middle of your half";
      this.aimMiddle(t);
    } else if (t.type === "cover") {
      t.why = "a setting far from all balls measured so far, so every possible ball is covered";
      this.coverPick(t);
    } else if (t.type === "saim") {
      t.why = t.range ? "the model aims at a spot - mark where it really landed" : "the model aims the serve at a point - mark where it really landed";
      this.aimMiddle(t);
    }
  }
  aimMiddle(t) {
    if (t.type === "saim") {
      const a2 = aim(fixSpin(t.base), t.target, this.params, this.setup, t.range || [S_MIN, S_MAX]);
      t.ball = a2 ? a2.ball : { ...fixSpin(t.base), height: t.range ? 40 : -25, drop: 0 };
      return;
    }
    const a = aim(fixSpin(t.spec.base), MIDDLE, this.params, this.setup);
    t.ball = a ? a.ball : { ...fixSpin(t.spec.base), height: 40, drop: 0 };
  }
  // after a miss: refit and let the model choose again; if it still picks the same ball,
  // step 5 heights (net -> higher, long -> lower)
  retry(t, res) {
    const before = t.ball;
    this.refit();
    if (t.type === "align") {
      const a = aim({ speed: 3, spin: 3, type: "top" }, { x: 0, y: 70 }, this.params, this.setup);
      if (a) t.ball = { ...a.ball, drop: t.drop };
    } else if (t.type === "loop") t.ball = loopBall(t.spec.loop, this.params, this.setup);
    if (t.ball.height === before.height && t.ball.speed === before.speed) {
      const dir = res.result === "net" ? 1 : -1;
      t.ball = { ...t.ball, height: Math.max(H_MIN, Math.min(H_MAX, t.ball.height + 5 * dir)) };
    }
  }
  coverPick(t) {
    if (!t.pool || t.n - (t.poolAt || 0) >= 6) {
      this.refit();
      t.pool = safeSettings(this.params, this.setup);
      t.poolAt = t.n;
    }
    const seen = this.all().map((s) => feat(s.ball));
    let best = null;
    for (const c of t.pool) {
      const f = feat(c);
      let m = Infinity;
      for (const g of seen) {
        const d = dist(f, g);
        if (d < m) m = d;
        if (m < (best ? best.m : 0)) break;
      }
      if (!best || m > best.m) best = { c, m };
    }
    t.gap = best ? best.m : 0;
    if (!best || best.m < COVER_STOP) {
      t.ball = null;
      t.done = true;
      return;
    }
    t.ball = best.c;
  }
  ballFor(t) {
    if (t.type === "net" || t.type === "long" || t.type === "sflat") return { ...t.base, height: t.h, drop: t.drop };
    return t.ball;
  }
  // ---- result of the pending ball
  // ---- undo: every recorded ball can be taken back (state before it is kept)
  snapshot() {
    const { index, cur: cur2, shots, log, middle, found, params, dirty, pending: pending2 } = this;
    return structuredClone({ index, cur: cur2, shots, log, middle, found, params, dirty, pending: pending2 });
  }
  canUndo() {
    return this.history.length > 0;
  }
  undo() {
    const h = this.history.pop();
    if (!h) return null;
    Object.assign(this, h);
    return this.pending;
  }
  record(res) {
    const pend = this.pending;
    if (!pend) return;
    (this.history || (this.history = [])).push(this.snapshot());
    if (this.history.length > 80) this.history.shift();
    this.pending = null;
    const t = this.cur;
    t.n++;
    const shot = { ball: { ...pend.ball }, result: res.result, src: "cal", step: pend.type, kind: pend.kind };
    if (res.result === "ok") {
      shot.x = res.x;
      shot.y = res.y;
      shot.second = res.second ?? null;
    }
    if (res.result !== "unseen") {
      this.shots.push(shot);
      this.dirty = true;
    }
    this.log.push({ ...shot, pred: pend.pred, label: pend.label });
    const landed = res.result === "ok";
    if (t.type === "align" || t.type === "loop") {
      if (landed || t.n >= 3) {
        t.done = true;
        return;
      }
      if (res.result === "unseen" || res.result === "side") return;
      this.retry(t, res);
      return;
    }
    if (t.type === "cover") {
      if (t.n >= t.max) {
        t.done = true;
        return;
      }
      if (res.result !== "ok") t.pool = null;
      this.coverPick(t);
      return;
    }
    if (t.type === "middle" || t.type === "saim") {
      const err = landed && pend.pred.ok ? Math.hypot(res.x - pend.pred.x, res.y - pend.pred.y) : landed || pend.pred.ok ? 60 : null;
      if (err !== null) (this.middle[t.kind] = this.middle[t.kind] || []).push({ err, ball: pend.ball, x: res.x, y: res.y, pred: pend.pred, label: pend.label });
      if (landed && err <= MIDDLE_OK || t.n >= (t.aims || MIDDLE_MAX)) {
        t.done = true;
        return;
      }
      this.refit();
      this.aimMiddle(t);
      return;
    }
    if (res.result === "unseen" || res.result === "side") {
      if (t.n >= LIMIT_MAX + 1) t.done = true;
      return;
    }
    const isBad = t.badSet.includes(res.result);
    const h = pend.ball.height;
    if (isBad) t.bad = h;
    else t.good = h;
    const up = t.up;
    if (t.good !== null && t.bad !== null && (up ? t.good <= t.bad : t.good >= t.bad)) {
      if (isBad) t.good = null;
      else t.bad = null;
    }
    this.found[t.type === "sflat" ? `serve.${t.base.type}` : `${t.kind}.${t.type}`] = { ball: t.base, good: t.good, bad: t.bad };
    if (t.n >= LIMIT_MAX) {
      t.done = true;
      return;
    }
    if (t.good !== null && t.bad !== null) {
      if (Math.abs(t.good - t.bad) <= LIMIT_GAP) {
        t.done = true;
        return;
      }
      t.h = Math.round((t.good + t.bad) / 2);
    } else if (t.good !== null) {
      const step = 3 + 2 * (t.n - 1);
      t.h = up ? t.good - step : t.good + step;
    } else {
      const step = 3 + 2 * (t.n - 1);
      t.h = up ? t.bad + step : t.bad - step;
    }
    if (t.h < t.lo || t.h > t.hi) {
      t.h = Math.max(t.lo, Math.min(t.hi, t.h));
      if (t.h === h) t.done = true;
    }
  }
  // repeat the pending ball (e.g. not seen)
  skipTask() {
    this.pending = null;
    if (this.cur) this.cur.done = true;
    this.cur = null;
  }
  all() {
    return this.earlier.length ? this.earlier.concat(this.shots) : this.shots;
  }
  finish() {
    const all = this.all();
    let f = fitBest(all, this.setup, this.params, { starts: 6 });
    if (objective(f.params, all, this.setup) > 6 + 3 * all.length) f = fitBest(all, this.setup, f.params, { starts: 14, spread: 2.5 });
    this.params = f.params;
    this.dirty = false;
    return this.params;
  }
  // accuracy per kind of ball: the middle balls were aimed with the model of that moment,
  // so their error is an honest test (the last one counts most)
  report() {
    const out = {};
    for (const [k, list] of Object.entries(this.middle)) {
      if (!list.length) continue;
      const by = {};
      list.forEach((e) => {
        let _a;
        return (by[_a = e.label] || (by[_a] = [])).push(e.err);
      });
      const tasks = Object.values(by), avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
      out[k] = { first: avg(tasks.map((t) => t[0])), last: avg(tasks.map((t) => t[t.length - 1])), balls: list.length };
    }
    return out;
  }
  limits(kind2) {
    const res = {};
    for (const l of this.log.filter((l2) => l2.kind === kind2)) res[l.step] = (res[l.step] || 0) + 1;
    return res;
  }
}
