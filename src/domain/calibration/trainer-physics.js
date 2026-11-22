// Adapted from nova_fan's Nova Trainer 0.1.0-beta.9 calibration physics.
const TABLE = Object.freeze({ L: 2.74, W: 1.525, NET_U: 1.37, NET_H: 0.1525, R: 0.02 });
export const PRIOR = Object.freeze({
  a: 2.4,
  // exit speed at speed 0 (m/s)
  b: 0.92,
  // exit speed per speed step (m/s)
  c: 1.7,
  // launch angle at height 0 (deg)
  d: 0.65,
  // launch angle per height step (deg)
  kM: 1e-3,
  // Magnus factor (1/rad)
  z0: 0.43,
  // exit height above the table (m)
  g: 0,
  // side angle at drop 0 (deg)  - robot alignment
  k: 1.8,
  // side angle per drop step (deg)
  r: 0.88,
  // bounce: vertical restitution
  // spin effects of the two wheels (per spin step of the wheels; 0 = like the start values).
  // Topspin and backspin get their own values: with backspin the lower wheel is the fast
  // one (at low speed the upper one runs at its minimum), so the ball leaves differently.
  eT: 0,
  // launch angle per topspin step (deg)
  eB: 0,
  // launch angle per backspin step (deg, + = steeper)
  sT: 0,
  // exit speed per topspin step (m/s)
  sB: 0,
  // exit speed per backspin step (m/s)
  eta: 1
  // share of the wheel spin that ends up in the ball (Magnus and bounce)
});
const PRIOR_SD = Object.freeze({
  a: 0.8,
  b: 0.3,
  c: 5,
  d: 0.15,
  kM: 12e-4,
  z0: 0.08,
  g: 3,
  k: 0.5,
  r: 0.05,
  eT: 0.6,
  eB: 0.6,
  sT: 0.08,
  sB: 0.08,
  eta: 0.25
});
const PARAM_KEYS = Object.freeze(["a", "b", "c", "d", "kM", "z0", "g", "k", "r", "eT", "eB", "sT", "sB", "eta"]);
const BASE_KEYS = PARAM_KEYS.slice(0, 9);
export const BOUNDS = Object.freeze({
  a: [0, 5],
  b: [0.4, 2.2],
  c: [-12, 25],
  d: [0.2, 1.1],
  kM: [2e-4, 8e-3],
  z0: [0.15, 0.6],
  g: [-12, 12],
  k: [0.6, 3.5],
  r: [0.7, 0.97],
  eT: [-3, 3],
  eB: [-3, 3],
  sT: [-0.4, 0.4],
  sB: [-0.4, 0.4],
  eta: [0.4, 1.6]
});
export const fullParams = (p) => ({ ...PRIOR, ...p || {} });
const DEFAULT_SETUP = Object.freeze({ dist: 10, side: 0 });
const DRAG = 0.14;
const G = 9.81;
const DEG = Math.PI / 180;
const MU = 0.25;
const RPS_PER_RPM = 89e-4;
function rpms(speed, spin, type) {
  const base = 970 + 630.5 * speed, f = 342 * spin;
  let top = type === "back" ? base - f : base + f;
  let bot = type === "back" ? base + f : base - f;
  top = Math.min(7200, Math.max(500, top));
  bot = Math.min(7200, Math.max(500, bot));
  return { top, bot };
}
export function simulate(ball2, p = PRIOR, setup2 = DEFAULT_SETUP, dt = 3e-3) {
  if (p.eta === void 0) p = fullParams(p);
  const { top, bot } = rpms(Number(ball2.speed) || 0, Number(ball2.spin) || 0, ball2.type);
  const serve = (Number(ball2.height) || 0) < 0;
  const effSpeed = ((top + bot) / 2 - 970) / 630.5;
  const sig = (top - bot) / 684;
  const tsp = Math.max(0, sig), bsp = Math.max(0, -sig);
  const v0 = Math.max(0.5, p.a + p.b * effSpeed + p.sT * tsp + p.sB * bsp);
  const theta = (p.c + p.d * (Number(ball2.height) || 0) + p.eT * tsp + p.eB * bsp) * DEG;
  const omega = p.eta * 2 * Math.PI * RPS_PER_RPM * (top - bot);
  const psi = (p.g + p.k * (Number(ball2.drop) || 0) + (Number(setup2.head) || 0)) * DEG;
  const u0 = (setup2.dist ?? 10) / 100, w0 = (setup2.side ?? 0) / 100;
  const cosP = Math.cos(psi), sinP = Math.sin(psi);
  let s = 0, z = p.z0, vs = v0 * Math.cos(theta), vz = v0 * Math.sin(theta), om = omega;
  let netClear = null, robotBounce = false, rb = null, first = null, second = null;
  const R = TABLE.R;
  for (let t = 0; t < 3; t += dt) {
    const v = Math.hypot(vs, vz);
    const as = -DRAG * v * vs + p.kM * om * vz;
    const az = -G - DRAG * v * vz - p.kM * om * vs;
    vs += as * dt;
    vz += az * dt;
    const sPrev = s, zPrev = z;
    s += vs * dt;
    z += vz * dt;
    const u = u0 + s * cosP, uPrev = u0 + sPrev * cosP;
    if (netClear === null && uPrev < TABLE.NET_U && u >= TABLE.NET_U) {
      const f = (TABLE.NET_U - uPrev) / (u - uPrev);
      const zn = zPrev + f * (z - zPrev);
      netClear = zn - R - TABLE.NET_H;
      if (netClear < 0) return result({ net: true, netClear });
    }
    if (z <= R && vz < 0) {
      if (zPrev > R) {
        s = sPrev + (s - sPrev) * (zPrev - R) / (zPrev - z);
      }
      const u2 = u0 + s * cosP;
      const w = w0 + s * sinP;
      if (u2 > TABLE.L + 0.01 || Math.abs(w) > TABLE.W / 2 + 0.01 || u2 < 0) {
        if (!first) return result({ out: u2 > TABLE.L ? "long" : "side", netClear, landU: u2, landW: w });
        second = { u: u2, w, onTable: false };
        break;
      }
      if (u2 < TABLE.NET_U) {
        if (first) break;
        if (!robotBounce) rb = { u: u2, w };
        robotBounce = true;
      } else if (!first) {
        first = { u: u2, w };
      } else {
        second = { u: u2, w, onTable: true };
        break;
      }
      z = R;
      const vzIn = -vz;
      vz = vzIn * p.r;
      const slip = vs - om * R;
      const maxFric = MU * (1 + p.r) * vzIn;
      const dv = -Math.sign(slip) * Math.min(maxFric, Math.abs(slip) * 2 / 7);
      vs += dv;
      om -= dv * 5 / (2 * R);
    }
  }
  if (!first) return result({ out: "short", netClear, robotBounce });
  if (!second) second = { onTable: false };
  return result({ netClear, robotBounce, first, second });
  function result(r) {
    const out = { net: !!r.net, netClear: r.netClear ?? null, robotBounce: !!(r.robotBounce || rb), out: r.out || null };
    if (rb) {
      out.rbX = rb.w * 100;
      out.rbU = rb.u * 100;
    }
    if (r.first) {
      out.x = r.first.w * 100;
      out.y = (TABLE.L - r.first.u) * 100;
      out.secondOnTable = !!(r.second && r.second.onTable);
      if (r.second && r.second.u !== void 0) {
        out.x2 = r.second.w * 100;
        out.y2 = (TABLE.L - r.second.u) * 100;
      }
    } else if (r.landU !== void 0) {
      out.x = r.landW * 100;
      out.y = (TABLE.L - r.landU) * 100;
    }
    out.ok = !out.net && !out.out;
    if (out.ok && serve && !out.robotBounce) {
      out.ok = false;
      out.out = "noserve";
    }
    return out;
  }
}
const SIGMA_CM = 8;
function clampParams(p) {
  const q = {};
  PARAM_KEYS.forEach((k) => {
    q[k] = Math.min(BOUNDS[k][1], Math.max(BOUNDS[k][0], p[k]));
  });
  return q;
}
const SIGMA_LIMIT = 3;
function residuals(p, shots, setup2, prior = PRIOR, dt = 4e-3) {
  const out = [];
  for (const sh of shots) {
    const r = simulate(sh.ball, p, setup2, dt);
    const nc = r.netClear !== null ? r.netClear * 100 : null;
    if (sh.result === "ok") {
      if (r.ok) out.push((r.x - sh.x) / SIGMA_CM, (r.y - sh.y) / SIGMA_CM);
      else if (r.net) out.push((-nc + 2) / SIGMA_LIMIT + 1, 3);
      else if (r.x !== undefined) {
        const dx = r.x - sh.x;
        const dy = r.y - sh.y;
        out.push(dx / SIGMA_CM + Math.sign(dx), dy / SIGMA_CM + Math.sign(dy));
      } else out.push(5, 5);
      if (sh.second != null) out.push(r.ok && Boolean(r.secondOnTable) === sh.second ? 0 : 2);
    } else if (sh.result === "net") {
      out.push(nc === null ? 0 : Math.max(0, nc + 1) / SIGMA_LIMIT);
    } else if (sh.result === "long") {
      out.push(r.net ? (-nc + 3) / SIGMA_LIMIT : r.y !== undefined ? Math.max(0, r.y + 1) / SIGMA_LIMIT : 0);
    } else if (sh.result === "side") {
      out.push(r.ok ? Math.max(0, 76 - Math.abs(r.x)) / SIGMA_LIMIT : 0);
    }
  }
  for (const k of PARAM_KEYS) out.push((p[k] - prior[k]) / PRIOR_SD[k]);
  return out;
}
export function objective(p, shots, setup2, prior = PRIOR, dt = 4e-3) {
  return residuals(p, shots, setup2, prior, dt).reduce((a, r) => a + r * r, 0);
}
export function fitParams(shots, setup2, start = PRIOR, iters = 40, keys = PARAM_KEYS, prior = PRIOR) {
  const n = keys.length;
  start = fullParams(start);
  const toP = (v) => clampParams({ ...start, ...Object.fromEntries(keys.map((k, i) => [k, prior[k] + v[i] * PRIOR_SD[k]])) });
  const res = (v) => residuals(toP(v), shots, setup2, prior);
  const sq = (r2) => r2.reduce((a, x2) => a + x2 * x2, 0);
  let x = keys.map((k) => (start[k] - prior[k]) / PRIOR_SD[k]);
  let r = res(x), f = sq(r), lam = 1;
  const H = 0.02;
  for (let it = 0; it < Math.min(iters, 60); it++) {
    const J = [];
    for (let i = 0; i < n; i++) {
      const xp = x.slice();
      xp[i] += H;
      const rp = res(xp);
      J.push(rp.map((v, j) => (v - r[j]) / H));
    }
    const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_2, j) => J[i].reduce((a, v, m) => a + v * J[j][m], 0)));
    const g = J.map((col) => col.reduce((a, v, m) => a + v * r[m], 0));
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      const M = A.map((row2, i) => row2.map((v, j) => v + (i === j ? lam * (1 + A[i][i]) : 0)));
      const dx = solve(M, g.map((v) => -v));
      const xn = x.map((v, i) => v + dx[i]);
      const rn = res(xn), fn = sq(rn);
      if (fn < f) {
        x = xn;
        r = rn;
        const df = f - fn;
        f = fn;
        lam = Math.max(1e-4, lam / 3);
        improved = df > 1e-4;
        break;
      }
      lam *= 4;
    }
    if (!improved) break;
  }
  const params = toP(x);
  return { params, ...landingError(params, shots, setup2) };
}
export function fitBest(shots, setup2, start = PRIOR, { starts = 4, iters = 30, keys = PARAM_KEYS, spread = 1.6 } = {}) {
  start = fullParams(start);
  let seed = 99991;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647 - 0.5;
  let best = null;
  const tryFrom = (c, k = keys) => {
    let f = fitParams(shots, setup2, c, iters, k);
    if (k !== keys) f = fitParams(shots, setup2, f.params, iters, keys);
    const o = objective(f.params, shots, setup2);
    if (!best || o < best.o) best = { ...f, o };
  };
  tryFrom(start);
  tryFrom(PRIOR);
  tryFrom(PRIOR, BASE_KEYS.filter((k) => keys.includes(k)));
  if (starts > 3) {
    const pool = [];
    for (let i = 0; i < starts * 25; i++) {
      const q = { ...i % 2 ? start : PRIOR };
      for (const k of keys) q[k] += rnd() * spread * 2 * PRIOR_SD[k];
      const c = clampParams(q);
      pool.push({ c, o: objective(c, shots, setup2, PRIOR, 6e-3) });
    }
    pool.sort((x, y) => x.o - y.o);
    pool.slice(0, starts - 3).forEach(({ c }) => tryFrom(c));
  }
  return fitParams(shots, setup2, best.params, 60, keys);
}
function solve(M, b) {
  const n = b.length, A = M.map((row2, i) => [...row2, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-9;
    for (let i = 0; i < n; i++) if (i !== c) {
      const k = A[i][c] / d;
      for (let j = c; j <= n; j++) A[i][j] -= k * A[c][j];
    }
  }
  return A.map((row2, i) => row2[n] / (row2[i] || 1e-9));
}
export function landingError(params, shots, setup2) {
  let sum = 0, n = 0;
  shots.filter((s) => s.result === "ok").forEach((s) => {
    const r = simulate(s.ball, params, setup2, 2e-3);
    if (r.ok || r.x !== void 0) {
      sum += Math.hypot(r.x - s.x, r.y - s.y);
      n++;
    } else {
      sum += r.net ? 30 : 60;
      n++;
    }
  });
  return { meanErrorCm: n ? sum / n : null, n };
}

export const CENTERED_SETUP = Object.freeze({ dist: 10, side: 0, head: 0 });
