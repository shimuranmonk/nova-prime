// Adapted from Nova Trainer's uncalibrated physics preview by nova_fan.
// This is a visual estimate only; live execution remains disabled.
export const TABLE_DIMENSIONS = Object.freeze({ lengthCm: 274, widthCm: 152.5 });

const TABLE = Object.freeze({ L: 2.74, W: 1.525, NET_U: 1.37, NET_H: 0.1525, R: 0.02 });
const PRIOR = Object.freeze({ a: 2.4, b: 0.92, c: 1.7, d: 0.65, kM: 1e-3, z0: 0.43, g: 0, k: 1.8, r: 0.88, eT: 0, eB: 0, sT: 0, sB: 0, eta: 1 });
const DEFAULT_SETUP = Object.freeze({ dist: 10, side: 0 });
const CORNER_SIDE = 60;
const CORNER_HEAD = Math.atan2(CORNER_SIDE, TABLE.L * 100 - DEFAULT_SETUP.dist) * 180 / Math.PI;
const POSITIONS = Object.freeze({
  middle: Object.freeze({ side: 0, head: 0 }),
  left: Object.freeze({ side: -CORNER_SIDE, head: CORNER_HEAD }),
  right: Object.freeze({ side: CORNER_SIDE, head: -CORNER_HEAD }),
});
const DRAG = 0.14;
const GRAVITY = 9.81;
const DEG = Math.PI / 180;
const MU = 0.25;
const RPS_PER_RPM = 89e-4;

function rpms(speed, spin, type) {
  const base = 970 + 630.5 * speed;
  const offset = 342 * spin;
  let top = type === "back" ? base - offset : base + offset;
  let bottom = type === "back" ? base + offset : base - offset;
  top = Math.min(7200, Math.max(500, top));
  bottom = Math.min(7200, Math.max(500, bottom));
  return { top, bottom };
}

export function previewBall(ball, robotPosition = "middle", dt = 3e-3) {
  const setup = { ...DEFAULT_SETUP, ...(POSITIONS[robotPosition] ?? POSITIONS.middle) };
  const { top, bottom } = rpms(Number(ball.speed) || 0, Number(ball.spin) || 0, ball.type);
  const effectiveSpeed = ((top + bottom) / 2 - 970) / 630.5;
  const signedSpin = (top - bottom) / 684;
  const topSpin = Math.max(0, signedSpin);
  const backSpin = Math.max(0, -signedSpin);
  const velocity = Math.max(0.5, PRIOR.a + PRIOR.b * effectiveSpeed + PRIOR.sT * topSpin + PRIOR.sB * backSpin);
  const theta = (PRIOR.c + PRIOR.d * (Number(ball.height) || 0) + PRIOR.eT * topSpin + PRIOR.eB * backSpin) * DEG;
  let omega = PRIOR.eta * 2 * Math.PI * RPS_PER_RPM * (top - bottom);
  const psi = (PRIOR.g + PRIOR.k * (Number(ball.drop) || 0) + setup.head) * DEG;
  const initialU = setup.dist / 100;
  const initialW = setup.side / 100;
  const cosPsi = Math.cos(psi);
  const sinPsi = Math.sin(psi);
  let distance = 0;
  let height = PRIOR.z0;
  let forwardVelocity = velocity * Math.cos(theta);
  let verticalVelocity = velocity * Math.sin(theta);
  let netClearance = null;
  let firstBounce = null;
  let secondBounce = null;

  for (let elapsed = 0; elapsed < 3; elapsed += dt) {
    const speed = Math.hypot(forwardVelocity, verticalVelocity);
    const forwardAcceleration = -DRAG * speed * forwardVelocity + PRIOR.kM * omega * verticalVelocity;
    const verticalAcceleration = -GRAVITY - DRAG * speed * verticalVelocity - PRIOR.kM * omega * forwardVelocity;
    forwardVelocity += forwardAcceleration * dt;
    verticalVelocity += verticalAcceleration * dt;
    const previousDistance = distance;
    const previousHeight = height;
    distance += forwardVelocity * dt;
    height += verticalVelocity * dt;
    const u = initialU + distance * cosPsi;
    const previousU = initialU + previousDistance * cosPsi;

    if (netClearance == null && previousU < TABLE.NET_U && u >= TABLE.NET_U) {
      const fraction = (TABLE.NET_U - previousU) / (u - previousU);
      const netHeight = previousHeight + fraction * (height - previousHeight);
      netClearance = netHeight - TABLE.R - TABLE.NET_H;
      if (netClearance < 0) return Object.freeze({ ok: false, outcome: "net", netClearanceCm: netClearance * 100 });
    }

    if (height <= TABLE.R && verticalVelocity < 0) {
      if (previousHeight > TABLE.R) distance = previousDistance + (distance - previousDistance) * (previousHeight - TABLE.R) / (previousHeight - height);
      const bounceU = initialU + distance * cosPsi;
      const bounceW = initialW + distance * sinPsi;
      if (bounceU > TABLE.L + 0.01 || Math.abs(bounceW) > TABLE.W / 2 + 0.01 || bounceU < 0) {
        return Object.freeze({ ok: false, outcome: bounceU > TABLE.L ? "long" : "side", xCm: bounceW * 100, yCm: (TABLE.L - bounceU) * 100, netClearanceCm: netClearance == null ? null : netClearance * 100 });
      }
      if (bounceU >= TABLE.NET_U && !firstBounce) firstBounce = { u: bounceU, w: bounceW };
      else if (bounceU >= TABLE.NET_U) {
        secondBounce = { u: bounceU, w: bounceW };
        break;
      }
      height = TABLE.R;
      const incoming = -verticalVelocity;
      verticalVelocity = incoming * PRIOR.r;
      const slip = forwardVelocity - omega * TABLE.R;
      const maximumFriction = MU * (1 + PRIOR.r) * incoming;
      const delta = -Math.sign(slip) * Math.min(maximumFriction, Math.abs(slip) * 2 / 7);
      forwardVelocity += delta;
      omega -= delta * 5 / (2 * TABLE.R);
    }
  }

  if (!firstBounce) return Object.freeze({ ok: false, outcome: "short", netClearanceCm: netClearance == null ? null : netClearance * 100 });
  return Object.freeze({
    ok: true,
    outcome: secondBounce ? "short" : "in",
    xCm: firstBounce.w * 100,
    yCm: (TABLE.L - firstBounce.u) * 100,
    secondBounce: Boolean(secondBounce),
    netClearanceCm: netClearance == null ? null : netClearance * 100,
  });
}

export function previewPosition(result) {
  const x = Number.isFinite(result.xCm) ? ((result.xCm + TABLE_DIMENSIONS.widthCm / 2) / TABLE_DIMENSIONS.widthCm) * 100 : 50;
  const y = Number.isFinite(result.yCm) ? (result.yCm / TABLE_DIMENSIONS.lengthCm) * 100 : result.outcome === "net" ? 50 : 2;
  return Object.freeze({ x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, y)) });
}
