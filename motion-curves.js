/** Small deterministic motion curves. Time arguments are seconds unless noted. */
const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const finiteTime = value => Number.isFinite(value) ? Math.max(0, value) : 0;

export const MOTION_TIMING = Object.freeze({
  placement: .85,
  swing: 1.2,
  cameraIn: .56,
  cameraHold: .34,
  cameraOut: .9,
  orbitHalfLife: .12
});

/** Minimum-jerk interpolation: velocity and acceleration are zero at both ends. */
export function smootherStep(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
export const minimumJerk = smootherStep;

export function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

/** Resting step response of an underdamped spring, not a sequence of linear keyframes. */
export function springResponse(time, damping = .38, frequency = 14) {
  const t = finiteTime(time);
  const zeta = Math.max(.001, Math.min(.999, damping));
  const omega = Math.max(.001, frequency);
  const root = Math.sqrt(1 - zeta * zeta);
  const damped = omega * root;
  return 1 - Math.exp(-zeta * omega * t) * (
    Math.cos(damped * t) + zeta / root * Math.sin(damped * t)
  );
}

/** 0.28 → approximately 1.20 → 1, with no jump at the placement hand-off. */
export function placementScale(time) {
  if (time <= 0) return .28;
  if (time >= MOTION_TIMING.placement) return 1;
  const t = finiteTime(time);
  const spring = .28 + .72 * springResponse(t);
  const residual = 1 - smootherStep((t - .60) / .25);
  return 1 + (spring - 1) * residual;
}

/** A soft attack, then a damped pendulum; no velocity snap when it starts or stops. */
export function placementSwing(time) {
  if (time <= 0 || time >= MOTION_TIMING.swing) return 0;
  const t = finiteTime(time);
  const attack = smootherStep(t / .11);
  const release = 1 - smootherStep((t - .90) / .30);
  return .22 * Math.sin(t * 11.2) * Math.exp(-t * 2.6) * attack * release;
}

function bezierCoordinate(t, p1, p2) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t;
}
function bezierSlope(t, p1, p2) {
  return 3 * (1 - t) * (1 - t) * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (1 - p2);
}
function cinematicBezier(value) {
  const x = clamp01(value);
  if (x === 0 || x === 1) return x;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const slope = bezierSlope(t, .22, .36);
    if (slope < 1e-5) break;
    t = clamp01(t - (bezierCoordinate(t, .22, .36) - x) / slope);
  }
  return bezierCoordinate(t, 1, 1);
}

/**
 * Normalized camera progress. The forward move arrives decisively, then floats
 * into rest. Time-warping the Bezier keeps its fast middle without an abrupt start.
 * The slower return uses a symmetric minimum-jerk curve.
 */
export function cinematicProgress(value, phase = 'in') {
  const t = smootherStep(value);
  return phase === 'in' || phase === 'push'
    ? .55 * cinematicBezier(t) + .45 * t
    : t;
}

/** A tiny raised arc with zero position, velocity and acceleration at each end. */
export function cameraArc(value) {
  const t = smootherStep(value);
  return Math.sin(Math.PI * t) ** 2;
}

/** Optional numeric-array adapter; keeps the curve helpers independent of Three.js. */
export function sampleCameraTransition(from, to, value, { phase = 'in', arcHeight = .035 } = {}) {
  const progress = cinematicProgress(value, phase);
  const blend = (start, end) => start.map((number, index) => number + (end[index] - number) * progress);
  const position = blend(from.position, to.position);
  position[1] += arcHeight * cameraArc(value);
  return {
    position,
    target: blend(from.target, to.target),
    progress,
    done: value >= 1
  };
}

/** Exponential following; equal elapsed time gives equal results at different FPS. */
export function damp(current, target, lambda, dt) {
  const elapsed = finiteTime(dt);
  const rate = Math.max(0, Number(lambda) || 0);
  return target + (current - target) * Math.exp(-rate * elapsed);
}

/** Exact integration of a decaying angular velocity, suitable for subtle orbit inertia. */
export function dampedInertia(velocity, dt, halfLife = MOTION_TIMING.orbitHalfLife) {
  const elapsed = finiteTime(dt);
  if (!Number.isFinite(velocity) || !elapsed) return { delta: 0, velocity: Number.isFinite(velocity) ? velocity : 0 };
  const rate = Math.LN2 / Math.max(.001, Number(halfLife) || MOTION_TIMING.orbitHalfLife);
  const attenuation = Math.exp(-rate * elapsed);
  return {
    delta: velocity * (1 - attenuation) / rate,
    velocity: velocity * attenuation
  };
}
