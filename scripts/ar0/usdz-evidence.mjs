export const AR0_REVISION_ID = 'sheen-chair-r1';

const requireFiniteVector = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`${label} must contain three finite numbers`);
  }
  return value;
};

export const validateUsdzEvidence = (evidence, expected) => {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('USDZ validation evidence is missing or malformed');
  if (evidence.schemaVersion !== 1) throw new Error('USDZ validation evidence schemaVersion must be 1');
  if (evidence.assetRevisionId !== expected.assetRevisionId) throw new Error('USDZ validation evidence revision does not match');
  if (evidence.usdzSha256 !== expected.usdzSha256) throw new Error('USDZ validation evidence hash does not match staged USDZ');
  if (typeof evidence.parser !== 'string' || !evidence.parser.trim()) throw new Error('USDZ validation evidence parser is missing');
  if (evidence.upAxis !== 'Y') throw new Error('USDZ stage must be Y-up');
  if (evidence.metersPerUnit !== 1) throw new Error('USDZ stage metersPerUnit must be 1');
  if (!evidence.dependencies || !Array.isArray(evidence.dependencies.unresolved)) throw new Error('USDZ dependency evidence is malformed');
  if (evidence.dependencies.unresolved.length) throw new Error('USDZ has unresolved dependencies');

  const minimum = requireFiniteVector(evidence.stageBounds?.min, 'USDZ stageBounds.min');
  const maximum = requireFiniteVector(evidence.stageBounds?.max, 'USDZ stageBounds.max');
  const size = requireFiniteVector(evidence.stageBounds?.size, 'USDZ stageBounds.size');
  const sizeMeters = requireFiniteVector(evidence.stageBounds?.sizeMeters, 'USDZ stageBounds.sizeMeters');
  if (size.some((entry) => entry <= 0) || sizeMeters.some((entry) => entry <= 0)) throw new Error('USDZ stage bounds must be positive');
  for (let axis = 0; axis < 3; axis += 1) {
    if (maximum[axis] <= minimum[axis]) throw new Error(`USDZ stage bounds are invalid on axis ${axis}`);
    const derivedSize = maximum[axis] - minimum[axis];
    const sizeTolerance = Math.max(1e-9, Math.abs(derivedSize) * 1e-9);
    if (Math.abs(size[axis] - derivedSize) > sizeTolerance) throw new Error(`USDZ stage bounds size is inconsistent on axis ${axis}`);
    const meterSize = size[axis] * evidence.metersPerUnit;
    const meterTolerance = Math.max(1e-9, Math.abs(meterSize) * 1e-9);
    if (Math.abs(sizeMeters[axis] - meterSize) > meterTolerance) throw new Error(`USDZ stage meter size is inconsistent on axis ${axis}`);
    const glbSize = expected.glbSize[axis];
    if (!Number.isFinite(glbSize) || glbSize <= 0) throw new Error(`Canonical GLB bounds are invalid on axis ${axis}`);
    const delta = Math.abs(glbSize - sizeMeters[axis]) / glbSize;
    if (!Number.isFinite(delta) || delta > 0.01) throw new Error(`USDZ/GLB dimension delta exceeds 1% on axis ${axis}`);
  }
  return { ...evidence, stageBounds: { ...evidence.stageBounds, sizeMeters } };
};
