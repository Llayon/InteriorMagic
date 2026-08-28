export const ROTATION_EPSILON = 1e-6;
const TAU = Math.PI * 2;

export const normalizeRotation = (angle: number): number => {
  if (!Number.isFinite(angle)) return angle;
  const normalized = ((angle % TAU) + TAU) % TAU;
  return normalized >= TAU - ROTATION_EPSILON ? 0 : normalized;
};

export const snapRotation = (angle: number, stepDegrees: number): number => {
  if (!Number.isFinite(angle) || !Number.isFinite(stepDegrees) || stepDegrees <= 0) return angle;
  const step = stepDegrees * Math.PI / 180;
  const normalized = normalizeRotation(angle);
  const index = Math.floor(normalized / step + 0.5 + ROTATION_EPSILON);
  return normalizeRotation(index * step);
};

export const nextSnapRotation = (angle: number, stepDegrees: number, direction: -1 | 1): number => {
  if (!Number.isFinite(angle) || !Number.isFinite(stepDegrees) || stepDegrees <= 0) return angle;
  const step = stepDegrees * Math.PI / 180;
  const normalized = normalizeRotation(angle);
  const quotient = normalized / step;
  const nearest = Math.round(quotient);
  const onSnap = Math.abs(normalized - nearest * step) <= ROTATION_EPSILON;
  const index = onSnap ? nearest + direction : (direction > 0 ? Math.ceil(quotient) : Math.floor(quotient));
  return normalizeRotation(index * step);
};

export const signedRotationDelta = (from: number, to: number): number => {
  const delta = normalizeRotation(to - from);
  return delta > Math.PI ? delta - TAU : delta;
};
